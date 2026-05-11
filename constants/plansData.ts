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
}

export const plans: Plan[] = [
  {
    id: 'basic',
    name: 'Basic',
    price: 0,
    period: 'Free Forever',
    swipes: '10 swipes/day',
    swipesPerDay: 10,
    features: ['Text messaging', 'Basic profile', 'Limited filters'],
  },
  {
    id: 'starter',
    name: 'Starter',
    price: 7,
    period: 'per month',
    swipes: '30 swipes/day',
    swipesPerDay: 30,
    features: ['Enhanced messaging', 'Priority support', 'Standard filters'],
    popular: true,
  },
  {
    id: 'pro',
    name: 'Pro',
    price: 15,
    period: 'per month',
    swipes: '70 swipes/day',
    swipesPerDay: 70,
    features: [
      'See who drafted you',
      'Advanced filters',
      'Premium badge',
      'Priority matching',
      'No ads',
    ],
  },
];
