import type { SupabaseClient } from '@supabase/supabase-js';

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
