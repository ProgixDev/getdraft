/**
 * Config barrel file
 * Re-exports all configuration modules for easy imports
 * 
 * Usage:
 * import { colors, fonts, assets } from '@/config';
 * import { brand, semantic, lightTheme } from '@/config/colors';
 */

// Colors
export * from './colors';
export { default as colors } from './colors';

// Fonts
export * from './fonts';
export { default as fonts } from './fonts';

// Assets
export * from './assets';
export { default as assets } from './assets';
