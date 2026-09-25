import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { SupabaseClient } from '@supabase/supabase-js';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { SupabaseService } from '../../config/supabase.config';
import { CurrentUserPayload } from '../types';
import { resolveAuthzClaims } from '../utils/authz-claims';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private supabaseService: SupabaseService,
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
      // The shared client, never a fresh one. createClient() here ran on
      // EVERY authenticated request, and supabase-js defaults to
      // autoRefreshToken, so each call armed a 30s interval that nothing ever
      // cleared -- a timer and a client leaked per request. SupabaseService
      // hands out one process-wide client with that machinery switched off.
      const supabase = this.supabaseService.getClient();

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
    return this.supabaseService.getAdminClient();
  }

  private extractToken(request: any): string | null {
    const authHeader = request.headers?.authorization;
    if (!authHeader) return null;
    const [type, token] = authHeader.split(' ');
    return type === 'Bearer' ? token : null;
  }
}
