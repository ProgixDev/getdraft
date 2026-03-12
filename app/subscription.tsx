import React, { useState } from 'react';
import {
  View,
  StyleSheet,
  Text,
  Pressable,
  ScrollView,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  useFonts,
  Poppins_400Regular,
  Poppins_500Medium,
  Poppins_600SemiBold,
  Poppins_700Bold,
} from '@expo-google-fonts/poppins';
import { brand, neutral, semantic, theme } from '@/config/colors';
import { plans } from '@/constants/plansData';

export default function SubscriptionScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [currentPlanId] = useState('basic');

  const [fontsLoaded] = useFonts({
    Poppins_400Regular,
    Poppins_500Medium,
    Poppins_600SemiBold,
    Poppins_700Bold,
  });

  if (!fontsLoaded) return null;

  const currentPlan = plans.find((p) => p.id === currentPlanId)!;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable style={styles.headerButton} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={22} color={theme.text} />
        </Pressable>
        <Text style={styles.headerTitle}>My Subscription</Text>
        <View style={styles.headerButton} />
      </View>

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
        </View>

        {/* Plan comparison */}
        <Text style={styles.sectionHeading}>All Plans</Text>

        {plans.map((plan) => {
          const isCurrent = plan.id === currentPlanId;
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

              {!isCurrent && (
                <Pressable
                  style={[styles.upgradeButton, plan.popular && styles.upgradeButtonPopular]}
                  onPress={() =>
                    Alert.alert(
                      'Upgrade',
                      `Upgrading to ${plan.name} ($${plan.price}/${plan.period}) is coming soon!`
                    )
                  }
                >
                  <Text
                    style={[styles.upgradeButtonText, plan.popular && styles.upgradeButtonTextPopular]}
                  >
                    Upgrade to {plan.name}
                  </Text>
                </Pressable>
              )}
            </View>
          );
        })}

        {/* Manage */}
        <Pressable
          style={styles.manageButton}
          onPress={() =>
            Alert.alert('Manage Subscription', 'Subscription management is coming soon.')
          }
        >
          <Text style={styles.manageButtonText}>Manage Subscription</Text>
        </Pressable>
      </ScrollView>
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
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    gap: 14,
  },
  // Current plan hero
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
  sectionHeading: {
    fontSize: 18,
    fontFamily: 'Poppins_600SemiBold',
    color: theme.text,
    marginTop: 4,
  },
  // Plan cards
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
  upgradeButtonText: {
    fontSize: 15,
    fontFamily: 'Poppins_600SemiBold',
    color: theme.text,
  },
  upgradeButtonTextPopular: {
    color: theme.accentText,
  },
  manageButton: {
    height: 50,
    borderRadius: 25,
    backgroundColor: theme.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  manageButtonText: {
    fontSize: 16,
    fontFamily: 'Poppins_600SemiBold',
    color: theme.accentText,
  },
});
