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

export const PLAN_SWIPE_LIMITS: Record<PlanId, number> = {
  [PlanId.BASIC]: 10,
  [PlanId.STARTER]: 30,
  [PlanId.PRO]: 70,
  [PlanId.PREMIUM]: 70, // legacy alias for Pro
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
}
