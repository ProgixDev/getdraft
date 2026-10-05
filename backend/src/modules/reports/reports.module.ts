import { Module } from '@nestjs/common';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';
import { MailModule } from '../mail/mail.module';

@Module({
  // MailModule: every report is emailed to the moderation address.
  imports: [MailModule],
  controllers: [ReportsController],
  providers: [ReportsService],
})
export class ReportsModule {}
