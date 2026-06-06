/**
 * Persists auth state to AsyncStorage
 * Keeps user logged in until explicit logout
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import type { UserRole } from "./slices/authSlice";

const AUTH_STORAGE_KEY = "@getdraft/auth";

export interface PersistedAuth {
  user: {
    id: string;
    email: string;
    role: UserRole;
    name?: string;
  };
  isOnboarded: boolean;
}

export async function loadAuth(): Promise<PersistedAuth | null> {
  try {
    const raw = await AsyncStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as PersistedAuth;
    return data?.user ? data : null;
  } catch {
    return null;
  }
}

export async function saveAuth(auth: PersistedAuth): Promise<void> {
  try {
    await AsyncStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(auth));
  } catch {
    // Ignore storage errors
  }
}

export async function clearAuth(): Promise<void> {
  try {
    await AsyncStorage.removeItem(AUTH_STORAGE_KEY);
  } catch {
    // Ignore storage errors
  }
}
