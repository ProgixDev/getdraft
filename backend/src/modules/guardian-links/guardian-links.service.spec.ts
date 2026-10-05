import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GuardianLinksService } from './guardian-links.service';
import { SupabaseService } from '../../config/supabase.config';

// One chainable builder per from(): every filter returns the builder and the
// terminal maybeSingle() resolves with what the table is set up to return.
const builder = (result: any) => {
  const b: any = {};
  ['select', 'eq', 'insert', 'update'].forEach((m) => {
    b[m] = jest.fn().mockReturnValue(b);
  });
  b.maybeSingle = jest.fn().mockResolvedValue(result);
  return b;
};

describe('GuardianLinksService', () => {
  let service: GuardianLinksService;
  const mockAdminClient: any = { from: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GuardianLinksService,
        {
          provide: SupabaseService,
          useValue: { getAdminClient: () => mockAdminClient },
        },
        // No secret configured: outside production the service signs with
        // its dev fallback, which is all a round trip needs.
        { provide: ConfigService, useValue: { get: jest.fn() } },
      ],
    }).compile();
    service = module.get(GuardianLinksService);
  });

  describe('submitScan: only a parent account can become a guardian', () => {
    const scan = {
      qrToken: 'not.a.real.token',
      relationship: 'parent' as const,
      questionnaire: {},
    };

    it.each(['athlete', 'coach', 'recruiter', 'team', 'admin'])(
      'a %s is refused with 403 before the QR is even read',
      async (role) => {
        await expect(service.submitScan('user-1', role, scan)).rejects.toThrow(
          new ForbiddenException('Only parent accounts can link to an athlete.'),
        );
        expect(mockAdminClient.from).not.toHaveBeenCalled();
      },
    );

    it('a parent gets past the role check (a forged QR is then a 400, not a 403)', async () => {
      await expect(
        service.submitScan('parent-1', 'parent', scan),
      ).rejects.toThrow(BadRequestException);
    });

    it('a parent scanning a real QR creates the link, waiting for the video', async () => {
      const inserted = { id: 'link-1', status: 'pending_video' };
      const linkInsert = builder({ data: inserted, error: null });
      let guardianLinkCalls = 0;
      mockAdminClient.from.mockImplementation((table: string) => {
        if (table === 'users') {
          return builder({
            data: { id: 'ath-1', role: 'athlete', name: 'Sam' },
            error: null,
          });
        }
        // guardian_links: first the "already linked?" read, then the insert.
        guardianLinkCalls += 1;
        return guardianLinkCalls === 1
          ? builder({ data: null, error: null })
          : linkInsert;
      });

      const { token } = await service.issueQr('ath-1');
      const link = await service.submitScan('parent-1', 'parent', {
        ...scan,
        qrToken: token,
      });

      expect(link).toEqual(inserted);
      expect(linkInsert.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          athlete_user_id: 'ath-1',
          guardian_user_id: 'parent-1',
          status: 'pending_video',
        }),
      );
    });

    it('the same real QR in the hands of a team creates nothing', async () => {
      mockAdminClient.from.mockImplementation(() =>
        builder({ data: { id: 'ath-1', role: 'athlete' }, error: null }),
      );
      const { token } = await service.issueQr('ath-1');
      mockAdminClient.from.mockClear();

      await expect(
        service.submitScan('team-1', 'team', { ...scan, qrToken: token }),
      ).rejects.toThrow(ForbiddenException);
      expect(mockAdminClient.from).not.toHaveBeenCalled();
    });
  });
});
