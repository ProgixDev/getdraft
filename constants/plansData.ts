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
    features: ['Text messaging', 'Basic profile', 'Limited filters'],
  },
  {
    id: 'starter',
    name: 'Starter',
    price: 3,
    period: 'per month',
    swipes: '30 swipes/day',
    features: ['Enhanced messaging', 'Priority support', 'Standard filters'],
  },
  {
    id: 'pro',
    name: 'Pro',
    price: 7,
    period: 'per month',
    swipes: '100 swipes/day',
    features: ['Advanced features', 'See who liked you', 'Advanced filters', 'No ads'],
    popular: true,
  },
  {
    id: 'premium',
    name: 'Premium',
    price: 15,
    period: 'per month',
    swipes: 'Unlimited',
    features: ['Full access', 'Unlimited swipes', 'Premium badge', 'Priority matching', 'All features'],
  },
];
