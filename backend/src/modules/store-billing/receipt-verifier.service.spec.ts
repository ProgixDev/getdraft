import * as crypto from 'crypto';
import type { ConfigService } from '@nestjs/config';
import {
  APPLE_ROOT_CA_G3_BASE64,
  APPLE_ROOT_CA_G3_SHA256,
  ReceiptVerifierService,
} from './receipt-verifier.service';
import {
  DEV_LEAF_KEY,
  LEAF_KEY,
  TEST_DEV_INTER,
  TEST_DEV_LEAF,
  TEST_INTER,
  TEST_LEAF,
  TEST_ROOT,
} from './apple-test-chain.fixture';

const USER = '11111111-1111-4111-8111-111111111111';
const APP_APPLE_ID = 6802070784;

function config(extra: Record<string, string> = {}): ConfigService {
  // Offline: no OCSP. Dates are then checked at the payload's signedDate.
  const values: Record<string, string> = {
    APPLE_ONLINE_CHECKS: 'false',
    ...extra,
  };
  return { get: (k: string) => values[k] } as unknown as ConfigService;
}

/** The real service, trusting only Apple Root CA - G3. */
const real = (extra?: Record<string, string>) =>
  new ReceiptVerifierService(config(extra));

/** The same service trusting the throwaway test root instead. */
class TestRootVerifier extends ReceiptVerifierService {
  protected appleRootCertificates(): Buffer[] {
    return [Buffer.from(TEST_ROOT, 'base64')];
  }
}
const underTestRoot = (extra?: Record<string, string>) =>
  new TestRootVerifier(config(extra));

const b64url = (o: unknown) =>
  Buffer.from(JSON.stringify(o)).toString('base64url');

function sign(
  payload: object,
  x5c: string[],
  key: crypto.KeyObject | string,
): string {
  const signingInput = `${b64url({ alg: 'ES256', x5c })}.${b64url(payload)}`;
  const privateKey =
    typeof key === 'string' ? crypto.createPrivateKey(key) : key;
  const signature = crypto
    .sign('sha256', Buffer.from(signingInput), {
      key: privateKey,
      dsaEncoding: 'ieee-p1363',
    })
    .toString('base64url');
  return `${signingInput}.${signature}`;
}

const appleChain = [TEST_LEAF, TEST_INTER, TEST_ROOT];

function transaction(extra: Record<string, unknown> = {}) {
  const now = Date.now();
  return {
    transactionId: '2000000001',
    originalTransactionId: '2000000001',
    bundleId: 'com.getdraft.app',
    productId: 'elite_monthly',
    purchaseDate: now,
    expiresDate: now + 30 * 24 * 3600 * 1000,
    type: 'Auto-Renewable Subscription',
    inAppOwnershipType: 'PURCHASED',
    signedDate: now,
    environment: 'Production',
    appAccountToken: USER,
    ...extra,
  };
}

function notification(data: Record<string, unknown>) {
  return {
    notificationType: 'DID_RENEW',
    notificationUUID: '6f1a8a5e-2d1b-4c61-9d1e-0f1e2d3c4b5a',
    version: '2.0',
    signedDate: Date.now(),
    data: {
      bundleId: 'com.getdraft.app',
      appAppleId: APP_APPLE_ID,
      environment: 'Production',
      ...data,
    },
  };
}

describe('ReceiptVerifierService (Apple)', () => {
  it('embeds the genuine Apple Root CA - G3', () => {
    const root = new crypto.X509Certificate(
      Buffer.from(APPLE_ROOT_CA_G3_BASE64, 'base64'),
    );
    expect(root.fingerprint256).toBe(APPLE_ROOT_CA_G3_SHA256);
    expect(root.subject).toContain('CN=Apple Root CA - G3');
  });

  it('accepts a transaction signed by a correctly built StoreKit chain', async () => {
    const res = await underTestRoot().verifyApple(
      sign(transaction(), appleChain, LEAF_KEY),
    );
    expect(res).toMatchObject({
      ok: true,
      productId: 'elite_monthly',
      transactionId: '2000000001',
      active: true,
      appAccountToken: USER,
      environment: 'Production',
    });
  });

  it('accepts sandbox purchases (App Review), unless told not to', async () => {
    const jws = sign(
      transaction({ environment: 'Sandbox' }),
      appleChain,
      LEAF_KEY,
    );
    expect(await underTestRoot().verifyApple(jws)).toMatchObject({
      ok: true,
      environment: 'Sandbox',
    });
    expect(
      await underTestRoot({ APPLE_ALLOW_SANDBOX: 'false' }).verifyApple(jws),
    ).toMatchObject({ ok: false });
  });

  it('refuses the PEM-injection forgery that fooled the hand-rolled check', async () => {
    // x5c[0] is Apple's genuine public root with an attacker PUBLIC KEY block
    // smuggled in after it. The old code verified the signature against the
    // PEM text (the attacker's key) and the chain against the certificate in
    // it (Apple's root), and granted Elite. Nothing here needs an Apple
    // account.
    const attacker = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
    const spki = attacker.publicKey
      .export({ type: 'spki', format: 'der' })
      .toString('base64');
    const injected =
      `${APPLE_ROOT_CA_G3_BASE64}\n-----END CERTIFICATE-----\n` +
      `-----BEGIN PUBLIC KEY-----\n${spki}\n-----END PUBLIC KEY-----`;
    const chain = [injected, APPLE_ROOT_CA_G3_BASE64, APPLE_ROOT_CA_G3_BASE64];

    const res = await real().verifyApple(
      sign(transaction(), chain, attacker.privateKey),
    );
    expect(res.ok).toBe(false);

    const forgedNotification = sign(
      notification({
        signedTransactionInfo: sign(transaction(), chain, attacker.privateKey),
      }),
      chain,
      attacker.privateKey,
    );
    expect((await real().verifyAppleNotification(forgedNotification)).ok).toBe(
      false,
    );
  });

  it('refuses data signed by a developer-held certificate under the same root', async () => {
    // Any paid Apple developer can get a certificate under Apple Root CA - G3
    // for a key they generated (Apple Pay via WWDR CA - G2). Only a leaf
    // carrying the App Store receipt OID may sign.
    const res = await underTestRoot().verifyApple(
      sign(
        transaction(),
        [TEST_DEV_LEAF, TEST_DEV_INTER, TEST_ROOT],
        DEV_LEAF_KEY,
      ),
    );
    expect(res.ok).toBe(false);
  });

  it('refuses a JWS signed by a key other than the leaf certificate', async () => {
    const other = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
    const res = await underTestRoot().verifyApple(
      sign(transaction(), appleChain, other.privateKey),
    );
    expect(res.ok).toBe(false);
  });

  it('refuses chains that are not exactly leaf, intermediate, root', async () => {
    const short = await underTestRoot().verifyApple(
      sign(transaction(), [TEST_LEAF, TEST_INTER], LEAF_KEY),
    );
    const long = await underTestRoot().verifyApple(
      sign(
        transaction(),
        [TEST_LEAF, TEST_INTER, TEST_ROOT, TEST_ROOT],
        LEAF_KEY,
      ),
    );
    expect(short.ok).toBe(false);
    expect(long.ok).toBe(false);
  });

  it("refuses another app's purchase", async () => {
    const res = await underTestRoot().verifyApple(
      sign(transaction({ bundleId: 'com.other.app' }), appleChain, LEAF_KEY),
    );
    expect(res.ok).toBe(false);
  });

  it('refuses the genuine chain under a root it does not trust', async () => {
    // The real service trusts only Apple's root, so the test chain, however
    // well built, is refused there.
    const res = await real().verifyApple(
      sign(transaction(), appleChain, LEAF_KEY),
    );
    expect(res.ok).toBe(false);
  });

  it('refuses garbage without throwing', async () => {
    for (const junk of ['', 'a.b', 'not-a-jws', 'e30.e30.e30']) {
      expect((await real().verifyApple(junk)).ok).toBe(false);
      expect((await real().verifyAppleNotification(junk)).ok).toBe(false);
    }
  });

  describe('notifications', () => {
    it('accepts a signed notification and returns its transaction', async () => {
      const payload = sign(
        notification({
          signedTransactionInfo: sign(transaction(), appleChain, LEAF_KEY),
        }),
        appleChain,
        LEAF_KEY,
      );
      const res = await underTestRoot().verifyAppleNotification(payload);
      expect(res).toMatchObject({
        ok: true,
        notification: {
          notificationType: 'DID_RENEW',
          purchase: { ok: true, productId: 'elite_monthly', active: true },
        },
      });
    });

    it('accepts a sandbox notification, which carries no appAppleId', async () => {
      const payload = sign(
        notification({
          environment: 'Sandbox',
          appAppleId: undefined,
          signedTransactionInfo: sign(
            transaction({ environment: 'Sandbox' }),
            appleChain,
            LEAF_KEY,
          ),
        }),
        appleChain,
        LEAF_KEY,
      );
      expect((await underTestRoot().verifyAppleNotification(payload)).ok).toBe(
        true,
      );
    });

    it('refuses a genuine envelope around a forged transaction', async () => {
      const payload = sign(
        notification({
          signedTransactionInfo: sign(
            transaction(),
            [TEST_DEV_LEAF, TEST_DEV_INTER, TEST_ROOT],
            DEV_LEAF_KEY,
          ),
        }),
        appleChain,
        LEAF_KEY,
      );
      expect((await underTestRoot().verifyAppleNotification(payload)).ok).toBe(
        false,
      );
    });

    it('refuses a production transaction inside a sandbox envelope', async () => {
      const payload = sign(
        notification({
          environment: 'Sandbox',
          appAppleId: undefined,
          signedTransactionInfo: sign(transaction(), appleChain, LEAF_KEY),
        }),
        appleChain,
        LEAF_KEY,
      );
      expect((await underTestRoot().verifyAppleNotification(payload)).ok).toBe(
        false,
      );
    });

    it("refuses a notification for another app id", async () => {
      const payload = sign(
        notification({ appAppleId: 123 }),
        appleChain,
        LEAF_KEY,
      );
      expect((await underTestRoot().verifyAppleNotification(payload)).ok).toBe(
        false,
      );
    });
  });
});
