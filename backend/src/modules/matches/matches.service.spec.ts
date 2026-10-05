import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ForbiddenException } from '@nestjs/common';
import { MatchesService } from './matches.service';
import { SupabaseService } from '../../config/supabase.config';

const mockQueryBuilder = (finalResult: any = { data: null, error: null }) => {
  const builder: any = {};
  ['select', 'eq', 'neq', 'or', 'order', 'limit', 'single', 'update'].forEach(
    (m) => {
      builder[m] = jest.fn().mockReturnValue(builder);
    },
  );
  builder.single.mockResolvedValue(finalResult);
  builder.then = (resolve: any) => resolve(finalResult);
  return builder;
};

describe('MatchesService', () => {
  let service: MatchesService;

  const mockAdminClient: any = { from: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MatchesService,
        {
          provide: SupabaseService,
          useValue: { getAdminClient: () => mockAdminClient },
        },
      ],
    }).compile();

    service = module.get<MatchesService>(MatchesService);
  });

  describe('getMatches', () => {
    it('should return empty array when no matches', async () => {
      const builder = mockQueryBuilder({ data: [] });
      mockAdminClient.from.mockReturnValue(builder);

      const result = await service.getMatches('user-1');
      expect(result).toEqual([]);
    });

    // One match with `other`, whose recruiter profile (if any) is `profile`.
    const matchWith = async (other: any, profile: any = null) => {
      mockAdminClient.from.mockImplementation((table: string) => {
        if (table === 'matches') {
          return mockQueryBuilder({
            data: [
              {
                id: 'match-1',
                user_1_id: 'user-1',
                user_2_id: other.id,
                matched_at: '2026-10-01T00:00:00Z',
                kind: 'recruit',
              },
            ],
          });
        }
        if (table === 'users') return mockQueryBuilder({ data: other });
        if (table === 'recruiter_profiles') {
          return mockQueryBuilder({ data: profile });
        }
        return mockQueryBuilder({ data: null, count: 0 });
      });
      const [row] = await service.getMatches('user-1');
      return row;
    };

    it("a team on the Draft Board is labelled 'team', with its club name and verified badge", async () => {
      const row = await matchWith(
        { id: 'team-2', name: 'FC Montreal', role: 'team', is_banned: false },
        { role_type: 'team', organization: 'FC Montreal', verified: true },
      );
      expect(row).toMatchObject({
        recruiterRole: 'team',
        organization: 'FC Montreal',
        verified: true,
        otherRole: 'team',
        kind: 'recruit',
      });
    });

    it("a team stays 'team' with a stale profile row, or with none yet", async () => {
      const stale = await matchWith(
        { id: 'team-2', name: 'FC Montreal', role: 'team', is_banned: false },
        { role_type: 'coach', organization: 'FC Montreal', verified: false },
      );
      expect(stale.recruiterRole).toBe('team');

      const none = await matchWith({
        id: 'team-2',
        name: 'FC Montreal',
        role: 'team',
        is_banned: false,
      });
      expect(none).toMatchObject({ recruiterRole: 'team', organization: '' });
    });

    it('coaches and agents keep the label from their profile', async () => {
      const row = await matchWith(
        { id: 'rec-2', name: 'Mike', role: 'recruiter', is_banned: false },
        { role_type: 'agent', organization: 'Elite', verified: true },
      );
      expect(row).toMatchObject({
        recruiterRole: 'agent',
        organization: 'Elite',
      });
    });
  });

  describe('getMatch', () => {
    it('should return match when user is participant', async () => {
      const matchData = {
        id: 'match-1',
        user_1_id: 'user-1',
        user_2_id: 'user-2',
        is_active: true,
      };
      mockAdminClient.from.mockReturnValue(
        mockQueryBuilder({ data: matchData }),
      );

      const result = await service.getMatch('match-1', 'user-1');
      expect(result.id).toBe('match-1');
    });

    it('should throw NotFoundException when match not found', async () => {
      mockAdminClient.from.mockReturnValue(mockQueryBuilder({ data: null }));

      await expect(service.getMatch('no-match', 'user-1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw ForbiddenException when user is not participant', async () => {
      const matchData = {
        id: 'match-1',
        user_1_id: 'user-A',
        user_2_id: 'user-B',
      };
      mockAdminClient.from.mockReturnValue(
        mockQueryBuilder({ data: matchData }),
      );

      await expect(service.getMatch('match-1', 'user-X')).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('unmatch', () => {
    it('should deactivate an existing match', async () => {
      const matchData = {
        id: 'match-1',
        user_1_id: 'user-1',
        user_2_id: 'user-2',
      };

      const selectBuilder = mockQueryBuilder({ data: matchData });
      const updateBuilder = mockQueryBuilder({ data: null });

      let callCount = 0;
      mockAdminClient.from.mockImplementation(() => {
        callCount++;
        return callCount === 1 ? selectBuilder : updateBuilder;
      });

      const result = await service.unmatch('match-1', 'user-1');
      expect(result.message).toBe('Unmatched successfully');
    });

    it('should throw NotFoundException for non-existent match', async () => {
      mockAdminClient.from.mockReturnValue(mockQueryBuilder({ data: null }));

      await expect(service.unmatch('no-match', 'user-1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw ForbiddenException when not your match', async () => {
      const matchData = {
        id: 'match-1',
        user_1_id: 'user-A',
        user_2_id: 'user-B',
      };
      mockAdminClient.from.mockReturnValue(
        mockQueryBuilder({ data: matchData }),
      );

      await expect(service.unmatch('match-1', 'user-X')).rejects.toThrow(
        ForbiddenException,
      );
    });
  });
});
