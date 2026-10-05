/**
 * Per-user Discover settings that outlive a launch: the Recruiting |
 * Community choice and whether the one-time Community tip has been shown.
 *
 * Keyed by user id, so a second account signing in on the same phone starts
 * from its own choice (Recruiting the first time) instead of inheriting the
 * last user's. Every read and write swallows storage errors: losing one of
 * these only means the default comes back, never a broken screen.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import type { DiscoverMode } from "./slices/discoverPreferencesSlice";

const MODE_KEY = "@getdraft/discoverMode";
const COMMUNITY_HINT_KEY = "@getdraft/communityHintSeen";

export async function loadDiscoverMode(
  userId: string,
): Promise<DiscoverMode | null> {
  try {
    const raw = await AsyncStorage.getItem(`${MODE_KEY}:${userId}`);
    return raw === "peer" || raw === "recruit" ? raw : null;
  } catch {
    return null;
  }
}

export async function saveDiscoverMode(
  userId: string,
  mode: DiscoverMode,
): Promise<void> {
  try {
    await AsyncStorage.setItem(`${MODE_KEY}:${userId}`, mode);
  } catch {
    // Ignore storage errors
  }
}

export async function hasSeenCommunityHint(userId: string): Promise<boolean> {
  try {
    return (
      (await AsyncStorage.getItem(`${COMMUNITY_HINT_KEY}:${userId}`)) === "1"
    );
  } catch {
    // Unreadable storage: treat as seen, so a broken store can't show the
    // tip on every visit.
    return true;
  }
}

export async function markCommunityHintSeen(userId: string): Promise<void> {
  try {
    await AsyncStorage.setItem(`${COMMUNITY_HINT_KEY}:${userId}`, "1");
  } catch {
    // Ignore storage errors
  }
}
