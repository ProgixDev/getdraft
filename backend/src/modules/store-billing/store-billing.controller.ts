import { Body, Controller, Logger, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import {
  PurchasePlatform,
  ValidatePurchaseDto,
} from './dto/validate-purchase.dto';
import { ReceiptVerifierService } from './receipt-verifier.service';
import {
  STORE_PACK_PRODUCTS,
  STORE_PLAN_PRODUCTS,
  StoreBillingService,
} from './store-billing.service';

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
   * The user comes from the auth token, never from the request body -- so a
   * receipt can only ever credit the account that presented it, and one user
   * cannot replay another's purchase against their own account.
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

    if (STORE_PLAN_PRODUCTS[productId]) {
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
}
