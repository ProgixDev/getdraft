import type { SupabaseClient } from '@supabase/supabase-js';
import { isMinor } from './age';

export type ActivationStatus = 'active' | 'pending_guardian';

/**
 * Set a user's activation_status on public.users AND mirror it into
 * auth.users.user_metadata.
 *
 * JwtAuthGuard reads `user_metadata` on every request, so mirroring here
 * means the ActivationGuard sees the new value on the very next request
 * without a DB round-trip. This intentionally follows the same
 * role-mirror pattern already used in UsersService.updateMe().
 *
 * Pass the SERVICE-ROLE (admin) Supabase client — auth.admin.* requires it.
 */
export async function setActivationStatus(
  admin: SupabaseClient,
  userId: string,
  status: ActivationStatus,
): Promise<void> {
  // supabase-js returns { error } on failure — surface it instead of
  // silently no-op'ing, which would leave a minor un-gated (or never
  // activate an approved one). Callers decide whether to treat it as fatal.
  const { error: updErr } = await admin
    .from('users')
    .update({ activation_status: status })
    .eq('id', userId);
  if (updErr) {
    throw new Error(`activation_status update failed: ${updErr.message}`);
  }

  const { data: authUser, error: getErr } =
    await admin.auth.admin.getUserById(userId);
  if (getErr) {
    throw new Error(`activation metadata read failed: ${getErr.message}`);
  }
  const mergedMeta = {
    ...(authUser?.user?.user_metadata ?? {}),
    activation_status: status,
  };
  const { error: metaErr } = await admin.auth.admin.updateUserById(userId, {
    user_metadata: mergedMeta,
  });
  if (metaErr) {
    throw new Error(`activation metadata write failed: ${metaErr.message}`);
  }
}

/**
 * Re-decide a single athlete's activation after a guardian link may have
 * disappeared (guardian deleted their account, athlete revoked the link,
 * a link was declined). This is the safety counterpart to the approval
 * flip in guardian-links.service.ts -> adminDecide.
 *
 * Rule: an under-18 athlete may only be `active` while at least one
 * APPROVED guardian link still exists. If none remains they fall back to
 * `pending_guardian` — the exact gate they had before their first
 * approval, so a minor account is never usable without a guardian of
 * record (COPPA consent trail). Adults, non-athletes, and minors who
 * still have another approved guardian are left untouched.
 *
 * Idempotent — safe to call after any link removal. Only writes when the
 * status actually needs to change. Returns the resulting status.
 *
 * Pass the SERVICE-ROLE (admin) Supabase client.
 */
export async function reevaluateMinorActivation(
  admin: SupabaseClient,
  athleteUserId: string,
): Promise<ActivationStatus> {
  // Only athletes are ever gated by the guardian flow.
  const { data: user, error: userErr } = await admin
    .from('users')
    .select('role, activation_status')
    .eq('id', athleteUserId)
    .maybeSingle();
  if (userErr) {
    throw new Error(`reevaluate: user read failed: ${userErr.message}`);
  }
  // User already gone (e.g. cascade) or not an athlete — nothing to gate.
  if (!user || user.role !== 'athlete') return 'active';

  // Non-minors (and accounts with an unknown DOB) follow the same
  // "treated as adult" default as onboarding — never gate them.
  const { data: prof, error: profErr } = await admin
    .from('athlete_profiles')
    .select('date_of_birth')
    .eq('user_id', athleteUserId)
    .maybeSingle();
  if (profErr) {
    throw new Error(`reevaluate: profile read failed: ${profErr.message}`);
  }
  if (!isMinor(prof?.date_of_birth)) return 'active';

  // A minor stays active only while an approved guardian link remains.
  const { data: links, error: linkErr } = await admin
    .from('guardian_links')
    .select('id')
    .eq('athlete_user_id', athleteUserId)
    .eq('status', 'approved')
    .limit(1);
  if (linkErr) {
    throw new Error(`reevaluate: link read failed: ${linkErr.message}`);
  }

  const desired: ActivationStatus =
    links && links.length > 0 ? 'active' : 'pending_guardian';

  if (user.activation_status !== desired) {
    await setActivationStatus(admin, athleteUserId, desired);
  }
  return desired;
}
