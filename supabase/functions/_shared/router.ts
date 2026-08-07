/**
 * A minimal path router, so one Edge Function can serve a whole NestJS
 * module instead of one function per endpoint.
 *
 * Why fat functions: the API has 112 endpoints. Deploying 112 Edge
 * Functions means 112 cold starts, 112 deploy steps and 112 config
 * entries, and Supabase bills and boots per function. One function per
 * NestJS module (~18) keeps related handlers warm together and keeps the
 * mapping obvious when tracing an endpoint from the old stack to the new.
 *
 * Path handling: Supabase serves a function at
 *   /functions/v1/<name>/<rest>
 * and passes the path through as /<name>/<rest>, so the function's own
 * name is stripped before matching. Routes are then written exactly as
 * they appear in the Nest controllers -- '/me', '/user/:id' -- which keeps
 * the two readable side by side during the migration.
 */

import { handlePreflight } from './cors.ts';
import { fail, ok } from './response.ts';
import { NotFound } from './errors.ts';

export interface Ctx {
  req: Request;
  /** :params captured from the path. */
  params: Record<string, string>;
  /** Parsed ?query string. */
  query: URLSearchParams;
  /** Parsed JSON body, or undefined for GET/DELETE and empty bodies. */
  body: unknown;
}

export type Handler = (ctx: Ctx) => Promise<unknown> | unknown;

export interface Route {
  method: string;
  /** e.g. '/user/:id'. Matched after the function name is stripped. */
  path: string;
  handler: Handler;
  /** HTTP status on success. Defaults to 200 (201 for POST). */
  status?: number;
}

interface Compiled extends Route {
  segments: string[];
}

function compile(routes: Route[]): Compiled[] {
  return routes.map((r) => ({
    ...r,
    segments: r.path.split('/').filter(Boolean),
  }));
}

function match(
  compiled: Compiled[],
  method: string,
  segments: string[],
): { route: Compiled; params: Record<string, string> } | null {
  for (const route of compiled) {
    if (route.method !== method) continue;
    if (route.segments.length !== segments.length) continue;

    const params: Record<string, string> = {};
    let good = true;
    for (let i = 0; i < route.segments.length; i++) {
      const pat = route.segments[i];
      if (pat.startsWith(':')) {
        params[pat.slice(1)] = decodeURIComponent(segments[i]);
      } else if (pat !== segments[i]) {
        good = false;
        break;
      }
    }
    if (good) return { route, params };
  }
  return null;
}

/**
 * Build the function's fetch handler.
 *
 * `name` is the deployed function name, stripped from the front of the
 * path before matching.
 */
export function createRouter(name: string, routes: Route[]) {
  const compiled = compile(routes);

  return async (req: Request): Promise<Response> => {
    const origin = req.headers.get('origin');

    const preflight = handlePreflight(req);
    if (preflight) return preflight;

    try {
      const url = new URL(req.url);
      const segments = url.pathname.split('/').filter(Boolean);
      // Drop the function's own name. Supabase includes it; a local
      // `supabase functions serve` may not, so only strip when present.
      if (segments[0] === name) segments.shift();

      const hit = match(compiled, req.method, segments);
      if (!hit) throw NotFound(`Cannot ${req.method} /${segments.join('/')}`);

      let body: unknown = undefined;
      if (req.method !== 'GET' && req.method !== 'DELETE') {
        const raw = await req.text();
        if (raw) {
          try {
            body = JSON.parse(raw);
          } catch {
            // Mirrors Nest's ValidationPipe rejecting unparseable JSON.
            throw NotFound('Malformed JSON body');
          }
        }
      }

      const result = await hit.route.handler({
        req,
        params: hit.params,
        query: url.searchParams,
        body,
      });

      const status =
        hit.route.status ?? (req.method === 'POST' ? 201 : 200);
      return ok(result, status, origin);
    } catch (err) {
      // Unexpected throws are logged in full here and reported to the
      // client as a bare 500 by toErrorBody -- never leak internals.
      if (!(err && typeof err === 'object' && 'status' in err)) {
        console.error(`[${name}] unhandled:`, err);
      }
      return fail(err, origin);
    }
  };
}
