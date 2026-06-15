import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { ALLOW_PENDING_KEY } from '../decorators/allow-pending.decorator';

/**
 * Blocks under-18 athletes whose account is still `pending_guardian`
 * (awaiting guardian validation + admin approval) from every protected
 * feature endpoint. Server-side counterpart to the client route-guard —
 * hiding the UI is not enough; the API must refuse too.
 *
 * Runs AFTER JwtAuthGuard (which surfaces `activationStatus` onto
 * request.user from the JWT's user_metadata). Public routes and routes
 * explicitly marked @AllowPending() (read-self, guardian QR, KYC) pass
 * through so the minor can actually complete activation.
 */
@Injectable()
export class ActivationGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const allowPending = this.reflector.getAllAndOverride<boolean>(
      ALLOW_PENDING_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (allowPending) return true;

    const { user } = context.switchToHttp().getRequest();
    // No user here means a public/unauthenticated route slipped through —
    // JwtAuthGuard already owns that decision, so don't double-fault.
    if (!user) return true;

    if (user.activationStatus === 'pending_guardian') {
      throw new ForbiddenException({
        statusCode: 403,
        code: 'MINOR_NOT_ACTIVATED',
        message:
          'Your Draft account needs guardian approval before you can use this feature.',
      });
    }

    return true;
  }
}
