import React, { useEffect } from 'react';
import { View, StyleSheet, Dimensions } from 'react-native';
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withTiming,
    withDelay,
    Easing,
    runOnJS,
} from 'react-native-reanimated';
import { brand } from '@/config/colors';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const LOGO_SIZE = SCREEN_WIDTH * 0.45;

interface SplashScreenProps {
    /** Callback when splash animation completes */
    onAnimationComplete?: () => void;
    /** Duration of the fade-in animation in ms */
    fadeInDuration?: number;
    /** Delay before starting the animation in ms */
    animationDelay?: number;
    /** Total duration to show the splash screen in ms */
    displayDuration?: number;
}

/**
 * SplashScreen component with animated logo fade-in
 * Uses the GetDraft brand assets and Reanimated for smooth animations
 */
export const SplashScreen: React.FC<SplashScreenProps> = ({
    onAnimationComplete,
    fadeInDuration = 800,
    animationDelay = 200,
    displayDuration = 2500,
}) => {
    // Shared values for animations
    const logoOpacity = useSharedValue(0);
    const logoScale = useSharedValue(0.9);

    // Animated styles for logo
    const animatedLogoStyle = useAnimatedStyle(() => ({
        opacity: logoOpacity.value,
        transform: [{ scale: logoScale.value }],
    }));

    useEffect(() => {
        // Start fade-in animation with delay
        logoOpacity.value = withDelay(
            animationDelay,
            withTiming(1, {
                duration: fadeInDuration,
                easing: Easing.bezier(0.25, 0.1, 0.25, 1),
            })
        );

        logoScale.value = withDelay(
            animationDelay,
            withTiming(1, {
                duration: fadeInDuration,
                easing: Easing.bezier(0.25, 0.1, 0.25, 1),
            })
        );

        // Trigger completion callback after display duration
        if (onAnimationComplete) {
            const timer = setTimeout(() => {
                runOnJS(onAnimationComplete)();
            }, displayDuration);

            return () => clearTimeout(timer);
        }
    }, [animationDelay, fadeInDuration, displayDuration, onAnimationComplete]);

    return (
        <View style={styles.container}>
            {/* Logo container */}
            <View style={styles.logoContainer}>
                <Animated.Image
                    source={require('@/assets/logo_white.png')}
                    style={[styles.logo, animatedLogoStyle]}
                    resizeMode="contain"
                />
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#121212',
        justifyContent: 'center',
        alignItems: 'center',
    },
    logoContainer: {
        justifyContent: 'center',
        alignItems: 'center',
    },
    logo: {
        width: LOGO_SIZE,
        height: LOGO_SIZE,
        tintColor: brand.white,
    },
});

export default SplashScreen;
