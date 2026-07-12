import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  StyleSheet,
  Text,
  Pressable,
  ActivityIndicator,
  Alert,
  ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import {
  useFonts,
  Poppins_400Regular,
  Poppins_500Medium,
  Poppins_600SemiBold,
  Poppins_700Bold,
} from '@expo-google-fonts/poppins';
import { brand, neutral, semantic } from '@/config/colors';
import { kycService, KycStatus } from '@/services/kyc';
import { useAppDispatch } from '@/store/hooks';
import { logoutAsync } from '@/store/slices/authSlice';

WebBrowser.maybeCompleteAuthSession();

interface KycVerificationScreenProps {
  onComplete: () => void;
  onBack?: () => void;
}

export const KycVerificationScreen: React.FC<KycVerificationScreenProps> = ({
  onComplete,
  onBack,
}) => {
  const insets = useSafeAreaInsets();
  const dispatch = useAppDispatch();
  const [fontsLoaded] = useFonts({
    Poppins_400Regular,
    Poppins_500Medium,
    Poppins_600SemiBold,
    Poppins_700Bold,
  });

  const [status, setStatus] = useState<KycStatus>('none');
  const [isStarting, setIsStarting] = useState(false);
  const [isPolling, setIsPolling] = useState(false);
  const [pollTimedOut, setPollTimedOut] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Fetch status on mount — in case the user already finished a session
  // in a previous attempt.
  useEffect(() => {
    kycService.getStatus()
      .then((r) => setStatus(r.kycStatus))
      .catch(() => {});
    return () => {
      if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
    };
  }, []);

  // When approved, auto-advance to the next step.
  useEffect(() => {
    if (status === 'approved') {
      onComplete();
    }
  }, [status, onComplete]);

  const pollStatus = useCallback(async () => {
    setIsPolling(true);
    setPollTimedOut(false);
    const startedAt = Date.now();
    const TIMEOUT_MS = 45_000;
    const INTERVAL_MS = 2_000;

    const tick = async () => {
      try {
        const r = await kycService.getStatus();
        setStatus(r.kycStatus);
        if (r.kycStatus === 'approved' || r.kycStatus === 'declined') {
          setIsPolling(false);
          return;
        }
      } catch {
        /* swallow — keep polling */
      }
      if (Date.now() - startedAt < TIMEOUT_MS) {
        pollTimerRef.current = setTimeout(tick, INTERVAL_MS);
      } else {
        setIsPolling(false);
        setPollTimedOut(true);
      }
    };
    await tick();
  }, []);

  const handleStart = useCallback(async () => {
    if (isStarting) return;
    setError(null);
    setIsStarting(true);
    try {
      // The browser auto-closes when Didit redirects to this deep link
      // after verification, so we pass the same URL to BOTH the backend
      // (as Didit's callback) and to openAuthSessionAsync (as the URL
      // it watches for to dismiss the in-app browser).
      const returnUrl = Linking.createURL('kyc/return');
      const { url } = await kycService.start(returnUrl);
      await WebBrowser.openAuthSessionAsync(url, returnUrl);
      await pollStatus();
    } catch (err: any) {
      const message =
        err?.response?.data?.message ?? err?.message ?? 'Could not start verification.';
      setError(String(message));
    } finally {
      setIsStarting(false);
    }
  }, [isStarting, pollStatus]);

  // Back stays usable while we poll — just cancel the timer on the way out.
  const handleBack = useCallback(() => {
    if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
    setIsPolling(false);
    onBack?.();
  }, [onBack]);

  // Stuck in manual review — let the user leave and come back later.
  const handleLogout = useCallback(() => {
    if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
    dispatch(logoutAsync());
  }, [dispatch]);

  if (!fontsLoaded) return null;

  return (
    <LinearGradient
      colors={[brand.primary, '#0a4d8f', brand.primary]}
      style={styles.container}
    >
      <ScrollView
        contentContainerStyle={[styles.scrollContainer, { paddingTop: 60, paddingBottom: insets.bottom + 32 }]}
        showsVerticalScrollIndicator={false}
      >
        {onBack && (
          <View style={styles.headerRow}>
            <Pressable style={styles.backButton} onPress={handleBack} disabled={isStarting}>
              <Ionicons name="chevron-back" size={22} color={brand.white} />
              <Text style={styles.backText}>Back</Text>
            </Pressable>
          </View>
        )}

        <Animated.View entering={FadeIn.duration(500)} style={styles.iconWrap}>
          <View style={styles.iconCircle}>
            <Ionicons
              name={
                status === 'approved'
                  ? 'shield-checkmark'
                  : status === 'declined'
                    ? 'alert-circle'
                    : status === 'in_review' || status === 'pending'
                      ? 'hourglass'
                      : 'shield-checkmark-outline'
              }
              size={40}
              color={brand.white}
            />
          </View>
        </Animated.View>

        <Animated.View entering={FadeInDown.duration(600).delay(150)} style={styles.card}>
          <Text style={styles.title}>Verify your identity</Text>
          <Text style={styles.subtitle}>
            We use a quick, secure verification by{' '}
            <Text style={styles.brandWord}>Didit</Text>. It takes about a minute and
            keeps the platform safe for everyone.
          </Text>

          <View style={styles.bulletList}>
            <Bullet text="Scan a government ID (front + back)" />
            <Bullet text="Take a quick selfie for face match" />
            <Bullet text="Confirm a liveness gesture" />
          </View>

          {status === 'in_review' && (
            <View style={styles.statusPill}>
              <ActivityIndicator size="small" color={brand.primary} />
              <Text style={styles.statusPillText}>
                Your verification is in manual review. We'll notify you when it's done.
              </Text>
            </View>
          )}
          {status === 'declined' && (
            <View style={[styles.statusPill, styles.statusPillDanger]}>
              <Ionicons name="alert-circle" size={18} color="#D14" />
              <Text style={[styles.statusPillText, { color: '#D14' }]}>
                Verification was declined. Try again with a clearer photo of your ID.
              </Text>
            </View>
          )}
          {status === 'approved' && (
            <View style={[styles.statusPill, styles.statusPillSuccess]}>
              <Ionicons name="checkmark-circle" size={18} color={semantic.success} />
              <Text style={[styles.statusPillText, { color: semantic.success }]}>
                You're verified — finishing up…
              </Text>
            </View>
          )}

          {error && <Text style={styles.errorText}>{error}</Text>}

          <Pressable
            style={[
              styles.primaryButton,
              (isStarting || isPolling || status === 'approved') && styles.buttonDisabled,
            ]}
            // After a poll timeout, re-check the existing session's status —
            // a fresh Didit session is only for declined (or first) attempts.
            onPress={
              pollTimedOut && status !== 'declined' ? pollStatus : handleStart
            }
            disabled={isStarting || isPolling || status === 'approved'}
          >
            {isStarting ? (
              <ActivityIndicator color={brand.white} />
            ) : isPolling ? (
              <>
                <ActivityIndicator color={brand.white} />
                <Text style={styles.primaryButtonText}>Checking…</Text>
              </>
            ) : status === 'declined' ? (
              <Text style={styles.primaryButtonText}>Try again</Text>
            ) : pollTimedOut ? (
              <Text style={styles.primaryButtonText}>Check status again</Text>
            ) : (
              <Text style={styles.primaryButtonText}>Verify with Didit</Text>
            )}
          </Pressable>

          {status === 'in_review' && (
            <Pressable onPress={handleLogout} style={styles.logoutLink}>
              <Text style={styles.logoutLinkText}>Finish later — log out</Text>
            </Pressable>
          )}

          <Text style={styles.legal}>
            Your ID is processed by Didit and never stored on GetDraft's servers.
            We only keep the approval status.
          </Text>

        </Animated.View>
      </ScrollView>
    </LinearGradient>
  );
};

function Bullet({ text }: { text: string }) {
  return (
    <View style={styles.bulletRow}>
      <View style={styles.bulletDot}>
        <Ionicons name="checkmark" size={12} color={brand.white} />
      </View>
      <Text style={styles.bulletText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContainer: {
    flexGrow: 1,
    paddingHorizontal: 24,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingRight: 12,
  },
  backText: {
    color: brand.white,
    fontSize: 15,
    fontFamily: 'Poppins_500Medium',
    marginLeft: 2,
  },
  iconWrap: {
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 22,
  },
  iconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(255,255,255,0.16)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    backgroundColor: brand.white,
    borderRadius: 24,
    padding: 26,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  title: {
    fontSize: 24,
    fontFamily: 'Poppins_700Bold',
    color: neutral.gray900,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    fontFamily: 'Poppins_400Regular',
    color: neutral.gray600,
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 20,
  },
  brandWord: {
    fontFamily: 'Poppins_600SemiBold',
    color: neutral.gray900,
  },
  bulletList: {
    marginTop: 18,
    gap: 10,
  },
  bulletRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  bulletDot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: brand.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bulletText: {
    flex: 1,
    fontSize: 14,
    fontFamily: 'Poppins_500Medium',
    color: neutral.gray800,
  },
  statusPill: {
    marginTop: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: neutral.gray100,
    padding: 12,
    borderRadius: 12,
  },
  statusPillDanger: {
    backgroundColor: 'rgba(221, 17, 68, 0.08)',
  },
  statusPillSuccess: {
    backgroundColor: 'rgba(0, 184, 148, 0.10)',
  },
  statusPillText: {
    flex: 1,
    fontSize: 13,
    fontFamily: 'Poppins_500Medium',
    color: neutral.gray700,
    lineHeight: 18,
  },
  errorText: {
    marginTop: 14,
    fontSize: 13,
    fontFamily: 'Poppins_500Medium',
    color: '#D14',
    textAlign: 'center',
  },
  primaryButton: {
    marginTop: 22,
    backgroundColor: brand.primary,
    borderRadius: 999,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    minHeight: 52,
  },
  buttonDisabled: { opacity: 0.65 },
  primaryButtonText: {
    color: brand.white,
    fontSize: 15,
    fontFamily: 'Poppins_600SemiBold',
  },
  logoutLink: {
    marginTop: 14,
    alignSelf: 'center',
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  logoutLinkText: {
    fontSize: 13,
    fontFamily: 'Poppins_500Medium',
    color: neutral.gray600,
    textDecorationLine: 'underline',
  },
  legal: {
    marginTop: 16,
    textAlign: 'center',
    fontSize: 11,
    fontFamily: 'Poppins_400Regular',
    color: neutral.gray500,
    lineHeight: 16,
  },
});

export default KycVerificationScreen;
