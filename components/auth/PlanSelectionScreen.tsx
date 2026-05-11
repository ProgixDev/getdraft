import React, { useState } from 'react';
import {
    View,
    StyleSheet,
    Text,
    Pressable,
    ScrollView,
    Dimensions,
} from 'react-native';
import Animated, { FadeInDown, FadeIn } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import {
    useFonts,
    Poppins_400Regular,
    Poppins_500Medium,
    Poppins_600SemiBold,
    Poppins_700Bold,
    Poppins_800ExtraBold,
} from '@expo-google-fonts/poppins';
import { brand, neutral } from '@/config/colors';
import { Plan, plans } from '@/constants/plansData';

const { width } = Dimensions.get('window');

interface PlanSelectionScreenProps {
    onPlanSelected: (planId: string) => void;
    onBack: () => void;
}

export const PlanSelectionScreen: React.FC<PlanSelectionScreenProps> = ({
    onPlanSelected,
    onBack,
}) => {
    const [fontsLoaded] = useFonts({
        Poppins_400Regular,
        Poppins_500Medium,
        Poppins_600SemiBold,
        Poppins_700Bold,
        Poppins_800ExtraBold,
    });

    const [selectedPlan, setSelectedPlan] = useState('pro');

    const handleContinue = () => {
        onPlanSelected(selectedPlan);
    };

    if (!fontsLoaded) return null;

    return (
        <LinearGradient
            colors={[brand.primary, '#0a4d8f', brand.primary]}
            style={styles.container}
        >
            <ScrollView 
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.scrollContent}
            >
                {/* Back Button */}
                <Pressable onPress={onBack} style={styles.backButton}>
                    <Ionicons name="arrow-back" size={24} color={brand.white} />
                </Pressable>

                {/* Header */}
                <Animated.View entering={FadeIn.duration(800)} style={styles.header}>
                    <Text style={styles.title}>Choose Your Plan</Text>
                    <Text style={styles.subtitle}>
                        Start with free and upgrade anytime
                    </Text>
                </Animated.View>

                {/* Plans */}
                <View style={styles.plansContainer}>
                    {plans.map((plan, index) => (
                        <Animated.View
                            key={plan.id}
                            entering={FadeInDown.duration(600).delay(100 * index)}
                        >
                            <Pressable
                                style={[
                                    styles.planCard,
                                    selectedPlan === plan.id && styles.planCardSelected,
                                    plan.popular && styles.planCardPopular,
                                ]}
                                onPress={() => setSelectedPlan(plan.id)}
                            >
                                {plan.popular && (
                                    <View style={styles.popularBadge}>
                                        <Text style={styles.popularText}>MOST POPULAR</Text>
                                    </View>
                                )}

                                <View style={styles.planHeader}>
                                    <Text style={[
                                        styles.planName,
                                        selectedPlan === plan.id && styles.planNameSelected,
                                    ]}>
                                        {plan.name}
                                    </Text>
                                    
                                    <View style={styles.priceContainer}>
                                        {plan.price === 0 ? (
                                            <Text style={[
                                                styles.freeText,
                                                selectedPlan === plan.id && styles.priceSelected,
                                            ]}>
                                                FREE
                                            </Text>
                                        ) : (
                                            <>
                                                <Text style={[
                                                    styles.priceSymbol,
                                                    selectedPlan === plan.id && styles.priceSelected,
                                                ]}>
                                                    $
                                                </Text>
                                                <Text style={[
                                                    styles.priceAmount,
                                                    selectedPlan === plan.id && styles.priceSelected,
                                                ]}>
                                                    {plan.price}
                                                </Text>
                                            </>
                                        )}
                                    </View>
                                    
                                    <Text style={[
                                        styles.pricePeriod,
                                        selectedPlan === plan.id && styles.pricePeriodSelected,
                                    ]}>
                                        {plan.period}
                                    </Text>
                                </View>

                                <View style={styles.swipesContainer}>
                                    <Ionicons
                                        name="flash"
                                        size={14}
                                        color={selectedPlan === plan.id ? brand.primary : neutral.gray500}
                                    />
                                    <Text style={[
                                        styles.swipesText,
                                        selectedPlan === plan.id && styles.swipesTextSelected,
                                    ]}>
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
                                                color={selectedPlan === plan.id ? brand.primary : neutral.gray400}
                                            />
                                            <Text style={[
                                                styles.featureText,
                                                selectedPlan === plan.id && styles.featureTextSelected,
                                            ]}>
                                                {feature}
                                            </Text>
                                        </View>
                                    ))}
                                </View>

                                {selectedPlan === plan.id && (
                                    <View style={styles.selectedIndicator}>
                                        <Ionicons name="checkmark-circle" size={24} color={brand.primary} />
                                    </View>
                                )}
                            </Pressable>
                        </Animated.View>
                    ))}
                </View>

                {/* Continue Button */}
                <Animated.View entering={FadeInDown.duration(800).delay(400)}>
                    <Pressable
                        style={({ pressed }) => [
                            styles.continueButton,
                            pressed && { transform: [{ scale: 0.98 }] },
                        ]}
                        onPress={handleContinue}
                    >
                        <LinearGradient
                            colors={[brand.white, brand.white]}
                            style={styles.buttonGradient}
                        >
                            <Text style={styles.buttonText}>
                                {plans.find(p => p.id === selectedPlan)?.price === 0
                                    ? 'Start Free'
                                    : 'Continue'}
                            </Text>
                            <Ionicons name="arrow-forward" size={20} color={brand.primary} />
                        </LinearGradient>
                    </Pressable>
                </Animated.View>
            </ScrollView>
        </LinearGradient>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    scrollContent: {
        paddingTop: 48,
        paddingHorizontal: 20,
        paddingBottom: 28,
    },
    backButton: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: 'rgba(255, 255, 255, 0.2)',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 14,
    },
    header: {
        alignItems: 'center',
        marginBottom: 18,
    },
    title: {
        fontSize: 26,
        fontFamily: 'Poppins_800ExtraBold',
        color: brand.white,
        marginBottom: 4,
        textAlign: 'center',
    },
    subtitle: {
        fontSize: 13,
        fontFamily: 'Poppins_400Regular',
        color: 'rgba(255, 255, 255, 0.85)',
    },
    plansContainer: {
        gap: 10,
        marginBottom: 14,
    },
    planCard: {
        backgroundColor: brand.white,
        borderRadius: 16,
        padding: 14,
        borderWidth: 2,
        borderColor: 'transparent',
        position: 'relative',
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
        borderColor: '#FFD700',
    },
    popularBadge: {
        position: 'absolute',
        top: -10,
        right: 14,
        backgroundColor: '#FFD700',
        paddingHorizontal: 10,
        paddingVertical: 3,
        borderRadius: 10,
    },
    popularText: {
        fontSize: 10,
        fontFamily: 'Poppins_700Bold',
        color: brand.primary,
        letterSpacing: 0.5,
    },
    planHeader: {
        alignItems: 'center',
        marginBottom: 8,
    },
    planName: {
        fontSize: 17,
        fontFamily: 'Poppins_700Bold',
        color: brand.primary,
        marginBottom: 2,
    },
    planNameSelected: {
        color: brand.primary,
    },
    priceContainer: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        marginBottom: 2,
    },
    priceSymbol: {
        fontSize: 18,
        fontFamily: 'Poppins_700Bold',
        color: neutral.gray700,
        marginTop: 4,
    },
    priceAmount: {
        fontSize: 34,
        fontFamily: 'Poppins_800ExtraBold',
        color: neutral.gray700,
        lineHeight: 40,
    },
    freeText: {
        fontSize: 28,
        fontFamily: 'Poppins_800ExtraBold',
        color: neutral.gray700,
    },
    priceSelected: {
        color: brand.primary,
    },
    pricePeriod: {
        fontSize: 13,
        fontFamily: 'Poppins_400Regular',
        color: neutral.gray600,
    },
    pricePeriodSelected: {
        color: brand.primary,
    },
    swipesContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: neutral.gray50,
        paddingVertical: 5,
        paddingHorizontal: 12,
        borderRadius: 16,
        alignSelf: 'center',
        marginBottom: 10,
    },
    swipesText: {
        fontSize: 12,
        fontFamily: 'Poppins_600SemiBold',
        color: neutral.gray600,
        marginLeft: 6,
    },
    swipesTextSelected: {
        color: brand.primary,
    },
    divider: {
        height: 1,
        backgroundColor: neutral.gray200,
        marginBottom: 10,
    },
    featuresContainer: {
        gap: 6,
    },
    featureRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    featureText: {
        fontSize: 12,
        fontFamily: 'Poppins_400Regular',
        color: neutral.gray700,
        flex: 1,
    },
    featureTextSelected: {
        color: brand.primary,
        fontFamily: 'Poppins_500Medium',
    },
    selectedIndicator: {
        position: 'absolute',
        top: 14,
        right: 14,
    },
    continueButton: {
        height: 50,
        borderRadius: 999,
        overflow: 'hidden',
    },
    buttonGradient: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 8,
        elevation: 4,
    },
    buttonText: {
        color: brand.primary,
        fontSize: 17,
        fontFamily: 'Poppins_700Bold',
    },
});
