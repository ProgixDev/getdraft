import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
import { OutreachService } from './outreach.service';
import { SupabaseService } from '../../config/supabase.config';
import { NotificationsService } from '../notifications/notifications.service';
import { CurrentUserPayload, UserRole } from '../../common/types';

interface Call {
  table: string;
  op: 'select' | 'insert' | 'update' | 'delete';
  columns?: string;
  payload?: any;
  filters: [string, unknown][];
}
type Handler = (call: Call) => any;

/** supabase-js stand-in: one recorded Call per from(), answered by `handler`. */
function fakeSupabase(handler: Handler) {
  const calls: Call[] = [];
  const from = jest.fn((table: string) => {
    const call: Call = { table, op: 'select', filters: [] };
    calls.push(call);
    const resolve = () => Promise.resolve(handler(call));
    const b: any = {};
    ['or', 'neq', 'order', 'limit'].forEach((m) => {
      b[m] = jest.fn(() => b);
    });
    b.select = jest.fn((cols?: string) => {
      if (call.op === 'select') call.columns = cols;
      return b;
    });
    b.insert = jest.fn((payload: any) => {
      call.op = 'insert';
      call.payload = payload;
      return b;
    });
    b.update = jest.fn((payload: any) => {
      call.op = 'update';
      call.payload = payload;
      return b;
    });
    b.delete = jest.fn(() => {
      call.op = 'delete';
      return b;
    });
    b.eq = jest.fn((col: string, val: unknown) => {
      call.filters.push([col, val]);
      return b;
    });
    b.single = jest.fn(resolve);
    b.maybeSingle = jest.fn(resolve);
    b.then = (res: any, rej: any) => resolve().then(res, rej);
    return b;
  });
  return { client: { from }, calls };
}

const ok = (data: any) => ({ data, error: null });

describe('OutreachService', () => {
  let service: OutreachService;
  let supa: ReturnType<typeof fakeSupabase>;
  let handler: Handler;
  const push = { sendPushToUser: jest.fn().mockResolvedValue(undefined) };

  const as = (role: UserRole): CurrentUserPayload => ({
    id: 'sender-1',
    email: 'sender@test.com',
    role,
  });
  const dto = {
    parentId: 'parent-1',
    childAthleteId: 'ath-1',
    message: 'We would like to invite your daughter to a tryout.',
  };

  // A parent who is the approved guardian of the athlete, nobody blocked.
  const linkedFamily: Handler = (call) => {
    if (call.table === 'users') {
      const id = call.filters.find(([col]) => col === 'id')?.[1];
      if (id === 'parent-1') return ok({ id, role: 'parent' });
      if (id === 'ath-1') return ok({ id, role: 'athlete' });
      return ok({ name: 'FC Montreal' });
    }
    if (call.table === 'guardian_links') return ok([{ id: 'link-1' }]);
    if (call.table === 'blocks') return ok([]);
    if (call.table === 'outreach' && call.op === 'insert') {
      return ok({ id: 'outreach-1', ...call.payload });
    }
    return ok(null);
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    handler = () => ok(null);
    supa = fakeSupabase((call) => handler(call));
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OutreachService,
        {
          provide: SupabaseService,
          useValue: { getAdminClient: () => supa.client },
        },
        { provide: NotificationsService, useValue: push },
      ],
    }).compile();
    service = module.get(OutreachService);
  });

  describe('createOutreach: who may write to a guardian', () => {
    it.each([UserRole.COACH, UserRole.RECRUITER, UserRole.TEAM])(
      "a %s can, when the parent is the athlete's approved guardian",
      async (role) => {
        handler = linkedFamily;
        const outreach: any = await service.createOutreach(as(role), dto);
        expect(outreach.id).toBe('outreach-1');
        const insert = supa.calls.find(
          (c) => c.table === 'outreach' && c.op === 'insert',
        );
        expect(insert?.payload).toMatchObject({
          recruiter_id: 'sender-1',
          parent_id: 'parent-1',
          child_athlete_id: 'ath-1',
        });
        expect(push.sendPushToUser).toHaveBeenCalledTimes(1);
      },
    );

    it.each([UserRole.ATHLETE, UserRole.PARENT, UserRole.ADMIN])(
      'a %s cannot (403), and nothing is read or written',
      async (role) => {
        handler = linkedFamily;
        await expect(service.createOutreach(as(role), dto)).rejects.toThrow(
          ForbiddenException,
        );
        expect(supa.calls).toHaveLength(0);
      },
    );

    it('a team is held to the coach rules: no approved guardian link, no outreach', async () => {
      handler = (call) =>
        call.table === 'guardian_links' ? ok([]) : linkedFamily(call);
      await expect(
        service.createOutreach(as(UserRole.TEAM), dto),
      ).rejects.toThrow(
        new ForbiddenException('This parent is not linked to that athlete'),
      );
      expect(supa.calls.some((c) => c.op === 'insert')).toBe(false);
    });

    it('...and a parent who blocked the team is not contacted', async () => {
      handler = (call) =>
        call.table === 'blocks' ? ok([{ id: 'block-1' }]) : linkedFamily(call);
      await expect(
        service.createOutreach(as(UserRole.TEAM), dto),
      ).rejects.toThrow(new ForbiddenException('You cannot contact this user'));
      expect(supa.calls.some((c) => c.op === 'insert')).toBe(false);
    });
  });

  describe('getOutreachList: the sender label a parent sees', () => {
    // One thread, sent by a user with `role` whose profile row says `roleType`.
    const listFor = async (role: string, roleType: string | null) => {
      handler = (call) => {
        if (call.table === 'outreach') {
          return ok([
            {
              id: 'outreach-1',
              recruiter_id: 'sender-1',
              child_athlete_id: 'ath-1',
              message: 'Hello',
              created_at: '2026-10-01T00:00:00Z',
              status: 'New',
            },
          ]);
        }
        if (call.table === 'users') {
          const id = call.filters.find(([col]) => col === 'id')?.[1];
          return ok(id === 'sender-1' ? { name: 'Sender', role } : { name: 'Sam' });
        }
        if (call.table === 'recruiter_profiles') {
          return ok(
            roleType
              ? { role_type: roleType, organization: 'Org', verified: true }
              : null,
          );
        }
        return { count: 0, data: null, error: null };
      };
      const [row] = await service.getOutreachList('parent-1', UserRole.PARENT);
      return row;
    };

    it.each([
      ['team', 'team', 'Team'],
      ['coach', 'coach', 'Coach'],
      ['recruiter', 'agent', 'Agent'],
    ])('%s (role_type %s) -> %p', async (role, roleType, label) => {
      const row = await listFor(role, roleType);
      expect(row.recruiterRole).toBe(label);
      expect(row.organization).toBe('Org');
      expect(row.verified).toBe(true);
    });

    it("a team is 'Team' even with no profile row, or one that still says coach", async () => {
      expect((await listFor('team', null)).recruiterRole).toBe('Team');
      expect((await listFor('team', 'coach')).recruiterRole).toBe('Team');
    });

    it("an agent with no profile row is still 'Agent', as before", async () => {
      expect((await listFor('recruiter', null)).recruiterRole).toBe('Agent');
    });
  });
});
