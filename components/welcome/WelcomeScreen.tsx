import React, { useCallback, useRef, useState } from 'react';
import {
    View,
    StyleSheet,
    Dimensions,
    Image,
    Pressable,
    Text,
} from 'react-native';
import Animated, {
    useSharedValue,
    useAnimatedScrollHandler,
    useAnimatedStyle,
    withSpring,
    interpolate,
    Extrapolation,
    runOnJS,
    SharedValue,
} from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
import {
    useFonts,
    Poppins_400Regular,
    Poppins_700Bold,
    Poppins_800ExtraBold,
} from '@expo-google-fonts/poppins';
import { images } from '@/config/assets';
import { brand, neutral } from '@/config/colors';
import { welcomeSlides } from '@/constants/welcomeData';
import { PaginationDots } from './PaginationDots';
import { GrainyGradient } from './GrainyGradient';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

interface WelcomeScreenProps {
    /** Callback when user completes onboarding */
    onComplete: () => void;
}

/**
 * Welcome/Onboarding screen with clean layout
 * Features:
 * - Animated SVG Background Orb (Breathing)
 * - Typography logo centered at top
 * - Skip button at top right (not on last slide)
 * - Title and subtitle on left
 * - Player images filling bottom right
 * - Vertical pagination dots
 */
export const WelcomeScreen: React.FC<WelcomeScreenProps> = ({ onComplete }) => {
    const [fontsLoaded] = useFonts({
        Poppins_400Regular,
        Poppins_700Bold,
        Poppins_800ExtraBold,
    });

    const scrollX = useSharedValue(0);
    const scrollRef = useRef<Animated.ScrollView>(null);
    const [currentIndex, setCurrentIndex] = useState(0);

    const scrollHandler = useAnimatedScrollHandler({
        onScroll: (event) => {
            scrollX.value = event.contentOffset.x;
        },
        onMomentumEnd: (event) => {
            const index = Math.round(event.contentOffset.x / SCREEN_WIDTH);
            runOnJS(setCurrentIndex)(index);
        },
    });

    const handleSkip = useCallback(() => {
        onComplete();
    }, [onComplete]);

    const handleComplete = useCallback(() => {
        onComplete();
    }, [onComplete]);

    // Button Animation
    const buttonScale = useSharedValue(1);
    const handlePressIn = () => {
        buttonScale.value = withSpring(0.95);
    };
    const handlePressOut = () => {
        buttonScale.value = withSpring(1);
    };
    const animatedButtonStyle = useAnimatedStyle(() => {
        return {
            transform: [{ scale: buttonScale.value }],
        };
    });

    if (!fontsLoaded) {
        return null;
    }

    const isLastSlide = currentIndex === welcomeSlides.length - 1;

    return (
        <View style={styles.container}>
            {/* Background: clean grainy gradient (dark) */}
            <GrainyGradient />

            {/* Header: Logo center + Skip top right */}
            <View style={styles.header}>
                <View style={styles.headerSpacer} />
                <Image
                    source={images.logoWhite}
                    style={styles.logo}
                    resizeMode="contain"
                />
                {!isLastSlide ? (
                    <Pressable onPress={handleSkip} style={styles.skipButton}>
                        <Text style={styles.skipButtonText}>Skip</Text>
                    </Pressable>
                ) : (
                    <View style={styles.headerSpacer} />
                )}
            </View>

            {/* Scrollable content */}
            <Animated.ScrollView
                ref={scrollRef}
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                onScroll={scrollHandler}
                scrollEventThrottle={16}
                decelerationRate="fast"
                style={styles.scrollView}
            >
                {welcomeSlides.map((slide, index) => (
                    <SlideContent
                        key={slide.id}
                        slide={slide}
                        index={index}
                        scrollX={scrollX}
                    />
                ))}
            </Animated.ScrollView>

            {/* Bottom section: Dots + Button (only on last slide) */}
            <View style={styles.bottomContainer}>
                <View style={styles.dotsContainer}>
                    <PaginationDots
                        count={welcomeSlides.length}
                        scrollX={scrollX}
                        vertical
                    />
                </View>

                {isLastSlide && (
                    <Pressable
                        onPress={handleComplete}
                        onPressIn={handlePressIn}
                        onPressOut={handlePressOut}
                    >
                        <Animated.View style={[styles.primaryButton, animatedButtonStyle]}>
                            <Text style={styles.primaryButtonText}>Get Started</Text>
                        </Animated.View>
                    </Pressable>
                )}
            </View>
        </View>
    );
};

// Individual slide content component
interface SlideContentProps {
    slide: (typeof welcomeSlides)[0];
    index: number;
    scrollX: SharedValue<number>;
}

const SlideContent: React.FC<SlideContentProps> = ({ slide, index, scrollX }) => {
    const inputRange = [
        (index - 1) * SCREEN_WIDTH,
        index * SCREEN_WIDTH,
        (index + 1) * SCREEN_WIDTH,
    ];

    const animatedTextStyle = useAnimatedStyle(() => {
        const opacity = interpolate(
            scrollX.value,
            inputRange,
            [0, 1, 0],
            Extrapolation.CLAMP
        );

        const translateX = interpolate(
            scrollX.value,
            inputRange,
            [-30, 0, 30],
            Extrapolation.CLAMP
        );

        return {
            opacity,
            transform: [{ translateX }],
        };
    });

    const animatedImageStyle = useAnimatedStyle(() => {
        const opacity = interpolate(
            scrollX.value,
            inputRange,
            [0, 1, 0],
            Extrapolation.CLAMP
        );

        const scale = interpolate(
            scrollX.value,
            inputRange,
            [0.85, 1, 0.85],
            Extrapolation.CLAMP
        );

        const translateX = interpolate(
            scrollX.value,
            inputRange,
            [50, 0, -50],
            Extrapolation.CLAMP
        );

        return {
            opacity,
            transform: [{ scale }, { translateX }],
        };
    });

    return (
        <View style={slideStyles.container}>
            <Animated.View style={[slideStyles.textContainer, animatedTextStyle]}>
                <Text style={slideStyles.title}>{slide.title}</Text>
                <Text style={slideStyles.subtitle}>{slide.subtitle}</Text>
            </Animated.View>

            {/* Decorative Background Shapes */}
            <View style={slideStyles.decorativeContainer}>
                {/* Blurred background areas */}
                <BlurView intensity={15} style={[slideStyles.blurCircle, slideStyles.blurLarge]}>
                    <View style={[slideStyles.decorativeCircle, slideStyles.circleLarge]} />
                </BlurView>
                
                <BlurView intensity={20} style={[slideStyles.blurCircle, slideStyles.blurMedium]}>
                    <View style={[slideStyles.decorativeCircle, slideStyles.circleMedium]} />
                </BlurView>
                
                <BlurView intensity={10} style={[slideStyles.blurCircle, slideStyles.blurSmall]}>
                    <View style={[slideStyles.decorativeCircle, slideStyles.circleSmall]} />
                </BlurView>
                
                {/* Accent shapes without blur */}
                <View style={[slideStyles.decorativeCircle, slideStyles.circleAccent1]} />
                <View style={[slideStyles.decorativeCircle, slideStyles.circleAccent2]} />
            </View>

            <Animated.View
                style={[
                    slideStyles.imageContainer,
                    // Special adjustment for first slide - 10% bigger
                    index === 0 && { 
                        bottom: -SCREEN_HEIGHT * 0.15, 
                        right: -SCREEN_WIDTH * 0.25,
                        width: SCREEN_WIDTH * 1.21,
                        height: SCREEN_HEIGHT * 0.77,
                    },
                    // Special adjustment for third slide - 10% bigger
                    index === 2 && { 
                        width: SCREEN_WIDTH * 1.21,
                        height: SCREEN_HEIGHT * 0.77,
                    },
                    animatedImageStyle,
                ]}
            >
                <Image
                    source={slide.image}
                    style={slideStyles.image}
                    resizeMode="contain"
                />
            </Animated.View>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#0a0a0a', // Fallback under the GrainyGradient
    },
    header: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingTop: 60,
        paddingHorizontal: 20,
        paddingBottom: 16,
        zIndex: 10,
    },
    headerSpacer: {
        width: 60,
    },
    logo: {
        width: 160,
        height: 36,
    },
    skipButton: {
        paddingVertical: 8,
        paddingHorizontal: 16,
    },
    skipButtonText: {
        color: 'rgba(255,255,255,0.6)',
        fontSize: 16,
        fontFamily: 'Poppins_400Regular',
    },
    scrollView: {
        flex: 1,
    },
    bottomContainer: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        flexDirection: 'row',
        alignItems: 'flex-end',
        justifyContent: 'space-between',
        paddingHorizontal: 24,
        paddingBottom: 50,
        paddingTop: 20,
        zIndex: 10,
    },
    dotsContainer: {
        paddingLeft: 8,
    },
    primaryButton: {
        backgroundColor: brand.primary,
        paddingVertical: 18,
        paddingHorizontal: 48,
        borderRadius: 999,
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: brand.primary,
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.3,
        shadowRadius: 12,
        elevation: 6,
    },
    primaryButtonText: {
        color: brand.white,
        fontSize: 17,
        fontFamily: 'Poppins_700Bold',
        letterSpacing: 0.5,
    },
});

const slideStyles = StyleSheet.create({
    container: {
        width: SCREEN_WIDTH,
        height: SCREEN_HEIGHT,
        position: 'relative',
    },
    textContainer: {
        position: 'absolute',
        top: 140,
        left: 24,
        right: 24,
        zIndex: 2,
    },
    title: {
        fontSize: 42,
        fontFamily: 'Poppins_800ExtraBold',
        color: '#FFFFFF',
        lineHeight: 48,
        marginBottom: 12,
    },
    subtitle: {
        fontSize: 16,
        fontFamily: 'Poppins_400Regular',
        color: 'rgba(255,255,255,0.7)',
        lineHeight: 24,
    },
    decorativeContainer: {
        position: 'absolute',
        width: '100%',
        height: '100%',
        zIndex: 0,
    },
    decorativeCircle: {
        width: '100%',
        height: '100%',
        borderRadius: 999,
        backgroundColor: brand.primary,
    },
    blurCircle: {
        position: 'absolute',
        borderRadius: 999,
        overflow: 'hidden',
    },
    blurLarge: {
        width: SCREEN_WIDTH * 0.8,
        height: SCREEN_WIDTH * 0.8,
        bottom: SCREEN_HEIGHT * 0.25,
        right: -SCREEN_WIDTH * 0.3,
    },
    blurMedium: {
        width: SCREEN_WIDTH * 0.5,
        height: SCREEN_WIDTH * 0.5,
        bottom: SCREEN_HEIGHT * 0.15,
        left: -SCREEN_WIDTH * 0.15,
    },
    blurSmall: {
        width: SCREEN_WIDTH * 0.35,
        height: SCREEN_WIDTH * 0.35,
        bottom: SCREEN_HEIGHT * 0.48,
        right: SCREEN_WIDTH * 0.1,
    },
    circleLarge: {
        opacity: 0.08,
    },
    circleMedium: {
        opacity: 0.1,
    },
    circleSmall: {
        opacity: 0.12,
    },
    circleAccent1: {
        position: 'absolute',
        width: SCREEN_WIDTH * 0.25,
        height: SCREEN_WIDTH * 0.25,
        bottom: SCREEN_HEIGHT * 0.38,
        left: SCREEN_WIDTH * 0.15,
        opacity: 0.02,
    },
    circleAccent2: {
        position: 'absolute',
        width: SCREEN_WIDTH * 0.2,
        height: SCREEN_WIDTH * 0.2,
        bottom: SCREEN_HEIGHT * 0.1,
        right: SCREEN_WIDTH * 0.25,
        opacity: 0.03,
    },
    imageContainer: {
        position: 'absolute',
        right: -SCREEN_WIDTH * 0.15,
        bottom: -SCREEN_HEIGHT * 0.05,
        width: SCREEN_WIDTH * 1.1,
        height: SCREEN_HEIGHT * 0.7,
        zIndex: 1,
    },
    image: {
        width: '100%',
        height: '100%',
    },
});

export default WelcomeScreen;
