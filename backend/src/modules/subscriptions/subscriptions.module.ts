import { Module } from '@nestjs/common';
import { SubscriptionsController } from './subscriptions.controller';
import { StripeWebhookController } from './stripe-webhook.controller';
import { SubscriptionsService } from './subscriptions.service';

@Module({
  controllers: [SubscriptionsController, StripeWebhookController],
  providers: [SubscriptionsService],
  exports: [SubscriptionsService],
})
export class SubscriptionsModule {}
