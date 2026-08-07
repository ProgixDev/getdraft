/**
 * rankings -- first real module ported off NestJS.
 *
 * Mirrors modules/rankings/{rankings.controller,rankings.service}.ts. The
 * four routes keep their exact paths, query params, response shapes and
 * error messages, because services/rankingsService.ts on the client is not
 * changing.
 *
 *   GET /rankings              ?division&sport&limit
 *   GET /rankings/sports       ?division
 *   GET /rankings/me
 *   GET /rankings/user/:id
 *
 * Two behaviours carried over deliberately -- both are things the original
 * had to be fixed FOR, and a port is exactly where they get quietly lost:
 *
 *  1. "Profile Visible" is absent-means-VISIBLE. The flag lives in a
 *     free-form JSONB blob, so only an explicit `false` hides an athlete.
 *     Treating absent as hidden would empty the leaderboard; treating
 *     `false` as visible would publish athletes who opted out.
 *  2. GET /user/:id narrows via an ALLOW-LIST, not by deleting fields.
 *     That was an IDOR (audit E7): the full view row carried every
 *     engagement counter plus kyc_status -- identity-verification state on
 *     a platform full of minors -- for any id a caller cared to type. An
 *     allow-list also means a column added to the view later is private by
 *     default instead of leaking until someone notices.
 */

import { createRouter, type Ctx } from '../_shared/router.ts';
import { adminClient } from '../_shared/db.ts';
import { requireUser } from '../_shared/auth.ts';
import { BadRequest } from '../_shared/errors.ts';

type Division = 'CA' | 'US' | 'OTHER';
const DIVISIONS: readonly string[] = ['CA', 'US', 'OTHER'];
const VIEW = 'athlete_ranking_scores';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function division(q: URLSearchParams): Division {
  const d = q.get('division');
  return (d && DIVISIONS.includes(d) ? d : 'CA') as Division;
}

/**
 * Athletes who switched "Profile Visible" off. The ranking view has no
 * privacy filter of its own, so without this an opted-out athlete is still
 * listed publicly with name, avatar and score.
 */
async function hiddenAthleteIds(): Promise<string[]> {
  const { data } = await adminClient()
    .from('users')
    .select('id, preferences')
    .eq('role', 'athlete');
  return (data ?? [])
    .filter((u: any) => u?.preferences?.profileVisible === false)
    .map((u: any) => u.id as string);
}

async function isHiddenAthlete(userId: string): Promise<boolean> {
  const { data } = await adminClient()
    .from('users')
    .select('preferences')
    .eq('id', userId)
    .maybeSingle();
  return (data as any)?.preferences?.profileVisible === false;
}

async function fetchRow(userId: string): Promise<any | null> {
  const { data, error } = await adminClient()
    .from(VIEW)
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw BadRequest(error.message);
  return data ?? null;
}

const handler = createRouter('rankings', [
  {
    method: 'GET',
    path: '/',
    handler: async ({ req, query }: Ctx) => {
      await requireUser(req);
      const div = division(query);
      const sport = query.get('sport') ?? undefined;
      const rawLimit = Number(query.get('limit') ?? 50);
      const limit = Math.min(
        Math.max(Number.isFinite(rawLimit) ? rawLimit : 50, 1),
        200,
      );

      let q = adminClient().from(VIEW).select('*').eq('division', div);

      // Excluded in the query rather than post-filtered, so `limit` still
      // returns a full page.
      const hidden = await hiddenAthleteIds();
      if (hidden.length > 0) q = q.not('user_id', 'in', `(${hidden.join(',')})`);

      q = sport
        ? q.eq('sport', sport).order('division_rank', { ascending: true })
        : q.order('score', { ascending: false });

      const { data, error } = await q.limit(limit);
      if (error) throw BadRequest(error.message);
      return data ?? [];
    },
  },

  {
    method: 'GET',
    path: '/sports',
    handler: async ({ req, query }: Ctx) => {
      await requireUser(req);
      let q = adminClient()
        .from(VIEW)
        .select('sport')
        .eq('division', division(query));

      // Same filter as the leaderboard, so a sport whose only athletes
      // opted out doesn't appear in the picker and then open empty.
      const hidden = await hiddenAthleteIds();
      if (hidden.length > 0) q = q.not('user_id', 'in', `(${hidden.join(',')})`);

      const { data, error } = await q;
      if (error) throw BadRequest(error.message);

      const sports = new Set<string>();
      (data ?? []).forEach((r: { sport?: string }) => {
        if (r.sport) sports.add(r.sport);
      });
      return Array.from(sports).sort();
    },
  },

  {
    method: 'GET',
    path: '/me',
    handler: async ({ req }: Ctx) => {
      const caller = await requireUser(req);
      return await fetchRow(caller.id);
    },
  },

  {
    method: 'GET',
    path: '/user/:id',
    handler: async ({ req, params }: Ctx) => {
      const caller = await requireUser(req);
      // Matches ParseUUIDPipe's message so the client's error handling is
      // unchanged.
      if (!UUID_RE.test(params.id)) {
        throw BadRequest('Validation failed (uuid is expected)');
      }

      const row = await fetchRow(params.id);
      if (!row) return null;
      if (caller.id === params.id || caller.role === 'admin') return row;

      // Opted-out athletes are not ranked publicly, so the chip disappears
      // for everyone but themselves.
      if (await isHiddenAthlete(params.id)) return null;

      // ALLOW-LIST. See the header -- do not convert this to a delete-list.
      return {
        user_id: row.user_id,
        name: row.name,
        avatar_url: row.avatar_url,
        country: row.country,
        sport: row.sport,
        position: row.position,
        level: row.level,
        class_year: row.class_year,
        division: row.division,
        score: row.score,
        division_rank: row.division_rank,
        cohort_size: row.cohort_size,
      };
    },
  },
]);

Deno.serve(handler);
