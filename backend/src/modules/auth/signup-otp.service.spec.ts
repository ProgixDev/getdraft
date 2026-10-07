import * as bcrypt from 'bcrypt';
import { SignupOtpService } from './signup-otp.service';

/**
 * One signup_otps row behind a tiny query builder that understands the
 * calls the service makes: select ... eq ... maybeSingle, and
 * update ... eq ... [select]. An update applies only when every eq filter
 * matches the row, which is what makes the attempts compare-and-set real.
 */
function fakeSupabase(row: Record<string, any>) {
  const from = () => {
    let patch: Record<string, any> | null = null;
    const filters: [string, any][] = [];
    const matches = () => filters.every(([k, v]) => row[k] === v);
    const apply = () => {
      if (patch && matches()) {
        Object.assign(row, patch);
        return { data: [{ id: row.id }], error: null };
      }
      return { data: [], error: null };
    };
    const b: any = {
      select: () => (patch ? Promise.resolve(apply()) : b),
      update: (p: Record<string, any>) => {
        patch = p;
        return b;
      },
      eq: (k: string, v: any) => {
        filters.push([k, v]);
        return b;
      },
      maybeSingle: () =>
        Promise.resolve({ data: matches() ? { ...row } : null, error: null }),
      then: (res: any, rej: any) => Promise.resolve(apply()).then(res, rej),
    };
    return b;
  };
  return { getAdminClient: () => ({ from }) } as any;
}

async function rowFor(code: string, attempts = 0) {
  return {
    id: 'otp-1',
    contact: 'a@b.co',
    contact_type: 'email',
    code_hash: await bcrypt.hash(code, 4),
    attempts,
    verified: false,
    expires_at: new Date(Date.now() + 60_000).toISOString(),
  };
}

describe('SignupOtpService', () => {
  it('generates six digits', () => {
    const svc = new SignupOtpService(fakeSupabase({}));
    for (let i = 0; i < 50; i++) expect(svc.generateCode()).toMatch(/^\d{6}$/);
  });

  it('spends an attempt on a wrong code', async () => {
    const row = await rowFor('123456');
    const svc = new SignupOtpService(fakeSupabase(row));
    await expect(svc.verify('a@b.co', 'email', '000000')).rejects.toThrow(
      'Incorrect code.',
    );
    expect(row.attempts).toBe(1);
  });

  it('lets parallel guesses through only one at a time', async () => {
    const row = await rowFor('123456');
    const svc = new SignupOtpService(fakeSupabase(row));
    const guesses = Array.from({ length: 10 }, (_, i) =>
      svc.verify('a@b.co', 'email', String(100000 + i)),
    );
    const results = await Promise.allSettled(guesses);
    // Each guess first has to win the attempts compare-and-set; the rest
    // are refused before their code is ever compared.
    expect(row.attempts).toBeLessThanOrEqual(5);
    expect(results.every((r) => r.status === 'rejected')).toBe(true);
  });

  it('accepts the right code once', async () => {
    const row = await rowFor('123456');
    const svc = new SignupOtpService(fakeSupabase(row));
    await expect(svc.verify('a@b.co', 'email', '123456')).resolves.toBeUndefined();
    expect(row.verified).toBe(true);
    await expect(svc.verify('a@b.co', 'email', '123456')).rejects.toThrow(
      'already been used',
    );
  });

  it('refuses once the attempts are used up', async () => {
    const row = await rowFor('123456', 5);
    const svc = new SignupOtpService(fakeSupabase(row));
    await expect(svc.verify('a@b.co', 'email', '123456')).rejects.toThrow(
      'Too many failed attempts',
    );
  });
});
