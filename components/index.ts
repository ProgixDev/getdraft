/**
 * Components barrel file
 * Re-exports all components for easy imports
 *
 * Usage:
 * import { SplashScreen, WelcomeScreen } from '@/components';
 */

// Screens
export { SplashExperience as SplashScreen } from './splash';

// Welcome / Onboarding
export { WelcomeScreen, PaginationDots } from './welcome';

// Auth
export {
    AuthScreen,
    EmailVerificationScreen,
    PlanSelectionScreen,
    LocationSelectionScreen,
    ProfileSetupScreen,
} from './auth';

// UI Components (add as you build)
// export { Button } from './ui/Button';
// export { Card } from './ui/Card';
// export { Input } from './ui/Input';
