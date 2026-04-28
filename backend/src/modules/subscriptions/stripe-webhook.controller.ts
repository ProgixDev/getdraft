import { Controller, Post, Req, Headers } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiExcludeEndpoint } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { SubscriptionsService } from './subscriptions.service';
import { StripeService } from '../../config/stripe.config';
import { Public } from '../../common/decorators/public.decorator';

@ApiTags('Webhooks')
@Controller('webhooks')
export class StripeWebhookController {
  constructor(
    private subscriptionsService: SubscriptionsService,
    private stripeService: StripeService,
    private configService: ConfigService,
  ) {}

  @Public()
  @Post('stripe')
  @ApiExcludeEndpoint()
  async handleWebhook(
    @Req() req: any,
    @Headers('stripe-signature') signature: string,
  ) {
    const stripe = this.stripeService.getClient();
    const webhookSecret = this.configService.get('STRIPE_WEBHOOK_SECRET');

    let event: any;
    try {
      event = stripe.webhooks.constructEvent(
        req.rawBody || req.body,
        signature,
        webhookSecret,
      );
    } catch {
      return { received: false, error: 'Invalid signature' };
    }

    await this.subscriptionsService.handleWebhook(event);
    return { received: true };
  }
}
