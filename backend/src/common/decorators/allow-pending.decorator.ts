import { SetMetadata } from '@nestjs/common';

export const ALLOW_PENDING_KEY = 'allowPending';

/**
 * Marks a route (or whole controller) as reachable by an athlete whose
 * account is still `pending_guardian` (under-18, awaiting guardian
 * validation). Everything NOT annotated is blocked for pending minors by
 * the ActivationGuard. Use ONLY on the endpoints needed to drive the
 * activation flow itself (read self, show/refresh the guardian QR, KYC).
 */
export const AllowPending = () => SetMetadata(ALLOW_PENDING_KEY, true);
