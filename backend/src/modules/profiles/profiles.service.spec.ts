import 'reflect-metadata';
import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import {
  ProfilesService,
  DOB_LOCKED_MESSAGE,
  WRONG_PROFILE_MESSAGES,
} from './profiles.service';
import {
  UpsertRecruiterProfileDto,
  WEBSITE_MAX_LENGTH,
} from './dto/recruiter-profile.dto';
import { SupabaseService } from '../../config/supabase.config';
import { OrgType, RecruiterRoleType, UserRole } from '../../common/types';
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

    it("a team's public profile is its recruiter profile, org_type and website included", async () => {
      handler = (call) => {
        if (call.table === 'users') {
          return ok({ id: 'team-1', name: 'FC Montreal', role: 'team' });
        }
        if (call.table === 'recruiter_profiles') {
          return ok({
            user_id: 'team-1',
            organization: 'FC Montreal',
            sport: 'Soccer',
            role_type: 'team',
            org_type: 'club',
            website: 'https://fcmontreal.example',
            verified: true,
          });
        }
        return ok(null);
      };
      const result: any = await service.getPublicProfile(
        'team-1',
        'ath-1',
        'athlete',
      );
      expect(result.role).toBe('team');
      expect(result.profile).toMatchObject({
        organization: 'FC Montreal',
        role_type: 'team',
        org_type: 'club',
        website: 'https://fcmontreal.example',
        verified: true,
      });
      expect(result.age).toBeNull();
      expect(result.parent_user_id).toBeNull();
    });

    it('a team, like a coach, gets the guardian id outreach needs', async () => {
      handler = athleteWorld;
      const result: any = await service.getPublicProfile(
        'ath-1',
        'team-1',
        'team',
      );
      expect(result.parent_user_id).toBe('parent-9');
      expect(result.profile).not.toHaveProperty('date_of_birth');
    });
  });

  describe('profile writes: one profile type per account type', () => {
    const recruiterBody = { organization: 'Org', sport: 'Soccer' };
    const noWrites = () =>
      expect(supa.calls.filter((c) => c.op !== 'select')).toHaveLength(0);

    it.each([
      UserRole.COACH,
      UserRole.RECRUITER,
      UserRole.TEAM,
      UserRole.PARENT,
      UserRole.ADMIN,
    ])(
      'PUT /profiles/athlete is refused for a %s (403), nothing written',
      async (role) => {
        await expect(
          service.upsertAthleteProfile('u-1', role, { sport: 'Soccer' }),
        ).rejects.toThrow(
          new ForbiddenException(WRONG_PROFILE_MESSAGES.athlete),
        );
        noWrites();
      },
    );

    it.each([UserRole.ATHLETE, UserRole.PARENT, UserRole.ADMIN])(
      'PUT /profiles/recruiter is refused for a %s (403), nothing written',
      async (role) => {
        await expect(
          service.upsertRecruiterProfile('u-1', role, recruiterBody),
        ).rejects.toThrow(
          new ForbiddenException(WRONG_PROFILE_MESSAGES.recruiter),
        );
        noWrites();
      },
    );

    it.each([
      UserRole.ATHLETE,
      UserRole.COACH,
      UserRole.RECRUITER,
      UserRole.TEAM,
      UserRole.ADMIN,
    ])(
      'PUT /profiles/parent is refused for a %s (403), nothing written',
      async (role) => {
        await expect(
          service.upsertParentProfile('u-1', role, { relationship: 'Mother' }),
        ).rejects.toThrow(
          new ForbiddenException(WRONG_PROFILE_MESSAGES.parent),
        );
        noWrites();
      },
    );

    it('each account type can still write its own profile', async () => {
      await service.upsertAthleteProfile('u-1', UserRole.ATHLETE, {
        sport: 'Soccer',
      });
      await service.upsertRecruiterProfile(
        'u-2',
        UserRole.COACH,
        recruiterBody,
      );
      await service.upsertRecruiterProfile(
        'u-3',
        UserRole.RECRUITER,
        recruiterBody,
      );
      await service.upsertRecruiterProfile('u-4', UserRole.TEAM, recruiterBody);
      await service.upsertParentProfile('u-5', UserRole.PARENT, {
        relationship: 'Mother',
      });
      const inserts = supa.calls.filter((c) => c.op === 'insert');
      expect(inserts.map((c) => c.table)).toEqual([
        'athlete_profiles',
        'recruiter_profiles',
        'recruiter_profiles',
        'recruiter_profiles',
        'parent_profiles',
      ]);
    });
  });

  describe('upsertRecruiterProfile: coach, agent and team', () => {
    const body = { organization: 'FC Montreal', sport: 'Soccer' };
    const profileWrites = () =>
      supa.calls.filter(
        (c) => c.table === 'recruiter_profiles' && c.op !== 'select',
      );
    // No row yet -> insert; an existing row -> update. Either way the write
    // comes back as the stored row.
    const world =
      (existing: boolean): Handler =>
      (call) => {
        if (call.table !== 'recruiter_profiles') return ok(null);
        if (call.op === 'select') return ok(existing ? { id: 'rp-1' } : null);
        return ok({ id: 'rp-1', ...call.payload });
      };

    it.each([
      [UserRole.COACH, 'coach'],
      [UserRole.RECRUITER, 'agent'],
      [UserRole.TEAM, 'team'],
    ])(
      'role_type comes from the account type: %s -> %p (create)',
      async (role, roleType) => {
        handler = world(false);
        const saved: any = await service.upsertRecruiterProfile(
          'u-1',
          role,
          body,
        );
        const [insert] = profileWrites();
        expect(insert.op).toBe('insert');
        expect(insert.payload.role_type).toBe(roleType);
        expect(insert.payload.user_id).toBe('u-1');
        expect(saved.role_type).toBe(roleType);
      },
    );

    it('the role_type in the request is ignored: a coach cannot label itself a team', async () => {
      for (const existing of [false, true]) {
        supa.calls.length = 0;
        handler = world(existing);
        await service.upsertRecruiterProfile('coach-1', UserRole.COACH, {
          ...body,
          role_type: RecruiterRoleType.TEAM,
        });
        const [write] = profileWrites();
        expect(write.op).toBe(existing ? 'update' : 'insert');
        expect(write.payload.role_type).toBe('coach');
      }
    });

    it('...and a team stays a team whatever the app sends', async () => {
      handler = world(true);
      await service.upsertRecruiterProfile('team-1', UserRole.TEAM, {
        ...body,
        role_type: RecruiterRoleType.AGENT,
      });
      expect(profileWrites()[0].payload.role_type).toBe('team');
    });

    it('org_type and website are saved and returned (create, then update)', async () => {
      handler = world(false);
      const created: any = await service.upsertRecruiterProfile(
        'team-1',
        UserRole.TEAM,
        {
          ...body,
          org_type: OrgType.CLUB,
          website: 'https://fcmontreal.example',
          tags: ['Ligue 1 Québec'],
        },
      );
      expect(profileWrites()[0].payload).toMatchObject({
        organization: 'FC Montreal',
        sport: 'Soccer',
        role_type: 'team',
        org_type: 'club',
        website: 'https://fcmontreal.example',
        tags: ['Ligue 1 Québec'],
      });
      expect(created.org_type).toBe('club');
      expect(created.website).toBe('https://fcmontreal.example');

      supa.calls.length = 0;
      handler = world(true);
      const updated: any = await service.upsertRecruiterProfile(
        'team-1',
        UserRole.TEAM,
        { ...body, org_type: OrgType.ACADEMY, website: null },
      );
      const [update] = profileWrites();
      expect(update.op).toBe('update');
      expect(update.filters).toContainEqual(['user_id', 'team-1']);
      expect(update.payload.org_type).toBe('academy');
      // null clears the website; it is written, not skipped.
      expect(update.payload).toHaveProperty('website', null);
      expect(updated.org_type).toBe('academy');
    });

    it('a save that does not mention org_type or website leaves them alone', async () => {
      handler = world(true);
      await service.upsertRecruiterProfile('coach-1', UserRole.COACH, body);
      // undefined never reaches the database: supabase-js drops it from the
      // JSON body, so the columns are not touched (and not required to exist).
      const sent = JSON.parse(JSON.stringify(profileWrites()[0].payload));
      expect(sent).toEqual({ ...body, role_type: 'coach' });
    });
  });

  // The same options as the global ValidationPipe (main.ts).
  describe('UpsertRecruiterProfileDto', () => {
    const base = { organization: 'FC Montreal', sport: 'Soccer' };
    const parse = (extra: Record<string, unknown>) =>
      plainToInstance(
        UpsertRecruiterProfileDto,
        { ...base, ...extra },
        { enableImplicitConversion: true },
      );
    const invalid = (extra: Record<string, unknown>) =>
      validateSync(parse(extra), {
        whitelist: true,
        forbidNonWhitelisted: true,
      }).map((e) => e.property);

    it('role_type is optional now, and old builds that send it still pass', () => {
      expect(invalid({})).toEqual([]);
      expect(invalid({ role_type: 'coach' })).toEqual([]);
      expect(invalid({ role_type: 'team' })).toEqual([]);
    });

    it.each(['club', 'school', 'college', 'academy', 'pro', 'other'])(
      'accepts org_type %p',
      (orgType) => {
        expect(invalid({ org_type: orgType })).toEqual([]);
      },
    );

    it('refuses an org_type outside the list', () => {
      expect(invalid({ org_type: 'franchise' })).toEqual(['org_type']);
    });

    it('accepts an http(s) website and keeps it as sent', () => {
      const dto = parse({ website: 'https://www.fcmontreal.example/academy' });
      expect(validateSync(dto)).toHaveLength(0);
      expect(dto.website).toBe('https://www.fcmontreal.example/academy');
      expect(invalid({ website: 'http://fcmontreal.example' })).toEqual([]);
    });

    it('adds https:// to a website typed without it', () => {
      const dto = parse({ website: '  www.fcmontreal.example ' });
      expect(validateSync(dto)).toHaveLength(0);
      expect(dto.website).toBe('https://www.fcmontreal.example');
    });

    it.each([
      'javascript:alert(1)',
      'ftp://fcmontreal.example',
      'not a website',
      'https://fcmontreal.example@elsewhere.example',
    ])('refuses %p as a website', (website) => {
      expect(invalid({ website })).toEqual(['website']);
    });

    it('refuses a website longer than the limit', () => {
      const long = `https://fcmontreal.example/${'a'.repeat(WEBSITE_MAX_LENGTH)}`;
      expect(invalid({ website: long })).toEqual(['website']);
    });

    it('an empty org_type or website means "not set": null, and valid', () => {
      const dto = parse({ org_type: '', website: '   ' });
      expect(validateSync(dto)).toHaveLength(0);
      expect(dto.org_type).toBeNull();
      expect(dto.website).toBeNull();
      expect(invalid({ org_type: null, website: null })).toEqual([]);
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
        service.upsertAthleteProfile('ath-1', UserRole.ATHLETE, { date_of_birth: '2000-05-01' }),
      ).rejects.toThrow(new BadRequestException(DOB_LOCKED_MESSAGE));
      expect(writes()).toHaveLength(0);
    });

    it('after onboarding, clearing the date of birth is refused too', async () => {
      handler = world({ dob: '2010-05-01' });
      await expect(
        service.upsertAthleteProfile('ath-1', UserRole.ATHLETE, {
          date_of_birth: null as unknown as string,
        }),
      ).rejects.toThrow(DOB_LOCKED_MESSAGE);
      expect(writes()).toHaveLength(0);
    });

    it('the same date, or the app date picker one-day shift, saves the rest and keeps the stored date', async () => {
      for (const sent of ['2010-05-01', '2010-04-30', '2010-05-01T00:00:00.000Z']) {
        supa.calls.length = 0;
        handler = world({ dob: '2010-05-01' });
        await service.upsertAthleteProfile('ath-1', UserRole.ATHLETE, {
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
      await service.upsertAthleteProfile('ath-1', UserRole.ATHLETE, {
        date_of_birth: '2009-01-01',
      });
      expect(writes()[0].payload.date_of_birth).toBe('2009-01-01');
    });

    it('with no date of birth stored, one can be added after onboarding, and the guardian gate runs', async () => {
      handler = world({ dob: null, onboarded: true });
      await service.upsertAthleteProfile('ath-1', UserRole.ATHLETE, {
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
      await service.upsertAthleteProfile('ath-1', UserRole.ATHLETE, {
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
        service.upsertAthleteProfile('ath-1', UserRole.ATHLETE, { date_of_birth: '2011-02-03' }),
      ).rejects.toThrow(BadRequestException);
      const [first, rollback] = writes();
      expect(first.payload.date_of_birth).toBe('2011-02-03');
      expect(rollback.payload).toEqual({ date_of_birth: null });
    });

    it('a save without a date of birth never looks at onboarding', async () => {
      handler = world({ dob: '2010-05-01' });
      await service.upsertAthleteProfile('ath-1', UserRole.ATHLETE, { bio: 'Only a bio' });
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
        service.upsertAthleteProfile('ath-1', UserRole.ATHLETE, { date_of_birth: '2000-01-01' }),
      ).rejects.toThrow(BadRequestException);
      expect(writes()).toHaveLength(0);
    });
  });
});
