import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { ProfilesService, DOB_LOCKED_MESSAGE } from './profiles.service';
import { SupabaseService } from '../../config/supabase.config';
import { ageFromDob } from '../../common/utils/age';
import { reevaluateMinorActivation } from '../../common/utils/activation';

jest.mock('../../common/utils/activation', () => ({
  reevaluateMinorActivation: jest.fn().mockResolvedValue('active'),
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
 * A tiny supabase-js stand-in: every from() records one Call (table, op,
 * payload, eq filters) and resolves through `handler`.
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
      or: jest.fn(() => b),
      limit: jest.fn(() => b),
      single: jest.fn(resolve),
      maybeSingle: jest.fn(resolve),
      then: (res: any, rej: any) => resolve().then(res, rej),
    };
    return b;
  });
  return { client: { from }, calls };
}

const ok = (data: any) => ({ data, error: null });

describe('ProfilesService', () => {
  let service: ProfilesService;
  let supa: ReturnType<typeof fakeSupabase>;
  let handler: Handler;

  beforeEach(async () => {
    jest.clearAllMocks();
    handler = () => ok(null);
    supa = fakeSupabase((call) => handler(call));

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProfilesService,
        {
          provide: SupabaseService,
          useValue: { getAdminClient: () => supa.client },
        },
      ],
    }).compile();
    service = module.get(ProfilesService);
  });

  describe('getPublicProfile', () => {
    const athleteProfile = {
      id: 'ap-1',
      user_id: 'ath-1',
      sport: 'Soccer',
      bio: 'Striker',
      date_of_birth: '2010-05-01',
    };

    const athleteWorld: Handler = (call) => {
      if (call.table === 'users') {
        return ok({ id: 'ath-1', name: 'Sam', role: 'athlete' });
      }
      if (call.table === 'athlete_profiles') return ok({ ...athleteProfile });
      if (call.table === 'guardian_links') {
        return ok({ guardian_user_id: 'parent-9' });
      }
      return ok(null);
    };

    it("another athlete sees an age, never the date of birth or the guardian id", async () => {
      handler = athleteWorld;
      const result: any = await service.getPublicProfile(
        'ath-1',
        'viewer-1',
        'athlete',
      );
      const age = ageFromDob('2010-05-01');
      expect(result.age).toBe(age);
      expect(result.profile.age).toBe(age);
      expect(result.profile).not.toHaveProperty('date_of_birth');
      expect(JSON.stringify(result)).not.toContain('2010-05-01');
      expect(result.parent_user_id).toBeNull();
      // The guardian link is not even read for this viewer.
      expect(supa.calls.some((c) => c.table === 'guardian_links')).toBe(false);
      expect(result.profile.bio).toBe('Striker');
    });

    it('a coach or agent gets the guardian id outreach needs, but still no date of birth', async () => {
      handler = athleteWorld;
      for (const role of ['coach', 'recruiter']) {
        const result: any = await service.getPublicProfile(
          'ath-1',
          'coach-1',
          role,
        );
        expect(result.parent_user_id).toBe('parent-9');
        expect(result.profile).not.toHaveProperty('date_of_birth');
        expect(typeof result.age).toBe('number');
      }
    });

    it('the owner still gets their own date of birth', async () => {
      handler = athleteWorld;
      const result: any = await service.getPublicProfile(
        'ath-1',
        'ath-1',
        'athlete',
      );
      expect(result.profile.date_of_birth).toBe('2010-05-01');
      expect(result.parent_user_id).toBe('parent-9');
    });

    it('no date of birth, or one in the future: age is null', async () => {
      for (const dob of [null, '2999-01-01']) {
        handler = (call) =>
          call.table === 'athlete_profiles'
            ? ok({ ...athleteProfile, date_of_birth: dob })
            : athleteWorld(call);
        const result: any = await service.getPublicProfile(
          'ath-1',
          'viewer-1',
          'athlete',
        );
        expect(result.age).toBeNull();
        expect(result.profile.age).toBeNull();
      }
    });

    it("a parent's linked child is not shared with other users", async () => {
      handler = (call) => {
        if (call.table === 'users') {
          return ok({ id: 'parent-1', name: 'Pat', role: 'parent' });
        }
        if (call.table === 'parent_profiles') {
          return ok({
            user_id: 'parent-1',
            relationship: 'Mother',
            child_athlete_id: 'ath-1',
            bio: 'Hi',
          });
        }
        return ok(null);
      };
      const other: any = await service.getPublicProfile(
        'parent-1',
        'viewer-1',
        'parent',
      );
      expect(other.profile).not.toHaveProperty('child_athlete_id');
      expect(other.profile.relationship).toBe('Mother');
      expect(other.age).toBeNull();

      const own: any = await service.getPublicProfile(
        'parent-1',
        'parent-1',
        'parent',
      );
      expect(own.profile.child_athlete_id).toBe('ath-1');
    });
  });

  describe('upsertAthleteProfile: date of birth lock', () => {
    const stored = {
      id: 'ap-1',
      user_id: 'ath-1',
      sport: 'Soccer',
      photos: [],
      date_of_birth: '2010-05-01',
    };

    const world =
      (opts: { dob?: string | null; onboarded?: boolean }): Handler =>
      (call) => {
        if (call.table === 'athlete_profiles' && call.op === 'select') {
          return ok({ ...stored, date_of_birth: opts.dob ?? null });
        }
        if (call.table === 'athlete_profiles' && call.op === 'update') {
          return ok({ ...stored, ...call.payload });
        }
        if (call.table === 'users' && call.columns === 'is_onboarded') {
          return ok({ is_onboarded: opts.onboarded ?? true });
        }
        return ok(null);
      };
    const writes = () =>
      supa.calls.filter(
        (c) => c.table === 'athlete_profiles' && c.op !== 'select',
      );

    it('after onboarding, a different date of birth is refused (400)', async () => {
      handler = world({ dob: '2010-05-01' });
      await expect(
        service.upsertAthleteProfile('ath-1', { date_of_birth: '2000-05-01' }),
      ).rejects.toThrow(new BadRequestException(DOB_LOCKED_MESSAGE));
      expect(writes()).toHaveLength(0);
    });

    it('after onboarding, clearing the date of birth is refused too', async () => {
      handler = world({ dob: '2010-05-01' });
      await expect(
        service.upsertAthleteProfile('ath-1', {
          date_of_birth: null as unknown as string,
        }),
      ).rejects.toThrow(DOB_LOCKED_MESSAGE);
      expect(writes()).toHaveLength(0);
    });

    it('the same date, or the app date picker one-day shift, saves the rest and keeps the stored date', async () => {
      for (const sent of ['2010-05-01', '2010-04-30', '2010-05-01T00:00:00.000Z']) {
        supa.calls.length = 0;
        handler = world({ dob: '2010-05-01' });
        await service.upsertAthleteProfile('ath-1', {
          bio: 'New bio',
          date_of_birth: sent,
        });
        const [update] = writes();
        expect(update.payload.bio).toBe('New bio');
        expect(update.payload).not.toHaveProperty('date_of_birth');
      }
      expect(reevaluateMinorActivation).not.toHaveBeenCalled();
    });

    it('before onboarding it can still be corrected', async () => {
      handler = world({ dob: '2010-05-01', onboarded: false });
      await service.upsertAthleteProfile('ath-1', {
        date_of_birth: '2009-01-01',
      });
      expect(writes()[0].payload.date_of_birth).toBe('2009-01-01');
    });

    it('with no date of birth stored, one can be added after onboarding, and the guardian gate runs', async () => {
      handler = world({ dob: null, onboarded: true });
      await service.upsertAthleteProfile('ath-1', {
        date_of_birth: '2011-02-03',
      });
      expect(writes()[0].payload.date_of_birth).toBe('2011-02-03');
      expect(reevaluateMinorActivation).toHaveBeenCalledWith(
        supa.client,
        'ath-1',
      );
    });

    it('before onboarding, adding a date of birth leaves the gate to onboarding', async () => {
      handler = world({ dob: null, onboarded: false });
      await service.upsertAthleteProfile('ath-1', {
        date_of_birth: '2011-02-03',
      });
      expect(reevaluateMinorActivation).not.toHaveBeenCalled();
    });

    it('if the guardian gate cannot run, the new date of birth is undone (400)', async () => {
      (reevaluateMinorActivation as jest.Mock).mockRejectedValueOnce(
        new Error('gotrue down'),
      );
      handler = world({ dob: null, onboarded: true });
      await expect(
        service.upsertAthleteProfile('ath-1', { date_of_birth: '2011-02-03' }),
      ).rejects.toThrow(BadRequestException);
      const [first, rollback] = writes();
      expect(first.payload.date_of_birth).toBe('2011-02-03');
      expect(rollback.payload).toEqual({ date_of_birth: null });
    });

    it('a save without a date of birth never looks at onboarding', async () => {
      handler = world({ dob: '2010-05-01' });
      await service.upsertAthleteProfile('ath-1', { bio: 'Only a bio' });
      expect(
        supa.calls.some(
          (c) => c.table === 'users' && c.columns === 'is_onboarded',
        ),
      ).toBe(false);
      expect(writes()[0].payload).toEqual(
        expect.objectContaining({ bio: 'Only a bio' }),
      );
    });

    it('if onboarding status cannot be read, nothing is unlocked', async () => {
      handler = (call) =>
        call.table === 'users' && call.columns === 'is_onboarded'
          ? { data: null, error: { message: 'timeout' } }
          : world({ dob: '2010-05-01' })(call);
      await expect(
        service.upsertAthleteProfile('ath-1', { date_of_birth: '2000-01-01' }),
      ).rejects.toThrow(BadRequestException);
      expect(writes()).toHaveLength(0);
    });
  });
});
