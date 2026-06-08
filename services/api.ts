import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

const TOKEN_KEY = '@getdraft/tokens';

// Resolve the dev API URL.
// - Physical device or LAN: use the same host the Expo dev server is reachable on
// - Android emulator: 10.0.2.2 maps to host machine
// - iOS simulator: localhost works
// Override at any time with EXPO_PUBLIC_API_URL.
const BACKEND_PORT = 3000;

function extractHost(value: string | undefined | null): string | null {
  if (!value) return null;
  // Strip any scheme: exp://, http://, https://, exps://
  const stripped = value.replace(/^[a-z+]+:\/\//i, '');
  // Take the first segment before "/" or "?"
  const beforePath = stripped.split('/')[0].split('?')[0];
  // Take everything before ":" (drop the port)
  const host = beforePath.split(':')[0];
  return host || null;
}

function resolveDevApiUrl(): string {
  const override = process.env.EXPO_PUBLIC_API_URL;
  if (override) return override;

  // Try every place Expo might stash the dev server host
  const candidates = [
    (Constants.expoConfig as any)?.hostUri,
    (Constants as any).expoGoConfig?.debuggerHost,
    (Constants as any).manifest?.debuggerHost,
    (Constants as any).manifest?.hostUri,
    (Constants as any).manifest2?.extra?.expoGo?.debuggerHost,
    (Constants as any).manifest2?.extra?.expoClient?.hostUri,
  ];

  for (const candidate of candidates) {
    const host = extractHost(candidate);
    if (host && host !== 'localhost' && host !== '127.0.0.1') {
      return `http://${host}:${BACKEND_PORT}/api`;
    }
  }

  if (Platform.OS === 'android') {
    return `http://10.0.2.2:${BACKEND_PORT}/api`;
  }

  return `http://localhost:${BACKEND_PORT}/api`;
}

export const API_BASE_URL = __DEV__
  ? resolveDevApiUrl()
  : 'https://getdraft-api.up.railway.app/api';

// Same host without the /api suffix — used for WebSocket connections
export const API_ORIGIN = API_BASE_URL.replace(/\/api\/?$/, '');

const baseURL = API_BASE_URL;

if (__DEV__) {
  // eslint-disable-next-line no-console
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  // eslint-disable-next-line no-console
  console.log('[api] baseURL =', baseURL);
  // eslint-disable-next-line no-console
  console.log('[api] override with EXPO_PUBLIC_API_URL if wrong');
  // eslint-disable-next-line no-console
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
}

export interface Tokens {
  accessToken: string;
  refreshToken: string;
}

// --- Token storage ---

export async function saveTokens(tokens: Tokens): Promise<void> {
  if (__DEV__) {
    // eslint-disable-next-line no-console
    console.log('[auth] saveTokens', {
      hasAccess: !!tokens?.accessToken,
      hasRefresh: !!tokens?.refreshToken,
    });
  }
  if (!tokens?.accessToken || !tokens?.refreshToken) {
    // eslint-disable-next-line no-console
    console.warn('[auth] saveTokens called with missing fields — skipping write.');
    return;
  }
  await AsyncStorage.setItem(TOKEN_KEY, JSON.stringify(tokens));
}

export async function loadTokens(): Promise<Tokens | null> {
  try {
    const raw = await AsyncStorage.getItem(TOKEN_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export async function clearTokens(): Promise<void> {
  if (__DEV__) {
    // eslint-disable-next-line no-console
    console.log('[auth] clearTokens — caller stack:');
    // eslint-disable-next-line no-console
    console.log(new Error().stack);
  }
  await AsyncStorage.removeItem(TOKEN_KEY);
}

// --- Axios instance ---

const api = axios.create({
  baseURL,
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
});

// Request interceptor — attach JWT
api.interceptors.request.use(async (config) => {
  const tokens = await loadTokens();
  if (tokens?.accessToken) {
    config.headers.Authorization = `Bearer ${tokens.accessToken}`;
  }
  return config;
});

// Response interceptor — auto-refresh on 401
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config;

    if (error.response?.status === 401 && !original._retry) {
      original._retry = true;

      try {
        const tokens = await loadTokens();
        if (!tokens?.refreshToken) throw new Error('No refresh token');

        const { data } = await axios.post(
          `${api.defaults.baseURL}/auth/refresh`,
          { refreshToken: tokens.refreshToken },
        );

        const newTokens: Tokens = {
          accessToken: data.data.accessToken,
          refreshToken: data.data.refreshToken,
        };
        await saveTokens(newTokens);

        original.headers.Authorization = `Bearer ${newTokens.accessToken}`;
        return api(original);
      } catch {
        await clearTokens();
        // The app's auth state listener will handle redirect to login
      }
    }

    return Promise.reject(error);
  },
);

export default api;
