import { Module, Controller, Get } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AppConfigModule } from './config/config.module';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { Public } from './common/decorators/public.decorator';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { ProfilesModule } from './modules/profiles/profiles.module';
import { DiscoverModule } from './modules/discover/discover.module';
import { MatchesModule } from './modules/matches/matches.module';
import { OutreachModule } from './modules/outreach/outreach.module';
import { ChatModule } from './modules/chat/chat.module';
import { SubscriptionsModule } from './modules/subscriptions/subscriptions.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { UploadsModule } from './modules/uploads/uploads.module';
import { StatsModule } from './modules/stats/stats.module';
import { AdminModule } from './modules/admin/admin.module';
import { KycModule } from './modules/kyc/kyc.module';
import { GuardianLinksModule } from './modules/guardian-links/guardian-links.module';

@Controller()
class HealthController {
  @Public()
  @Get('health')
  health() {
    return { status: 'ok' };
  }
}

@Module({
  imports: [
    AppConfigModule,
    AuthModule,
    UsersModule,
    ProfilesModule,
    DiscoverModule,
    MatchesModule,
    OutreachModule,
    ChatModule,
    SubscriptionsModule,
    NotificationsModule,
    UploadsModule,
    StatsModule,
    AdminModule,
    KycModule,
    GuardianLinksModule,
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
