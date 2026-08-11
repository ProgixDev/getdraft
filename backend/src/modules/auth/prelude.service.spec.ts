import { BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { PreludeService } from './prelude.service';

/**
 * The interesting cases here are the ones where "what the API returned" and
 * "what the caller should be told" deliberately differ. Those decisions are
 * easy to mistake for bugs and refactor away, so they are pinned.
 */

const makeService = (apiKey: string | null = 'sk_test') => {
  const svc = new PreludeService({
    get: (k: string) => (k === 'PRELUDE_API_KEY' ? apiKey : undefined),
  } as any);
  svc.onModuleInit();
  return svc;
};

const mockFetch = (body: unknown, ok = true, status = 200) => {
  (globalThis as any).fetch = jest.fn().mockResolvedValue({
    ok,
    status,
    json: async () => body,
  });
};

describe('PreludeService', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    delete (globalThis as any).fetch;
  });

  describe('startVerification', () => {
    it('sends to the v2 endpoint with the channel as preferred_channel', async () => {
      mockFetch({ id: 'vrf_1', status: 'success' });
      await makeService().startVerification('+15551234567', 'sms');

      const [url, init] = (globalThis as any).fetch.mock.calls[0];
      expect(url).toBe('https://api.prelude.dev/v2/verification');
      expect(init.method).toBe('POST');
      expect(init.headers.Authorization).toBe('Bearer sk_test');
      expect(JSON.parse(init.body)).toEqual({
        target: { type: 'phone_number', value: '+15551234567' },
        options: { preferred_channel: 'sms' },
      });
    });

    it('treats retry as a successful send', async () => {
      // A code was already in flight; Prelude resent or reused it. Throwing
      // here would show an error to a user who is about to receive an SMS.
      mockFetch({ id: 'vrf_1', status: 'retry' });
      await expect(
        makeService().startVerification('+15551234567', 'sms'),
      ).resolves.toBeUndefined();
    });

    it('reports SUCCESS when shadow blocked', async () => {
      // The entire point of shadow blocking is that the caller cannot tell
      // it happened. Surfacing an error would hand an attacker the signal.
      mockFetch({ id: 'vrf_1', status: 'shadow_blocked', reason: 'suspicious' });
      await expect(
        makeService().startVerification('+15551234567', 'sms'),
      ).resolves.toBeUndefined();
    });

    it('maps a hard block on an invalid number to a useful message', async () => {
      mockFetch({
        id: 'vrf_1',
        status: 'blocked',
        reason: 'invalid_phone_number',
      });
      await expect(
        makeService().startVerification('+1555', 'sms'),
      ).rejects.toThrow('That phone number looks invalid.');
    });

    it('maps repeated attempts to a rate-limit message', async () => {
      mockFetch({
        id: 'vrf_1',
        status: 'blocked',
        reason: 'repeated_attempts',
      });
      await expect(
        makeService().startVerification('+15551234567', 'sms'),
      ).rejects.toThrow(/Too many attempts/);
    });

    it('fails when Prelude wants a challenge we cannot present', async () => {
      // No captcha UI exists, so pretending a code is on its way would leave
      // the user waiting for a message that never arrives.
      mockFetch({ id: 'vrf_1', status: 'challenged', reason: 'suspicious' });
      await expect(
        makeService().startVerification('+15551234567', 'sms'),
      ).rejects.toThrow(BadRequestException);
    });

    it('never leaks the provider error text to the user', async () => {
      mockFetch(
        { code: 'internal', message: 'account 123 suspended, see dashboard' },
        false,
        500,
      );
      await expect(
        makeService().startVerification('+15551234567', 'sms'),
      ).rejects.toThrow("Couldn't send the code — please try again.");
    });

    it('throws a server error when the API key is missing', async () => {
      await expect(
        makeService(null).startVerification('+15551234567', 'sms'),
      ).rejects.toThrow(InternalServerErrorException);
    });
  });

  describe('checkVerification', () => {
    it('returns true on success', async () => {
      mockFetch({ id: 'vrf_1', status: 'success' });
      await expect(
        makeService().checkVerification('+15551234567', '123456'),
      ).resolves.toBe(true);
    });

    it('returns false on a wrong code', async () => {
      mockFetch({ id: 'vrf_1', status: 'failure' });
      await expect(
        makeService().checkVerification('+15551234567', '000000'),
      ).resolves.toBe(false);
    });

    it('throws on expiry so the user is told to request a new code', async () => {
      // Distinct from "wrong code" on purpose — telling someone their code is
      // wrong when it has merely expired sends them into a retry loop.
      mockFetch({ id: 'vrf_1', status: 'expired_or_not_found' });
      await expect(
        makeService().checkVerification('+15551234567', '123456'),
      ).rejects.toThrow('This code has expired. Request a new one.');
    });

    it('fails CLOSED on an unrecognised status', async () => {
      // A verification result we cannot interpret must never count as a pass.
      mockFetch({ id: 'vrf_1', status: 'something_new_from_the_api' });
      await expect(
        makeService().checkVerification('+15551234567', '123456'),
      ).resolves.toBe(false);
    });

    it('fails CLOSED when the body is not JSON', async () => {
      (globalThis as any).fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => {
          throw new Error('not json');
        },
      });
      await expect(
        makeService().checkVerification('+15551234567', '123456'),
      ).resolves.toBe(false);
    });
  });
});
