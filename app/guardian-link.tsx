import React from 'react';
import { useRouter } from 'expo-router';
import { GuardianLinkScreen } from '@/components/auth/GuardianLinkScreen';

/**
 * Standalone route for the guardian-link flow — used so a parent who
 * already finished onboarding (e.g. via dev-skip) can replay the video
 * tutorial + record their declaration without resetting their account.
 *
 * In production this is the same screen they'd land on from a "Verify
 * my link" entry in Settings.
 */
export default function GuardianLinkRoute() {
  const router = useRouter();
  return (
    <GuardianLinkScreen
      onComplete={() => router.back()}
      onBack={() => router.back()}
    />
  );
}
