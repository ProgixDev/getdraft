/**
 * Shared subscription plan data
 * Used by PlanSelectionScreen (onboarding) and Subscription screen (More tab)
 *
 * Four tiers, priced by the client on 2026-09-11. Every feature listed here
 * is enforced by the server (PLAN_SWIPE_LIMITS, SUPER_DRAFT_LIMITS,
 * PLAN_FEATURES in backend/src/common/types) -- nothing on a card is
 * marketing only. Prices are display values; the stores and Stripe are the
 * source of truth for what is charged.
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
    name: "Free",
    price: 0,
    period: "Free Forever",
    swipes: "20 Drafts / month",
    swipesPerDay: 20,
    features: [
      "Create your profile",
      "Browse and discover",
      "20 Drafts per month",
      "1 Super Draft per month",
      "Chat after a match",
      "Top 10 of every ranking",
    ],
  },
  {
    id: "starter",
    name: "Starter",
    price: 3.99,
    period: "per month",
    swipes: "60 Drafts / month",
    swipesPerDay: 60,
    features: [
      "60 Drafts per month",
      "2 Super Drafts per month",
      "Advanced filters",
      "Full rankings",
    ],
  },
  {
    id: "pro",
    name: "Pro",
    price: 7.99,
    period: "per month",
    swipes: "Unlimited Drafts",
    swipesPerDay: 9999,
    features: [
      "Unlimited Drafts",
      "5 Super Drafts per month",
      "Advanced filters",
      "Full rankings",
      "Boosted visibility in Discover",
    ],
    popular: true,
  },
  {
    id: "elite",
    name: "Elite",
    price: 12.99,
    period: "per month",
    swipes: "Unlimited Drafts",
    swipesPerDay: 9999,
    features: [
      "Unlimited Drafts",
      "10 Super Drafts per month",
      "Advanced filters",
      "Full rankings",
      "Top visibility in Discover",
    ],
  },
  {
    // LEGACY — keep as a display entry so users who subscribed before the
    // tiers were restructured don't see "Free" with manage controls on the
    // subscription screen. Filtered out of the plan picker by the `legacy`
    // flag. The backend treats premium as an alias of pro (PLAN_SWIPE_LIMITS).
    id: "premium",
    name: "Premium",
    price: 15,
    period: "per month",
    swipes: "Unlimited Drafts",
    swipesPerDay: 9999,
    features: ["Unlimited Drafts", "Advanced filters", "Full rankings"],
    legacy: true,
  },
];
