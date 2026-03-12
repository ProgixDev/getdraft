import React, { useEffect, useState } from 'react';
import { Text, StyleSheet } from 'react-native';
import {
  useSharedValue,
  withTiming,
  withDelay,
  Easing,
  useAnimatedReaction,
  runOnJS,
} from 'react-native-reanimated';

interface AnimatedCounterProps {
  targetValue: number;
  duration?: number;
  delay?: number;
  suffix?: string;
  prefix?: string;
  style?: any;
}

function formatNumber(n: number): string {
  return n.toLocaleString('en-US');
}

export function AnimatedCounter({
  targetValue,
  duration = 1800,
  delay = 0,
  suffix = '',
  prefix = '',
  style,
}: AnimatedCounterProps) {
  const counter = useSharedValue(0);
  const [display, setDisplay] = useState('0');

  useEffect(() => {
    counter.value = withDelay(
      delay,
      withTiming(targetValue, {
        duration,
        easing: Easing.out(Easing.cubic),
      })
    );
  }, [targetValue, duration, delay]);

  useAnimatedReaction(
    () => Math.floor(counter.value),
    (current, previous) => {
      if (current !== previous) {
        runOnJS(setDisplay)(formatNumber(current));
      }
    }
  );

  return (
    <Text style={[styles.text, style]}>
      {prefix}{display}{suffix}
    </Text>
  );
}

const styles = StyleSheet.create({
  text: {
    fontSize: 36,
    fontFamily: 'Poppins_800ExtraBold',
    color: '#FFFFFF',
  },
});
