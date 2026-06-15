import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { createClient } from '@supabase/supabase-js';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { CurrentUserPayload, UserRole } from '../types';

@Injectable()
export class JwtAuthGuard implements CanActivate {
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

      // Banned users are mirrored into user_metadata by AdminService.banUser
      // (which also revokes their sessions). Reject here so a banned user who
      // logs back in still can't reach any endpoint.
      if (user.user_metadata?.is_banned === true) {
        throw new ForbiddenException('This account has been suspended.');
      }

      const currentUser: CurrentUserPayload = {
        id: user.id,
        email: user.email!,
        role: (user.user_metadata?.role as UserRole) || UserRole.ATHLETE,
        // Mirrored from user_metadata so ActivationGuard can gate without a
        // DB read. Anything other than 'pending_guardian' is treated as
        // active (covers all existing accounts minted before migration 022).
        activationStatus:
          user.user_metadata?.activation_status === 'pending_guardian'
            ? 'pending_guardian'
            : 'active',
      };

      request.user = currentUser;
      return true;
    } catch (err) {
      if (err instanceof UnauthorizedException) throw err;
      throw new UnauthorizedException('Invalid or expired token');
    }
  }

  private extractToken(request: any): string | null {
    const authHeader = request.headers?.authorization;
    if (!authHeader) return null;
    const [type, token] = authHeader.split(' ');
    return type === 'Bearer' ? token : null;
  }
}
