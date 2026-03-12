import React, { useEffect } from 'react';
import { View, StyleSheet, Dimensions } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  withSequence,
  Easing,
  runOnJS,
} from 'react-native-reanimated';
import { theme } from '@/config/colors';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const LOGO_SIZE = SCREEN_WIDTH * 0.45;

interface LogoAnimationProps {
  onComplete: () => void;
  active: boolean;
}

export function LogoAnimation({ onComplete, active }: LogoAnimationProps) {
  const logoOpacity = useSharedValue(0);
  const logoScale = useSharedValue(0.7);
  const glowOpacity = useSharedValue(0);
  const containerOpacity = useSharedValue(1);

  useEffect(() => {
    if (!active) return;

    // Logo entrance: fade in + scale up
    logoOpacity.value = withDelay(
      200,
      withTiming(1, {
        duration: 800,
        easing: Easing.bezier(0.25, 0.1, 0.25, 1),
      })
    );

    logoScale.value = withDelay(
      200,
      withSequence(
        // Scale to 1
        withTiming(1, {
          duration: 800,
          easing: Easing.bezier(0.25, 0.1, 0.25, 1),
        }),
        // Subtle pulse
        withTiming(1.04, { duration: 400, easing: Easing.inOut(Easing.ease) }),
        withTiming(1, { duration: 400, easing: Easing.inOut(Easing.ease) }),
      )
    );

    // Glow halo
    glowOpacity.value = withDelay(
      300,
      withTiming(0.35, { duration: 700, easing: Easing.out(Easing.ease) })
    );

    // Exit: fade out after hold
    const exitTimer = setTimeout(() => {
      containerOpacity.value = withTiming(0, { duration: 500 }, () => {
        runOnJS(onComplete)();
      });
    }, 2000);

    return () => clearTimeout(exitTimer);
  }, [active]);

  const logoStyle = useAnimatedStyle(() => ({
    opacity: logoOpacity.value,
    transform: [{ scale: logoScale.value }],
  }));

  const glowStyle = useAnimatedStyle(() => ({
    opacity: glowOpacity.value,
  }));

  const containerStyle = useAnimatedStyle(() => ({
    opacity: containerOpacity.value,
  }));

  return (
    <Animated.View style={[styles.container, containerStyle]}>
      {/* Glow halo */}
      <Animated.View style={[styles.glow, glowStyle]} />

      {/* Logo */}
      <Animated.Image
        source={require('@/assets/logo_white.png')}
        style={[styles.logo, logoStyle]}
        resizeMode="contain"
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: theme.bg,
  },
  glow: {
    position: 'absolute',
    width: LOGO_SIZE * 2.5,
    height: LOGO_SIZE * 2.5,
    borderRadius: LOGO_SIZE * 1.25,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
  },
  logo: {
    width: LOGO_SIZE,
    height: LOGO_SIZE,
    tintColor: '#FFFFFF',
  },
});
