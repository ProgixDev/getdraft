import { useEffect, useState } from "react";
import api from "@/services/api";

/**
 * The Mapbox public token, from wherever it can be found.
 *
 * It is an EXPO_PUBLIC_* value, inlined at BUILD time from the EAS
 * environment of one specific project. Any build made elsewhere -- another
 * EAS account, a local build -- ships with it missing, and the Globe shows
 * "Map unavailable" forever while every location search silently returns
 * nothing. That is exactly how the iOS 1.0 in the App Store went out, and
 * how the early APKs did before it.
 *
 * So the build-time token is the fast path, and when it is absent the app
 * asks the server once (GET /config) and caches the answer for the session.
 * The token is public by design -- it ships inside every binary -- so there
 * is nothing to protect by keeping it out of an API response.
 *
 * Everything that talks to Mapbox reads the token through here. Do not read
 * process.env.EXPO_PUBLIC_MAPBOX_TOKEN anywhere else.
 */

const BUILD_TOKEN: string | undefined =
  process.env.EXPO_PUBLIC_MAPBOX_TOKEN || undefined;

let runtimeToken: string | undefined;
let inflight: Promise<string | undefined> | null = null;
const listeners = new Set<(token: string | undefined) => void>();

/** Synchronous: whatever is known right now. May be undefined briefly. */
export function getMapboxToken(): string | undefined {
  return BUILD_TOKEN ?? runtimeToken;
}

/**
 * Resolve the token, fetching from the server if the build has none.
 * Safe to call repeatedly: one request in flight at a time, cached after.
 */
export function loadMapboxToken(): Promise<string | undefined> {
  const known = getMapboxToken();
  if (known) return Promise.resolve(known);
  if (inflight) return inflight;
  inflight = api
    .get("/config")
    .then(({ data }) => {
      const t = data?.data?.mapboxToken ?? data?.mapboxToken;
      runtimeToken = typeof t === "string" && t.length > 0 ? t : undefined;
      if (runtimeToken) listeners.forEach((l) => l(runtimeToken));
      return runtimeToken;
    })
    .catch(() => undefined)
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

/**
 * React hook: the token, re-rendering once the runtime fetch lands. Screens
 * that render Mapbox (the Globe) or gate UI on the token (the location
 * pickers) use this so a build without the token still shows the map a
 * moment later instead of the permanent "unavailable" state.
 */
export function useMapboxToken(): string | undefined {
  return useMapboxTokenStatus().token;
}

/**
 * Same, plus whether a fetch is still in progress -- so a screen can show a
 * spinner while the server is being asked, and only say "unavailable" once
 * both the build and the server have come up empty.
 */
export function useMapboxTokenStatus(): {
  token: string | undefined;
  pending: boolean;
} {
  const [token, setToken] = useState<string | undefined>(getMapboxToken());
  const [pending, setPending] = useState<boolean>(!getMapboxToken());
  useEffect(() => {
    if (token) {
      setPending(false);
      return;
    }
    listeners.add(setToken);
    loadMapboxToken().then((t) => {
      if (t) setToken(t);
      setPending(false);
    });
    return () => {
      listeners.delete(setToken);
    };
  }, [token]);
  return { token, pending };
}
