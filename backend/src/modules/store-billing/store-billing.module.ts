import { Module } from '@nestjs/common';
import { StoreBillingController } from './store-billing.controller';
import { StoreBillingService } from './store-billing.service';
import { ReceiptVerifierService } from './receipt-verifier.service';

@Module({
  controllers: [StoreBillingController],
  providers: [StoreBillingService, ReceiptVerifierService],
  exports: [StoreBillingService],
})
export class StoreBillingModule {}
