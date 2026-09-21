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

/**
 * Which pool Discover shows and which pairs a swipe may create.
 *
 * RECRUIT is the original product: athletes ↔ coaches/agents. PEER is the
 * community layer the client asked for -- the same role matching itself
 * (athlete↔athlete, coach↔coach, agent↔agent, parent↔parent) so people can
 * swap advice. Kept as separate pools rather than one wider deck: a coach
 * scouting athletes must never have other coaches mixed into the same stack,
 * and peer activity must stay out of the Draft Score (migration 044).
 */
export enum DiscoverMode {
  RECRUIT = 'recruit',
  PEER = 'peer',
}

/**
 * The four tiers the client priced on 2026-09-11:
 *   basic   Free
 *   starter USD 3.99 / month
 *   pro     USD 7.99 / month
 *   elite   USD 12.99 / month
 * Ids are stable and never renamed -- they are foreign keys in Stripe
 * metadata and store product ids. Display names live in the app catalogue.
 */
export enum PlanId {
  BASIC = 'basic',
  STARTER = 'starter',
  PRO = 'pro',
  ELITE = 'elite',
  /** @deprecated kept for DB-compat; new signups never use Premium. */
  PREMIUM = 'premium',
}

/**
 * Order of the tiers, for "at least Pro" checks and for sorting boosted
 * profiles ahead in Discover. Higher = more.
 */
export const PLAN_RANK: Record<PlanId, number> = {
  [PlanId.BASIC]: 0,
  [PlanId.STARTER]: 1,
  [PlanId.PRO]: 2,
  [PlanId.PREMIUM]: 2, // legacy alias for Pro
  [PlanId.ELITE]: 3,
};

export function planRank(planId: string | null | undefined): number {
  return PLAN_RANK[planId as PlanId] ?? 0;
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
// intentionally limited so users upgrade; Starter is the cheap step up,
// Pro and Elite are unlimited.
export const PLAN_SWIPE_LIMITS: Record<PlanId, number> = {
  [PlanId.BASIC]: 20, // free: 20 Drafts / month
  [PlanId.STARTER]: 60,
  [PlanId.PRO]: -1, // unlimited Drafts
  [PlanId.ELITE]: -1, // unlimited Drafts
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
  [PlanId.STARTER]: 2,
  [PlanId.PRO]: 5,
  [PlanId.ELITE]: 10,
  [PlanId.PREMIUM]: 5, // legacy alias for Pro
};

/**
 * What else a tier unlocks, beyond the two counters above. Each of these is
 * enforced server-side (the app only mirrors them for the UI):
 *
 *   advancedFilters  position / level / verified-only filters on Discover.
 *                    Free users' requests have them stripped.
 *   fullRankings     the whole leaderboard. Free sees the top 10 of a board.
 *   visibilityBoost  0 = normal, 1 = boosted, 2 = top: paid profiles sort
 *                    ahead within each Discover page (see getEveryoneFeed).
 */
export const PLAN_FEATURES: Record<
  PlanId,
  { advancedFilters: boolean; fullRankings: boolean; visibilityBoost: 0 | 1 | 2 }
> = {
  [PlanId.BASIC]: { advancedFilters: false, fullRankings: false, visibilityBoost: 0 },
  [PlanId.STARTER]: { advancedFilters: true, fullRankings: true, visibilityBoost: 0 },
  [PlanId.PRO]: { advancedFilters: true, fullRankings: true, visibilityBoost: 1 },
  [PlanId.ELITE]: { advancedFilters: true, fullRankings: true, visibilityBoost: 2 },
  [PlanId.PREMIUM]: { advancedFilters: true, fullRankings: true, visibilityBoost: 1 },
};

/** Rows a free user may see on any one rankings board. */
export const FREE_RANKINGS_ROWS = 10;

export function planFeatures(planId: string | null | undefined) {
  return PLAN_FEATURES[planId as PlanId] ?? PLAN_FEATURES[PlanId.BASIC];
}

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
   * Account activation state, resolved from auth.users.app_metadata by
   * JwtAuthGuard (see common/utils/authz-claims.ts).
   * 'pending_guardian' = under-18 athlete awaiting guardian
   * validation; the ActivationGuard blocks feature endpoints for them.
   * Defaults to 'active' for every existing/adult/non-athlete account.
   */
  activationStatus?: 'active' | 'pending_guardian';
}
