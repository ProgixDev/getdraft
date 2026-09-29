import { useEffect, useRef, useState } from "react";
import { getMapboxToken, loadMapboxToken, useMapboxToken } from "@/lib/mapbox-token";

const DEBOUNCE_MS = 350;
const MIN_LEN = 2;

/** A first-level division: wilaya, state, province, région. */
export interface RegionOption {
  name: string;
  country: string;
  lat: number | null;
  lng: number | null;
}

/**
 * Looks up first-level divisions by name.
 *
 * Regions come from geocoding rather than a bundled constant: there are
 * ~3,000 worldwide and they get renamed and resplit (Algeria went from 48
 * wilayas to 58 in 2019), so a shipped list is stale the day it lands.
 * Countries are the opposite case and stay local in `constants/countryData`.
 */
export async function searchRegions(query: string): Promise<RegionOption[]> {
  const token = getMapboxToken() ?? (await loadMapboxToken());
  if (!token) return [];

  const params = new URLSearchParams({
    q: query,
    access_token: token,
    // Mapbox's `region` is the first-level division in every country.
    types: "region",
    autocomplete: "true",
    limit: "8",
    language: "en",
  });

  const resp = await fetch(
    `https://api.mapbox.com/search/geocode/v6/forward?${params.toString()}`,
  );
  if (!resp.ok) throw new Error(`geocode ${resp.status}`);

  const json = await resp.json();

  return ((json.features ?? []) as any[])
    .map((feature): RegionOption | null => {
      const props = feature.properties ?? {};
      const name = props.name;
      // The parent country is what makes a region filterable -- "Blida" on
      // its own cannot be resolved, and the row would read ambiguously.
      const country = props.context?.country?.name;
      if (!name || !country) return null;

      const coords = props.coordinates ?? {};
      const lat = Number(coords.latitude ?? feature.geometry?.coordinates?.[1]);
      const lng = Number(coords.longitude ?? feature.geometry?.coordinates?.[0]);

      return {
        name,
        country,
        lat: Number.isFinite(lat) ? lat : null,
        lng: Number.isFinite(lng) ? lng : null,
      };
    })
    .filter((r): r is RegionOption => r !== null);
}

/**
 * Looks up cities and towns by name, optionally inside one country.
 *
 * The bundled city list is a shortcut of the biggest cities in 31 countries;
 * it cannot hold every town an athlete lives in. The Discover city filter is
 * a free-text match on the profile's location, so any real place name works
 * as a filter, and this finds them.
 */
export async function searchCities(
  query: string,
  countryCode?: string,
): Promise<string[]> {
  const token = getMapboxToken() ?? (await loadMapboxToken());
  if (!token) return [];

  const params = new URLSearchParams({
    q: query,
    access_token: token,
    types: "place,locality",
    autocomplete: "true",
    limit: "8",
    language: "en",
  });
  if (countryCode) params.set("country", countryCode.toLowerCase());

  const resp = await fetch(
    `https://api.mapbox.com/search/geocode/v6/forward?${params.toString()}`,
  );
  if (!resp.ok) throw new Error(`geocode ${resp.status}`);

  const json = await resp.json();
  const names = ((json.features ?? []) as any[])
    .map((feature) => feature.properties?.name as string | undefined)
    .filter((name): name is string => Boolean(name));
  // Two towns can share a name inside one country; the filter cannot tell
  // them apart anyway, so show the name once.
  return Array.from(new Set(names));
}

/**
 * Debounced search bound to an input value.
 *
 * Returns [] rather than throwing when the token is missing or the request
 * fails: every caller pairs this with a local list that still works, and a
 * network blip should not put an error in front of someone who is only
 * picking a filter.
 */
function useDebouncedSearch<T>(
  query: string,
  search: (q: string) => Promise<T[]>,
  deps: unknown[] = [],
) {
  const [results, setResults] = useState<T[]>([]);
  const [searching, setSearching] = useState(false);
  // Guards against a slow earlier request overwriting a newer one's results.
  const seqRef = useRef(0);

  const token = useMapboxToken();

  useEffect(() => {
    const q = query.trim();

    if (!token || q.length < MIN_LEN) {
      setResults([]);
      setSearching(false);
      return;
    }

    setSearching(true);
    const seq = ++seqRef.current;

    const timer = setTimeout(async () => {
      try {
        const found = await search(q);
        if (seq === seqRef.current) setResults(found);
      } catch {
        if (seq === seqRef.current) setResults([]);
      } finally {
        if (seq === seqRef.current) setSearching(false);
      }
    }, DEBOUNCE_MS);

    return () => clearTimeout(timer);
    // `search` is recreated every render; `deps` carries what it closes over.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, token, ...deps]);

  return { results, searching, enabled: Boolean(token) };
}

/** Debounced region search bound to an input value. */
export function useRegionSearch(query: string) {
  return useDebouncedSearch(query, searchRegions);
}

/**
 * Debounced city search bound to an input value. Pass `enabled: false` to
 * keep a mounted-but-unused caller from hitting Mapbox.
 */
export function useCitySearch(
  query: string,
  countryCode?: string,
  enabled = true,
) {
  return useDebouncedSearch(
    enabled ? query : "",
    (q) => searchCities(q, countryCode),
    [countryCode],
  );
}
