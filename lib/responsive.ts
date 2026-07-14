import { useWindowDimensions } from "react-native";

/**
 * The app is phone-first. On tablets (and large foldables) we don't stretch
 * the phone layout edge-to-edge — that looks broken. Instead we cap the content
 * to a phone-like column and centre it, so a tablet renders "the same as the
 * mobile phone screens" (client requirement) with neutral gutters on the sides.
 *
 * Phones stay untouched: their width is below PHONE_MAX_WIDTH, so the cap is a
 * no-op and everything renders exactly as before.
 */
export const PHONE_MAX_WIDTH = 500;
export const TABLET_BREAKPOINT = 600;

export function useResponsive() {
  const { width, height } = useWindowDimensions();
  const isTablet = width >= TABLET_BREAKPOINT;
  // The width components should actually lay out against — never wider than a
  // phone column. Use this instead of Dimensions.get('window').width for any
  // sizing that must stay phone-sized on tablets (cards, decks, sheets).
  const contentWidth = Math.min(width, PHONE_MAX_WIDTH);
  return { windowWidth: width, windowHeight: height, isTablet, contentWidth };
}
