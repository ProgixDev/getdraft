import { Module, Controller, Get, Res, Logger } from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import { PRIVACY_HTML } from './privacy.page';
import { TERMS_HTML } from './terms.page';
import { LICENSES_HTML } from './licenses.page';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { AppConfigModule } from './config/config.module';
import { PrismaModule } from './prisma/prisma.module';
import { SupabaseService } from './config/supabase.config';
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
  private readonly logger = new Logger('Health');

  constructor(private readonly supabaseService: SupabaseService) {}

  /**
   * LIVENESS — is this process alive?
   *
   * Railway healthchecks exactly this path (backend/railway.json) with
   * restartPolicyType ON_FAILURE and 10 retries, so it MUST report on the
   * process and not on its dependencies. Returning 503 here when Postgres is
   * unreachable would make Railway restart the container ten times and then
   * fail the deploy — converting a database outage into a total outage, and
   * blocking the very deploy that might fix it. Do not "improve" this to a
   * 503.
   *
   * It does now report the database in the BODY, which is the gap that hid
   * the August outage: this endpoint answered {"status":"ok"} for days while
   * the database it depends on had been suspended and removed from DNS.
   * Everything looked healthy and nothing worked.
   *
   * Anything monitoring this must assert on `db`, not just the status code.
   * For an endpoint that fails loudly, use /health/ready below.
   */
  @Public()
  @Get('health')
  async health() {
    const ok = await this.probeDb();
    return {
      status: ok ? 'ok' : 'degraded',
      db: ok ? 'up' : 'down',
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * READINESS — can this process actually serve traffic?
   *
   * 503 when the database is unreachable, so an uptime monitor raises an
   * alarm instead of a human noticing days later. Deliberately NOT the path
   * Railway checks; see the warning above.
   */
  @Public()
  @Get('health/ready')
  async ready(@Res() res: FastifyReply) {
    const ok = await this.probeDb();
    res.status(ok ? 200 : 503).send({
      status: ok ? 'ready' : 'not_ready',
      db: ok ? 'up' : 'down',
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Cheapest query that still proves the round trip: a HEAD-style count
   * against a table that always exists. No rows are transferred.
   *
   * The reason for the probe is that every layer above it lies — the process
   * is up, the port is open, the router answers — while the database behind
   * them is gone.
   */
  private async probeDb(): Promise<boolean> {
    try {
      const { error } = await this.supabaseService
        .getAdminClient()
        .from('users')
        .select('id', { count: 'exact', head: true });
      if (error) throw new Error(error.message);
      return true;
    } catch (err: any) {
      // Logged, never returned: /health is public, and a driver error can
      // carry hostnames and connection details.
      this.logger.error(
        `database unreachable: ${err?.message ?? String(err)}`,
      );
      return false;
    }
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
    // HealthController injects this to probe the database. Feature modules
    // provide their own instance; this one is only for the health check.
    SupabaseService,
    // Throttle BEFORE auth so unauthenticated abuse (OTP-spam, brute force)
    // is rejected before it touches Supabase/Prelude/Gmail.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    // Runs after JwtAuthGuard (needs request.user.activationStatus). Blocks
    // pending-guardian minors from every endpoint not marked @AllowPending().
    { provide: APP_GUARD, useClass: ActivationGuard },
  ],
})
export class AppModule {}
