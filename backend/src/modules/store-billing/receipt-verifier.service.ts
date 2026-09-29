import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import {
  Environment,
  SignedDataVerifier,
  VerificationException,
  VerificationStatus,
} from '@apple/app-store-server-library';

export type VerifiedPurchase = {
  ok: boolean;
  reason?: string;
  productId?: string;
  transactionId?: string;
  /** Subscriptions only. */
  expiresAt?: string | null;
  purchasedAt?: string | null;
  /** True when the store says the subscription is currently in force. */
  active?: boolean;
  /** Apple only: the GetDraft user id the app attached to the purchase. */
  appAccountToken?: string | null;
  /** Apple only: 'Production' or 'Sandbox' (App Review and TestFlight). */
  environment?: string | null;
};

export type AppleNotification = {
  notificationType: string;
  subtype: string | null;
  /** Null for notifications that carry no transaction, such as TEST. */
  purchase: VerifiedPurchase | null;
};

/**
 * Apple Root CA - G3, DER, base64: the root StoreKit 2 signs under. Taken
 * from https://www.apple.com/certificateauthority/AppleRootCA-G3.cer. Its
 * SHA-256 is APPLE_ROOT_CA_G3_SHA256, which the spec asserts, so a bad paste
 * fails the tests instead of failing every purchase. Valid until 2039.
 */
export const APPLE_ROOT_CA_G3_BASE64 =
  'MIICQzCCAcmgAwIBAgIILcX8iNLFS5UwCgYIKoZIzj0EAwMwZzEbMBkGA1UEAwwSQXBwbGUgUm9vdCBDQSAtIEczMSYwJAYDVQQLDB1BcHBsZSBDZXJ0aWZpY2F0aW9uIEF1dGhvcml0eTETMBEGA1UECgwKQXBwbGUgSW5jLjELMAkGA1UEBhMCVVMwHhcNMTQwNDMwMTgxOTA2WhcNMzkwNDMwMTgxOTA2WjBnMRswGQYDVQQDDBJBcHBsZSBSb290IENBIC0gRzMxJjAkBgNVBAsMHUFwcGxlIENlcnRpZmljYXRpb24gQXV0aG9yaXR5MRMwEQYDVQQKDApBcHBsZSBJbmMuMQswCQYDVQQGEwJVUzB2MBAGByqGSM49AgEGBSuBBAAiA2IABJjpLz1AcqTtkyJygRMc3RCV8cWjTnHcFBbZDuWmBSp3ZHtfTjjTuxxEtX/1H7YyYl3J6YRbTzBPEVoA/VhYDKX1DyxNB0cTddqXl5dvMVztK517IDvYuVTZXpmkOlEKMaNCMEAwHQYDVR0OBBYEFLuw3qFYM4iapIqZ3r6966/ayySrMA8GA1UdEwEB/wQFMAMBAf8wDgYDVR0PAQH/BAQDAgEGMAoGCCqGSM49BAMDA2gAMGUCMQCD6cHEFl4aXTQY2e3v9GwOAEZLuN+yRhHFD/3meoyhpmvOwgPUnPWTxnS4at+qIxUCMG1mihDK1A3UT82NQz60imOlM27jbdoXt2QfyFMm+YhidDkLF1vLUagM6BgD56KyKA==';

export const APPLE_ROOT_CA_G3_SHA256 =
  '63:34:3A:BF:B8:9A:6A:03:EB:B5:7E:9B:3F:5F:A7:BE:7C:4F:5C:75:6F:30:17:B3:A8:C4:88:C3:65:3E:91:79';

/** GetDraft's numeric App Store id (Apple requires it for production data). */
const DEFAULT_APPLE_APP_ID = 6802070784;

/** Errors where the other App Store environment may still accept the data. */
const WRONG_ENVIRONMENT = new Set<VerificationStatus>([
  VerificationStatus.INVALID_ENVIRONMENT,
  // Sandbox notifications carry no appAppleId, so the production verifier
  // reports them as the wrong app rather than the wrong environment.
  VerificationStatus.INVALID_APP_IDENTIFIER,
]);

/**
 * Asks Apple and Google whether a receipt is real.
 *
 * This is the whole security model for in-app purchases. Everything the client
 * sends is a claim: a jailbroken device can post any product id it likes. Only
 * the store can say whether money actually changed hands, so nothing is
 * granted until one of them confirms it.
 *
 * Both paths are read-only and idempotent, so a retry is always safe.
 */
@Injectable()
export class ReceiptVerifierService {
  private readonly logger = new Logger(ReceiptVerifierService.name);
  private readonly appleProduction: SignedDataVerifier;
  /** Null when sandbox purchases are refused (APPLE_ALLOW_SANDBOX=false). */
  private readonly appleSandbox: SignedDataVerifier | null;

  constructor(private config: ConfigService) {
    // Apple's own verifier, not a hand-rolled one. Twice a hand-written check
    // here accepted forged receipts: first a root pinned by name, then a
    // chain whose leaf was parsed as PEM, so a JWS signed with any key passed
    // next to Apple's genuine public root. The library parses every
    // certificate as DER, checks the chain against the root we supply (never
    // the one in the request), requires exactly three certificates with
    // Apple's App Store OIDs on the leaf (1.2.840.113635.100.6.11.1) and
    // intermediate (1.2.840.113635.100.6.2.1), checks validity dates and
    // OCSP, verifies the signature with the verified leaf's key, and checks
    // bundle id, app id and environment.
    const roots = this.appleRootCertificates();
    const bundleId =
      this.config.get<string>('IOS_BUNDLE_ID') ?? 'com.getdraft.app';
    const appAppleId = Number(
      this.config.get<string>('APPLE_APP_ID') ?? DEFAULT_APPLE_APP_ID,
    );
    // OCSP revocation checks; turned off only by tests, which run offline.
    const onlineChecks =
      this.config.get<string>('APPLE_ONLINE_CHECKS') !== 'false';

    this.appleProduction = new SignedDataVerifier(
      roots,
      onlineChecks,
      Environment.PRODUCTION,
      bundleId,
      appAppleId,
    );
    // App Review buys in the sandbox against this production server, so
    // refusing sandbox data would fail review. TestFlight purchases are
    // sandbox too, which means testers get plans without paying: the price
    // of passing review. Set APPLE_ALLOW_SANDBOX=false to refuse them.
    this.appleSandbox =
      this.config.get<string>('APPLE_ALLOW_SANDBOX') === 'false'
        ? null
        : new SignedDataVerifier(
            roots,
            onlineChecks,
            Environment.SANDBOX,
            bundleId,
          );
  }

  /**
   * The roots Apple data must chain to. Only the spec overrides this, to
   * sign test data under a throwaway root built like Apple's; production
   * always trusts exactly Apple Root CA - G3.
   */
  protected appleRootCertificates(): Buffer[] {
    return [Buffer.from(APPLE_ROOT_CA_G3_BASE64, 'base64')];
  }

  // ------------------------------------------------------------------ Apple

  /**
   * Verify a StoreKit 2 signed transaction (JWS), as the app sends it.
   *
   * The JWS carries the transaction and Apple's signature over it, so it can
   * be checked without a shared secret. An unverified JWS is just JSON:
   * anyone can mint one claiming a Pro subscription, so nothing is trusted
   * until SignedDataVerifier has accepted it.
   */
  async verifyApple(jws: string): Promise<VerifiedPurchase> {
    try {
      const { value } = await this.withAppleVerifier((v) =>
        v.verifyAndDecodeTransaction(jws),
      );
      return this.toPurchase(value);
    } catch (err) {
      return { ok: false, reason: this.appleFailure('transaction', err) };
    }
  }

  /**
   * Verify an App Store Server Notification (V2).
   *
   * The envelope, the renewal info and the transaction inside are separate
   * JWSs, each signed by Apple, so each is verified, and by the verifier that
   * accepted the envelope: a genuine envelope around a forged transaction,
   * or a sandbox transaction inside a production envelope, is refused.
   */
  async verifyAppleNotification(
    signedPayload: string,
  ): Promise<
    | { ok: true; notification: AppleNotification }
    | { ok: false; reason: string }
  > {
    try {
      const { value: body, verifier } = await this.withAppleVerifier((v) =>
        v.verifyAndDecodeNotification(signedPayload),
      );
      const data = body.data;

      let gracePeriodExpiresMs: number | undefined;
      if (data?.signedRenewalInfo) {
        const renewal = await verifier.verifyAndDecodeRenewalInfo(
          data.signedRenewalInfo,
        );
        gracePeriodExpiresMs = renewal.gracePeriodExpiresDate;
      }

      let purchase: VerifiedPurchase | null = null;
      if (data?.signedTransactionInfo) {
        const transaction = await verifier.verifyAndDecodeTransaction(
          data.signedTransactionInfo,
        );
        purchase = this.toPurchase(transaction, gracePeriodExpiresMs);
      }

      return {
        ok: true,
        notification: {
          notificationType: String(body.notificationType ?? ''),
          subtype: body.subtype ?? null,
          purchase,
        },
      };
    } catch (err) {
      return { ok: false, reason: this.appleFailure('notification', err) };
    }
  }

  /**
   * Run a verification in production first, then in the sandbox when the
   * data is simply from the other environment. Any other failure stands.
   */
  private async withAppleVerifier<T>(
    run: (verifier: SignedDataVerifier) => Promise<T>,
  ): Promise<{ value: T; verifier: SignedDataVerifier }> {
    try {
      return {
        value: await run(this.appleProduction),
        verifier: this.appleProduction,
      };
    } catch (err) {
      if (
        this.appleSandbox &&
        err instanceof VerificationException &&
        WRONG_ENVIRONMENT.has(err.status)
      ) {
        return {
          value: await run(this.appleSandbox),
          verifier: this.appleSandbox,
        };
      }
      throw err;
    }
  }

  /** Log a failed Apple verification and turn it into a short reason. */
  private appleFailure(what: string, err: unknown): string {
    if (err instanceof VerificationException) {
      const status = VerificationStatus[err.status] ?? String(err.status);
      this.logger.warn(
        `apple ${what} rejected: ${status}${err.cause ? ` (${err.cause.message})` : ''}`,
      );
      return err.status === VerificationStatus.RETRYABLE_VERIFICATION_FAILURE
        ? 'Could not reach Apple to verify the purchase; try again'
        : `Apple verification failed (${status})`;
    }
    this.logger.error(
      `apple ${what} verification threw: ${(err as Error)?.message ?? err}`,
    );
    return 'Could not verify the purchase';
  }

  /** Map a verified Apple transaction onto the store-neutral shape. */
  private toPurchase(
    payload: {
      productId?: string;
      transactionId?: string;
      originalTransactionId?: string;
      purchaseDate?: number;
      expiresDate?: number;
      revocationDate?: number;
      appAccountToken?: string;
      environment?: string;
    },
    gracePeriodExpiresMs?: number,
  ): VerifiedPurchase {
    const expiresMs: number | undefined = payload.expiresDate;
    const revoked = !!payload.revocationDate;
    // During a billing grace period Apple keeps the subscription in force
    // while it retries the card, so access continues until grace ends.
    const inForce =
      !expiresMs ||
      expiresMs > Date.now() ||
      (!!gracePeriodExpiresMs && gracePeriodExpiresMs > Date.now());

    return {
      ok: true,
      productId: payload.productId,
      transactionId: String(
        payload.originalTransactionId ?? payload.transactionId,
      ),
      purchasedAt: payload.purchaseDate
        ? new Date(payload.purchaseDate).toISOString()
        : null,
      expiresAt: expiresMs ? new Date(expiresMs).toISOString() : null,
      active: !revoked && inForce,
      appAccountToken: payload.appAccountToken ?? null,
      environment: payload.environment ?? null,
    };
  }

  // ----------------------------------------------------------------- Google

  /**
   * Verify a Play purchase token against the Play Developer API.
   *
   * Unlike Apple, the token is opaque -- it means nothing without asking
   * Google. That needs a service account, so this fails closed when one is not
   * configured rather than trusting the client.
   */
  async verifyGoogle(
    productId: string,
    purchaseToken: string,
    isSubscription: boolean,
  ): Promise<VerifiedPurchase> {
    const raw = this.config.get<string>('GOOGLE_SERVICE_ACCOUNT_JSON');
    const packageName =
      this.config.get<string>('ANDROID_PACKAGE_NAME') ?? 'com.getdraft.app';
    if (!raw) {
      this.logger.error(
        'GOOGLE_SERVICE_ACCOUNT_JSON not configured — refusing to grant',
      );
      return { ok: false, reason: 'Play verification is not configured' };
    }

    try {
      const account = JSON.parse(raw);
      const token = await this.googleAccessToken(account);

      const kind = isSubscription ? 'subscriptionsv2' : 'products';
      const url = isSubscription
        ? `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${packageName}/purchases/subscriptionsv2/tokens/${purchaseToken}`
        : `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${packageName}/purchases/products/${productId}/tokens/${purchaseToken}`;

      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const body = await res.text();
        this.logger.warn(
          `google ${kind} verification failed (${res.status}): ${body.slice(0, 200)}`,
        );
        return { ok: false, reason: 'Google rejected the purchase token' };
      }
      const data: any = await res.json();

      if (isSubscription) {
        const line = data.lineItems?.[0];
        const expiry = line?.expiryTime ?? null;
        // ACTIVE and IN_GRACE_PERIOD both mean the user should keep access;
        // cutting off during a billing retry punishes someone whose card just
        // needs updating.
        const active =
          data.subscriptionState === 'SUBSCRIPTION_STATE_ACTIVE' ||
          data.subscriptionState === 'SUBSCRIPTION_STATE_IN_GRACE_PERIOD';
        return {
          ok: true,
          productId: line?.productId ?? productId,
          transactionId: data.latestOrderId ?? purchaseToken,
          purchasedAt: data.startTime ?? null,
          expiresAt: expiry,
          active,
        };
      }

      // One-off product. purchaseState 0 = purchased, 1 = cancelled, 2 = pending.
      if (data.purchaseState !== 0) {
        return { ok: false, reason: 'Purchase is not in a completed state' };
      }
      return {
        ok: true,
        productId,
        transactionId: data.orderId ?? purchaseToken,
        purchasedAt: data.purchaseTimeMillis
          ? new Date(Number(data.purchaseTimeMillis)).toISOString()
          : null,
        expiresAt: null,
        active: true,
      };
    } catch (err: any) {
      this.logger.error(`google verification threw: ${err?.message}`);
      return { ok: false, reason: 'Could not verify the purchase' };
    }
  }

  /**
   * Mint a short-lived access token for the Play Developer API.
   *
   * A signed JWT exchanged for an OAuth token, which is the service-account
   * flow. Done inline rather than pulling in googleapis, which is a large
   * dependency for one call.
   */
  private async googleAccessToken(account: {
    client_email: string;
    private_key: string;
  }): Promise<string> {
    const now = Math.floor(Date.now() / 1000);
    const header = { alg: 'RS256', typ: 'JWT' };
    const claim = {
      iss: account.client_email,
      scope: 'https://www.googleapis.com/auth/androidpublisher',
      aud: 'https://oauth2.googleapis.com/token',
      exp: now + 3600,
      iat: now,
    };
    const enc = (o: unknown) =>
      Buffer.from(JSON.stringify(o)).toString('base64url');
    const unsigned = `${enc(header)}.${enc(claim)}`;
    const signature = crypto
      .createSign('RSA-SHA256')
      .update(unsigned)
      .sign(account.private_key.replace(/\\n/g, '\n'), 'base64url');

    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: `${unsigned}.${signature}`,
      }),
    });
    if (!res.ok) {
      throw new Error(`token exchange failed: ${res.status}`);
    }
    const data: any = await res.json();
    return data.access_token;
  }
}
