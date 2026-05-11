import { Controller, Get, Post, Body } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { SubscriptionsService } from './subscriptions.service';
import { CreateCheckoutDto } from './dto/create-checkout.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CurrentUserPayload } from '../../common/types';

@ApiTags('Subscriptions')
@ApiBearerAuth()
@Controller('subscriptions')
export class SubscriptionsController {
  constructor(private subscriptionsService: SubscriptionsService) {}

  @Get('me')
  @ApiOperation({ summary: 'Get my subscription status' })
  getMySubscription(@CurrentUser('id') userId: string) {
    return this.subscriptionsService.getMySubscription(userId);
  }

  @Post('checkout')
  @ApiOperation({ summary: 'Create Stripe checkout session' })
  createCheckout(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: CreateCheckoutDto,
  ) {
    return this.subscriptionsService.createCheckout(
      user.id,
      user.email,
      dto.planId,
    );
  }

  @Post('portal')
  @ApiOperation({ summary: 'Get Stripe customer portal URL' })
  createPortal(@CurrentUser('id') userId: string) {
    return this.subscriptionsService.createPortalSession(userId);
  }

  @Post('payment-sheet')
  @ApiOperation({
    summary:
      'Mobile Payment Sheet: returns { paymentIntent, ephemeralKey, customer, publishableKey } for @stripe/stripe-react-native.',
  })
  createPaymentSheet(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: CreateCheckoutDto,
  ) {
    return this.subscriptionsService.createPaymentSheet(
      user.id,
      user.email,
      dto.planId,
    );
  }

  @Post('cancel')
  @ApiOperation({
    summary:
      'Cancel the user\'s active subscription. Body: { immediate?: boolean }. Defaults to cancel-at-period-end.',
  })
  cancel(
    @CurrentUser('id') userId: string,
    @Body() body: { immediate?: boolean },
  ) {
    return this.subscriptionsService.cancelSubscription(
      userId,
      !!body?.immediate,
    );
  }

  @Post('resume')
  @ApiOperation({ summary: 'Undo a pending cancel_at_period_end.' })
  resume(@CurrentUser('id') userId: string) {
    return this.subscriptionsService.resumeSubscription(userId);
  }

  @Get('swipe-packs')
  @ApiOperation({ summary: 'List available swipe-pack top-ups.' })
  listSwipePacks() {
    return this.subscriptionsService.getSwipePacks();
  }

  @Post('swipe-pack')
  @ApiOperation({
    summary:
      'Mobile Payment Sheet bundle for a one-off swipe-pack purchase. Body: { packId }.',
  })
  buySwipePack(
    @CurrentUser() user: CurrentUserPayload,
    @Body() body: { packId: string },
  ) {
    return this.subscriptionsService.createSwipePackSheet(
      user.id,
      user.email,
      body.packId,
    );
  }
}
