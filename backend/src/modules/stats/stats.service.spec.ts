import { Test, TestingModule } from '@nestjs/testing';
import { StatsService } from './stats.service';
import { SupabaseService } from '../../config/supabase.config';

// from('users') builder: remembers the role it was filtered on and resolves
// through `answer`, both for an awaited list and for a head count.
const usersTable = (answer: (role: string | undefined) => any) => {
  const from = jest.fn(() => {
    let role: string | undefined;
    const b: any = {
      select: jest.fn(() => b),
      eq: jest.fn((col: string, val: any) => {
        if (col === 'role') role = val;
        return b;
      }),
      then: (res: any, rej: any) =>
        Promise.resolve(answer(role)).then(res, rej),
    };
    return b;
  });
  return { from };
};

describe('StatsService', () => {
  let service: StatsService;
  let client: { from: jest.Mock };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StatsService,
        {
          provide: SupabaseService,
          useValue: { getAdminClient: () => client },
        },
      ],
    }).compile();
    service = module.get(StatsService);
  });

  it('welcome stats count teams next to coaches and agents', async () => {
    const counts: Record<string, number> = {
      athlete: 120,
      coach: 14,
      recruiter: 6,
      parent: 30,
      team: 4,
    };
    client = usersTable((role) => ({ count: counts[role ?? ''] ?? 0 }));

    expect(await service.getWelcomeStats()).toEqual({
      athletes: 120,
      coaches: 14,
      recruiters: 6,
      parents: 30,
      teams: 4,
    });
  });

  it('welcome stats report 0 teams when there are none', async () => {
    client = usersTable(() => ({ count: null }));
    expect((await service.getWelcomeStats()).teams).toBe(0);
  });

  it('globe stats count teams per continent', async () => {
    client = usersTable(() => ({
      data: [
        { role: 'athlete', country: 'Canada' },
        { role: 'team', country: 'Canada' },
        { role: 'team', country: 'United States' },
        { role: 'coach', country: 'France' },
        { role: 'team', country: 'France' },
        { role: 'recruiter', country: 'Japan' },
        { role: 'parent', country: 'Canada' }, // not counted, as before
        { role: 'team', country: 'Atlantis' }, // unknown country: skipped
      ],
    }));

    const stats = await service.getGlobeStats();
    expect(stats['North America']).toEqual({
      athletes: 1,
      coaches: 0,
      recruiters: 0,
      teams: 2,
    });
    expect(stats.Europe).toEqual({
      athletes: 0,
      coaches: 1,
      recruiters: 0,
      teams: 1,
    });
    expect(stats.Asia).toMatchObject({ recruiters: 1, teams: 0 });
  });
});
