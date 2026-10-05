import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UsersService } from './users.service';
import { SupabaseService } from '../../config/supabase.config';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { CurrentUserPayload, UserRole } from '../../common/types';
import { writeAuthzClaims } from '../../common/utils/authz-claims';
import { TEAM_ROLE_DISABLED_MESSAGE } from '../../common/utils/team-role';

jest.mock('../../common/utils/authz-claims', () => ({
  writeAuthzClaims: jest.fn().mockResolvedValue({ error: null }),
}));

type Op = 'select' | 'update' | 'insert';
interface Call {
  table: string;
  op: Op;
  columns?: string;
  payload?: any;
  filters: [string, unknown][];
}
type Handler = (call: Call) => { data: any; error: any };

/**
 * A tiny supabase-js stand-in (the same shape as in profiles.service.spec):
 * every from() records one Call and resolves through `handler`.
 */
function fakeSupabase(handler: Handler) {
  const calls: Call[] = [];
  const from = jest.fn((table: string) => {
    const call: Call = { table, op: 'select', filters: [] };
    calls.push(call);
    const resolve = () => Promise.resolve(handler(call));
    const b: any = {
      select: jest.fn((cols?: string) => {
        if (call.op === 'select') call.columns = cols;
        return b;
      }),
      update: jest.fn((payload: any) => {
        call.op = 'update';
        call.payload = payload;
        return b;
      }),
      insert: jest.fn((payload: any) => {
        call.op = 'insert';
        call.payload = payload;
        return b;
      }),
      eq: jest.fn((col: string, val: unknown) => {
        call.filters.push([col, val]);
        return b;
      }),
      single: jest.fn(resolve),
      maybeSingle: jest.fn(resolve),
      then: (res: any, rej: any) => resolve().then(res, rej),
    };
    return b;
  });
  return { client: { from }, calls };
}

const ok = (data: any) => ({ data, error: null });

describe('UsersService', () => {
  let service: UsersService;
  let supa: ReturnType<typeof fakeSupabase>;
  let handler: Handler;

  const me = (role: UserRole): CurrentUserPayload => ({
    id: 'user-1',
    email: 'user@test.com',
    role,
  });

  const originalFlag = process.env.TEAM_ROLE_ENABLED;
  afterEach(() => {
    if (originalFlag === undefined) delete process.env.TEAM_ROLE_ENABLED;
    else process.env.TEAM_ROLE_ENABLED = originalFlag;
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    delete process.env.TEAM_ROLE_ENABLED;
    handler = () => ok(null);
    supa = fakeSupabase((call) => handler(call));

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        {
          provide: SupabaseService,
          useValue: { getAdminClient: () => supa.client },
        },
        { provide: SubscriptionsService, useValue: {} },
        { provide: ConfigService, useValue: { get: jest.fn() } },
      ],
    }).compile();
    service = module.get(UsersService);
  });

  describe('getMe: profileCompleted', () => {
    // users row + whether the role's profile row exists.
    const world =
      (role: string, profileTable: string, hasProfile: boolean): Handler =>
      (call) => {
        if (call.table === 'users') return ok({ id: 'user-1', role });
        if (call.table === profileTable) {
          return ok(hasProfile ? { user_id: 'user-1' } : null);
        }
        return ok(null);
      };

    it.each([
      ['team', 'recruiter_profiles'],
      ['coach', 'recruiter_profiles'],
      ['recruiter', 'recruiter_profiles'],
      ['athlete', 'athlete_profiles'],
      ['parent', 'parent_profiles'],
    ])('a %s is done once its %s row exists', async (role, table) => {
      handler = world(role, table, false);
      const before: any = await service.getMe(me(role as UserRole));
      expect(before.role).toBe(role);
      expect(before.profileCompleted).toBe(false);
      expect(supa.calls.map((c) => c.table)).toEqual(['users', table]);

      handler = world(role, table, true);
      const after: any = await service.getMe(me(role as UserRole));
      expect(after.profileCompleted).toBe(true);
    });

    it('a team is never treated as a role with no profile step', async () => {
      // Before 'team' was mapped, an unknown role read as "profile done" and
      // signup skipped the profile step.
      handler = world('team', 'recruiter_profiles', false);
      const result: any = await service.getMe(me(UserRole.TEAM));
      expect(result.profileCompleted).toBe(false);
    });
  });

  describe('updateMe: choosing the account type', () => {
    // `current` is the stored users row the role checks read; the final
    // update echoes the payload back.
    const world =
      (current: { role: string; is_onboarded: boolean }): Handler =>
      (call) => {
        if (call.table === 'users' && call.op === 'select') return ok(current);
        if (call.table === 'users' && call.op === 'update') {
          return ok({ id: 'user-1', ...current, ...call.payload });
        }
        return ok(null);
      };
    const writes = (table: string) =>
      supa.calls.filter((c) => c.table === table && c.op !== 'select');

    it.each([undefined, 'false', '0', 'off', 'no', '', 'maybe'])(
      "TEAM_ROLE_ENABLED=%p: role 'team' is refused with 400, nothing written",
      async (flag) => {
        if (flag === undefined) delete process.env.TEAM_ROLE_ENABLED;
        else process.env.TEAM_ROLE_ENABLED = flag;
        handler = world({ role: 'athlete', is_onboarded: false });

        await expect(
          service.updateMe(me(UserRole.ATHLETE), { role: UserRole.TEAM }),
        ).rejects.toThrow(new BadRequestException(TEAM_ROLE_DISABLED_MESSAGE));
        expect(TEAM_ROLE_DISABLED_MESSAGE).toBe(
          'Team accounts are not available yet.',
        );
        expect(writeAuthzClaims).not.toHaveBeenCalled();
        expect(writes('users')).toHaveLength(0);
      },
    );

    it('while off, the refusal is the 400 even for an onboarded account', async () => {
      handler = world({ role: 'coach', is_onboarded: true });
      await expect(
        service.updateMe(me(UserRole.COACH), { role: UserRole.TEAM }),
      ).rejects.toThrow(new BadRequestException(TEAM_ROLE_DISABLED_MESSAGE));
    });

    it.each(['true', '1', 'on', 'yes', ' TRUE '])(
      "TEAM_ROLE_ENABLED=%p: role 'team' is accepted during signup",
      async (flag) => {
        process.env.TEAM_ROLE_ENABLED = flag;
        handler = world({ role: 'athlete', is_onboarded: false });

        const result: any = await service.updateMe(me(UserRole.ATHLETE), {
          role: UserRole.TEAM,
          name: 'FC Montreal',
        });

        expect(result.role).toBe('team');
        // The claim the guards read, and the column, both say team.
        expect(writeAuthzClaims).toHaveBeenCalledWith(supa.client, 'user-1', {
          role: UserRole.TEAM,
        });
        const [update] = writes('users');
        expect(update.payload).toEqual({ role: 'team', name: 'FC Montreal' });
        expect(update.filters).toContainEqual(['id', 'user-1']);
      },
    );

    it('switched on, the account type is still fixed after onboarding (403)', async () => {
      process.env.TEAM_ROLE_ENABLED = 'true';
      handler = world({ role: 'coach', is_onboarded: true });
      await expect(
        service.updateMe(me(UserRole.COACH), { role: UserRole.TEAM }),
      ).rejects.toThrow(ForbiddenException);
      expect(writeAuthzClaims).not.toHaveBeenCalled();
      expect(writes('users')).toHaveLength(0);
    });

    it('an existing team may resend its own role, even with the switch off again', async () => {
      // The app resends the role on some profile saves. Switching the flag
      // off must stop new teams, not break the ones that exist.
      handler = world({ role: 'team', is_onboarded: true });
      const result: any = await service.updateMe(me(UserRole.TEAM), {
        role: UserRole.TEAM,
        location: 'Montreal, QC',
      });
      expect(result.role).toBe('team');
      expect(writes('users')).toHaveLength(1);
    });

    it('the other roles are not affected by the switch', async () => {
      handler = world({ role: 'athlete', is_onboarded: false });
      const result: any = await service.updateMe(me(UserRole.ATHLETE), {
        role: UserRole.COACH,
      });
      expect(result.role).toBe('coach');
    });

    it('admin stays refused whatever the switch says', async () => {
      process.env.TEAM_ROLE_ENABLED = 'true';
      await expect(
        service.updateMe(me(UserRole.ATHLETE), { role: UserRole.ADMIN }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('switching coach -> team mid-signup moves the profile row with it', async () => {
      process.env.TEAM_ROLE_ENABLED = 'true';
      handler = world({ role: 'coach', is_onboarded: false });
      await service.updateMe(me(UserRole.COACH), { role: UserRole.TEAM });
      const [sync] = writes('recruiter_profiles');
      expect(sync.op).toBe('update');
      expect(sync.payload).toEqual({ role_type: 'team' });
      expect(sync.filters).toContainEqual(['user_id', 'user-1']);
    });

    it('resending the same role, or moving to a role with no recruiter profile, touches no profile row', async () => {
      handler = world({ role: 'coach', is_onboarded: true });
      await service.updateMe(me(UserRole.COACH), { role: UserRole.COACH });
      expect(writes('recruiter_profiles')).toHaveLength(0);

      handler = world({ role: 'coach', is_onboarded: false });
      await service.updateMe(me(UserRole.COACH), { role: UserRole.PARENT });
      expect(writes('recruiter_profiles')).toHaveLength(0);
    });

    it('a save without a role never looks at the switch', async () => {
      handler = world({ role: 'team', is_onboarded: true });
      await service.updateMe(me(UserRole.TEAM), { name: 'FC Montreal' });
      expect(writeAuthzClaims).not.toHaveBeenCalled();
      expect(writes('users')[0].payload).toEqual({ name: 'FC Montreal' });
    });
  });
});
