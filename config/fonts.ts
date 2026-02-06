import { Platform } from 'react-native';

/**
 * Font configuration for the MyRoster app
 * Includes font families, sizes, weights, and line heights
 */

// Font Families - Platform specific
export const fontFamilies = Platform.select({
    ios: {
        sans: 'System',
        serif: 'Georgia',
        rounded: 'SF Pro Rounded',
        mono: 'Menlo',
    },
    android: {
        sans: 'Roboto',
        serif: 'serif',
        rounded: 'sans-serif-medium',
        mono: 'monospace',
    },
    web: {
        sans: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
        serif: "Georgia, 'Times New Roman', serif",
        rounded: "'SF Pro Rounded', 'Hiragino Maru Gothic ProN', Meiryo, sans-serif",
        mono: "SFMono-Regular, Menlo, Monaco, Consolas, 'Courier New', monospace",
    },
    default: {
        sans: 'System',
        serif: 'serif',
        rounded: 'System',
        mono: 'monospace',
    },
})!;

// Font Sizes
export const fontSizes = {
    xs: 10,
    sm: 12,
    md: 14,
    base: 16,
    lg: 18,
    xl: 20,
    '2xl': 24,
    '3xl': 30,
    '4xl': 36,
    '5xl': 48,
    '6xl': 60,
} as const;

// Font Weights
export const fontWeights = {
    thin: '100' as const,
    extralight: '200' as const,
    light: '300' as const,
    normal: '400' as const,
    medium: '500' as const,
    semibold: '600' as const,
    bold: '700' as const,
    extrabold: '800' as const,
    black: '900' as const,
};

// Line Heights
export const lineHeights = {
    tight: 1.1,
    snug: 1.25,
    normal: 1.5,
    relaxed: 1.625,
    loose: 2,
} as const;

// Letter Spacing
export const letterSpacing = {
    tighter: -0.8,
    tight: -0.4,
    normal: 0,
    wide: 0.4,
    wider: 0.8,
    widest: 1.6,
} as const;

// Typography Presets - Ready-to-use text styles
export const typography = {
    // Headings
    h1: {
        fontSize: fontSizes['4xl'],
        fontWeight: fontWeights.bold,
        lineHeight: lineHeights.tight,
        letterSpacing: letterSpacing.tight,
    },
    h2: {
        fontSize: fontSizes['3xl'],
        fontWeight: fontWeights.bold,
        lineHeight: lineHeights.tight,
        letterSpacing: letterSpacing.tight,
    },
    h3: {
        fontSize: fontSizes['2xl'],
        fontWeight: fontWeights.semibold,
        lineHeight: lineHeights.snug,
    },
    h4: {
        fontSize: fontSizes.xl,
        fontWeight: fontWeights.semibold,
        lineHeight: lineHeights.snug,
    },
    h5: {
        fontSize: fontSizes.lg,
        fontWeight: fontWeights.medium,
        lineHeight: lineHeights.normal,
    },
    h6: {
        fontSize: fontSizes.base,
        fontWeight: fontWeights.medium,
        lineHeight: lineHeights.normal,
    },

    // Body Text
    bodyLarge: {
        fontSize: fontSizes.lg,
        fontWeight: fontWeights.normal,
        lineHeight: lineHeights.relaxed,
    },
    body: {
        fontSize: fontSizes.base,
        fontWeight: fontWeights.normal,
        lineHeight: lineHeights.normal,
    },
    bodySmall: {
        fontSize: fontSizes.md,
        fontWeight: fontWeights.normal,
        lineHeight: lineHeights.normal,
    },

    // Labels & Captions
    label: {
        fontSize: fontSizes.md,
        fontWeight: fontWeights.medium,
        lineHeight: lineHeights.normal,
    },
    caption: {
        fontSize: fontSizes.sm,
        fontWeight: fontWeights.normal,
        lineHeight: lineHeights.normal,
    },
    overline: {
        fontSize: fontSizes.xs,
        fontWeight: fontWeights.semibold,
        lineHeight: lineHeights.normal,
        letterSpacing: letterSpacing.wider,
        textTransform: 'uppercase' as const,
    },

    // Buttons
    button: {
        fontSize: fontSizes.base,
        fontWeight: fontWeights.semibold,
        lineHeight: lineHeights.normal,
    },
    buttonSmall: {
        fontSize: fontSizes.md,
        fontWeight: fontWeights.semibold,
        lineHeight: lineHeights.normal,
    },
} as const;

// Legacy Fonts export (for backwards compatibility with existing theme.ts)
export const Fonts = fontFamilies;

export default {
    families: fontFamilies,
    sizes: fontSizes,
    weights: fontWeights,
    lineHeights,
    letterSpacing,
    typography,
};
