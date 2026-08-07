/**
 * Caller resolution -- the Edge Function counterpart of JwtAuthGuard +
 * common/utils/authz-claims.ts + ActivationGuard.
 *
 * The rules are carried over deliberately, because they were each fixed
 * for a reason:
 *
 *  1. role / is_banned / activation_status come from app_metadata, NEVER
 *     user_metadata. user_metadata is writable by any signed-in user with
 *     the anon key that ships inside the APK -- reading authz from it let
 *     anyone self-assign role='admin', lift their own ban, or mark a
 *     minor's account active and skip guardian consent.
 *  2. A claim set that cannot be resolved is a DENIAL, not a default.
 *     Guessing 'athlete' on an unreadable row is how a gate silently stops
 *     being a gate.
 *  3. Ban and activation are re-read from public.users rather than trusted
 *     from the token. Supabase does not check access tokens against a
 *     revocation list, so a banned user's JWT stays valid for up to an
 *     hour after signOut. For a product whose users are minors that window
 *     is not acceptable.
 */

import { adminClient, bearer } from './db.ts';
import { Forbidden, Unauthorized } from './errors.ts';

export type UserRole = 'athlete' | 'parent' | 'coach' | 'recruiter' | 'admin';
export type ActivationStatus = 'active' | 'pending_guardian';

export interface Caller {
  id: string;
  email: string | null;
  role: UserRole;
  activationStatus: ActivationStatus;
  /** The caller's raw JWT, for handing to userClient() so RLS applies. */
  token: string;
}

const ROLES: readonly string[] = [
  'athlete',
  'parent',
  'coach',
  'recruiter',
  'admin',
];

/**
 * Authenticate the request. Throws 401 when there is no usable identity and
 * 403 when the account is suspended.
 */
export async function requireUser(req: Request): Promise<Caller> {
  const token = bearer(req);
  if (!token) throw Unauthorized('Missing authentication token');

  const admin = adminClient();

  // Verified against GoTrue, not decoded locally -- a locally-decoded JWT
  // cannot detect a revoked session.
  const { data: got, error } = await admin.auth.getUser(token);
  if (error || !got?.user) throw Unauthorized('Invalid or expired token');
  const user = got.user;

  // Authoritative columns. See rule 3 above for why this is not read from
  // the token even though app_metadata is present in it.
  const { data: row, error: rowErr } = await admin
    .from('users')
    .select('role, is_banned, activation_status')
    .eq('id', user.id)
    .maybeSingle();

  if (rowErr || !row) {
    // No profile row => nothing can be said about what this caller may do.
    throw Unauthorized('Account not found');
  }

  if (row.is_banned === true) {
    throw Forbidden('This account has been suspended.');
  }

  const role = ROLES.includes(row.role) ? (row.role as UserRole) : 'athlete';
  const activationStatus: ActivationStatus =
    row.activation_status === 'pending_guardian' ? 'pending_guardian' : 'active';

  return { id: user.id, email: user.email ?? null, role, activationStatus, token };
}

/** RolesGuard equivalent. */
export function requireRole(caller: Caller, ...allowed: UserRole[]): void {
  if (!allowed.includes(caller.role)) {
    throw Forbidden('You do not have access to this resource.');
  }
}

/**
 * ActivationGuard equivalent -- deny-by-default for under-18 athletes
 * awaiting guardian consent. Routes that must stay reachable so the minor
 * can COMPLETE activation (read-self, guardian QR, KYC) simply do not call
 * this, mirroring @AllowPending().
 */
export function requireActivated(caller: Caller): void {
  if (caller.activationStatus !== 'active') {
    throw Forbidden('Your account is awaiting guardian approval.');
  }
}
