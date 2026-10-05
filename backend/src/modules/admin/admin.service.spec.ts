import { Test, TestingModule } from '@nestjs/testing';
import { AdminService } from './admin.service';
import { SupabaseService } from '../../config/supabase.config';
import { ChatGateway } from '../chat/chat.gateway';

describe('AdminService', () => {
  let service: AdminService;
  const usersByRole: Record<string, number> = {
    athlete: 120,
    coach: 14,
    recruiter: 6,
    team: 4,
    parent: 30,
    admin: 1,
  };

  // Every query in getStats is a head count; the users ones may be narrowed
  // to a role, which decides the number that comes back.
  const from = jest.fn((table: string) => {
    let role: string | undefined;
    const b: any = {
      select: jest.fn(() => b),
      eq: jest.fn((col: string, val: any) => {
        if (col === 'role') role = val;
        return b;
      }),
      then: (res: any, rej: any) => {
        const count =
          table !== 'users'
            ? 7
            : role
              ? (usersByRole[role] ?? 0)
              : Object.values(usersByRole).reduce((a, n) => a + n, 0);
        return Promise.resolve({ count }).then(res, rej);
      },
    };
    return b;
  });

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminService,
        {
          provide: SupabaseService,
          useValue: { getAdminClient: () => ({ from }) },
        },
        { provide: ChatGateway, useValue: { disconnectUser: jest.fn() } },
      ],
    }).compile();
    service = module.get(AdminService);
  });

  it('dashboard head counts include teams', async () => {
    const stats = await service.getStats();
    expect(stats.byRole).toEqual(usersByRole);
    expect(stats.totalUsers).toBe(175);
  });
});
