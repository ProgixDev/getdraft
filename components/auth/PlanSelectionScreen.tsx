import React, { useState } from "react";
import {
  View,
  StyleSheet,
  Text,
  Pressable,
  ScrollView,
  Dimensions,
  ActivityIndicator,
} from "react-native";
import Animated, { FadeInDown, FadeIn } from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import {
  useFonts,
  Poppins_400Regular,
  Poppins_500Medium,
  Poppins_600SemiBold,
  Poppins_700Bold,
  Poppins_800ExtraBold,
} from "@expo-google-fonts/poppins";
import { brand, neutral } from "@/config/colors";
import { PHONE_MAX_WIDTH } from "@/lib/responsive";
import { Plan, plans } from "@/constants/plansData";

// Phone-width app frame, not the raw window (tablets are wider than the frame).
const width = Math.min(Dimensions.get("window").width, PHONE_MAX_WIDTH);

interface PlanSelectionScreenProps {
  /**
   * Called when the user picks a plan. For paid plans the parent
   * should present Stripe and resolve once the charge is confirmed;
   * for the free plan it should just advance. Returning a rejected
   * promise stops the per-card spinner so the user can retry.
   */
  onPlanSelected: (planId: string) => Promise<void> | void;
  /**
   * Optional X-to-skip handler. Shown as a close icon at the top-right
   * when present — used at the end of signup so users can defer the
   * subscription decision and finish onboarding on Basic.
   */
  onSkip?: () => void;
  /** Optional back-chevron, shown top-left when present. */
  onBack?: () => void;
}

export const PlanSelectionScreen: React.FC<PlanSelectionScreenProps> = ({
  onPlanSelected,
  onSkip,
  onBack,
}) => {
  const [fontsLoaded] = useFonts({
    Poppins_400Regular,
    Poppins_500Medium,
    Poppins_600SemiBold,
    Poppins_700Bold,
    Poppins_800ExtraBold,
  });

  const [processingPlanId, setProcessingPlanId] = useState<string | null>(
    null,
  );

  const handlePick = async (planId: string) => {
    if (processingPlanId) return;
    setProcessingPlanId(planId);
    try {
      await onPlanSelected(planId);
      // Parent navigates away on success — leave the spinner on so
      // the card doesn't visually "reset" before unmount.
    } catch {
      // Failure / cancellation — release the spinner so the user
      // can pick again. The parent is expected to surface the
      // error message itself.
      setProcessingPlanId(null);
    }
  };

  if (!fontsLoaded) return null;

  return (
    <LinearGradient
      colors={[brand.primary, "#0a4d8f", brand.primary]}
      style={styles.container}
    >
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* Top bar — back chevron (optional) + X-to-skip (optional) */}
        <View style={styles.topBar}>
          {onBack ? (
            <Pressable onPress={onBack} style={styles.iconButton}>
              <Ionicons name="arrow-back" size={22} color={brand.white} />
            </Pressable>
          ) : (
            <View style={styles.iconButton} />
          )}
          {onSkip ? (
            <Pressable
              onPress={onSkip}
              style={styles.iconButton}
              disabled={processingPlanId !== null}
            >
              <Ionicons name="close" size={22} color={brand.white} />
            </Pressable>
          ) : (
            <View style={styles.iconButton} />
          )}
        </View>

        {/* Header */}
        <Animated.View entering={FadeIn.duration(800)} style={styles.header}>
          <Text style={styles.title}>Choose Your Plan</Text>
          <Text style={styles.subtitle}>
            Tap a paid plan to pay now — start free anytime.
          </Text>
        </Animated.View>

        {/* Plans */}
        <View style={styles.plansContainer}>
          {plans.filter((p) => !p.legacy).map((plan, index) => {
            const isProcessing = processingPlanId === plan.id;
            const isDisabled = processingPlanId !== null && !isProcessing;
            const isSelected = isProcessing; // visual highlight for the tapped one
            return (
            <Animated.View
              key={plan.id}
              entering={FadeInDown.duration(600).delay(100 * index)}
            >
              <Pressable
                style={[
                  styles.planCard,
                  isSelected && styles.planCardSelected,
                  plan.popular && styles.planCardPopular,
                  isDisabled && { opacity: 0.5 },
                ]}
                onPress={() => handlePick(plan.id)}
                disabled={processingPlanId !== null}
              >
                {plan.popular && (
                  <View style={styles.popularBadge}>
                    <Text style={styles.popularText}>MOST POPULAR</Text>
                  </View>
                )}

                <View style={styles.planHeader}>
                  <Text
                    style={[
                      styles.planName,
                      isSelected && styles.planNameSelected,
                    ]}
                  >
                    {plan.name}
                  </Text>

                  <View style={styles.priceContainer}>
                    {plan.price === 0 ? (
                      <Text
                        style={[
                          styles.freeText,
                          isSelected && styles.priceSelected,
                        ]}
                      >
                        FREE
                      </Text>
                    ) : (
                      <>
                        <Text
                          style={[
                            styles.priceSymbol,
                            isSelected && styles.priceSelected,
                          ]}
                        >
                          $
                        </Text>
                        <Text
                          style={[
                            styles.priceAmount,
                            isSelected && styles.priceSelected,
                          ]}
                        >
                          {plan.price}
                        </Text>
                      </>
                    )}
                  </View>

                  <Text
                    style={[
                      styles.pricePeriod,
                      isSelected && styles.pricePeriodSelected,
                    ]}
                  >
                    {plan.period}
                  </Text>
                </View>

                <View style={styles.swipesContainer}>
                  <Ionicons
                    name="heart"
                    size={16}
                    color={
                      isSelected ? brand.primary : neutral.gray500
                    }
                  />
                  <Text
                    style={[
                      styles.swipesText,
                      isSelected && styles.swipesTextSelected,
                    ]}
                  >
                    {plan.swipes}
                  </Text>
                </View>

                <View style={styles.divider} />

                <View style={styles.featuresContainer}>
                  {plan.features.map((feature, idx) => (
                    <View key={idx} style={styles.featureRow}>
                      <Ionicons
                        name="checkmark-circle"
                        size={18}
                        color={
                          isSelected
                            ? brand.primary
                            : neutral.gray400
                        }
                      />
                      <Text
                        style={[
                          styles.featureText,
                          isSelected &&
                            styles.featureTextSelected,
                        ]}
                      >
                        {feature}
                      </Text>
                    </View>
                  ))}
                </View>

                {isProcessing ? (
                  <View style={styles.selectedIndicator}>
                    <ActivityIndicator size="small" color={brand.primary} />
                  </View>
                ) : null}
              </Pressable>
            </Animated.View>
            );
          })}
        </View>
      </ScrollView>
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: 60,
    paddingHorizontal: 24,
    paddingBottom: 40,
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  iconButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  header: {
    alignItems: "center",
    marginBottom: 32,
  },
  title: {
    fontSize: 32,
    fontFamily: "Poppins_800ExtraBold",
    color: brand.white,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    fontFamily: "Poppins_400Regular",
    color: "rgba(255, 255, 255, 0.9)",
  },
  plansContainer: {
    gap: 16,
    marginBottom: 24,
  },
  planCard: {
    backgroundColor: brand.white,
    borderRadius: 20,
    padding: 20,
    borderWidth: 3,
    borderColor: "transparent",
    position: "relative",
  },
  planCardSelected: {
    borderColor: brand.primary,
    shadowColor: brand.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 6,
  },
  planCardPopular: {
    borderColor: "#FFD700",
  },
  popularBadge: {
    position: "absolute",
    top: -12,
    right: 20,
    backgroundColor: "#FFD700",
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  popularText: {
    fontSize: 10,
    fontFamily: "Poppins_700Bold",
    color: brand.primary,
    letterSpacing: 0.5,
  },
  planHeader: {
    alignItems: "center",
    marginBottom: 16,
  },
  planName: {
    fontSize: 20,
    fontFamily: "Poppins_700Bold",
    color: brand.primary,
    marginBottom: 8,
  },
  planNameSelected: {
    color: brand.primary,
  },
  priceContainer: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 4,
  },
  priceSymbol: {
    fontSize: 24,
    fontFamily: "Poppins_700Bold",
    color: neutral.gray700,
    marginTop: 4,
  },
  priceAmount: {
    fontSize: 48,
    fontFamily: "Poppins_800ExtraBold",
    color: neutral.gray700,
    lineHeight: 56,
  },
  freeText: {
    fontSize: 40,
    fontFamily: "Poppins_800ExtraBold",
    color: neutral.gray700,
  },
  priceSelected: {
    color: brand.primary,
  },
  pricePeriod: {
    fontSize: 13,
    fontFamily: "Poppins_400Regular",
    color: neutral.gray600,
  },
  pricePeriodSelected: {
    color: brand.primary,
  },
  swipesContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: neutral.gray50,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    alignSelf: "center",
    marginBottom: 16,
  },
  swipesText: {
    fontSize: 13,
    fontFamily: "Poppins_600SemiBold",
    color: neutral.gray600,
    marginLeft: 6,
  },
  swipesTextSelected: {
    color: brand.primary,
  },
  divider: {
    height: 1,
    backgroundColor: neutral.gray200,
    marginBottom: 16,
  },
  featuresContainer: {
    gap: 10,
  },
  featureRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  featureText: {
    fontSize: 13,
    fontFamily: "Poppins_400Regular",
    color: neutral.gray700,
    flex: 1,
  },
  featureTextSelected: {
    color: brand.primary,
    fontFamily: "Poppins_500Medium",
  },
  selectedIndicator: {
    position: "absolute",
    top: 20,
    right: 20,
  },
  continueButton: {
    height: 56,
    borderRadius: 28,
    overflow: "hidden",
  },
  buttonGradient: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  buttonText: {
    color: brand.primary,
    fontSize: 17,
    fontFamily: "Poppins_700Bold",
  },
});
