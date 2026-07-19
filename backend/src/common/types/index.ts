export enum UserRole {
  ATHLETE = 'athlete',
  PARENT = 'parent',
  COACH = 'coach',
  RECRUITER = 'recruiter',
  ADMIN = 'admin',
}

export enum SwipeDirection {
  DRAFT = 'draft',
  PASS = 'pass',
}

export enum PlanId {
  BASIC = 'basic',
  STARTER = 'starter',
  PRO = 'pro',
  /** @deprecated kept for DB-compat; new signups never use Premium. */
  PREMIUM = 'premium',
}

export enum OutreachStatus {
  NEW = 'New',
  IN_REVIEW = 'In Review',
  RESPONDED = 'Responded',
}

export enum RecruiterRoleType {
  AGENT = 'agent',
  COACH = 'coach',
}

export enum SubscriptionStatus {
  ACTIVE = 'active',
  CANCELED = 'canceled',
  PAST_DUE = 'past_due',
  TRIALING = 'trialing',
}

export enum PushPlatform {
  IOS = 'ios',
  ANDROID = 'android',
}

// Monthly DRAFT allowance per plan. Passes are always free; only Drafts
// (right-swipes) count against this. -1 = unlimited. The free tier is
// intentionally limited so users upgrade; paid tiers get unlimited Drafts.
export const PLAN_SWIPE_LIMITS: Record<PlanId, number> = {
  [PlanId.BASIC]: 20, // free: 20 Drafts / month
  [PlanId.STARTER]: -1, // unlimited Drafts
  [PlanId.PRO]: -1, // unlimited Drafts
  [PlanId.PREMIUM]: -1, // legacy alias for Pro
};

// Monthly SUPER DRAFT allowance per plan. A Super Draft is a standout Draft
// that pushes the sender to the top of the recipient's "who drafted you" list
// and fires a dedicated notification. Unlike normal Drafts, Super Drafts are
// ALWAYS capped (even on unlimited plans) — scarcity is what makes them
// special, and the cap is a paid-plan upsell. -1 would mean unlimited but is
// intentionally unused here. Counted per calendar month from the swipes table
// (is_super = true), so no extra counter column or reset job is needed.
export const SUPER_DRAFT_LIMITS: Record<PlanId, number> = {
  [PlanId.BASIC]: 1, // free: 1 Super Draft / month
  [PlanId.STARTER]: 3,
  [PlanId.PRO]: 5,
  [PlanId.PREMIUM]: 5, // legacy alias for Pro
};

export class JwtPayload {
  sub: string;
  email: string;
  role: UserRole;
}

export class CurrentUserPayload {
  id: string;
  email: string;
  role: UserRole;
  /**
   * Account activation state, mirrored from auth.users.user_metadata by
   * JwtAuthGuard. 'pending_guardian' = under-18 athlete awaiting guardian
   * validation; the ActivationGuard blocks feature endpoints for them.
   * Defaults to 'active' for every existing/adult/non-athlete account.
   */
  activationStatus?: 'active' | 'pending_guardian';
}
