/**
 * CORS, mirroring main.ts:22-27 -- origin comes from CORS_ORIGINS (comma
 * separated) and falls back to '*'.
 *
 * The React Native app does not enforce CORS, but the landing site and any
 * browser-based admin do, and preflight failures there look like a total
 * outage rather than a config problem. Cheap to get right up front.
 *
 * When an allowlist is configured we echo the caller's origin back rather
 * than emitting the whole list -- browsers accept exactly one value, and
 * `Vary: Origin` keeps a CDN from caching one origin's response for
 * another.
 */

const configured = (Deno.env.get('CORS_ORIGINS') ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

export function corsHeaders(origin?: string | null): Record<string, string> {
  const base: Record<string, string> = {
    'Access-Control-Allow-Headers':
      'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, PUT, DELETE, OPTIONS',
    'Access-Control-Max-Age': '86400',
  };

  if (configured.length === 0) {
    return { ...base, 'Access-Control-Allow-Origin': '*' };
  }
  if (origin && configured.includes(origin)) {
    return { ...base, 'Access-Control-Allow-Origin': origin, Vary: 'Origin' };
  }
  // Not on the allowlist: omit the header entirely so the browser blocks it.
  return { ...base, Vary: 'Origin' };
}

/** Preflight short-circuit. Every function should call this first. */
export function handlePreflight(req: Request): Response | null {
  if (req.method !== 'OPTIONS') return null;
  return new Response(null, {
    status: 204,
    headers: corsHeaders(req.headers.get('origin')),
  });
}
