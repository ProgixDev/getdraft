import { Module } from '@nestjs/common';
import { GuardianLinksController } from './guardian-links.controller';
import { GuardianLinksService } from './guardian-links.service';

@Module({
  controllers: [GuardianLinksController],
  providers: [GuardianLinksService],
  exports: [GuardianLinksService],
})
export class GuardianLinksModule {}
