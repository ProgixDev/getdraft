import React from 'react';
import { StyleSheet, View, ViewStyle, StyleProp } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, {
  Defs,
  Filter,
  FeTurbulence,
  FeColorMatrix,
  Rect,
  RadialGradient,
  Stop,
} from 'react-native-svg';

interface GrainyGradientProps {
  /** Override the gradient colors. Provide 2–4 stops. */
  colors?: readonly [string, string, ...string[]];
  /** Grain intensity, 0–1. Default 0.08 — subtle. */
  grainOpacity?: number;
  /** Brand accent in one corner. Pass null to disable. */
  accentColor?: string | null;
  /** Style override (e.g. absolute positioning if used as background layer). */
  style?: StyleProp<ViewStyle>;
}

/**
 * Static, clean grainy gradient background.
 *
 * Layers (bottom to top):
 *   1. LinearGradient — base color wash (diagonal top-left → bottom-right)
 *   2. SVG radial accent — single soft glow in the bottom-right
 *   3. SVG noise — feTurbulence at low opacity for the grain
 *
 * No animations — the foreground should be the focal point.
 */
export const GrainyGradient: React.FC<GrainyGradientProps> = ({
  colors = ['#0c1322', '#0a0a0a', '#070707', '#100819'] as const,
  grainOpacity = 0.08,
  accentColor = '#1f4d8a',
  style,
}) => {
  return (
    <View style={[StyleSheet.absoluteFill, style]} pointerEvents="none">
      <LinearGradient
        colors={colors as unknown as readonly [string, string, ...string[]]}
        locations={colors.length === 4 ? [0, 0.45, 0.75, 1] : undefined}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      {accentColor && (
        <Svg width="100%" height="100%" style={StyleSheet.absoluteFill}>
          <Defs>
            <RadialGradient
              id="grainy-accent"
              cx="100%"
              cy="100%"
              rx="70%"
              ry="60%"
              fx="100%"
              fy="100%"
              gradientUnits="userSpaceOnUse"
            >
              <Stop offset="0" stopColor={accentColor} stopOpacity="0.45" />
              <Stop offset="1" stopColor={accentColor} stopOpacity="0" />
            </RadialGradient>
          </Defs>
          <Rect width="100%" height="100%" fill="url(#grainy-accent)" />
        </Svg>
      )}

      {grainOpacity > 0 && (
        <View style={[StyleSheet.absoluteFill, { opacity: grainOpacity }]}>
          <Svg width="100%" height="100%">
            <Defs>
              <Filter id="grainy-noise" x="0" y="0" width="100%" height="100%">
                <FeTurbulence
                  type="fractalNoise"
                  baseFrequency="0.9"
                  numOctaves={2}
                  stitchTiles="stitch"
                />
                <FeColorMatrix
                  type="matrix"
                  values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 1 0"
                />
              </Filter>
            </Defs>
            <Rect width="100%" height="100%" filter="url(#grainy-noise)" />
          </Svg>
        </View>
      )}
    </View>
  );
};

export default GrainyGradient;
