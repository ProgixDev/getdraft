import { Dimensions, useWindowDimensions } from "react-native";

/**
 * Screen sizes.
 *
 * The app used to render inside a 500pt phone column on tablets, centred with
 * black gutters, so an iPad showed "the phone screens". App Review rejected
 * exactly that (guideline 4, iPad Air, 2026-10-23: "not optimized to support
 * all screen sizes"), and the iPad cannot be dropped instead: 1.0.2 shipped
 * with iPad support, and an update may not support fewer devices.
 *
 * So screens now fill the window. Three widths:
 *   - getContentWidth(): the real window width. Use it for anything that must
 *     match the screen: paging carousels, full-bleed slides, grids.
 *   - PHONE_MAX_WIDTH: a cap for things that should stay phone-sized and sit
 *     centred on a tablet: bottom sheets, modals.
 *   - getDecorWidth(): the width capped at PHONE_MAX_WIDTH, for decorative
 *     sizes derived from the width (splash logo, globe), which would balloon
 *     on a tablet.
 * READABLE_MAX_WIDTH caps columns of text and media (the Feed) so lines and
 * photos keep a comfortable size on a tablet.
 *
 * Phones are below every cap, so nothing changes on a phone.
 */
export const PHONE_MAX_WIDTH = 500;
export const READABLE_MAX_WIDTH = 640;
export const TABLET_BREAKPOINT = 600;

/**
 * Spread into a vertical ScrollView / FlatList contentContainerStyle, or a
 * row of content: a centred column of readable width on a tablet, with the
 * screen's background and header still edge to edge. A no-op on a phone,
 * which is narrower than READABLE_MAX_WIDTH.
 */
export const readableColumn = {
  width: "100%",
  maxWidth: READABLE_MAX_WIDTH,
  alignSelf: "center",
} as const;

/** The real window width (see above). Read at module scope by many files. */
export function getContentWidth(): number {
  return Dimensions.get("window").width;
}

/** The window width, capped at phone size, for decorative sizing. */
export function getDecorWidth(): number {
  return Math.min(Dimensions.get("window").width, PHONE_MAX_WIDTH);
}

export function useResponsive() {
  const { width, height } = useWindowDimensions();
  const isTablet = width >= TABLET_BREAKPOINT;
  return {
    windowWidth: width,
    windowHeight: height,
    isTablet,
    contentWidth: width,
    readableWidth: Math.min(width, READABLE_MAX_WIDTH),
  };
}
