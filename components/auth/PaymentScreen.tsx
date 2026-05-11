import React, { useCallback, useEffect, useState } from 'react';
import {
    View,
    StyleSheet,
    Text,
    Pressable,
    ActivityIndicator,
    Alert,
} from 'react-native';
import Animated, { FadeInDown, FadeIn } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useStripe } from '@stripe/stripe-react-native';
import {
    useFonts,
    Poppins_400Regular,
    Poppins_500Medium,
    Poppins_600SemiBold,
    Poppins_700Bold,
    Poppins_800ExtraBold,
} from '@expo-google-fonts/poppins';
import { brand, neutral } from '@/config/colors';
import { subscriptionsService } from '@/services/subscriptions';
import { plans as plansList } from '@/constants/plansData';

interface PaymentScreenProps {
    selectedPlanId: string;
    onPaymentComplete: () => void;
    onBack: () => void;
}

export const PaymentScreen: React.FC<PaymentScreenProps> = ({
    selectedPlanId,
    onPaymentComplete,
    onBack,
}) => {
    const [fontsLoaded] = useFonts({
        Poppins_400Regular,
        Poppins_500Medium,
        Poppins_600SemiBold,
        Poppins_700Bold,
        Poppins_800ExtraBold,
    });

    const { initPaymentSheet, presentPaymentSheet } = useStripe();

    // Plan info comes from the shared constant so prices stay in sync
    // with the Plan-selection screen. Falls back to Basic if unknown.
    const plan = plansList.find((p) => p.id === selectedPlanId) ?? plansList[0];
    const isFree = plan.price === 0;

    const [sheetReady, setSheetReady] = useState(isFree);
    const [isInitializing, setIsInitializing] = useState(false);
    const [isPaying, setIsPaying] = useState(false);
    const [error, setError] = useState<string | null>(null);

    /**
     * Ask the backend for a fresh PaymentSheet bundle and hand it to
     * Stripe's native SDK. We do this lazily on mount (and on retry)
     * so the bundle's client secret is always fresh.
     */
    const initSheet = useCallback(async () => {
        if (isFree) return;
        setIsInitializing(true);
        setError(null);
        try {
            const params = await subscriptionsService.createPaymentSheet(plan.id);
            const { error: initErr } = await initPaymentSheet({
                merchantDisplayName: 'GetDraft',
                customerId: params.customerId,
                customerEphemeralKeySecret: params.ephemeralKeySecret,
                paymentIntentClientSecret: params.paymentIntentClientSecret,
                // Saves the card to the customer for future renewals.
                allowsDelayedPaymentMethods: false,
                returnURL: 'myroster://stripe-redirect',
                appearance: {
                    primaryButton: {
                        colors: { background: brand.primary, text: brand.white },
                    },
                },
            });
            if (initErr) {
                setError(initErr.message || 'Could not prepare checkout.');
                setSheetReady(false);
            } else {
                setSheetReady(true);
            }
        } catch (err: any) {
            const message =
                err?.response?.data?.message ?? err?.message ?? 'Could not start checkout.';
            setError(String(message));
            setSheetReady(false);
        } finally {
            setIsInitializing(false);
        }
    }, [initPaymentSheet, plan.id, isFree]);

    useEffect(() => {
        if (!isFree) initSheet();
    }, [initSheet, isFree]);

    const handlePay = async () => {
        if (isFree) {
            onPaymentComplete();
            return;
        }
        if (!sheetReady || isPaying) return;
        setIsPaying(true);
        setError(null);
        const { error: payErr } = await presentPaymentSheet();
        setIsPaying(false);
        if (payErr) {
            // 'Canceled' is the user dismissing the sheet — not an error.
            if (payErr.code !== 'Canceled') {
                setError(payErr.message || 'Payment failed.');
                Alert.alert('Payment failed', payErr.message || 'Try again.');
            }
            return;
        }
        // Payment succeeded; webhook will flip subscriptions.status to active.
        onPaymentComplete();
    };

    if (!fontsLoaded) return null;

    return (
        <LinearGradient
            colors={[brand.primary, '#0a4d8f', brand.primary]}
            style={styles.container}
        >
            <View style={styles.content}>
                <Pressable onPress={onBack} style={styles.backButton}>
                    <Ionicons name="arrow-back" size={22} color={brand.white} />
                </Pressable>

                <Animated.View entering={FadeIn.duration(500)} style={styles.header}>
                    <View style={styles.iconContainer}>
                        <Ionicons name="card-outline" size={40} color={brand.primary} />
                    </View>
                    <Text style={styles.title}>
                        {isFree ? 'Start your journey' : 'Complete payment'}
                    </Text>
                    <Text style={styles.subtitle}>
                        {isFree ? 'No card needed.' : 'Secure payment via Stripe'}
                    </Text>
                </Animated.View>

                <Animated.View
                    entering={FadeInDown.duration(600).delay(120)}
                    style={styles.card}
                >
                    <View style={styles.planSummary}>
                        <Text style={styles.planName}>{plan.name}</Text>
                        <View style={styles.priceRow}>
                            {isFree ? (
                                <Text style={styles.freeText}>FREE</Text>
                            ) : (
                                <>
                                    <Text style={styles.priceSymbol}>$</Text>
                                    <Text style={styles.priceAmount}>{plan.price}</Text>
                                </>
                            )}
                            <Text style={styles.period}>{plan.period}</Text>
                        </View>
                        <Text style={styles.swipes}>{plan.swipes}</Text>
                    </View>

                    <View style={styles.divider} />

                    <View style={styles.featuresRow}>
                        <Ionicons name="shield-checkmark" size={18} color={brand.primary} />
                        <Text style={styles.featureText}>
                            256-bit SSL encryption · PCI compliant
                        </Text>
                    </View>
                    <View style={styles.featuresRow}>
                        <Ionicons name="lock-closed" size={18} color={brand.primary} />
                        <Text style={styles.featureText}>Native Apple Pay & cards</Text>
                    </View>
                    <View style={styles.featuresRow}>
                        <Ionicons name="refresh" size={18} color={brand.primary} />
                        <Text style={styles.featureText}>Cancel anytime from Settings</Text>
                    </View>

                    {error && <Text style={styles.errorText}>{error}</Text>}

                    <Pressable
                        style={({ pressed }) => [
                            styles.payButton,
                            pressed && { transform: [{ scale: 0.98 }] },
                            (isPaying || isInitializing || (!sheetReady && !isFree)) &&
                                styles.buttonDisabled,
                        ]}
                        onPress={handlePay}
                        disabled={isPaying || isInitializing || (!sheetReady && !isFree)}
                    >
                        <LinearGradient
                            colors={[brand.primary, '#0a4d8f']}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 0 }}
                            style={styles.buttonGradient}
                        >
                            {isPaying || isInitializing ? (
                                <ActivityIndicator color={brand.white} />
                            ) : (
                                <Text style={styles.payButtonText}>
                                    {isFree
                                        ? 'Continue Free'
                                        : `Pay $${plan.price} / month`}
                                </Text>
                            )}
                        </LinearGradient>
                    </Pressable>

                    {error && !isFree && (
                        <Pressable style={styles.retryButton} onPress={initSheet}>
                            <Text style={styles.retryText}>Try again</Text>
                        </Pressable>
                    )}
                </Animated.View>
            </View>
        </LinearGradient>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1 },
    content: {
        flex: 1,
        paddingTop: 48,
        paddingHorizontal: 22,
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
    iconContainer: {
        width: 76,
        height: 76,
        borderRadius: 38,
        backgroundColor: brand.white,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 14,
    },
    title: {
        fontSize: 22,
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
    card: {
        backgroundColor: brand.white,
        borderRadius: 20,
        padding: 18,
    },
    planSummary: {
        alignItems: 'center',
        marginBottom: 14,
    },
    planName: {
        fontSize: 18,
        fontFamily: 'Poppins_700Bold',
        color: brand.primary,
        marginBottom: 2,
    },
    priceRow: {
        flexDirection: 'row',
        alignItems: 'baseline',
    },
    priceSymbol: {
        fontSize: 20,
        fontFamily: 'Poppins_700Bold',
        color: brand.primary,
    },
    priceAmount: {
        fontSize: 38,
        fontFamily: 'Poppins_800ExtraBold',
        color: brand.primary,
        lineHeight: 42,
    },
    freeText: {
        fontSize: 30,
        fontFamily: 'Poppins_800ExtraBold',
        color: brand.primary,
    },
    period: {
        fontSize: 13,
        fontFamily: 'Poppins_400Regular',
        color: neutral.gray600,
        marginLeft: 4,
    },
    swipes: {
        marginTop: 4,
        fontSize: 12,
        fontFamily: 'Poppins_500Medium',
        color: neutral.gray500,
    },
    divider: {
        height: 1,
        backgroundColor: neutral.gray200,
        marginBottom: 12,
    },
    featuresRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        marginBottom: 8,
    },
    featureText: {
        fontSize: 13,
        fontFamily: 'Poppins_500Medium',
        color: neutral.gray700,
    },
    errorText: {
        marginTop: 10,
        fontSize: 12,
        color: '#D14',
        fontFamily: 'Poppins_500Medium',
        textAlign: 'center',
    },
    payButton: {
        height: 50,
        borderRadius: 999,
        overflow: 'hidden',
        marginTop: 14,
    },
    buttonDisabled: { opacity: 0.6 },
    buttonGradient: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    payButtonText: {
        color: brand.white,
        fontSize: 15,
        fontFamily: 'Poppins_700Bold',
    },
    retryButton: {
        marginTop: 10,
        alignItems: 'center',
        paddingVertical: 8,
    },
    retryText: {
        color: brand.primary,
        fontSize: 13,
        fontFamily: 'Poppins_600SemiBold',
    },
});
