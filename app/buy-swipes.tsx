import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useStripe } from '@stripe/stripe-react-native';
import {
  useFonts,
  Poppins_400Regular,
  Poppins_500Medium,
  Poppins_600SemiBold,
  Poppins_700Bold,
} from '@expo-google-fonts/poppins';
import { brand, semantic, theme } from '@/config/colors';
import { subscriptionsService } from '@/services/subscriptions';

interface SwipePack {
  id: string;
  swipes: number;
  amountCents: number;
  label: string;
}

function formatPrice(amountCents: number): string {
  const dollars = amountCents / 100;
  return Number.isInteger(dollars) ? `$${dollars}` : `$${dollars.toFixed(2)}`;
}

function pricePerSwipe(pack: SwipePack): string {
  const cents = pack.amountCents / pack.swipes;
  return `${cents.toFixed(0)}¢ each`;
}

export default function BuySwipesScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { initPaymentSheet, presentPaymentSheet } = useStripe();

  const [fontsLoaded] = useFonts({
    Poppins_400Regular,
    Poppins_500Medium,
    Poppins_600SemiBold,
    Poppins_700Bold,
  });

  const [packs, setPacks] = useState<SwipePack[]>([]);
  const [loading, setLoading] = useState(true);
  const [pendingPackId, setPendingPackId] = useState<string | null>(null);
  const [bonusSwipes, setBonusSwipes] = useState<number | null>(null);

  const refreshBonus = useCallback(async () => {
    try {
      const sub = await subscriptionsService.getMySubscription();
      setBonusSwipes(sub?.bonus_swipes ?? 0);
    } catch {
      // Non-fatal — the screen still works without the badge.
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await subscriptionsService.listSwipePacks();
        if (!cancelled) setPacks(list);
      } catch (err: any) {
        const msg = err?.response?.data?.message ?? err?.message ?? 'Could not load packs.';
        if (!cancelled) Alert.alert('Could not load packs', String(msg));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    refreshBonus();
    return () => { cancelled = true; };
  }, [refreshBonus]);

  const handleBuy = useCallback(
    async (pack: SwipePack) => {
      if (pendingPackId) return;
      setPendingPackId(pack.id);
      try {
        const params = await subscriptionsService.buySwipePackSheet(pack.id);
        if (!params?.paymentIntentClientSecret) {
          throw new Error('Stripe did not return a payment session.');
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
        if (initErr) throw new Error(initErr.message || 'Could not prepare checkout.');

        const { error: payErr } = await presentPaymentSheet();
        if (payErr) {
          if (payErr.code !== 'Canceled') {
            throw new Error(payErr.message || 'Payment failed.');
          }
          return;
        }
        // Webhook credits bonus_swipes; refresh to surface the new total.
        await refreshBonus();
        Alert.alert(
          'Swipes added!',
          `${pack.swipes} swipes have been credited to your account.`,
          [{ text: 'Done', onPress: () => router.back() }],
        );
      } catch (err: any) {
        const msg = err?.response?.data?.message ?? err?.message ?? 'Try again in a moment.';
        Alert.alert('Could not buy pack', String(msg));
      } finally {
        setPendingPackId(null);
      }
    },
    [pendingPackId, initPaymentSheet, presentPaymentSheet, refreshBonus, router],
  );

  if (!fontsLoaded) return null;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable style={styles.headerButton} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={22} color={theme.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Buy more swipes</Text>
        <View style={styles.headerButton} />
      </View>

      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={theme.text} />
        </View>
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 24 }]}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.heroCard}>
            <View style={styles.heroIcon}>
              <Ionicons name="flash" size={28} color={brand.white} />
            </View>
            <Text style={styles.heroTitle}>Top up your swipes</Text>
            <Text style={styles.heroSubtitle}>
              One-time purchase. Extra swipes carry over and stack with your daily plan.
            </Text>
            {bonusSwipes !== null && bonusSwipes > 0 && (
              <View style={styles.bonusBadge}>
                <Ionicons name="sparkles" size={14} color={semantic.success} />
                <Text style={styles.bonusBadgeText}>
                  You have {bonusSwipes} bonus swipe{bonusSwipes === 1 ? '' : 's'} available
                </Text>
              </View>
            )}
          </View>

          <Text style={styles.sectionHeading}>Choose a pack</Text>

          {packs.map((pack, index) => {
            const isPopular = index === 1; // middle pack
            const isBest = index === 2; // largest pack
            const isPending = pendingPackId === pack.id;
            return (
              <Pressable
                key={pack.id}
                style={({ pressed }) => [
                  styles.packCard,
                  isPopular && styles.packCardPopular,
                  isBest && styles.packCardBest,
                  pressed && { opacity: 0.85 },
                  pendingPackId !== null && pendingPackId !== pack.id && styles.packCardDisabled,
                ]}
                onPress={() => handleBuy(pack)}
                disabled={pendingPackId !== null}
              >
                {isPopular && (
                  <View style={styles.popularBadge}>
                    <Text style={styles.popularBadgeText}>POPULAR</Text>
                  </View>
                )}
                {isBest && (
                  <View style={styles.bestBadge}>
                    <Text style={styles.bestBadgeText}>BEST VALUE</Text>
                  </View>
                )}

                <View style={styles.packRow}>
                  <View style={styles.packLeft}>
                    <Text style={styles.packSwipes}>{pack.swipes}</Text>
                    <Text style={styles.packSwipesLabel}>swipes</Text>
                  </View>
                  <View style={styles.packRight}>
                    <Text style={styles.packPrice}>{formatPrice(pack.amountCents)}</Text>
                    <Text style={styles.packUnit}>{pricePerSwipe(pack)}</Text>
                  </View>
                </View>

                <View style={styles.buyButton}>
                  {isPending ? (
                    <ActivityIndicator color={theme.accentText} />
                  ) : (
                    <>
                      <Text style={styles.buyButtonText}>Buy now</Text>
                      <Ionicons name="arrow-forward" size={16} color={theme.accentText} />
                    </>
                  )}
                </View>
              </Pressable>
            );
          })}

          <View style={styles.footer}>
            <Ionicons name="shield-checkmark" size={14} color={theme.textSecondary} />
            <Text style={styles.footerText}>
              Secure payment via Stripe · No subscription · Swipes never expire
            </Text>
          </View>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.bg },
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
  headerButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 18, fontFamily: 'Poppins_600SemiBold', color: theme.text },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll: { flex: 1 },
  scrollContent: { padding: 16, gap: 12 },
  heroCard: {
    backgroundColor: brand.primary,
    borderRadius: 18,
    padding: 22,
    alignItems: 'center',
  },
  heroIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  heroTitle: {
    fontSize: 22,
    fontFamily: 'Poppins_700Bold',
    color: brand.white,
    marginBottom: 6,
  },
  heroSubtitle: {
    fontSize: 13,
    fontFamily: 'Poppins_400Regular',
    color: 'rgba(255,255,255,0.75)',
    textAlign: 'center',
    paddingHorizontal: 8,
  },
  bonusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 12,
    backgroundColor: 'rgba(0,184,148,0.18)',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  bonusBadgeText: {
    fontSize: 12,
    fontFamily: 'Poppins_500Medium',
    color: semantic.successLight,
  },
  sectionHeading: {
    fontSize: 18,
    fontFamily: 'Poppins_600SemiBold',
    color: theme.text,
    marginTop: 8,
    marginBottom: 4,
  },
  packCard: {
    backgroundColor: theme.cardBg,
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: theme.cardBorder,
    gap: 14,
  },
  packCardPopular: { borderColor: brand.primary, borderWidth: 2 },
  packCardBest: { borderColor: semantic.success, borderWidth: 2 },
  packCardDisabled: { opacity: 0.5 },
  popularBadge: {
    position: 'absolute',
    top: -10,
    right: 16,
    backgroundColor: brand.primary,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  popularBadgeText: {
    fontSize: 10,
    fontFamily: 'Poppins_700Bold',
    color: brand.white,
    letterSpacing: 1,
  },
  bestBadge: {
    position: 'absolute',
    top: -10,
    right: 16,
    backgroundColor: semantic.success,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  bestBadgeText: {
    fontSize: 10,
    fontFamily: 'Poppins_700Bold',
    color: brand.white,
    letterSpacing: 1,
  },
  packRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  packLeft: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
  packSwipes: { fontSize: 38, fontFamily: 'Poppins_700Bold', color: theme.text, lineHeight: 42 },
  packSwipesLabel: { fontSize: 14, fontFamily: 'Poppins_500Medium', color: theme.textSecondary },
  packRight: { alignItems: 'flex-end' },
  packPrice: { fontSize: 24, fontFamily: 'Poppins_700Bold', color: theme.text },
  packUnit: { fontSize: 11, fontFamily: 'Poppins_500Medium', color: theme.textSecondary, marginTop: 2 },
  buyButton: {
    height: 44,
    borderRadius: 22,
    backgroundColor: theme.accent,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  buyButtonText: { fontSize: 14, fontFamily: 'Poppins_600SemiBold', color: theme.accentText },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 12,
  },
  footerText: {
    fontSize: 11,
    fontFamily: 'Poppins_400Regular',
    color: theme.textSecondary,
  },
});
