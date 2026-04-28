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

export const PLAN_SWIPE_LIMITS: Record<PlanId, number> = {
  [PlanId.BASIC]: 10,
  [PlanId.STARTER]: 30,
  [PlanId.PRO]: 100,
  [PlanId.PREMIUM]: -1, // unlimited
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
