import React, { useEffect, useRef } from "react";
import { View, StyleSheet, Text } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  Easing,
  runOnJS,
} from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import { theme } from "@/config/colors";
import { PLATFORM_STATS } from "@/constants/statsData";
import { AnimatedCounter } from "./AnimatedCounter";

interface StatsCounterProps {
  onComplete: () => void;
  active: boolean;
}

function StatCard({
  value,
  suffix,
  label,
  icon,
  index,
  active,
}: {
  value: number;
  suffix: string;
  label: string;
  icon: string;
  index: number;
  active: boolean;
}) {
  const cardOpacity = useSharedValue(0);
  const cardTranslateY = useSharedValue(30);

  useEffect(() => {
    if (!active) return;
    const stagger = index * 300;

    cardOpacity.value = withDelay(
      stagger,
      withTiming(1, { duration: 500, easing: Easing.out(Easing.ease) }),
    );
    cardTranslateY.value = withDelay(
      stagger,
      withTiming(0, { duration: 500, easing: Easing.out(Easing.cubic) }),
    );
  }, [active]);

  const cardStyle = useAnimatedStyle(() => ({
    opacity: cardOpacity.value,
    transform: [{ translateY: cardTranslateY.value }],
  }));

  // Counter starts after the card has slid in
  const counterDelay = active ? index * 300 + 400 : 0;

  return (
    <Animated.View style={[styles.statCard, cardStyle]}>
      <View style={styles.iconCircle}>
        <Ionicons name={icon as any} size={22} color="#0984E3" />
      </View>
      <View style={styles.statContent}>
        <AnimatedCounter
          targetValue={active ? value : 0}
          suffix={suffix}
          delay={counterDelay}
          duration={1600}
          style={styles.statNumber}
        />
        <Text style={styles.statLabel}>{label}</Text>
      </View>
    </Animated.View>
  );
}

export function StatsCounter({ onComplete, active }: StatsCounterProps) {
  const titleOpacity = useSharedValue(0);
  const containerOpacity = useSharedValue(0);
  const hasStarted = useRef(false);

  useEffect(() => {
    if (!active || hasStarted.current) return;
    hasStarted.current = true;

    // Entrance
    containerOpacity.value = withTiming(1, { duration: 400 });
    titleOpacity.value = withDelay(100, withTiming(1, { duration: 500 }));

    // Exit: all cards shown + counters done + hold
    // 3 cards * 300ms stagger + 400ms slide + 1600ms count + 500ms hold
    const totalDuration = 3 * 300 + 400 + 1600 + 600;

    const exitTimer = setTimeout(() => {
      containerOpacity.value = withTiming(0, { duration: 500 }, () => {
        runOnJS(onComplete)();
      });
    }, totalDuration);

    return () => clearTimeout(exitTimer);
  }, [active]);

  const titleStyle = useAnimatedStyle(() => ({
    opacity: titleOpacity.value,
  }));

  const containerStyle = useAnimatedStyle(() => ({
    opacity: containerOpacity.value,
  }));

  return (
    <Animated.View style={[styles.container, containerStyle]}>
      <Animated.Text style={[styles.title, titleStyle]}>
        GetDraft by the Numbers
      </Animated.Text>

      <View style={styles.statsWrap}>
        {PLATFORM_STATS.map((stat, index) => (
          <StatCard
            key={stat.label}
            value={stat.value}
            suffix={stat.suffix}
            label={stat.label}
            icon={stat.icon}
            index={index}
            active={active}
          />
        ))}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: theme.bg,
    paddingHorizontal: 28,
  },
  title: {
    fontSize: 22,
    fontFamily: "Poppins_800ExtraBold",
    color: "#FFFFFF",
    textAlign: "center",
    marginBottom: 36,
    letterSpacing: 0.3,
  },
  statsWrap: {
    width: "100%",
    gap: 16,
  },
  statCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.06)",
    borderRadius: 16,
    padding: 18,
    gap: 16,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
  },
  iconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "rgba(0, 184, 148, 0.12)",
    justifyContent: "center",
    alignItems: "center",
  },
  statContent: {
    flex: 1,
  },
  statNumber: {
    fontSize: 32,
    fontFamily: "Poppins_800ExtraBold",
    color: "#FFFFFF",
    lineHeight: 38,
  },
  statLabel: {
    fontSize: 14,
    fontFamily: "Poppins_500Medium",
    color: "rgba(255, 255, 255, 0.6)",
    marginTop: 2,
  },
});
