import {
  Body,
  Controller,
  Headers,
  HttpException,
  HttpStatus,
  Logger,
  Post,
} from '@nestjs/common';
import { ApiExcludeEndpoint, ApiTags } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { SkipThrottle } from '@nestjs/throttler';
import { Public } from '../../common/decorators/public.decorator';
import { StoreBillingService } from './store-billing.service';

/** RevenueCat event types this handler acts on. */
const SUBSCRIPTION_ACTIVE = new Set([
  'INITIAL_PURCHASE',
  'RENEWAL',
  'UNCANCELLATION',
  'PRODUCT_CHANGE',
  'SUBSCRIPTION_EXTENDED',
]);
const SUBSCRIPTION_ENDED = new Set(['EXPIRATION']);
const ONE_OFF = new Set(['NON_RENEWING_PURCHASE']);

@ApiTags('Webhooks')
// RevenueCat retries failed deliveries with backoff, so throttling here would
// drop legitimate retries and silently desync billing. The shared secret below
// is this route's abuse defence, exactly as the signature is for Stripe.
@SkipThrottle()
@Controller('webhooks')
export class RevenueCatWebhookController {
  private readonly logger = new Logger(RevenueCatWebhookController.name);

  constructor(
    private storeBilling: StoreBillingService,
    private configService: ConfigService,
  ) {}

  @Public()
  @Post('revenuecat')
  @ApiExcludeEndpoint()
  async handle(
    @Body() body: any,
    @Headers('authorization') authorization?: string,
  ) {
    const secret = this.configService.get<string>('REVENUECAT_WEBHOOK_SECRET');

    // FAIL CLOSED. Without this check anyone could POST a forged
    // INITIAL_PURCHASE naming any app_user_id and be granted Pro for free.
    // Refusing when unconfigured is the only safe default.
    if (!secret) {
      this.logger.error(
        'REVENUECAT_WEBHOOK_SECRET not configured — refusing webhook',
      );
      throw new HttpException(
        'Webhook secret not configured.',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
    if (authorization !== secret) {
      this.logger.warn('rejected RevenueCat webhook: bad authorization header');
      throw new HttpException('Invalid signature.', HttpStatus.UNAUTHORIZED);
    }

    const event = body?.event;
    if (!event?.type) {
      throw new HttpException('Malformed event.', HttpStatus.BAD_REQUEST);
    }

    const type: string = event.type;
    // app_user_id is our own user id: the app calls Purchases.logIn(userId)
    // after sign-in, so RevenueCat reports back in our terms.
    const userId: string | undefined = event.app_user_id;
    const productId: string | undefined = event.product_id;
    const transactionId: string =
      event.transaction_id ?? event.original_transaction_id ?? event.id;
    const store = event.store === 'PLAY_STORE' ? 'google' : 'apple';

    if (!userId || !productId || !transactionId) {
      this.logger.warn(
        `ignoring ${type}: missing app_user_id/product_id/transaction_id`,
      );
      // 200 on purpose: a malformed event will never become well-formed, and
      // a non-2xx makes RevenueCat retry it forever.
      return { received: true, ignored: 'missing fields' };
    }

    try {
      if (ONE_OFF.has(type)) {
        const result = await this.storeBilling.creditStorePack({
          userId,
          store,
          productId,
          transactionId,
          amountCents: Math.round((event.price ?? 0) * 100),
        });
        return { received: true, ...result };
      }

      if (SUBSCRIPTION_ACTIVE.has(type) || SUBSCRIPTION_ENDED.has(type)) {
        const result = await this.storeBilling.applyStoreSubscription({
          userId,
          store,
          productId,
          transactionId,
          periodStart: event.purchased_at_ms
            ? new Date(event.purchased_at_ms).toISOString()
            : null,
          periodEnd: event.expiration_at_ms
            ? new Date(event.expiration_at_ms).toISOString()
            : null,
          active: SUBSCRIPTION_ACTIVE.has(type),
        });
        return { received: true, ...result };
      }

      // CANCELLATION means auto-renew was switched off, NOT that access ended
      // — the user keeps the plan until EXPIRATION arrives. Downgrading here
      // would take away time somebody has already paid for.
      this.logger.log(`[revenuecat] ${type} noted, no entitlement change`);
      return { received: true, ignored: type };
    } catch (err: any) {
      this.logger.error(
        `[revenuecat] ${type} failed for ${userId}: ${err?.message}`,
      );
      // Non-2xx so RevenueCat retries: a genuine failure here means a paying
      // user has not been granted what they bought.
      throw new HttpException(
        'Could not process the event.',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
