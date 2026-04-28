import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

const TOKEN_KEY = '@getdraft/tokens';

export interface Tokens {
  accessToken: string;
  refreshToken: string;
}

// --- Token storage ---

export async function saveTokens(tokens: Tokens): Promise<void> {
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
  await AsyncStorage.removeItem(TOKEN_KEY);
}

// --- Axios instance ---

const api = axios.create({
  baseURL: __DEV__
    ? 'http://localhost:3000/api'
    : 'https://getdraft-api.up.railway.app/api',
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
