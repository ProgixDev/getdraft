/**
 * Color palette for the GetDraft app
 * Organized by semantic meaning and theme support
 */

// Brand Colors - GetDraft Official Palette
export const brand = {
    // Black - Primary brand color
    primary: '#121212',
    primaryLight: '#1E1E1E',
    primaryDark: '#000000',
    // White - Secondary brand color
    white: '#FFFFFF',
    whiteLight: '#FAFAFA',
    whiteDark: '#F5F5F5',
    // Accent colors (for future use)
    accent: '#121212',
    accentLight: '#2A2A2A',
    accentDark: '#000000',
    // Supporting colors
    secondary: '#1E1E1E',
    secondaryLight: '#2A2A2A',
    secondaryDark: '#0A0A0A',
} as const;

// Semantic Colors
export const semantic = {
    success: '#00B894',
    successLight: '#55EFC4',
    successDark: '#00896D',
    warning: '#FDCB6E',
    warningLight: '#FFEAA7',
    warningDark: '#E5A84B',
    error: '#E74C3C',
    errorLight: '#FF7675',
    errorDark: '#C0392B',
    info: '#74B9FF',
    infoLight: '#A8D8FF',
    infoDark: '#0984E3',
} as const;

// Neutral Colors
export const neutral = {
    white: '#FFFFFF',
    black: '#000000',
    gray50: '#F8FAFC',
    gray100: '#F1F5F9',
    gray200: '#E2E8F0',
    gray300: '#CBD5E1',
    gray400: '#94A3B8',
    gray500: '#64748B',
    gray600: '#475569',
    gray700: '#334155',
    gray800: '#1E293B',
    gray900: '#0F172A',
} as const;

// Theme Colors
export const lightTheme = {
    text: '#11181C',
    textSecondary: '#687076',
    textMuted: '#9BA1A6',
    background: '#FFFFFF',
    backgroundSecondary: '#F8FAFC',
    surface: '#FFFFFF',
    surfaceSecondary: '#F1F5F9',
    border: '#E2E8F0',
    borderLight: '#F1F5F9',
    tint: brand.primary,
    icon: '#687076',
    tabIconDefault: '#687076',
    tabIconSelected: brand.primary,
    overlay: 'rgba(0, 0, 0, 0.5)',
} as const;

export const darkTheme = {
    text: '#ECEDEE',
    textSecondary: '#9BA1A6',
    textMuted: '#687076',
    background: '#151718',
    backgroundSecondary: '#1E1F20',
    surface: '#1E1F20',
    surfaceSecondary: '#2A2B2C',
    border: '#2A2B2C',
    borderLight: '#3A3B3C',
    tint: '#FFFFFF',
    icon: '#9BA1A6',
    tabIconDefault: '#9BA1A6',
    tabIconSelected: '#FFFFFF',
    overlay: 'rgba(0, 0, 0, 0.7)',
} as const;

// Legacy Colors export (for backwards compatibility with existing theme.ts)
export const Colors = {
    light: lightTheme,
    dark: darkTheme,
} as const;

// ─── Active UI Theme (dark-dominant, matches GetDraft logo) ────────
// Every screen should reference `theme` for UI colors.
// `brand`, `semantic`, and `neutral` remain available as raw palettes.
export const theme = {
    // Backgrounds
    bg: '#0A0A0A',
    bgSecondary: '#111111',
    surface: '#1A1A1A',
    surfaceSecondary: '#222222',
    surfaceElevated: '#252525',
    // Text
    text: '#FFFFFF',
    textSecondary: '#A0A0A0',
    textMuted: '#666666',
    // Borders
    border: '#2A2A2A',
    borderLight: '#333333',
    // Inputs
    inputBg: '#1A1A1A',
    inputBorder: '#333333',
    inputText: '#FFFFFF',
    inputPlaceholder: '#666666',
    // Header & tab bar
    headerBg: '#111111',
    tabBarBg: '#0A0A0A',
    tabBarBorder: '#1A1A1A',
    // Interactive
    accent: '#FFFFFF',
    accentText: '#000000',
    // Cards
    cardBg: '#1A1A1A',
    cardBorder: '#2A2A2A',
    // Pressed / hover
    pressed: 'rgba(255,255,255,0.06)',
    // Overlay
    overlay: 'rgba(0, 0, 0, 0.7)',
    // Badge
    badgeBg: '#2A2A2A',
    badgeText: '#A0A0A0',
} as const;

// Export all color groups
export default {
    brand,
    semantic,
    neutral,
    theme,
    light: lightTheme,
    dark: darkTheme,
};
