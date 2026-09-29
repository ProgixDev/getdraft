import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  Logger,
  Post,
} from '@nestjs/common';
import { ApiExcludeEndpoint, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import {
  AppleNotificationDto,
  PurchasePlatform,
  ValidatePurchaseDto,
} from './dto/validate-purchase.dto';
import { ReceiptVerifierService } from './receipt-verifier.service';
import {
  STORE_PACK_PRODUCTS,
  STORE_PLAN_PRODUCTS,
  StoreBillingService,
} from './store-billing.service';

const OWNED_ELSEWHERE =
  'This purchase belongs to another GetDraft account on this Apple ID.';

@ApiTags('billing')
@Controller('billing')
export class StoreBillingController {
  private readonly logger = new Logger(StoreBillingController.name);

  constructor(
    private verifier: ReceiptVerifierService,
    private storeBilling: StoreBillingService,
  ) {}

  /**
   * Validate a store receipt and grant what it paid for.
   *
   * The user comes from the auth token, never from the request body, and a
   * purchase already tied to another account is refused, so one purchase
   * cannot unlock several accounts.
   *
   * Returns `granted: false` rather than throwing when verification fails. The
   * app uses that to leave the transaction unfinished, so the store offers it
   * again later instead of the user losing what they paid for.
   */
  @Post('validate')
  @ApiOperation({ summary: 'Validate an App Store / Play purchase' })
  async validate(
    @CurrentUser('id') userId: string,
    @Body() dto: ValidatePurchaseDto,
  ) {
    const isSubscription = !!STORE_PLAN_PRODUCTS[dto.productId];
    const isPack = !!STORE_PACK_PRODUCTS[dto.productId];

    if (!isSubscription && !isPack) {
      this.logger.warn(
        `unknown product "${dto.productId}" from user ${userId}`,
      );
      return { granted: false, reason: 'Unknown product' };
    }

    const verified =
      dto.platform === PurchasePlatform.IOS
        ? await this.verifier.verifyApple(dto.purchaseToken)
        : await this.verifier.verifyGoogle(
            dto.productId,
            dto.purchaseToken,
            isSubscription,
          );

    if (!verified.ok) {
      this.logger.warn(
        `receipt rejected for user ${userId} (${dto.productId}): ${verified.reason}`,
      );
      return { granted: false, reason: verified.reason };
    }

    // The store is the authority on WHAT was bought. Trusting the client's
    // productId here would let someone pay for drafts_10 and claim pro_monthly.
    const productId = verified.productId ?? dto.productId;
    if (productId !== dto.productId) {
      this.logger.warn(
        `product mismatch for user ${userId}: client said ${dto.productId}, store said ${productId}`,
      );
    }

    const store = dto.platform === PurchasePlatform.IOS ? 'apple' : 'google';
    const transactionId = verified.transactionId ?? dto.transactionId;

    // The app attaches the buyer's user id to every App Store purchase. A
    // receipt carrying someone else's id comes from another GetDraft account
    // signed into the same Apple ID, typically through Restore Purchases.
    if (
      verified.appAccountToken &&
      verified.appAccountToken.toLowerCase() !== userId.toLowerCase()
    ) {
      this.logger.warn(
        `user ${userId} presented ${productId} bought by ${verified.appAccountToken}`,
      );
      return { granted: false, reason: OWNED_ELSEWHERE, ownedElsewhere: true };
    }

    if (STORE_PLAN_PRODUCTS[productId]) {
      // One store subscription, one account. Purchases made before the app
      // sent a user id carry no token, so ownership is checked here too.
      const owner =
        await this.storeBilling.ownerOfStoreSubscription(transactionId);
      if (owner && owner !== userId) {
        this.logger.warn(
          `user ${userId} presented subscription ${transactionId} owned by ${owner}`,
        );
        return {
          granted: false,
          reason: OWNED_ELSEWHERE,
          ownedElsewhere: true,
        };
      }

      const result = await this.storeBilling.applyStoreSubscription({
        userId,
        store,
        productId,
        transactionId,
        periodStart: verified.purchasedAt ?? null,
        periodEnd: verified.expiresAt ?? null,
        active: verified.active !== false,
      });
      return { granted: true, ...result };
    }

    if (verified.active === false) {
      return { granted: false, reason: 'This purchase was refunded.' };
    }

    const result = await this.storeBilling.creditStorePack({
      userId,
      store,
      productId,
      transactionId,
    });
    // A duplicate is still a success from the caller's point of view: the
    // purchase is accounted for, so the app should finish the transaction.
    return { granted: true, ...result };
  }

  /**
   * App Store Server Notifications (V2): renewals, expiries, refunds and plan
   * changes, which the app never sees. Set this URL in App Store Connect for
   * both production and sandbox.
   *
   * Public, because Apple does not log in. The signed payload is the
   * authentication: it is verified back to Apple's root before anything is
   * applied. Throttled generously rather than not at all: Apple sends a few
   * notifications per subscriber per month and retries a refused one for
   * days, while an unlimited public endpoint that does signature work on
   * every request is an easy way to burn the server's CPU.
   */
  @Public()
  @Throttle({ default: { ttl: 60_000, limit: 300 } })
  @Post('apple/notifications')
  @HttpCode(200)
  @ApiExcludeEndpoint()
  async appleNotification(@Body() dto: AppleNotificationDto) {
    const result = await this.verifier.verifyAppleNotification(
      dto.signedPayload,
    );
    if (!result.ok) {
      this.logger.warn(`apple notification rejected: ${result.reason}`);
      throw new BadRequestException(result.reason);
    }
    await this.storeBilling.applyAppleNotification(result.notification);
    return { received: true };
  }
}
