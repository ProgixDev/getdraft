import React from "react";
import { View, StyleSheet, Dimensions } from "react-native";
import Animated, {
  useAnimatedStyle,
  interpolate,
  Extrapolation,
  SharedValue,
} from "react-native-reanimated";
import { brand } from "@/config/colors";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

interface PaginationDotsProps {
  count: number;
  scrollX: SharedValue<number>;
  /** If true, displays vertically */
  vertical?: boolean;
  /** Dot color — defaults to the brand primary (dark). */
  color?: string;
}

/**
 * Animated pagination dots for welcome carousel
 * Supports both horizontal and vertical orientation
 */
export const PaginationDots: React.FC<PaginationDotsProps> = ({
  count,
  scrollX,
  vertical = false,
  color = brand.primary,
}) => {
  return (
    <View style={[styles.container, vertical && styles.containerVertical]}>
      {Array.from({ length: count }).map((_, index) => (
        <AnimatedDot
          key={index}
          index={index}
          scrollX={scrollX}
          vertical={vertical}
          color={color}
        />
      ))}
    </View>
  );
};

interface AnimatedDotProps {
  index: number;
  scrollX: SharedValue<number>;
  vertical: boolean;
  color: string;
}

const AnimatedDot: React.FC<AnimatedDotProps> = ({
  index,
  scrollX,
  vertical,
  color,
}) => {
  const inputRange = [
    (index - 1) * SCREEN_WIDTH,
    index * SCREEN_WIDTH,
    (index + 1) * SCREEN_WIDTH,
  ];

  const animatedStyle = useAnimatedStyle(() => {
    const size = interpolate(
      scrollX.value,
      inputRange,
      [10, 28, 10],
      Extrapolation.CLAMP,
    );

    const opacity = interpolate(
      scrollX.value,
      inputRange,
      [0.3, 1, 0.3],
      Extrapolation.CLAMP,
    );

    return vertical ? { height: size, opacity } : { width: size, opacity };
  });

  return (
    <Animated.View
      style={[
        styles.dot,
        { backgroundColor: color },
        vertical ? styles.dotVertical : styles.dotHorizontal,
        animatedStyle,
      ]}
    />
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  containerVertical: {
    flexDirection: "column",
  },
  dot: {
    borderRadius: 5,
    backgroundColor: brand.primary,
  },
  dotHorizontal: {
    height: 10,
  },
  dotVertical: {
    width: 10,
  },
});

export default PaginationDots;
