import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { CurrentUserPayload } from '../types';
import { resolveAuthzClaims } from '../utils/authz-claims';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  /**
   * Service-role client used only to resolve authz claims for accounts that
   * predate app_metadata. Built lazily and cached — the guard is a
   * singleton (APP_GUARD), so this is one client for the whole process.
   */
  private adminClient: SupabaseClient | null = null;

  constructor(
    private reflector: Reflector,
    private configService: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest();
    const token = this.extractToken(request);
    if (!token) {
      throw new UnauthorizedException('Missing authorization token');
    }

    try {
      const supabase = createClient(
        this.configService.get<string>('SUPABASE_URL')!,
        this.configService.get<string>('SUPABASE_ANON_KEY')!,
      );

      const {
        data: { user },
        error,
      } = await supabase.auth.getUser(token);

      if (error || !user) {
        throw new UnauthorizedException('Invalid or expired token');
      }

      // role / is_banned / activation_status come from app_metadata, which
      // only the service_role key can write. They used to be read from
      // user_metadata — self-writable with the anon key that ships in the
      // APK, i.e. any user could grant themselves admin, lift their own ban,
      // or activate a minor still waiting on guardian consent. A claim set
      // we can't resolve is a denial (the catch below turns it into a 401).
      const claims = await resolveAuthzClaims(this.getAdminClient(), user);

      // AdminService.banUser writes the flag and revokes every session, so a
      // banned user who logs back in still can't reach any endpoint.
      if (claims.isBanned) {
        throw new ForbiddenException('This account has been suspended.');
      }

      const currentUser: CurrentUserPayload = {
        id: user.id,
        email: user.email!,
        role: claims.role,
        activationStatus: claims.activationStatus,
      };

      request.user = currentUser;
      return true;
    } catch (err) {
      if (err instanceof UnauthorizedException) throw err;
      throw new UnauthorizedException('Invalid or expired token');
    }
  }

  private getAdminClient(): SupabaseClient {
    if (!this.adminClient) {
      this.adminClient = createClient(
        this.configService.get<string>('SUPABASE_URL')!,
        this.configService.get<string>('SUPABASE_SERVICE_ROLE_KEY')!,
      );
    }
    return this.adminClient;
  }

  private extractToken(request: any): string | null {
    const authHeader = request.headers?.authorization;
    if (!authHeader) return null;
    const [type, token] = authHeader.split(' ');
    return type === 'Bearer' ? token : null;
  }
}
