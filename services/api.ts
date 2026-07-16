import axios from "axios";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import { Platform } from "react-native";

const TOKEN_KEY = "@getdraft/tokens";

// Resolve the dev API URL.
// - Physical device or LAN: use the same host the Expo dev server is reachable on
// - Android emulator: 10.0.2.2 maps to host machine
// - iOS simulator: localhost works
// Override at any time with EXPO_PUBLIC_API_URL.
const BACKEND_PORT = 3000;

function extractHost(value: string | undefined | null): string | null {
  if (!value) return null;
  // Strip any scheme: exp://, http://, https://, exps://
  const stripped = value.replace(/^[a-z+]+:\/\//i, "");
  // Take the first segment before "/" or "?"
  const beforePath = stripped.split("/")[0].split("?")[0];
  // Take everything before ":" (drop the port)
  const host = beforePath.split(":")[0];
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
    if (host && host !== "localhost" && host !== "127.0.0.1") {
      return `http://${host}:${BACKEND_PORT}/api`;
    }
  }

  if (Platform.OS === "android") {
    return `http://10.0.2.2:${BACKEND_PORT}/api`;
  }

  return `http://localhost:${BACKEND_PORT}/api`;
}

// EAS injects EXPO_PUBLIC_API_URL into the build via eas.json's env, and the
// dev server picks it up from the shell. Honour it in BOTH modes so a preview
// build hits Railway and a dev build can still be aimed at LAN/staging/etc.
const ENV_OVERRIDE = process.env.EXPO_PUBLIC_API_URL;
export const API_BASE_URL =
  ENV_OVERRIDE ?? (__DEV__ ? resolveDevApiUrl() : "https://getdraft-api-production.up.railway.app/api");

// Same host without the /api suffix — used for WebSocket connections
export const API_ORIGIN = API_BASE_URL.replace(/\/api\/?$/, "");

const baseURL = API_BASE_URL;

if (__DEV__) {
   
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
   
  console.log("[api] baseURL =", baseURL);
   
  console.log("[api] override with EXPO_PUBLIC_API_URL if wrong");
   
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
}

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

// --- Session-expired handoff ---
//
// api.ts can't import the Redux store (the store imports authSlice → which
// imports authService → which imports api.ts; a direct store import here
// would create a cycle that resolves to an undefined export at module load).
// Instead we expose a callback that the root layout sets on mount with
// `dispatch(logout)`, so a refresh failure inside the interceptor reliably
// drives the app back to the auth screen without bolting on a parallel
// mechanism.
let _onSessionExpired: (() => void) | null = null;
export function setOnSessionExpired(fn: (() => void) | null): void {
  _onSessionExpired = fn;
}

// --- Axios instance ---

const api = axios.create({
  baseURL,
  // Render's free tier sleeps after ~15 min of no traffic and takes ~45-55s to
  // cold-start. A 15s timeout caused login/signup to fail on a fresh app open.
  // 60s covers worst-case wake + first DB query; the _layout prewarm ping
  // usually means real requests land on a warm dyno.
  timeout: 60000,
  headers: { "Content-Type": "application/json" },
});

// Request interceptor — attach JWT
api.interceptors.request.use(async (config) => {
  const tokens = await loadTokens();
  if (tokens?.accessToken) {
    config.headers.Authorization = `Bearer ${tokens.accessToken}`;
  }
  return config;
});

// ── Single-flight token refresh ─────────────────────────────────────
// On a cold open after >1h idle, EVERY launch request (me, feed, matches,
// unread…) 401s at the same instant. Refresh tokens are ROTATED server-side
// (single use): without a shared lock each 401 raced /auth/refresh with the
// same token, the first won and invalidated it, the rest failed → tokens
// cleared → the user was logged out on basically every app open. That is the
// "have to log in every time" the client reported — persistence was never
// missing, the refresh was racing itself. All concurrent 401s now await ONE
// refresh and retry with its result.
let refreshInFlight: Promise<Tokens> | null = null;

function refreshTokensOnce(): Promise<Tokens> {
  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      const tokens = await loadTokens();
      if (!tokens?.refreshToken) {
        const e = new Error("No refresh token") as Error & {
          isAuthFailure: boolean;
        };
        e.isAuthFailure = true;
        throw e;
      }
      try {
        const { data } = await axios.post(
          `${api.defaults.baseURL}/auth/refresh`,
          { refreshToken: tokens.refreshToken },
        );
        const newTokens: Tokens = {
          accessToken: data.data.accessToken,
          refreshToken: data.data.refreshToken,
        };
        await saveTokens(newTokens);
        return newTokens;
      } catch (e: any) {
        // Only a server VERDICT (4xx/5xx response) means the session is dead.
        // A network drop / timeout says nothing about the session — flagging
        // it as an auth failure would log people out for riding an elevator.
        if (e?.response) e.isAuthFailure = true;
        throw e;
      }
    })().finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
}

// Response interceptor — auto-refresh on 401
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config;

    if (error.response?.status === 401 && !original._retry) {
      original._retry = true;

      try {
        const newTokens = await refreshTokensOnce();
        original.headers.Authorization = `Bearer ${newTokens.accessToken}`;
        return api(original);
      } catch (refreshErr: any) {
        // Transient failure (offline, timeout): the session is probably still
        // valid — reject THIS request but keep the tokens so the next attempt
        // can succeed. Never punish a network blip with a logout.
        if (!refreshErr?.isAuthFailure) {
          return Promise.reject(error);
        }
        // Refresh genuinely failed (account deleted, refresh token revoked,
        // …). Tear down auth state so the root layout transitions to login,
        // and rewrite the user-facing message so screens that surface
        // err.response.data.message show something neutral instead of the
        // raw backend string "Missing authorization token".
        //
        // EXCEPTION: requests marked with `skipSessionExpiredHandler` opt
        // out of the auto-logout. Used by signup-flow finishers like
        // completeOnboarding so a transient 401 mid-finish doesn't tear
        // down auth state behind the AuthScreen's back and bounce the
        // user to login at the very last step. The caller's catch path
        // still sees the error and can fall back locally.
        await clearTokens();
        const skipHandler =
          (original as any)?.skipSessionExpiredHandler === true;
        if (!skipHandler) {
          try {
            _onSessionExpired?.();
          } catch {
            /* listener errors must never block the rejection */
          }
        }
        (error as any).isAuthExpired = true;
        if (error.response?.data && typeof error.response.data === "object") {
          (error.response.data as any).message =
            "Your session expired. Please sign in again.";
        }
      }
    }

    return Promise.reject(error);
  },
);

export default api;
