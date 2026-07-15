import React, { useEffect, useRef } from "react";
import { StyleSheet, Dimensions } from "react-native";
import Svg, {
  Circle,
  Ellipse,
  Line,
  Defs,
  RadialGradient,
  Stop,
} from "react-native-svg";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  useAnimatedProps,
  withTiming,
  withDelay,
  withRepeat,
  Easing,
  runOnJS,
} from "react-native-reanimated";
import { theme } from "@/config/colors";
import { PHONE_MAX_WIDTH } from "@/lib/responsive";

// Phone-width app frame, not the raw window (tablets are wider than the frame).
const SCREEN_WIDTH = Math.min(Dimensions.get("window").width, PHONE_MAX_WIDTH);
const GLOBE_SIZE = Math.min(SCREEN_WIDTH * 0.7, 320);
const R = GLOBE_SIZE / 2;
const CX = R;
const CY = R;

const AnimatedEllipse = Animated.createAnimatedComponent(Ellipse);
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

// City locations as angles on the globe (longitude-like, latitude-like)
const CITIES = [
  { name: "New York", angle: 0, lat: 0.15 },
  { name: "London", angle: 45, lat: 0.2 },
  { name: "Paris", angle: 55, lat: 0.18 },
  { name: "Lagos", angle: 60, lat: -0.05 },
  { name: "São Paulo", angle: -30, lat: -0.25 },
  { name: "Tokyo", angle: 150, lat: 0.14 },
  { name: "Sydney", angle: 170, lat: -0.3 },
  { name: "Mumbai", angle: 100, lat: 0.05 },
  { name: "Toronto", angle: -10, lat: 0.22 },
  { name: "Dubai", angle: 80, lat: 0.08 },
  { name: "Cape Town", angle: 55, lat: -0.35 },
  { name: "Mexico City", angle: -20, lat: 0.0 },
];

// Connection arcs between cities (indices)
const ARCS = [
  [0, 1],
  [0, 4],
  [1, 5],
  [2, 7],
  [3, 10],
  [8, 1],
  [9, 7],
  [6, 5],
  [11, 4],
];

interface GlobeAnimationProps {
  onComplete: () => void;
  active: boolean;
  preload: boolean;
}

export function GlobeAnimation({ onComplete, active }: GlobeAnimationProps) {
  const containerOpacity = useSharedValue(0);
  const containerScale = useSharedValue(0.85);
  const textOpacity = useSharedValue(0);
  const rotation = useSharedValue(0);
  const dotPulse = useSharedValue(0);
  const hasStarted = useRef(false);

  useEffect(() => {
    if (!active || hasStarted.current) return;
    hasStarted.current = true;

    // Entrance
    containerOpacity.value = withTiming(1, {
      duration: 600,
      easing: Easing.out(Easing.ease),
    });
    containerScale.value = withTiming(1, {
      duration: 700,
      easing: Easing.out(Easing.cubic),
    });

    // Globe rotation
    rotation.value = withRepeat(
      withTiming(360, { duration: 12000, easing: Easing.linear }),
      -1,
      false,
    );

    // Pulsing dots
    dotPulse.value = withRepeat(
      withTiming(1, { duration: 1500, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );

    // Text appears after globe
    textOpacity.value = withDelay(500, withTiming(1, { duration: 500 }));

    // Exit after hold
    const exitTimer = setTimeout(() => {
      containerOpacity.value = withTiming(0, { duration: 500 }, () => {
        runOnJS(onComplete)();
      });
    }, 3500);

    return () => clearTimeout(exitTimer);
  }, [active]);

  const containerStyle = useAnimatedStyle(() => ({
    opacity: containerOpacity.value,
    transform: [{ scale: containerScale.value }],
  }));

  const textStyle = useAnimatedStyle(() => ({
    opacity: textOpacity.value,
  }));

  // Compute city positions on the globe surface based on rotation
  const getCityPos = (angle: number, lat: number, rotDeg: number) => {
    const rad = ((angle + rotDeg) % 360) * (Math.PI / 180);
    const x = CX + R * 0.85 * Math.sin(rad) * Math.cos(lat * Math.PI);
    const y = CY - R * 0.85 * Math.sin(lat * Math.PI);
    const z = Math.cos(rad) * Math.cos(lat * Math.PI);
    return { x, y, visible: z > -0.1 };
  };

  // Static rendering with animated wrapper
  // We use multiple grid lines to give the sphere 3D feel
  const gridLines = [];
  // Longitude lines
  for (let i = 0; i < 8; i++) {
    const angle = i * 45;
    gridLines.push(
      <Ellipse
        key={`lng-${i}`}
        cx={CX}
        cy={CY}
        rx={R * 0.85 * Math.sin((angle * Math.PI) / 180) || 1}
        ry={R * 0.85}
        fill="none"
        stroke="rgba(0, 184, 148, 0.12)"
        strokeWidth={0.8}
      />,
    );
  }
  // Latitude lines
  for (let i = -2; i <= 2; i++) {
    const latY = CY - R * 0.85 * Math.sin(i * 0.3 * Math.PI);
    const latR = R * 0.85 * Math.cos(i * 0.3 * Math.PI);
    gridLines.push(
      <Ellipse
        key={`lat-${i}`}
        cx={CX}
        cy={latY}
        rx={latR}
        ry={latR * 0.3}
        fill="none"
        stroke="rgba(0, 184, 148, 0.1)"
        strokeWidth={0.8}
      />,
    );
  }

  // Static dots at initial positions
  const dots = CITIES.map((city, i) => {
    const pos = getCityPos(city.angle, city.lat, 0);
    if (!pos.visible) return null;
    return (
      <Circle
        key={`dot-${i}`}
        cx={pos.x}
        cy={pos.y}
        r={3}
        fill="#00B894"
        opacity={0.8}
      />
    );
  });

  // Static arcs
  const arcLines = ARCS.map(([from, to], i) => {
    const p1 = getCityPos(CITIES[from].angle, CITIES[from].lat, 0);
    const p2 = getCityPos(CITIES[to].angle, CITIES[to].lat, 0);
    if (!p1.visible || !p2.visible) return null;
    return (
      <Line
        key={`arc-${i}`}
        x1={p1.x}
        y1={p1.y}
        x2={p2.x}
        y2={p2.y}
        stroke="rgba(116, 185, 255, 0.35)"
        strokeWidth={1}
        strokeDasharray="4,4"
      />
    );
  });

  return (
    <Animated.View style={[styles.container, containerStyle]}>
      <Animated.View style={styles.globeWrap}>
        <Svg
          width={GLOBE_SIZE}
          height={GLOBE_SIZE}
          viewBox={`0 0 ${GLOBE_SIZE} ${GLOBE_SIZE}`}
        >
          <Defs>
            <RadialGradient id="globeGrad" cx="40%" cy="35%" rx="50%" ry="50%">
              <Stop offset="0%" stopColor="#1a3a5c" stopOpacity="1" />
              <Stop offset="70%" stopColor="#0d1f33" stopOpacity="1" />
              <Stop offset="100%" stopColor="#060d16" stopOpacity="1" />
            </RadialGradient>
            <RadialGradient id="glowGrad" cx="50%" cy="50%" rx="50%" ry="50%">
              <Stop offset="70%" stopColor="#00B894" stopOpacity="0" />
              <Stop offset="100%" stopColor="#00B894" stopOpacity="0.08" />
            </RadialGradient>
          </Defs>

          {/* Outer glow */}
          <Circle cx={CX} cy={CY} r={R} fill="url(#glowGrad)" />

          {/* Globe body */}
          <Circle cx={CX} cy={CY} r={R * 0.88} fill="url(#globeGrad)" />

          {/* Atmosphere rim */}
          <Circle
            cx={CX}
            cy={CY}
            r={R * 0.88}
            fill="none"
            stroke="rgba(0, 184, 148, 0.2)"
            strokeWidth={2}
          />

          {/* Grid lines */}
          {gridLines}

          {/* Connection arcs */}
          {arcLines}

          {/* City dots */}
          {dots}

          {/* Center highlight */}
          <Circle
            cx={CX - R * 0.25}
            cy={CY - R * 0.25}
            r={R * 0.15}
            fill="rgba(255, 255, 255, 0.03)"
          />
        </Svg>
      </Animated.View>

      <Animated.Text style={[styles.tagline, textStyle]}>
        Connecting Athletes Worldwide
      </Animated.Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: theme.bg,
  },
  globeWrap: {
    width: GLOBE_SIZE,
    height: GLOBE_SIZE,
  },
  tagline: {
    marginTop: 28,
    fontSize: 18,
    fontFamily: "Poppins_700Bold",
    color: "#FFFFFF",
    textAlign: "center",
    letterSpacing: 0.5,
  },
});
