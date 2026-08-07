/**
 * Response envelope, mirroring
 * backend/src/common/interceptors/transform.interceptor.ts.
 *
 * Nest wraps handler returns as { statusCode, data } -- but NOT always, and
 * the exceptions are load-bearing. Any payload already carrying
 * `statusCode`, `cards` or `checkoutUrl` is returned raw. `cards` is the
 * Discover feed: the client reads `res.cards`, not `res.data.cards`, so
 * wrapping it silently breaks the main screen of the app. Getting this
 * wrong produces a 200 with plausible JSON that no screen can read, which
 * is far worse to debug than an error.
 */

import { corsHeaders } from './cors.ts';
import { toErrorBody } from './errors.ts';

const JSON_HEADERS = { 'Content-Type': 'application/json' };

/** True when Nest would have passed this payload through unwrapped. */
function isPreFormatted(data: unknown): boolean {
  if (!data || typeof data !== 'object') return false;
  const d = data as Record<string, unknown>;
  return (
    d.statusCode !== undefined ||
    d.cards !== undefined ||
    d.checkoutUrl !== undefined
  );
}

export function ok(
  data: unknown,
  status = 200,
  origin?: string | null,
): Response {
  const headers = { ...JSON_HEADERS, ...corsHeaders(origin) };

  // 204 must not carry a body, and neither must a void handler.
  if (status === 204 || data === undefined) {
    return new Response(null, { status: 204, headers: corsHeaders(origin) });
  }

  const body = isPreFormatted(data) ? data : { statusCode: status, data };
  return new Response(JSON.stringify(body), { status, headers });
}

export function fail(err: unknown, origin?: string | null): Response {
  const { body, status } = toErrorBody(err);
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...JSON_HEADERS, ...corsHeaders(origin) },
  });
}
