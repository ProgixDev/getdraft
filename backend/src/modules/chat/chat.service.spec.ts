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
