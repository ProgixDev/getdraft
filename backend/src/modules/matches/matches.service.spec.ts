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
