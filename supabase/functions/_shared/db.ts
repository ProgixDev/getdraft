/**
 * Supabase client factories.
 *
 * Two clients, and picking the wrong one is the single easiest way to
 * introduce a security hole in this codebase:
 *
 *   adminClient()      service_role. Bypasses RLS entirely. Use only where
 *                      the handler has already established what the caller
 *                      is allowed to do.
 *   userClient(token)  the caller's own JWT. RLS applies. Prefer this --
 *                      it is the whole point of moving onto Postgres
 *                      policies, and it fails closed if a policy is wrong.
 *
 * Note that 031/032 revoked every anon/authenticated table grant, so
 * userClient() currently reaches nothing. That is deliberate: access is
 * granted back per-table as each surface is migrated and its policies are
 * written and tested, rather than opened wholesale up front.
 */

import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';

function need(name: string): string {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`missing required env var: ${name}`);
  return v;
}

// SUPABASE_URL / the two keys are injected into every Edge Function by the
// platform -- they never need to be set as secrets.
const URL = () => need('SUPABASE_URL');

/** service_role -- bypasses RLS. */
export function adminClient(): SupabaseClient {
  return createClient(URL(), need('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** The caller's identity -- RLS applies. */
export function userClient(accessToken: string): SupabaseClient {
  return createClient(URL(), need('SUPABASE_ANON_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
}

/** Bearer token from the request, or null. */
export function bearer(req: Request): string | null {
  const h = req.headers.get('Authorization') ?? '';
  return h.startsWith('Bearer ') ? h.slice(7).trim() || null : null;
}
