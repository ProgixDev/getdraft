import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

/**
 * These clients are singletons shared by every request, so they must hold no
 * session of their own. supabase-js defaults to persistSession +
 * autoRefreshToken, which are right in a browser and actively harmful here:
 *
 *   - Every signInWithPassword / verifyOtp / refreshSession saves THAT user's
 *     session onto the one shared instance, so the client's idea of "the
 *     current user" is just whoever authenticated last.
 *   - autoRefreshToken then runs a background timer that refreshes whatever
 *     session is loaded. Refresh-token rotation is on, so each of those
 *     invisible refreshes INVALIDATES the refresh token the user's phone is
 *     still holding. The next time the app refreshes, its token is already
 *     spent, Supabase rejects it, and the app signs the user out.
 *
 * That is the "it keeps asking me to log in again" the client reported. The
 * app's own single-flight refresh (services/api.ts) was never the problem —
 * the race was on the server, stealing the token out from under it.
 *
 * Nothing here reads the implicit session: every call passes an explicit
 * token (getUser(token), refreshSession({refresh_token}), …), so turning this
 * off removes only the hidden state.
 */
const SERVER_SIDE_AUTH = {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
} as const;

@Injectable()
export class SupabaseService {
  private client: SupabaseClient;
  private adminClient: SupabaseClient;

  constructor(private configService: ConfigService) {
    this.client = createClient(
      this.configService.get<string>('SUPABASE_URL')!,
      this.configService.get<string>('SUPABASE_ANON_KEY')!,
      SERVER_SIDE_AUTH,
    );

    this.adminClient = createClient(
      this.configService.get<string>('SUPABASE_URL')!,
      this.configService.get<string>('SUPABASE_SERVICE_ROLE_KEY')!,
      SERVER_SIDE_AUTH,
    );
  }

  getClient(): SupabaseClient {
    return this.client;
  }

  getAdminClient(): SupabaseClient {
    return this.adminClient;
  }
}
