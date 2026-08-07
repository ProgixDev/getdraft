import type { SupabaseClient, User } from '@supabase/supabase-js';
import { UserRole } from '../types';
import type { ActivationStatus } from './activation';

/**
 * The three claims that decide what a request is allowed to do:
 * `role` (RolesGuard), `is_banned` (JwtAuthGuard / ChatGateway) and
 * `activation_status` (ActivationGuard).
 *
 * They live in auth.users.app_metadata — NEVER user_metadata. user_metadata
 * is self-writable by any signed-in user via
 * supabase.auth.updateUser({ data: {...} }) with the anon key that ships
 * inside the APK, so reading authz out of it let anyone grant themselves
 * role='admin', clear their own ban, or flip a minor's account to 'active'
 * and walk straight past the guardian-consent gate. app_metadata
 * (raw_app_meta_data) can only be written with the service_role key, i.e.
 * by this backend.
 */
export interface AuthzClaims {
  role: UserRole;
  isBanned: boolean;
  activationStatus: ActivationStatus;
}

function parseRole(value: unknown): UserRole | null {
  return (Object.values(UserRole) as string[]).includes(value as string)
    ? (value as UserRole)
    : null;
}

function parseActivation(value: unknown): ActivationStatus | null {
  if (value === 'pending_guardian') return 'pending_guardian';
  if (value === 'active') return 'active';
  return null;
}

/**
 * Resolve the authorization claims for an authenticated Supabase user.
 *
 * app_metadata is the fast path (no DB round-trip — GoTrue's /user endpoint
 * returns the live row, so a ban or an activation flip is visible on the
 * very next request). Accounts minted before the claims moved won't have
 * them; those fall back to public.users read over the SERVICE-ROLE client —
 * the authoritative copy — and are repaired on the way out. There is
 * deliberately NO fallback to user_metadata: that is the hole being closed.
 *
 * Throws when neither source can answer (missing profile row, read error).
 * Callers must treat that as a denial — an unknown claim set is never safe.
 */
export async function resolveAuthzClaims(
  admin: SupabaseClient,
  user: User,
): Promise<AuthzClaims> {
  const appMeta = (user.app_metadata ?? {}) as Record<string, unknown>;

  const role = parseRole(appMeta.role);
  const isBanned =
    typeof appMeta.is_banned === 'boolean' ? appMeta.is_banned : null;
  const activationStatus = parseActivation(appMeta.activation_status);

  if (role !== null && isBanned !== null && activationStatus !== null) {
    return { role, isBanned, activationStatus };
  }

  const { data, error } = await admin
    .from('users')
    .select('role, is_banned, activation_status')
    .eq('id', user.id)
    .maybeSingle();
  if (error || !data) {
    throw new Error(
      `authz claims unavailable for ${user.id}: ${
        error?.message ?? 'no profile row'
      }`,
    );
  }

  // Anything unrecognised resolves to the least-privileged reading:
  // athlete, not-banned only when the column says so, activation only
  // 'active' when the column says so.
  const resolved: AuthzClaims = {
    role: parseRole(data.role) ?? UserRole.ATHLETE,
    isBanned: data.is_banned === true,
    activationStatus: parseActivation(data.activation_status) ?? 'active',
  };

  await repairAppMetadata(admin, user, resolved);
  return resolved;
}

/** Subset of claims a writer wants to change. Keys match the metadata keys. */
export interface AuthzClaimPatch {
  role?: UserRole;
  is_banned?: boolean;
  activation_status?: ActivationStatus;
}

/**
 * Write authz claims into auth.users.app_metadata, merged over whatever is
 * already there.
 *
 * EVERY writer of role / is_banned / activation_status must come through
 * here. resolveAuthzClaims takes its metadata fast path the moment all
 * three claims are present, so a writer that updates only public.users
 * leaves a STALE claim beating the corrected column — which is exactly how
 * a user who picks a different role during onboarding stayed pinned to
 * their signup role forever, 403'd out of their own side of the app.
 *
 * Merges rather than replaces: GoTrue owns 'provider' / 'providers' in
 * app_metadata and dropping those breaks the OAuth login path.
 *
 * Returns the error rather than throwing, because callers need different
 * policies — activation must fail loudly, the ban mirror is best-effort.
 */
export async function writeAuthzClaims(
  admin: SupabaseClient,
  userId: string,
  patch: AuthzClaimPatch,
): Promise<{ error: Error | null }> {
  try {
    const { data: authUser, error: readErr } =
      await admin.auth.admin.getUserById(userId);
    if (readErr || !authUser?.user) {
      return {
        error: new Error(readErr?.message ?? `auth user ${userId} not found`),
      };
    }
    const { error: writeErr } = await admin.auth.admin.updateUserById(userId, {
      app_metadata: {
        ...((authUser.user.app_metadata ?? {}) as Record<string, unknown>),
        ...patch,
      },
    });
    return { error: writeErr ? new Error(writeErr.message) : null };
  } catch (err: any) {
    return { error: err instanceof Error ? err : new Error(String(err)) };
  }
}

/**
 * Mirror the resolved claims into app_metadata so the next request takes
 * the metadata fast path.
 */
async function repairAppMetadata(
  admin: SupabaseClient,
  user: User,
  claims: AuthzClaims,
): Promise<void> {
  // Opportunistic only — the DB read above already answered this request
  // and the next one simply repeats it. Never fail a request on a repair.
  await writeAuthzClaims(admin, user.id, {
    role: claims.role,
    is_banned: claims.isBanned,
    activation_status: claims.activationStatus,
  });
}
