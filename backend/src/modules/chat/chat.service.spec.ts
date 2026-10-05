import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ForbiddenException } from '@nestjs/common';
import { ChatService } from './chat.service';
import { SupabaseService } from '../../config/supabase.config';

const mockQueryBuilder = (finalResult: any = { data: null, error: null }) => {
  const builder: any = {};
  [
    'select',
    'eq',
    'neq',
    'or',
    'order',
    'limit',
    'single',
    'insert',
    'update',
    'lt',
  ].forEach((m) => {
    builder[m] = jest.fn().mockReturnValue(builder);
  });
  builder.single.mockResolvedValue(finalResult);
  builder.then = (resolve: any) => resolve(finalResult);
  return builder;
};

describe('ChatService', () => {
  let service: ChatService;
  const mockAdminClient: any = { from: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChatService,
        {
          provide: SupabaseService,
          useValue: { getAdminClient: () => mockAdminClient },
        },
      ],
    }).compile();

    service = module.get<ChatService>(ChatService);
  });

  describe('getThreads', () => {
    it('should return empty array when no matches', async () => {
      const builder = mockQueryBuilder({ data: null });
      mockAdminClient.from.mockReturnValue(builder);

      const result = await service.getThreads('user-1');
      expect(result).toEqual([]);
    });

    // The header label is the other person's real role: a Community
    // athlete is an 'athlete', not the old blanket 'agent'.
    const threadWith = async (other: any, recruiterProfile: any = null) => {
      mockAdminClient.from.mockImplementation((table: string) => {
        if (table === 'matches') {
          return mockQueryBuilder({
            data: [
              {
                id: 'match-1',
                user_1_id: 'user-1',
                user_2_id: other.id,
                matched_at: '2026-09-01T00:00:00Z',
              },
            ],
          });
        }
        if (table === 'users') return mockQueryBuilder({ data: other });
        if (table === 'recruiter_profiles') {
          return mockQueryBuilder({ data: recruiterProfile });
        }
        return mockQueryBuilder({ data: null, count: 0 });
      });
      const [thread] = await service.getThreads('user-1');
      return thread;
    };

    it.each([
      ['athlete', 'athlete'],
      ['parent', 'parent'],
      ['recruiter', 'agent'], // no recruiter profile: the app's word for it
      ['coach', 'coach'],
    ])('labels a %s without a recruiter profile as %p', async (role, label) => {
      const thread = await threadWith({ id: 'u-2', name: 'Alex', role });
      expect(thread.recruiterRole).toBe(label);
    });

    it('does not look up a recruiter profile for an athlete', async () => {
      await threadWith({ id: 'ath-2', name: 'Alex', role: 'athlete' });
      expect(mockAdminClient.from).not.toHaveBeenCalledWith(
        'recruiter_profiles',
      );
    });

    it('keeps the recruiter profile role for coaches and agents', async () => {
      const thread = await threadWith(
        { id: 'rec-2', name: 'Mike', role: 'recruiter' },
        { role_type: 'agent', organization: 'Elite', verified: true },
      );
      expect(thread.recruiterRole).toBe('agent');
      expect(thread.organization).toBe('Elite');
      expect(thread.verified).toBe(true);
    });
  });

  describe('sendMessage', () => {
    it('should send a message to a valid match', async () => {
      const matchData = {
        user_1_id: 'user-1',
        user_2_id: 'user-2',
        is_active: true,
      };
      const messageData = {
        id: 'msg-1',
        match_id: 'match-1',
        sender_id: 'user-1',
        text: 'Hello!',
        created_at: '2026-04-25T10:00:00Z',
      };

      let callCount = 0;
      mockAdminClient.from.mockImplementation((table: string) => {
        callCount++;
        if (table === 'matches') {
          return mockQueryBuilder({ data: matchData });
        }
        if (table === 'messages') {
          return mockQueryBuilder({ data: messageData, error: null });
        }
        return mockQueryBuilder();
      });

      const result = await service.sendMessage('match-1', 'user-1', 'Hello!');
      expect(result.text).toBe('Hello!');
      expect(result.sender_id).toBe('user-1');
    });

    it('should throw NotFoundException when match does not exist', async () => {
      mockAdminClient.from.mockReturnValue(mockQueryBuilder({ data: null }));

      await expect(
        service.sendMessage('no-match', 'user-1', 'Hello!'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException when match is inactive', async () => {
      const matchData = {
        user_1_id: 'user-1',
        user_2_id: 'user-2',
        is_active: false,
      };

      mockAdminClient.from.mockReturnValue(
        mockQueryBuilder({ data: matchData }),
      );

      await expect(
        service.sendMessage('match-1', 'user-1', 'Hello!'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw ForbiddenException when user is not participant', async () => {
      const matchData = {
        user_1_id: 'user-A',
        user_2_id: 'user-B',
        is_active: true,
      };

      mockAdminClient.from.mockReturnValue(
        mockQueryBuilder({ data: matchData }),
      );

      await expect(
        service.sendMessage('match-1', 'user-X', 'Hello!'),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('markAsRead', () => {
    it('should mark messages as read in valid match', async () => {
      const matchData = {
        user_1_id: 'user-1',
        user_2_id: 'user-2',
        is_active: true,
      };

      let callCount = 0;
      mockAdminClient.from.mockImplementation((table: string) => {
        callCount++;
        if (table === 'matches') {
          return mockQueryBuilder({ data: matchData });
        }
        return mockQueryBuilder({ data: null });
      });

      const result = await service.markAsRead('match-1', 'user-1');
      expect(result.message).toBe('Messages marked as read');
    });
  });

  describe('getMessages', () => {
    it('should throw NotFoundException if match not found', async () => {
      mockAdminClient.from.mockReturnValue(mockQueryBuilder({ data: null }));

      await expect(service.getMessages('no-match', 'user-1')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
