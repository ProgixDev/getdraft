import { Controller, Logger, Post, Req, Headers } from '@nestjs/common';
import { ApiTags, ApiExcludeEndpoint } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { SubscriptionsService } from './subscriptions.service';
import { StripeService } from '../../config/stripe.config';
import { Public } from '../../common/decorators/public.decorator';

@ApiTags('Webhooks')
@Controller('webhooks')
export class StripeWebhookController {
  private readonly logger = new Logger(StripeWebhookController.name);

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

    // rawBody is supplied by NestFactory.create({ rawBody: true }). For
    // signature verification it MUST be the exact bytes Stripe signed.
    const raw = req.rawBody ?? req.body;
    if (!raw) {
      this.logger.warn('Stripe webhook arrived with no body');
      return { received: false, error: 'Empty body' };
    }
    if (!webhookSecret) {
      this.logger.warn('STRIPE_WEBHOOK_SECRET not configured — accepting unsigned event');
      const event = typeof raw === 'string' ? JSON.parse(raw) : raw;
      await this.subscriptionsService.handleWebhook(event);
      return { received: true };
    }

    let event: any;
    try {
      event = stripe.webhooks.constructEvent(raw, signature, webhookSecret);
    } catch (err: any) {
      this.logger.error(`Stripe webhook signature failed: ${err?.message ?? err}`);
      return { received: false, error: 'Invalid signature' };
    }

    this.logger.log(`Stripe webhook: ${event.type} (${event.id})`);
    try {
      await this.subscriptionsService.handleWebhook(event);
    } catch (err: any) {
      this.logger.error(
        `Handler for ${event.type} threw: ${err?.message ?? err}`,
      );
    }
    return { received: true };
  }
}
