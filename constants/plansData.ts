/**
 * Shared subscription plan data
 * Used by PlanSelectionScreen (onboarding) and Subscription screen (More tab)
 */

export interface Plan {
  id: string;
  name: string;
  price: number;
  period: string;
  swipes: string;
  swipesPerDay: number;
  features: string[];
  popular?: boolean;
  /** Hide from the plan picker but keep for display on subscription.tsx. */
  legacy?: boolean;
}

export const plans: Plan[] = [
  {
    id: "basic",
    name: "Basic",
    price: 0,
    period: "Free Forever",
    swipes: "20 Drafts / month",
    swipesPerDay: 20,
    features: ["Unlimited browsing", "20 Drafts per month", "Message after a Draft"],
  },
  {
    id: "starter",
    name: "Starter",
    price: 7,
    period: "per month",
    swipes: "Unlimited Drafts",
    swipesPerDay: 9999,
    features: ["Unlimited Drafts", "Standard filters", "Priority support"],
    popular: true,
  },
  {
    id: "pro",
    name: "Pro",
    price: 15,
    period: "per month",
    swipes: "Unlimited Drafts",
    swipesPerDay: 9999,
    // "See who drafted you" is intentionally NOT a Pro perk here —
    // who-drafted-you is free in this app (see app/drafts-received.tsx).
    features: [
      "Everything in Starter",
      "Advanced filters",
      "Premium badge",
      "Priority matching",
    ],
  },
  {
    // LEGACY — keep as a display entry so users who subscribed before the
    // 3-plan restructure don't see "Basic / Free" with manage controls on
    // the subscription screen. Filtered out of PlanSelectionScreen by the
    // `legacy` flag. The backend treats premium as an alias of pro for
    // swipe-limit purposes (PLAN_SWIPE_LIMITS).
    id: "premium",
    name: "Premium",
    price: 15,
    period: "per month",
    swipes: "Unlimited Drafts",
    swipesPerDay: 9999,
    features: [
      "Advanced filters",
      "Premium badge",
      "Priority matching",
      "No ads",
    ],
    legacy: true,
  },
];
