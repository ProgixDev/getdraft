import React, { useCallback, useState } from 'react';
import {
  View,
  StyleSheet,
  Text,
  Pressable,
  ScrollView,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { useStripe } from '@stripe/stripe-react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  useFonts,
  Poppins_400Regular,
  Poppins_500Medium,
  Poppins_600SemiBold,
  Poppins_700Bold,
} from '@expo-google-fonts/poppins';
import { brand, semantic, theme } from '@/config/colors';
import { plans } from '@/constants/plansData';
import { subscriptionsService } from '@/services/subscriptions';

type SubStatus = 'active' | 'canceled' | 'past_due' | 'trialing';

interface ApiSubscription {
  plan_id?: string;
  status?: SubStatus;
  current_period_end?: string | number | null;
  swipes_used_today?: number;
  daily_swipe_limit?: number | null;
  cancel_at_period_end?: boolean;
}

function formatPeriodEnd(value: ApiSubscription['current_period_end']): string | null {
  if (!value) return null;
  const date = typeof value === 'number' ? new Date(value * 1000) : new Date(value);
  if (isNaN(date.getTime())) return null;
  return date.toLocaleDateString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric',
  });
}

function statusColor(status: SubStatus | undefined) {
  if (status === 'active' || status === 'trialing') return semantic.success;
  if (status === 'past_due') return '#E54B4B';
  if (status === 'canceled') return '#E5A23B';
  return theme.textSecondary;
}

function statusLabel(status: SubStatus | undefined) {
  if (status === 'trialing') return 'Trial';
  if (status === 'past_due') return 'Payment past due';
  if (status === 'canceled') return 'Canceled';
  if (status === 'active') return 'Active';
  return 'Free';
}

export default function SubscriptionScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [fontsLoaded] = useFonts({
    Poppins_400Regular,
    Poppins_500Medium,
    Poppins_600SemiBold,
    Poppins_700Bold,
  });

  const [apiSub, setApiSub] = useState<ApiSubscription | null>(null);
  const [loading, setLoading] = useState(true);
  // Generic pending key: planId for upgrades, 'cancel'/'resume' for manage actions, 'buy-swipes' for nav.
  const [pendingAction, setPendingAction] = useState<string | null>(null);

  const { initPaymentSheet, presentPaymentSheet } = useStripe();

  const refresh = useCallback(async () => {
    try {
      const data = await subscriptionsService.getMySubscription();
      setApiSub(data ?? null);
    } catch {
      setApiSub(null);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      setLoading(true);
      subscriptionsService.getMySubscription()
        .then((data) => { if (!cancelled) setApiSub(data ?? null); })
        .catch(() => { if (!cancelled) setApiSub(null); })
        .finally(() => { if (!cancelled) setLoading(false); });
      return () => { cancelled = true; };
    }, []),
  );

  /**
   * Upgrade via Stripe's native Payment Sheet (same flow as signup) —
   * keeps the user in the app instead of opening a browser, and avoids
   * the legacy /subscriptions/checkout path that returned a webview URL.
   */
  const handleUpgrade = useCallback(
    async (planId: string) => {
      if (pendingAction) return;
      setPendingAction(planId);
      try {
        const params = await subscriptionsService.createPaymentSheet(planId);
        if (!params?.paymentIntentClientSecret) {
          throw new Error('Stripe did not return a checkout session.');
        }
        const { error: initErr } = await initPaymentSheet({
          merchantDisplayName: 'GetDraft',
          customerId: params.customerId,
          customerEphemeralKeySecret: params.ephemeralKeySecret,
          paymentIntentClientSecret: params.paymentIntentClientSecret,
          returnURL: 'getdraft://stripe-redirect',
          defaultBillingDetails: { address: { country: 'CA' } },
          appearance: {
            primaryButton: { colors: { background: brand.primary, text: brand.white } },
          },
        });
        if (initErr) {
          throw new Error(initErr.message || 'Could not prepare checkout.');
        }
        const { error: payErr } = await presentPaymentSheet();
        if (payErr) {
          if (payErr.code !== 'Canceled') {
            throw new Error(payErr.message || 'Payment failed.');
          }
          return; // user dismissed the sheet
        }
        // Payment succeeded — webhook handles status transition, but refresh
        // the local view immediately so the UI doesn't stay stale.
        await refresh();
      } catch (err: any) {
        const msg = err?.response?.data?.message ?? err?.message ?? 'Try again in a moment.';
        Alert.alert('Could not start upgrade', String(msg));
      } finally {
        setPendingAction(null);
      }
    },
    [pendingAction, initPaymentSheet, presentPaymentSheet, refresh],
  );

  /**
   * Schedules a cancel-at-period-end on Stripe — keeps the user on
   * their paid plan until the next renewal date, then drops to Basic
   * via webhook. Confirmed once so the user doesn't trip the button.
   */
  const doCancel = useCallback(async () => {
    if (pendingAction) return;
    setPendingAction('cancel');
    try {
      const res = await subscriptionsService.cancel(false);
      await refresh();
      Alert.alert(
        'Subscription canceled',
        res.cancelAt
          ? `You'll keep your plan until ${new Date(res.cancelAt).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}, then drop to Basic.`
          : "You'll keep your plan until the end of the billing period.",
      );
    } catch (err: any) {
      const msg = err?.response?.data?.message ?? err?.message ?? 'Try again in a moment.';
      Alert.alert('Could not cancel', String(msg));
    } finally {
      setPendingAction(null);
    }
  }, [pendingAction, refresh]);

  const handleCancel = useCallback(() => {
    if (pendingAction) return;
    Alert.alert(
      'Cancel subscription?',
      "You'll keep your current plan until the end of this billing period. You can resume any time before then.",
      [
        { text: 'Keep plan', style: 'cancel' },
        { text: 'Cancel subscription', style: 'destructive', onPress: doCancel },
      ],
    );
  }, [pendingAction, doCancel]);

  const handleResume = useCallback(async () => {
    if (pendingAction) return;
    setPendingAction('resume');
    try {
      await subscriptionsService.resume();
      await refresh();
      Alert.alert('Subscription resumed', 'Your plan will renew automatically.');
    } catch (err: any) {
      const msg = err?.response?.data?.message ?? err?.message ?? 'Try again in a moment.';
      Alert.alert('Could not resume', String(msg));
    } finally {
      setPendingAction(null);
    }
  }, [pendingAction, refresh]);

  const goToBuySwipes = useCallback(() => {
    if (pendingAction) return;
    router.push('/buy-swipes');
  }, [pendingAction, router]);

  if (!fontsLoaded) return null;

  const currentPlanId = apiSub?.plan_id ?? 'basic';
  const currentPlan = plans.find((p) => p.id === currentPlanId) ?? plans[0];
  const status = apiSub?.status;
  const periodEnd = formatPeriodEnd(apiSub?.current_period_end);
  const isPaidPlan = currentPlanId !== 'basic';
  const showManage = isPaidPlan;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable style={styles.headerButton} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={22} color={theme.text} />
        </Pressable>
        <Text style={styles.headerTitle}>My Subscription</Text>
        <View style={styles.headerButton} />
      </View>

      {loading && !apiSub ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={theme.text} />
        </View>
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 24 }]}
          showsVerticalScrollIndicator={false}
        >
          {/* Current plan hero */}
          <View style={styles.currentPlanCard}>
            <View style={styles.currentPlanBadge}>
              <Text style={styles.currentPlanBadgeText}>CURRENT PLAN</Text>
            </View>
            <Text style={styles.currentPlanName}>{currentPlan.name}</Text>
            <Text style={styles.currentPlanPrice}>
              {currentPlan.price === 0 ? 'Free' : `$${currentPlan.price}`}
              <Text style={styles.currentPlanPeriod}> {currentPlan.period}</Text>
            </Text>
            <View style={styles.currentPlanSwipeRow}>
              <Ionicons name="swap-horizontal" size={16} color="rgba(255,255,255,0.8)" />
              <Text style={styles.currentPlanSwipes}>{currentPlan.swipes}</Text>
            </View>

            {(isPaidPlan || status === 'past_due') && (
              <View style={styles.statusPill}>
                <View style={[styles.statusDot, { backgroundColor: statusColor(status) }]} />
                <Text style={styles.statusText}>{statusLabel(status)}</Text>
              </View>
            )}

            {periodEnd && status !== 'canceled' && (
              <Text style={styles.periodText}>
                {apiSub?.cancel_at_period_end ? 'Cancels' : 'Renews'} on {periodEnd}
              </Text>
            )}
            {status === 'canceled' && periodEnd && (
              <Text style={styles.periodText}>Access ends on {periodEnd}</Text>
            )}
          </View>

          {/* Past-due banner */}
          {status === 'past_due' && (
            <View style={styles.pastDueCard}>
              <Ionicons name="warning" size={20} color="#E54B4B" />
              <Text style={styles.pastDueText}>
                Your last payment failed. Update your card to keep your plan.
              </Text>
            </View>
          )}

          {/* Plan comparison */}
          <Text style={styles.sectionHeading}>All Plans</Text>

          {plans.map((plan) => {
            const isCurrent = plan.id === currentPlanId;
            const isPending = pendingAction === plan.id;
            return (
              <View
                key={plan.id}
                style={[
                  styles.planCard,
                  isCurrent && styles.planCardCurrent,
                  plan.popular && !isCurrent && styles.planCardPopular,
                ]}
              >
                {plan.popular && !isCurrent && (
                  <View style={styles.popularBadge}>
                    <Text style={styles.popularBadgeText}>MOST POPULAR</Text>
                  </View>
                )}

                <View style={styles.planHeader}>
                  <View>
                    <Text style={styles.planName}>{plan.name}</Text>
                    <Text style={styles.planPrice}>
                      {plan.price === 0 ? 'Free' : `$${plan.price}`}
                      <Text style={styles.planPeriod}> {plan.period}</Text>
                    </Text>
                  </View>
                  {isCurrent && (
                    <View style={styles.currentBadge}>
                      <Ionicons name="checkmark-circle" size={14} color={semantic.success} />
                      <Text style={styles.currentBadgeText}>Current</Text>
                    </View>
                  )}
                </View>

                <Text style={styles.planSwipes}>{plan.swipes}</Text>

                <View style={styles.featureList}>
                  {plan.features.map((feature) => (
                    <View key={feature} style={styles.featureRow}>
                      <Ionicons name="checkmark" size={16} color={semantic.success} />
                      <Text style={styles.featureText}>{feature}</Text>
                    </View>
                  ))}
                </View>

                {!isCurrent && plan.id !== 'basic' && (
                  <Pressable
                    style={[
                      styles.upgradeButton,
                      plan.popular && styles.upgradeButtonPopular,
                      pendingAction !== null && styles.upgradeButtonDisabled,
                    ]}
                    onPress={() => handleUpgrade(plan.id)}
                    disabled={pendingAction !== null}
                  >
                    {isPending ? (
                      <ActivityIndicator
                        color={plan.popular ? theme.accentText : theme.text}
                      />
                    ) : (
                      <Text
                        style={[
                          styles.upgradeButtonText,
                          plan.popular && styles.upgradeButtonTextPopular,
                        ]}
                      >
                        Upgrade to {plan.name}
                      </Text>
                    )}
                  </Pressable>
                )}
              </View>
            );
          })}

          {/* Buy more swipes — always shown so free users can top up too. */}
          <Pressable
            style={[styles.swipePackButton, pendingAction !== null && styles.upgradeButtonDisabled]}
            onPress={goToBuySwipes}
            disabled={pendingAction !== null}
          >
            <Ionicons name="add-circle-outline" size={18} color={theme.accentText} />
            <Text style={styles.swipePackButtonText}>Buy more swipes</Text>
          </Pressable>

          {/* Cancel / resume (paid plans only) */}
          {showManage && apiSub?.cancel_at_period_end ? (
            <Pressable
              style={[styles.resumeButton, pendingAction !== null && styles.upgradeButtonDisabled]}
              onPress={handleResume}
              disabled={pendingAction !== null}
            >
              {pendingAction === 'resume' ? (
                <ActivityIndicator color={theme.accentText} />
              ) : (
                <Text style={styles.resumeButtonText}>Resume subscription</Text>
              )}
            </Pressable>
          ) : showManage ? (
            <Pressable
              style={[styles.cancelButton, pendingAction !== null && styles.upgradeButtonDisabled]}
              onPress={handleCancel}
              disabled={pendingAction !== null}
            >
              {pendingAction === 'cancel' ? (
                <ActivityIndicator color="#E54B4B" />
              ) : (
                <Text style={styles.cancelButtonText}>Cancel subscription</Text>
              )}
            </Pressable>
          ) : null}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.bg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 14,
    backgroundColor: theme.headerBg,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  headerButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontFamily: 'Poppins_600SemiBold',
    color: theme.text,
  },
  loadingWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    gap: 14,
  },
  currentPlanCard: {
    backgroundColor: brand.primary,
    borderRadius: 18,
    padding: 24,
    alignItems: 'center',
  },
  currentPlanBadge: {
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 4,
    marginBottom: 12,
  },
  currentPlanBadgeText: {
    fontSize: 11,
    fontFamily: 'Poppins_600SemiBold',
    color: brand.white,
    letterSpacing: 1,
  },
  currentPlanName: {
    fontSize: 28,
    fontFamily: 'Poppins_700Bold',
    color: brand.white,
  },
  currentPlanPrice: {
    fontSize: 18,
    fontFamily: 'Poppins_600SemiBold',
    color: brand.white,
    marginTop: 4,
  },
  currentPlanPeriod: {
    fontSize: 14,
    fontFamily: 'Poppins_400Regular',
    color: 'rgba(255,255,255,0.7)',
  },
  currentPlanSwipeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 12,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  currentPlanSwipes: {
    fontSize: 13,
    fontFamily: 'Poppins_500Medium',
    color: 'rgba(255,255,255,0.9)',
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 10,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusText: {
    fontSize: 12,
    fontFamily: 'Poppins_500Medium',
    color: brand.white,
  },
  periodText: {
    fontSize: 12,
    fontFamily: 'Poppins_400Regular',
    color: 'rgba(255,255,255,0.7)',
    marginTop: 8,
  },
  pastDueCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(229,75,75,0.12)',
    borderColor: '#E54B4B',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  pastDueText: {
    flex: 1,
    fontSize: 13,
    fontFamily: 'Poppins_500Medium',
    color: theme.text,
  },
  sectionHeading: {
    fontSize: 18,
    fontFamily: 'Poppins_600SemiBold',
    color: theme.text,
    marginTop: 4,
  },
  planCard: {
    backgroundColor: theme.cardBg,
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: theme.cardBorder,
  },
  planCardCurrent: {
    borderColor: semantic.success,
    borderWidth: 2,
  },
  planCardPopular: {
    borderColor: brand.primary,
    borderWidth: 2,
  },
  popularBadge: {
    alignSelf: 'flex-start',
    backgroundColor: brand.primary,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 3,
    marginBottom: 12,
  },
  popularBadgeText: {
    fontSize: 10,
    fontFamily: 'Poppins_600SemiBold',
    color: brand.white,
    letterSpacing: 0.5,
  },
  planHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  planName: {
    fontSize: 20,
    fontFamily: 'Poppins_700Bold',
    color: theme.text,
  },
  planPrice: {
    fontSize: 16,
    fontFamily: 'Poppins_600SemiBold',
    color: theme.text,
    marginTop: 2,
  },
  planPeriod: {
    fontSize: 13,
    fontFamily: 'Poppins_400Regular',
    color: theme.textMuted,
  },
  currentBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(0,184,148,0.15)',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  currentBadgeText: {
    fontSize: 12,
    fontFamily: 'Poppins_600SemiBold',
    color: semantic.success,
  },
  planSwipes: {
    fontSize: 13,
    fontFamily: 'Poppins_500Medium',
    color: theme.textSecondary,
    marginTop: 8,
  },
  featureList: {
    marginTop: 14,
    gap: 8,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  featureText: {
    fontSize: 14,
    fontFamily: 'Poppins_400Regular',
    color: theme.textSecondary,
  },
  upgradeButton: {
    marginTop: 16,
    height: 44,
    borderRadius: 22,
    backgroundColor: theme.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  upgradeButtonPopular: {
    backgroundColor: theme.accent,
  },
  upgradeButtonDisabled: {
    opacity: 0.6,
  },
  upgradeButtonText: {
    fontSize: 15,
    fontFamily: 'Poppins_600SemiBold',
    color: theme.text,
  },
  upgradeButtonTextPopular: {
    color: theme.accentText,
  },
  swipePackButton: {
    height: 50,
    borderRadius: 25,
    backgroundColor: theme.accent,
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  swipePackButtonText: {
    fontSize: 15,
    fontFamily: 'Poppins_600SemiBold',
    color: theme.accentText,
  },
  cancelButton: {
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
    borderWidth: 1,
    borderColor: 'rgba(229,75,75,0.5)',
    backgroundColor: 'rgba(229,75,75,0.08)',
  },
  cancelButtonText: {
    fontSize: 14,
    fontFamily: 'Poppins_600SemiBold',
    color: '#E54B4B',
  },
  resumeButton: {
    height: 50,
    borderRadius: 25,
    backgroundColor: brand.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  resumeButtonText: {
    fontSize: 15,
    fontFamily: 'Poppins_600SemiBold',
    color: theme.accentText,
  },
});
