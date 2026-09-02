import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

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
};

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

  constructor(private config: ConfigService) {}

  // ------------------------------------------------------------------ Apple

  /**
   * Verify a StoreKit 2 JWS.
   *
   * StoreKit 2 hands the app a signed JWS whose payload already contains the
   * transaction. Apple's public keys sit in the x5c header chain, so the
   * signature can be checked without calling Apple at all -- which means no
   * shared secret to leak and no dependency on Apple's availability at the
   * moment of purchase.
   *
   * The chain is verified back to Apple's root, because an unverified JWS is
   * just JSON: anyone can mint one claiming a Pro subscription.
   */
  async verifyApple(jws: string): Promise<VerifiedPurchase> {
    try {
      const [headerB64, payloadB64, signatureB64] = jws.split('.');
      if (!headerB64 || !payloadB64 || !signatureB64) {
        return { ok: false, reason: 'Malformed JWS' };
      }

      const header = JSON.parse(
        Buffer.from(headerB64, 'base64url').toString('utf8'),
      );
      const chain: string[] = header.x5c ?? [];
      if (chain.length < 2) {
        return { ok: false, reason: 'Missing certificate chain' };
      }

      // Leaf certificate signs the token; verify the token against it first.
      const leafPem = this.derToPem(chain[0]);
      const verifier = crypto.createVerify('SHA256');
      verifier.update(`${headerB64}.${payloadB64}`);
      const signature = Buffer.from(signatureB64, 'base64url');
      const signatureOk = verifier.verify(
        { key: leafPem, dsaEncoding: 'ieee-p1363' },
        signature,
      );
      if (!signatureOk) {
        return { ok: false, reason: 'Signature does not match' };
      }

      // Then walk the chain: each certificate must be signed by the next.
      // Without this a self-signed leaf would pass the check above.
      for (let i = 0; i < chain.length - 1; i += 1) {
        const child = new crypto.X509Certificate(this.derToPem(chain[i]));
        const parent = new crypto.X509Certificate(this.derToPem(chain[i + 1]));
        if (!child.verify(parent.publicKey)) {
          return { ok: false, reason: 'Broken certificate chain' };
        }
      }

      const root = new crypto.X509Certificate(
        this.derToPem(chain[chain.length - 1]),
      );
      if (!/Apple/i.test(root.subject)) {
        return { ok: false, reason: 'Chain does not terminate at Apple' };
      }

      const payload = JSON.parse(
        Buffer.from(payloadB64, 'base64url').toString('utf8'),
      );

      const expiresMs: number | undefined = payload.expiresDate;
      const revoked = !!payload.revocationDate;
      const active =
        !revoked && (!expiresMs || expiresMs > Date.now());

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
        active,
      };
    } catch (err: any) {
      this.logger.error(`apple verification threw: ${err?.message}`);
      return { ok: false, reason: 'Could not verify the receipt' };
    }
  }

  private derToPem(der: string): string {
    const lines = der.match(/.{1,64}/g)?.join('\n') ?? der;
    return `-----BEGIN CERTIFICATE-----\n${lines}\n-----END CERTIFICATE-----\n`;
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
