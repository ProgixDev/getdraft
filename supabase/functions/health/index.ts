/**
 * health -- the first Edge Function, and the proof that the pipeline works
 * end to end: deploy, routing, response envelope, and a real query against
 * Postgres from inside the function.
 *
 * Deliberately mirrors the shape of the existing GET /api/health so the
 * client's health ping (fired on app launch) can be repointed without a
 * code change on that path.
 *
 * verify_jwt is false for this function (see config.toml) -- a health probe
 * that requires a valid session cannot tell you the service is up when
 * auth is what is broken.
 */

import { createRouter } from '../_shared/router.ts';
import { adminClient } from '../_shared/db.ts';

const started = Date.now();

const handler = createRouter('health', [
  {
    method: 'GET',
    path: '/',
    handler: async () => {
      // Cheap but real: proves the function can actually reach Postgres,
      // which is the failure that took the old project down. A health
      // check that does not touch its dependencies reports "up" while the
      // database behind it is gone -- exactly what happened here.
      let db: 'up' | 'down' = 'down';
      let dbError: string | undefined;
      try {
        const { error } = await adminClient()
          .from('users')
          .select('id', { count: 'exact', head: true });
        if (error) throw new Error(error.message);
        db = 'up';
      } catch (e) {
        dbError = e instanceof Error ? e.message : String(e);
        console.error('[health] db check failed:', dbError);
      }

      return {
        status: db === 'up' ? 'ok' : 'degraded',
        runtime: 'supabase-edge',
        db,
        ...(dbError ? { dbError } : {}),
        uptimeMs: Date.now() - started,
        timestamp: new Date().toISOString(),
      };
    },
  },
]);

Deno.serve(handler);
