import { Module } from '@nestjs/common';
import { RevenueCatWebhookController } from './revenuecat-webhook.controller';
import { StoreBillingService } from './store-billing.service';

@Module({
  controllers: [RevenueCatWebhookController],
  providers: [StoreBillingService],
  exports: [StoreBillingService],
})
export class StoreBillingModule {}
