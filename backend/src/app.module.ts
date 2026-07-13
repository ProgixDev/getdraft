import { Module, Controller, Get, Res } from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import { PRIVACY_HTML } from './privacy.page';
import { TERMS_HTML } from './terms.page';
import { LICENSES_HTML } from './licenses.page';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { AppConfigModule } from './config/config.module';
import { PrismaModule } from './prisma/prisma.module';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { ActivationGuard } from './common/guards/activation.guard';
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
import { PostsModule } from './modules/posts/posts.module';
import { ConversationsModule } from './modules/conversations/conversations.module';
import { GuardianLinksModule } from './modules/guardian-links/guardian-links.module';
import { KycModule } from './modules/kyc/kyc.module';
import { RankingsModule } from './modules/rankings/rankings.module';

@Controller()
class HealthController {
  @Public()
  @Get('health')
  health() {
    return { status: 'ok' };
  }

  // Public privacy policy page (Google Play requires a public URL).
  // Served via the raw reply so the global JSON envelope doesn't wrap it.
  @Public()
  @Get('privacy')
  privacy(@Res() res: FastifyReply) {
    res.type('text/html; charset=utf-8').send(PRIVACY_HTML);
  }

  @Public()
  @Get('terms')
  terms(@Res() res: FastifyReply) {
    res.type('text/html; charset=utf-8').send(TERMS_HTML);
  }

  @Public()
  @Get('licenses')
  licenses(@Res() res: FastifyReply) {
    res.type('text/html; charset=utf-8').send(LICENSES_HTML);
  }

  @Public()
  @Get('version')
  version() {
    return {
      commit: process.env.RAILWAY_GIT_COMMIT_SHA ?? process.env.RENDER_GIT_COMMIT ?? null,
      branch: process.env.RAILWAY_GIT_BRANCH ?? process.env.RENDER_GIT_BRANCH ?? null,
      env: process.env.NODE_ENV ?? null,
    };
  }
}

@Module({
  imports: [
    AppConfigModule,
    PrismaModule,
    // In-memory throttler: fine on a single Render dyno. Horizontal scaling
    // would need a shared store (e.g. @nest-lab/throttler-storage-redis)
    // because each instance otherwise tracks its own counter.
    // Per-route overrides via @Throttle() tighten the abuse-prone endpoints
    // (login, request/verify-otp, complete-signup); webhooks opt out with
    // @SkipThrottle().
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]),
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
    PostsModule,
    ConversationsModule,
    GuardianLinksModule,
    KycModule,
    RankingsModule,
  ],
  controllers: [HealthController],
  providers: [
    // Throttle BEFORE auth so unauthenticated abuse (OTP-spam, brute force)
    // is rejected before it touches Supabase/Twilio/Gmail.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    // Runs after JwtAuthGuard (needs request.user.activationStatus). Blocks
    // pending-guardian minors from every endpoint not marked @AllowPending().
    { provide: APP_GUARD, useClass: ActivationGuard },
  ],
})
export class AppModule {}
