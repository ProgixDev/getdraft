import { useEffect, useRef, useState } from "react";

const MAPBOX_TOKEN = process.env.EXPO_PUBLIC_MAPBOX_TOKEN;
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
  if (!MAPBOX_TOKEN) return [];

  const params = new URLSearchParams({
    q: query,
    access_token: MAPBOX_TOKEN,
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
 * Debounced region search bound to an input value.
 *
 * Returns [] rather than throwing when the token is missing or the request
 * fails: every caller pairs this with a local country list that still works,
 * and a network blip should not put an error in front of someone who is only
 * picking a filter.
 */
export function useRegionSearch(query: string) {
  const [results, setResults] = useState<RegionOption[]>([]);
  const [searching, setSearching] = useState(false);
  // Guards against a slow earlier request overwriting a newer one's results.
  const seqRef = useRef(0);

  useEffect(() => {
    const q = query.trim();

    if (!MAPBOX_TOKEN || q.length < MIN_LEN) {
      setResults([]);
      setSearching(false);
      return;
    }

    setSearching(true);
    const seq = ++seqRef.current;

    const timer = setTimeout(async () => {
      try {
        const found = await searchRegions(q);
        if (seq === seqRef.current) setResults(found);
      } catch {
        if (seq === seqRef.current) setResults([]);
      } finally {
        if (seq === seqRef.current) setSearching(false);
      }
    }, DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [query]);

  return { results, searching, enabled: Boolean(MAPBOX_TOKEN) };
}
