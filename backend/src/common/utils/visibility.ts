import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Who may open someone's profile by id, outside Discover and the map (which
 * apply the same rules in their own queries).
 *
 * Hidden from everyone except the person, an admin and, for a minor, their
 * own guardian:
 *   - an athlete who is not active: a minor waiting for guardian approval.
 *     Discover, the map and the rankings never show them; reading the profile
 *     by id used to return all of it (photos, videos, team, city, age).
 *   - either side of a block. Blocking hid the feed and stopped messages, but
 *     the profile itself stayed one tap away.
 *
 * "Profile Visible" off is NOT a reason here: the setting promises to hide
 * the profile from search and the feed, and people the user already matched
 * or messaged still open it from the conversation header.
 */
export interface VisibilityTarget {
  id: string;
  role?: string | null;
  activation_status?: string | null;
}

export async function canViewProfile(
  admin: SupabaseClient,
  target: VisibilityTarget,
  viewer: { id?: string | null; role?: string | null },
): Promise<boolean> {
  if (!viewer.id) return false;
  if (viewer.id === target.id || viewer.role === 'admin') return true;

  if (await isBlockedPair(admin, viewer.id, target.id)) return false;

  const pendingAthlete =
    target.role === 'athlete' &&
    (target.activation_status ?? 'active') !== 'active';
  if (pendingAthlete) {
    // Their guardian is mid-way through linking (scan, video, review) and
    // must still see the child they are linking to.
    const { data } = await admin
      .from('guardian_links')
      .select('id')
      .eq('guardian_user_id', viewer.id)
      .eq('athlete_user_id', target.id)
      .in('status', ['pending_video', 'pending_admin', 'approved'])
      .limit(1);
    return (data?.length ?? 0) > 0;
  }
  return true;
}

/** True if either user has blocked the other. */
export async function isBlockedPair(
  admin: SupabaseClient,
  a: string,
  b: string,
): Promise<boolean> {
  const { data } = await admin
    .from('blocks')
    .select('id')
    .or(
      `and(blocker_id.eq.${a},blocked_id.eq.${b}),` +
        `and(blocker_id.eq.${b},blocked_id.eq.${a})`,
    )
    .limit(1);
  return (data?.length ?? 0) > 0;
}

/** Everyone `userId` blocked or was blocked by. */
export async function blockedPeerIds(
  admin: SupabaseClient,
  userId: string,
): Promise<Set<string>> {
  const { data } = await admin
    .from('blocks')
    .select('blocker_id, blocked_id')
    .or(`blocker_id.eq.${userId},blocked_id.eq.${userId}`);
  const ids = new Set<string>();
  for (const row of data ?? []) {
    ids.add(row.blocker_id === userId ? row.blocked_id : row.blocker_id);
  }
  return ids;
}
