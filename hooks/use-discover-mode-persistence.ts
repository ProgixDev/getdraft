import { useEffect, useRef, useState } from "react";
import { useStore } from "react-redux";
import type { RootState } from "@/store";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { setDiscoverMode } from "@/store/slices/discoverPreferencesSlice";
import { loadDiscoverMode, saveDiscoverMode } from "@/store/discoverStorage";

/**
 * Remembers the Recruiting | Community switch across launches. Mount once,
 * at the root, so it runs whichever screen flips the switch (Discover or
 * the Globe, which share it).
 *
 * When a user is signed in (a cold launch restoring the session, or a fresh
 * sign-in) their saved choice is read and applied; nothing saved means
 * Recruiting, the first-launch default. From then on every change is written
 * back for that user.
 */
export function useDiscoverModePersistence(): void {
  const dispatch = useAppDispatch();
  const store = useStore<RootState>();
  const userId = useAppSelector((s) => s.auth.user?.id ?? null);
  const mode = useAppSelector((s) => s.discoverPreferences.mode);
  // The user whose saved choice has been applied in this sign-in. Writes wait
  // for it, so the in-memory default can never overwrite a saved Community
  // before it has been read. Reset synchronously when the user changes (the
  // effects run in order, so the write effect below already sees the reset).
  const hydratedFor = useRef<string | null>(null);
  // Re-runs the write effect once the read lands.
  const [hydrations, setHydrations] = useState(0);
  // `${userId}:${mode}` last known to be in storage, to skip redundant writes.
  const persisted = useRef<string | null>(null);

  useEffect(() => {
    hydratedFor.current = null;
    if (!userId) return;
    let cancelled = false;
    const modeBefore = store.getState().discoverPreferences.mode;
    loadDiscoverMode(userId).then((saved) => {
      if (cancelled) return;
      // A switch flipped while the read was in flight wins over the saved
      // value; the write effect then stores the new choice.
      if (store.getState().discoverPreferences.mode === modeBefore) {
        dispatch(setDiscoverMode(saved ?? "recruit"));
      }
      persisted.current = saved ? `${userId}:${saved}` : null;
      hydratedFor.current = userId;
      setHydrations((n) => n + 1);
    });
    return () => {
      cancelled = true;
    };
  }, [userId, dispatch, store]);

  useEffect(() => {
    if (!userId || hydratedFor.current !== userId) return;
    const key = `${userId}:${mode}`;
    if (persisted.current === key) return;
    persisted.current = key;
    saveDiscoverMode(userId, mode);
  }, [userId, mode, hydrations]);
}
