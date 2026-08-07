import { resolveAuthzClaims, writeAuthzClaims } from './authz-claims';
import { UserRole } from '../types';

/**
 * These tests exist because the claims resolved here decide what every
 * request is allowed to do. The property under test is narrow and absolute:
 * authz comes from app_metadata or from public.users over service_role, and
 * NEVER from user_metadata — which any signed-in user can rewrite with the
 * anon key that ships inside the APK.
 */

const makeAdmin = (
  profile: Record<string, unknown> | null = null,
  profileError: { message: string } | null = null,
) => {
  const maybeSingle = jest
    .fn()
    .mockResolvedValue({ data: profile, error: profileError });
  const eq = jest.fn().mockReturnValue({ maybeSingle });
  const select = jest.fn().mockReturnValue({ eq });
  const from = jest.fn().mockReturnValue({ select });
  const updateUserById = jest.fn().mockResolvedValue({ data: {}, error: null });
  const getUserById = jest.fn().mockResolvedValue({
    // GoTrue owns provider/providers in here — the merge must keep them.
    data: { user: { id: 'u1', app_metadata: { provider: 'email' } } },
    error: null,
  });
  const admin: any = { from, auth: { admin: { getUserById, updateUserById } } };
  return { admin, from, getUserById, updateUserById };
};

const makeUser = (appMeta: any = {}, userMeta: any = {}): any => ({
  id: 'u1',
  app_metadata: appMeta,
  user_metadata: userMeta,
});

const FULL_CLAIMS = {
  role: UserRole.COACH,
  is_banned: false,
  activation_status: 'active',
};

describe('resolveAuthzClaims', () => {
  it('takes the app_metadata fast path without touching the database', async () => {
    const { admin, from } = makeAdmin();

    const claims = await resolveAuthzClaims(admin, makeUser(FULL_CLAIMS));

    expect(claims).toEqual({
      role: UserRole.COACH,
      isBanned: false,
      activationStatus: 'active',
    });
    expect(from).not.toHaveBeenCalled();
  });

  it('ignores a role planted in user_metadata', async () => {
    // The exact escalation being closed: the client calls
    // supabase.auth.updateUser({ data: { role: 'admin' } }) with the anon
    // key. app_metadata still says coach, so coach is what they get.
    const { admin } = makeAdmin();

    const claims = await resolveAuthzClaims(
      admin,
      makeUser(FULL_CLAIMS, { role: 'admin', is_banned: false }),
    );

    expect(claims.role).toBe(UserRole.COACH);
  });

  it('falls back to public.users, not user_metadata, when claims are absent', async () => {
    // Legacy account: nothing in app_metadata, and a self-planted admin
    // role sitting in user_metadata. The DB column must win.
    const { admin, from } = makeAdmin({
      role: 'athlete',
      is_banned: false,
      activation_status: 'active',
    });

    const claims = await resolveAuthzClaims(
      admin,
      makeUser({}, { role: 'admin' }),
    );

    expect(claims.role).toBe(UserRole.ATHLETE);
    expect(from).toHaveBeenCalledWith('users');
  });

  it('does not let a stale banned flag be dropped by a partial claim set', async () => {
    // role present but is_banned missing => the fast path must NOT fire.
    const { admin } = makeAdmin({
      role: 'athlete',
      is_banned: true,
      activation_status: 'active',
    });

    const claims = await resolveAuthzClaims(
      admin,
      makeUser({ role: 'athlete' }),
    );

    expect(claims.isBanned).toBe(true);
  });

  it('repairs app_metadata after a fallback, preserving GoTrue keys', async () => {
    const { admin, updateUserById } = makeAdmin({
      role: 'recruiter',
      is_banned: false,
      activation_status: 'pending_guardian',
    });

    await resolveAuthzClaims(admin, makeUser({}));

    expect(updateUserById).toHaveBeenCalledWith('u1', {
      app_metadata: {
        provider: 'email',
        role: UserRole.RECRUITER,
        is_banned: false,
        activation_status: 'pending_guardian',
      },
    });
  });

  it('resolves an unrecognised role to the least privilege', async () => {
    const { admin } = makeAdmin({
      role: 'superuser',
      is_banned: false,
      activation_status: 'active',
    });

    const claims = await resolveAuthzClaims(admin, makeUser({}));

    expect(claims.role).toBe(UserRole.ATHLETE);
  });

  it('throws when no source can answer, so the guard denies', async () => {
    // A claim set we cannot resolve is never safe to guess at — JwtAuthGuard
    // turns this into a 401 rather than defaulting to athlete.
    const { admin } = makeAdmin(null);

    await expect(resolveAuthzClaims(admin, makeUser({}))).rejects.toThrow(
      /authz claims unavailable/,
    );
  });
});

describe('writeAuthzClaims', () => {
  it('merges the patch over existing metadata', async () => {
    const { admin, updateUserById } = makeAdmin();

    const { error } = await writeAuthzClaims(admin, 'u1', {
      role: UserRole.PARENT,
    });

    expect(error).toBeNull();
    expect(updateUserById).toHaveBeenCalledWith('u1', {
      app_metadata: { provider: 'email', role: UserRole.PARENT },
    });
  });

  it('returns the error instead of throwing when the write fails', async () => {
    const { admin, updateUserById } = makeAdmin();
    updateUserById.mockResolvedValue({
      data: null,
      error: { message: 'gotrue unavailable' },
    });

    const { error } = await writeAuthzClaims(admin, 'u1', {
      is_banned: true,
    });

    expect(error?.message).toBe('gotrue unavailable');
  });

  it('returns the error instead of throwing when the read throws', async () => {
    const { admin, getUserById } = makeAdmin();
    getUserById.mockRejectedValue(new Error('network down'));

    const { error } = await writeAuthzClaims(admin, 'u1', {
      is_banned: true,
    });

    expect(error?.message).toBe('network down');
  });
});
