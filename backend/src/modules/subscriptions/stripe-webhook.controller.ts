import {
  Controller,
  HttpException,
  HttpStatus,
  Logger,
  Post,
  Req,
  Res,
  Headers,
} from '@nestjs/common';
import { ApiTags, ApiExcludeEndpoint } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { SkipThrottle } from '@nestjs/throttler';
import { SubscriptionsService } from './subscriptions.service';
import { StripeService } from '../../config/stripe.config';
import { Public } from '../../common/decorators/public.decorator';

@ApiTags('Webhooks')
// Stripe retries failed deliveries with exponential backoff — throttling
// here would drop legitimate retries and silently desync billing.
// Signature verification (constructEvent) is the abuse defense for this route.
@SkipThrottle()
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
    @Res({ passthrough: true }) res: any,
    @Headers('stripe-signature') signature: string,
  ) {
    const stripe = this.stripeService.getClient();
    const webhookSecret = this.configService.get('STRIPE_WEBHOOK_SECRET');

    // FAIL CLOSED: an unsigned-but-accepted webhook lets anyone POST a
    // forged subscription.created/payment_succeeded with arbitrary
    // metadata.user_id+plan_id, which the handler would happily apply.
    // Refusing here is the only safe answer in any environment.
    if (!webhookSecret) {
      this.logger.error(
        'STRIPE_WEBHOOK_SECRET not configured — refusing to process webhook',
      );
      throw new HttpException(
        'Webhook signing secret not configured.',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    // rawBody is supplied by NestFactory.create({ rawBody: true }). For
    // signature verification it MUST be the exact bytes Stripe signed.
    const raw = req.rawBody ?? req.body;
    if (!raw) {
      this.logger.warn('Stripe webhook arrived with no body');
      return { received: false, error: 'Empty body' };
    }

    let event: any;
    try {
      event = stripe.webhooks.constructEvent(raw, signature, webhookSecret);
    } catch (err: any) {
      // Bad signature: 200-with-error so Stripe does NOT retry forged
      // bodies in a tight loop. Legitimate retries arrive over signed
      // events; forged ones fail signature every time and would otherwise
      // hammer us forever.
      this.logger.error(`Stripe webhook signature failed: ${err?.message ?? err}`);
      return { received: false, error: 'Invalid signature' };
    }

    this.logger.log(`Stripe webhook: ${event.type} (${event.id})`);
    try {
      await this.subscriptionsService.handleWebhook(event);
    } catch (err: any) {
      // Handler failure on a signed event: surface a 5xx so Stripe retries
      // (transient DB errors are common; "paid but not upgraded" is worse
      // than a redelivery). The signature was already validated above, so
      // there is no retry-storm risk from forged senders.
      this.logger.error(
        `Handler for ${event.type} threw: ${err?.message ?? err}`,
      );
      throw new HttpException(
        `Handler for ${event.type} failed.`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
    return { received: true };
  }
}
