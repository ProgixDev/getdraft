import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { SupabaseService } from './supabase.config';
import { StripeService } from './stripe.config';

@Global()
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
  ],
  providers: [SupabaseService, StripeService],
  exports: [SupabaseService, StripeService],
})
export class AppConfigModule {}
