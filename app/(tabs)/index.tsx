import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  View,
  StyleSheet,
  Text,
  Pressable,
  TextInput,
  Image,
  ScrollView,
  useWindowDimensions,
  Alert,
  BackHandler,
  ActivityIndicator,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useSelector } from "react-redux";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  runOnJS,
  FadeIn,
  FadeOut,
  SlideInDown,
  SlideOutDown,
  useReducedMotion,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { Image as ExpoImage } from "expo-image";
import {
  useFonts,
  Poppins_400Regular,
  Poppins_500Medium,
  Poppins_600SemiBold,
  Poppins_700Bold,
  Poppins_800ExtraBold,
} from "@expo-google-fonts/poppins";
import { brand, neutral, semantic, theme } from "@/config/colors";
import type {
  RecruiterCard,
  AthleteProfile,
} from "@/constants/discoverData";
import { AthleteCard } from "@/components/discover/AthleteCard";
import { RootState } from "@/store";
import { discoverService } from "@/services/discover";
import {
  getSportTheme,
  SportTheme,
  SPORT_IMAGES,
} from "@/constants/sportThemes";
import { Asset } from "expo-asset";
import {
  useCarouselGesture,
  type SwipeTrigger,
} from "@/hooks/useCarouselGesture";
import type { SharedValue } from "react-native-reanimated";
import { Easing, withRepeat } from "react-native-reanimated";

type LastSwipe = { index: number; action: "draft" | "pass"; name: string } | null;
type SnackbarState = { visible: boolean; message: string; canUndo: boolean };

const successNotify = () => {
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
    () => {},
  );
};

// ------------------------------------------------------------------
// DiscoverCard — shown to athletes swiping on recruiters
// Memoized: changing currentIndex shouldn't re-render every visible card.
// ------------------------------------------------------------------
function DiscoverCardImpl({
  recruiter,
  absoluteIndex,
  isFocused,
  canGesture,
  cardWidth,
  cardHeight,
  slotWidth,
  screenHeight,
  focusedIndexSV,
  carouselTranslateX,
  onSwipeLeft,
  onSwipeRight,
  goNext,
  goPrev,
  canGoNext,
  canGoPrev,
  trigger,
  onTriggerHandled,
}: {
  recruiter: RecruiterCard;
  absoluteIndex: number;
  isFocused: boolean;
  canGesture: boolean;
  cardWidth: number;
  cardHeight: number;
  slotWidth: number;
  screenHeight: number;
  focusedIndexSV: SharedValue<number>;
  carouselTranslateX: SharedValue<number>;
  onSwipeLeft: () => void;
  onSwipeRight: () => void;
  goNext: () => void;
  goPrev: () => void;
  canGoNext: boolean;
  canGoPrev: boolean;
  trigger: SwipeTrigger;
  onTriggerHandled: () => void;
}) {
  const reducedMotion = useReducedMotion();
  const sportAccent = getSportTheme(recruiter.sport).accent;
  const roleLabel = recruiter.role === "agent" ? "Agent" : "Coach";
  const accessibilityLabel = `${recruiter.name}, ${roleLabel}, ${recruiter.sport}, ${recruiter.location}`;

  const { gesture, cardAnimStyle, draftOverlayStyle, passOverlayStyle } =
    useCarouselGesture({
      absoluteIndex,
      isFocused,
      canGesture,
      cardHeight,
      slotWidth,
      screenHeight,
      focusedIndexSV,
      carouselTranslateX,
      onSwipeLeft,
      onSwipeRight,
      goNext,
      goPrev,
      canGoNext,
      canGoPrev,
      reducedMotion: !!reducedMotion,
      trigger,
      onTriggerHandled,
    });

  return (
    <GestureDetector gesture={gesture}>
      <Animated.View
        accessible={isFocused}
        accessibilityLabel={accessibilityLabel}
        accessibilityActions={[
          { name: "activate", label: `Draft ${recruiter.name}` },
          { name: "magicTap", label: `Pass on ${recruiter.name}` },
          { name: "increment", label: "Next profile" },
          { name: "decrement", label: "Previous profile" },
        ]}
        onAccessibilityAction={(e) => {
          switch (e.nativeEvent.actionName) {
            case "activate":
              onSwipeRight();
              break;
            case "magicTap":
              onSwipeLeft();
              break;
            case "increment":
              if (canGoNext) goNext();
              break;
            case "decrement":
              if (canGoPrev) goPrev();
              break;
          }
        }}
        pointerEvents={isFocused ? "auto" : "none"}
        style={[
          styles.card,
          styles.cardAbs,
          { width: cardWidth, height: cardHeight },
          cardAnimStyle,
        ]}
      >
        <View style={styles.cardImage}>
          {recruiter.imageUrl ? (
            <ExpoImage
              source={recruiter.imageUrl}
              placeholder={getSportTheme(recruiter.sport).image}
              placeholderContentFit="cover"
              style={styles.media}
              contentFit="cover"
              cachePolicy="memory-disk"
              transition={0}
              priority="high"
              recyclingKey={String(recruiter.id)}
            />
          ) : (
            <View style={styles.placeholderImage}>
              <Ionicons
                name={recruiter.role === "agent" ? "briefcase" : "school"}
                size={72}
                color={theme.textMuted}
              />
            </View>
          )}

          <View
            style={[styles.cardTag, { borderColor: sportAccent + "55" }]}
          >
            <Ionicons name="diamond" size={12} color={brand.white} />
            <Text style={styles.cardTagText}>Open to Recruiting</Text>
          </View>

          <Animated.View
            style={[styles.overlay, styles.likeOverlay, draftOverlayStyle]}
          >
            <Text style={[styles.overlayText, { color: semantic.success }]}>
              DRAFT
            </Text>
          </Animated.View>
          <Animated.View
            style={[styles.overlay, styles.nopeOverlay, passOverlayStyle]}
          >
            <Text style={[styles.overlayText, { color: semantic.error }]}>
              PASS
            </Text>
          </Animated.View>

          <LinearGradient
            colors={[
              "transparent",
              "rgba(0,0,0,0.55)",
              "rgba(0,0,0,0.92)",
            ]}
            style={styles.cardOverlay}
            locations={[0, 0.55, 1]}
          >
            <View style={styles.overlayLocation}>
              <Ionicons name="location" size={14} color={brand.white} />
              <Text style={styles.overlayLocationText}>
                {recruiter.location}
              </Text>
              <View
                style={[
                  styles.sportPill,
                  { backgroundColor: sportAccent + "33", borderColor: sportAccent },
                ]}
              >
                <Text style={[styles.sportPillText, { color: sportAccent }]}>
                  {recruiter.sport}
                </Text>
              </View>
            </View>
            <View style={styles.overlayNameRow}>
              <Text style={styles.overlayName} numberOfLines={1}>
                {recruiter.name},{" "}
                {recruiter.role === "agent" ? "Agent" : "Coach"}
              </Text>
              {recruiter.verified && (
                <Ionicons
                  name="checkmark-circle"
                  size={20}
                  color={semantic.success}
                />
              )}
            </View>
            <Text style={styles.overlayOrg}>{recruiter.organization}</Text>
            <View style={styles.tagRow}>
              {(recruiter.tags ?? []).slice(0, 3).map((tag) => (
                <View key={tag} style={styles.tag}>
                  <Text style={styles.tagText}>{tag}</Text>
                </View>
              ))}
            </View>
          </LinearGradient>
        </View>
      </Animated.View>
    </GestureDetector>
  );
}

const DiscoverCard = React.memo(DiscoverCardImpl);

// ------------------------------------------------------------------
// Match celebration overlay
// ------------------------------------------------------------------
function MatchOverlay({
  recruiterName,
  onDismiss,
  onMessage,
}: {
  recruiterName: string;
  onDismiss: () => void;
  onMessage: () => void;
}) {
  return (
    <Animated.View
      entering={FadeIn.duration(300)}
      exiting={FadeOut.duration(300)}
      style={styles.matchOverlay}
      accessibilityViewIsModal
    >
      <LinearGradient
        colors={["rgba(0,0,0,0.85)", "rgba(18,18,18,0.97)"]}
        style={styles.matchOverlayInner}
      >
        <Text style={styles.matchEmoji}>🤝</Text>
        <Text style={styles.matchTitle}>Game On!</Text>
        <Text style={styles.matchSubtitle}>
          You and {recruiterName} are ready to connect.
        </Text>
        <Pressable
          style={styles.matchMessageButton}
          onPress={onMessage}
          accessibilityRole="button"
          accessibilityLabel={`Send a message to ${recruiterName}`}
        >
          <Ionicons name="chatbubble-outline" size={18} color={brand.white} />
          <Text style={styles.matchMessageButtonText}>Send a Message</Text>
        </Pressable>
        <Pressable
          style={styles.matchKeepButton}
          onPress={onDismiss}
          accessibilityRole="button"
          accessibilityLabel="Keep scouting"
        >
          <Text style={styles.matchKeepButtonText}>Keep Scouting</Text>
        </Pressable>
      </LinearGradient>
    </Animated.View>
  );
}

// Single backdrop layer — gradient base + bundled blurred hero. Opacity is
// driven by the wrapping Animated.View in DiscoverBackground (so the layer
// can fade in/out during a drag without animating any of its internals).
function BackdropLayer({
  sport,
  sportTheme,
}: {
  sport?: string;
  sportTheme: SportTheme;
}) {
  return (
    <>
      <LinearGradient
        colors={sportTheme.gradient}
        style={StyleSheet.absoluteFill}
        locations={[0, 0.55, 1]}
        start={{ x: 0.2, y: 0 }}
        end={{ x: 0.8, y: 1 }}
      />
      <ExpoImage
        source={sportTheme.image}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        transition={0}
        recyclingKey={sport ?? "default"}
        blurRadius={20}
        priority="high"
        cachePolicy="memory-disk"
        accessible={false}
      />
    </>
  );
}

// ------------------------------------------------------------------
// DiscoverBackground — drag-tracked sport-themed photo backdrop.
//
// Three layers (PREV / NEXT / CURRENT) plus a shared scrim. Each layer
// renders that sport's gradient + bundled blurred hero. Opacities are
// driven by carouselTranslateX on the UI thread, so the crossfade
// follows the finger with zero JS-thread lag:
//
//   tx = carouselTranslateX.value          (− = dragging left/next,
//                                            + = dragging right/prev)
//   right = clamp(max(tx,0) / slot, 0, 1)  (only when prev exists)
//   left  = clamp(max(-tx,0) / slot, 0, 1) (only when next exists)
//   CURRENT.opacity = 1 - right - left
//   PREV.opacity    = right
//   NEXT.opacity    = left
//
// At commit, the parent advances currentIndex and resets tx to 0 in the
// same tick — the slot props reshuffle (what was NEXT becomes CURRENT;
// PREV gets the just-decided card), and the new CURRENT is already at
// opacity 1 with its bundled image painted. No fade, no flicker.
//
// Reduced motion (or before slotWidth is measured) skips the live
// crossfade: only CURRENT is visible, swapping instantly on commit
// (Quick Sync fallback).
// ------------------------------------------------------------------
function DiscoverBackgroundImpl({
  sport,
  sportTheme,
  prevSport,
  prevTheme,
  nextSport,
  nextTheme,
  outgoingSport,
  outgoingTheme,
  bgSwapProgress,
  carouselTranslateX,
  slotWidth,
  reducedMotion,
}: {
  sport?: string;
  sportTheme: SportTheme;
  prevSport?: string;
  prevTheme?: SportTheme;
  nextSport?: string;
  nextTheme?: SportTheme;
  outgoingSport?: string;
  outgoingTheme?: SportTheme;
  bgSwapProgress: SharedValue<number>;
  carouselTranslateX: SharedValue<number>;
  slotWidth: number;
  reducedMotion: boolean;
}) {
  const liveCrossfade = !reducedMotion && slotWidth > 0;
  const hasPrev = !!prevTheme;
  const hasNext = !!nextTheme;
  const hasOutgoing = !!outgoingTheme;

  const currentStyle = useAnimatedStyle(() => {
    if (!liveCrossfade) return { opacity: 1 };
    const tx = carouselTranslateX.value;
    const right = tx > 0 && hasPrev ? Math.min(tx / slotWidth, 1) : 0;
    const left = tx < 0 && hasNext ? Math.min(-tx / slotWidth, 1) : 0;
    return { opacity: 1 - right - left };
  });

  const prevStyle = useAnimatedStyle(() => {
    if (!liveCrossfade || !hasPrev) return { opacity: 0 };
    const tx = carouselTranslateX.value;
    return { opacity: tx > 0 ? Math.min(tx / slotWidth, 1) : 0 };
  });

  const nextStyle = useAnimatedStyle(() => {
    if (!liveCrossfade || !hasNext) return { opacity: 0 };
    const tx = carouselTranslateX.value;
    return { opacity: tx < 0 ? Math.min(-tx / slotWidth, 1) : 0 };
  });

  // Outgoing layer for vertical (draft/pass) commits. Stacked ABOVE the
  // current layer so the OLD sport's image is visible at full opacity at the
  // start of the swap and fades to reveal the NEW sport painted underneath.
  // bgSwapProgress runs 0 → 1 over ~160ms via withTiming on the UI thread,
  // which is in step with the card's fly-off animation (no JS-thread lag).
  const outgoingStyle = useAnimatedStyle(() => ({
    opacity: 1 - bgSwapProgress.value,
  }));

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {hasPrev && (
        <Animated.View style={[StyleSheet.absoluteFill, prevStyle]}>
          <BackdropLayer sport={prevSport} sportTheme={prevTheme!} />
        </Animated.View>
      )}
      {hasNext && (
        <Animated.View style={[StyleSheet.absoluteFill, nextStyle]}>
          <BackdropLayer sport={nextSport} sportTheme={nextTheme!} />
        </Animated.View>
      )}
      <Animated.View style={[StyleSheet.absoluteFill, currentStyle]}>
        <BackdropLayer sport={sport} sportTheme={sportTheme} />
      </Animated.View>
      {hasOutgoing && (
        <Animated.View
          style={[StyleSheet.absoluteFill, outgoingStyle]}
          pointerEvents="none"
        >
          <BackdropLayer sport={outgoingSport} sportTheme={outgoingTheme!} />
        </Animated.View>
      )}
      <LinearGradient
        colors={[
          "rgba(0,0,0,0.55)",
          "rgba(0,0,0,0.35)",
          "rgba(0,0,0,0.75)",
        ]}
        locations={[0, 0.5, 1]}
        style={StyleSheet.absoluteFill}
      />
    </View>
  );
}

// Memoize so unrelated parent state (snackbar, swipesRemaining, match overlay,
// pendingAction) never causes the backdrop to re-render — only sport / theme /
// outgoing changes do. Themes are reference-stable (memoized in the parent).
const DiscoverBackground = React.memo(DiscoverBackgroundImpl);

// ------------------------------------------------------------------
// Snackbar — in-screen undo bar (not a toast library)
// ------------------------------------------------------------------
function Snackbar({
  visible,
  message,
  canUndo,
  onUndo,
  onHide,
  bottomOffset,
  reducedMotion,
}: {
  visible: boolean;
  message: string;
  canUndo: boolean;
  onUndo: () => void;
  onHide: () => void;
  bottomOffset: number;
  reducedMotion: boolean;
}) {
  useEffect(() => {
    if (!visible) return;
    const t = setTimeout(onHide, 4000);
    return () => clearTimeout(t);
  }, [visible, onHide]);

  if (!visible) return null;
  return (
    <Animated.View
      entering={reducedMotion ? FadeIn.duration(150) : SlideInDown.duration(220)}
      exiting={reducedMotion ? FadeOut.duration(150) : SlideOutDown.duration(180)}
      style={[styles.snackbar, { bottom: bottomOffset }]}
      accessibilityLiveRegion="polite"
    >
      <Text style={styles.snackbarText} numberOfLines={1}>
        {message}
      </Text>
      {canUndo && (
        <Pressable
          onPress={onUndo}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Undo last swipe"
        >
          <Text style={styles.snackbarUndo}>UNDO</Text>
        </Pressable>
      )}
    </Animated.View>
  );
}

// ------------------------------------------------------------------
// Main Discover Screen
// ------------------------------------------------------------------
export default function DiscoverScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const user = useSelector((state: RootState) => state.auth.user);
  const preferences = useSelector(
    (state: RootState) => state.discoverPreferences,
  );
  const isRecruiter = user?.role === "recruiter" || user?.role === "coach";
  const isParent = user?.role === "parent";
  const [currentIndex, setCurrentIndex] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const [swipeLock, setSwipeLock] = useState(false);
  const [cardAreaHeight, setCardAreaHeight] = useState(0);
  const [pendingAction, setPendingAction] = useState<SwipeTrigger>(null);
  const [matchOverlay, setMatchOverlay] = useState<{
    visible: boolean;
    name: string;
  }>({
    visible: false,
    name: "",
  });
  const [apiCards, setApiCards] = useState<any[] | null>(null);
  const [swipesRemaining, setSwipesRemaining] = useState<number | null>(null);
  const [lastSwipe, setLastSwipe] = useState<LastSwipe>(null);
  const [snackbar, setSnackbar] = useState<SnackbarState>({
    visible: false,
    message: "",
    canUndo: false,
  });
  const reducedMotion = useReducedMotion();
  const carouselTranslateX = useSharedValue(0);
  const focusedIndexSV = useSharedValue(0);
  const bounceY = useSharedValue(0);
  // Background sport-crossfade for vertical (draft/pass) commits. Default 1
  // = no swap in progress (outgoing layer is invisible). Driven by withTiming
  // on the UI thread, in step with the card's fly-off animation (~160ms).
  const bgSwapProgress = useSharedValue(1);
  const [bgOutgoing, setBgOutgoing] = useState<{
    sport?: string;
    theme: SportTheme;
  } | null>(null);

  const startBgSwap = useCallback(
    (oldSport: string | undefined, oldTheme: SportTheme) => {
      setBgOutgoing({ sport: oldSport, theme: oldTheme });
      bgSwapProgress.value = 0;
      bgSwapProgress.value = withTiming(
        1,
        { duration: 160 },
        (finished) => {
          if (finished) runOnJS(setBgOutgoing)(null);
        },
      );
    },
    [bgSwapProgress],
  );

  // Refs to the currently-focused card's sport + theme, refreshed on every
  // render below. Vertical commit handlers (which are kept callback-identity-
  // stable for React.memo on the cards) read these to capture the "old" sport
  // for the crossfade without needing currentIndex in their deps.
  const topCardSportRef = useRef<string | undefined>(undefined);
  const topCardThemeRef = useRef<SportTheme | undefined>(undefined);

  // Preload every bundled sport image once on mount so swiping never waits on
  // Metro to serve an asset on first view (dev). After this, each card + its
  // background is warm in cache and swaps in the same frame the card commits.
  useEffect(() => {
    Asset.loadAsync(SPORT_IMAGES).catch(() => {});
  }, []);

  const [fontsLoaded] = useFonts({
    Poppins_400Regular,
    Poppins_500Medium,
    Poppins_600SemiBold,
    Poppins_700Bold,
    Poppins_800ExtraBold,
  });

  // Fetch the real discover feed from the backend (no mock fallback).
  useEffect(() => {
    if (isParent) return;
    setApiCards(null); // null = loading
    discoverService
      .getFeed({
        sport: preferences.sport !== "all" ? preferences.sport : undefined,
        distanceKm: preferences.distanceKm ?? undefined,
        includeInternational: preferences.includeInternational,
        country: preferences.country || undefined,
        recruiterType:
          preferences.recruiterType !== "all"
            ? preferences.recruiterType
            : undefined,
        athletePosition:
          preferences.athletePosition !== "all"
            ? preferences.athletePosition
            : undefined,
        athleteLevel:
          preferences.athleteLevel !== "all"
            ? preferences.athleteLevel
            : undefined,
        verifiedRecruitersOnly: preferences.verifiedRecruitersOnly || undefined,
      })
      .then((res) => {
        setApiCards(res.cards);
        setSwipesRemaining(res.swipesRemaining);
        // Prefetch every card's image up front so browsing to neighbor cards is
        // instant (no per-card network wait). Only ~5-9 small images.
        const urls = (res.cards || [])
          .map((c: any) => c.imageUrl || c.photos?.[0])
          .filter((u: any) => typeof u === "string");
        if (urls.length) ExpoImage.prefetch(urls);
      })
      .catch(() => {
        // No mock fallback — show the empty state when the backend is unreachable.
        setApiCards([]);
        setSwipesRemaining(null);
      });
  }, [isParent, preferences]);

  const displayName = user?.name?.split(" ")[0] || "Player";
  // Parents redirect to /matches before render, so this screen only shows for
  // athletes / recruiters. No parent-facing copy needed here anymore.
  const discoverTitle = "Let's Start Scouting";

  // Real backend feed only — no static/mock fallback. Server already filters by
  // role/sport/country/etc.; here we just apply the local search query.
  const discoverItems = useMemo(() => {
    if (!apiCards || apiCards.length === 0) return [] as any[];
    const query = searchQuery.trim().toLowerCase();
    if (query.length === 0) return apiCards;
    return apiCards.filter((card: any) =>
      [card.name, card.sport, card.organization, card.location, card.position]
        .filter(Boolean)
        .some((field: string) => field.toLowerCase().includes(query)),
    );
  }, [apiCards, searchQuery]);

  useEffect(() => {
    setCurrentIndex(0);
    setSwipeLock(false);
    setPendingAction(null);
  }, [isRecruiter, preferences, searchQuery]);

  useEffect(() => {
    setPendingAction(null);
  }, [currentIndex]);

  useEffect(() => {
    if (isParent) {
      router.replace("/(tabs)/matches");
    }
  }, [isParent, router]);

  const handleCardAreaLayout = useCallback((e: any) => {
    const next = Math.round(e?.nativeEvent?.layout?.height ?? 0);
    if (next > 0) setCardAreaHeight(next);
  }, []);

  const cardWidth = useMemo(() => {
    // Narrower than screen so neighbor cards can peek at both edges.
    const maxWidth = 460;
    return Math.min(screenWidth - 80, maxWidth);
  }, [screenWidth]);

  const slotWidth = useMemo(() => {
    // Distance between adjacent card centers. Less than cardWidth so the
    // peeking neighbors visibly overlap the focused card edges.
    return Math.round(cardWidth - 32);
  }, [cardWidth]);

  const cardHeight = useMemo(() => {
    const fallback = Math.round(screenHeight * 0.72);
    const available =
      cardAreaHeight > 0 ? Math.max(0, cardAreaHeight - 8) : fallback;
    return available;
  }, [cardAreaHeight, screenHeight]);

  const circleSize = useMemo(() => {
    // Smaller than the previous design — buttons are the a11y path, not the
    // visual hero. The peeking deck and chevron hints carry the affordance.
    return Math.min(48, Math.max(40, Math.round(screenWidth * 0.12)));
  }, [screenWidth]);

  const messageHeight = useMemo(
    () => Math.round(circleSize * 0.82),
    [circleSize],
  );
  const actionIconSize = useMemo(
    () => Math.round(circleSize * 0.44),
    [circleSize],
  );

  // Refactored to read currentIndex from functional setState so the callback
  // identity stays stable across currentIndex changes — React.memo on the card
  // components can then skip non-focus-flipping rows on every swipe.
  const handleSwipeLeft = useCallback(() => {
    setSwipeLock(true);
    // Kick the bg crossfade BEFORE the index advances so the outgoing layer
    // captures the OLD sport while the current layer's prop swaps to the new.
    const oldSport = topCardSportRef.current;
    const oldTheme = topCardThemeRef.current;
    if (oldSport && oldTheme) startBgSwap(oldSport, oldTheme);
    setCurrentIndex((cur) => {
      const current = discoverItems[cur];
      const name =
        (current as RecruiterCard)?.name ??
        (current as AthleteProfile)?.name ??
        "";
      const targetId = current?.id;
      if (targetId) {
        discoverService.swipe(targetId, "pass").catch(() => {});
      }
      setLastSwipe({ index: cur, action: "pass", name });
      setSnackbar({
        visible: true,
        message: name ? `Passed on ${name}` : "Passed",
        canUndo: true,
      });
      const next = Math.min(cur + 1, discoverItems.length);
      // Update both atomically so the worklet sees the new focused index and
      // a reset translateX in the same UI frame (no 1-frame flicker).
      focusedIndexSV.value = next;
      carouselTranslateX.value = 0;
      return next;
    });
    // Short button-mash debounce — bridges the gap between the trigger effect
    // resetting pendingAction and the React commit advancing currentIndex.
    setTimeout(() => setSwipeLock(false), 80);
  }, [discoverItems, focusedIndexSV, carouselTranslateX, startBgSwap]);

  const handleSwipeRight = useCallback(() => {
    setSwipeLock(true);
    const oldSport = topCardSportRef.current;
    const oldTheme = topCardThemeRef.current;
    if (oldSport && oldTheme) startBgSwap(oldSport, oldTheme);
    setCurrentIndex((cur) => {
      const current = discoverItems[cur];
      const name =
        (current as RecruiterCard)?.name ??
        (current as AthleteProfile)?.name ??
        "";
      const targetId = current?.id;
      setLastSwipe({ index: cur, action: "draft", name });

      if (targetId) {
        discoverService
          .swipe(targetId, "draft")
          .then((res) => {
            setSwipesRemaining(res.swipesRemaining);
            if (res.matched) {
              setMatchOverlay({ visible: true, name });
              successNotify();
            } else {
              setSnackbar({
                visible: true,
                message: name ? `Drafted ${name}` : "Drafted",
                canUndo: true,
              });
            }
          })
          .catch(() => {
            // Honest copy on network error — no fake "Game On!"
            setSnackbar({
              visible: true,
              message: name ? `Drafted ${name}` : "Drafted",
              canUndo: true,
            });
          });
      } else {
        setSnackbar({
          visible: true,
          message: name ? `Drafted ${name}` : "Drafted",
          canUndo: true,
        });
      }

      const next = Math.min(cur + 1, discoverItems.length);
      focusedIndexSV.value = next;
      carouselTranslateX.value = 0;
      return next;
    });
    setTimeout(() => setSwipeLock(false), 80);
  }, [discoverItems, focusedIndexSV, carouselTranslateX, startBgSwap]);

  const handleMatchDismiss = useCallback(() => {
    setMatchOverlay({ visible: false, name: "" });
  }, []);

  const handleSendMessage = useCallback(() => {
    // Dismiss any open match overlay so the screen is clean when user returns
    setMatchOverlay({ visible: false, name: "" });
    router.push("/(tabs)/matches");
  }, [router]);

  const triggerPass = useCallback(() => {
    if (swipeLock || pendingAction) return;
    setPendingAction("pass");
  }, [swipeLock, pendingAction]);

  const triggerDraft = useCallback(() => {
    if (swipeLock || pendingAction) return;
    setPendingAction("draft");
  }, [swipeLock, pendingAction]);

  const handleTriggerHandled = useCallback(() => {
    setPendingAction(null);
  }, []);

  const goNext = useCallback(() => {
    setCurrentIndex((cur) => {
      const next = Math.min(cur + 1, Math.max(0, discoverItems.length - 1));
      focusedIndexSV.value = next;
      carouselTranslateX.value = 0;
      return next;
    });
  }, [discoverItems.length, focusedIndexSV, carouselTranslateX]);

  const goPrev = useCallback(() => {
    setCurrentIndex((cur) => {
      const prev = Math.max(cur - 1, 0);
      focusedIndexSV.value = prev;
      carouselTranslateX.value = 0;
      return prev;
    });
  }, [focusedIndexSV, carouselTranslateX]);

  // Keep focusedIndexSV in sync if currentIndex changes via other paths
  // (initial mount, search/preference reset, undo).
  useEffect(() => {
    focusedIndexSV.value = currentIndex;
    carouselTranslateX.value = 0;
  }, [currentIndex, focusedIndexSV, carouselTranslateX]);

  // Bouncing chevron affordance (Draft up / Pass down).
  useEffect(() => {
    if (reducedMotion) {
      bounceY.value = 0;
      return;
    }
    bounceY.value = withRepeat(
      withTiming(-4, {
        duration: 700,
        easing: Easing.inOut(Easing.ease),
      }),
      -1,
      true,
    );
  }, [reducedMotion, bounceY]);

  const draftBounceStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: bounceY.value }],
  }));
  const passBounceStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: -bounceY.value }],
  }));

  const handleUndo = useCallback(() => {
    if (!lastSwipe) return;
    // TODO: backend unswipe not wired — client-side restore only.
    focusedIndexSV.value = lastSwipe.index;
    carouselTranslateX.value = 0;
    setCurrentIndex(lastSwipe.index);
    setMatchOverlay({ visible: false, name: "" });
    setLastSwipe(null);
    setSnackbar({ visible: false, message: "", canUndo: false });
  }, [lastSwipe, focusedIndexSV, carouselTranslateX]);

  const hideSnackbar = useCallback(() => {
    setSnackbar((s) => ({ ...s, visible: false }));
  }, []);

  const goToSubscription = useCallback(() => {
    router.push("/subscription");
  }, [router]);

  useEffect(() => {
    if (!matchOverlay.visible) return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      handleMatchDismiss();
      return true;
    });
    return () => sub.remove();
  }, [matchOverlay.visible, handleMatchDismiss]);

  // 5-card window around the focused index (±2). Mounting next-next + prev-prev
  // up front means the cards (and their images) are already decoded before the
  // user reaches them — no per-swipe pop-in on the focused card. At edges the
  // window collapses naturally (no prev at start, no next at end).
  // Must live above any early-return so the hook order stays stable.
  const visibleCards = useMemo(() => {
    if (currentIndex >= discoverItems.length) {
      return [] as { item: any; absoluteIndex: number }[];
    }
    const arr: { item: any; absoluteIndex: number }[] = [];
    for (let i = currentIndex - 2; i <= currentIndex + 2; i++) {
      if (i >= 0 && i < discoverItems.length) {
        arr.push({ item: discoverItems[i], absoluteIndex: i });
      }
    }
    return arr;
  }, [discoverItems, currentIndex]);

  // Eagerly warm the upcoming card images each time the focused index moves.
  // The initial feed-load already prefetched everything, but apiCards may be
  // updated/extended later, and re-prefetching what's about to come on screen
  // is cheap and guarantees no per-card decode wait on rapid swipes.
  useEffect(() => {
    if (!apiCards || apiCards.length === 0) return;
    const urls: string[] = [];
    for (let i = currentIndex + 1; i <= currentIndex + 3; i++) {
      if (i >= apiCards.length) break;
      const card = apiCards[i];
      const url = card?.imageUrl || card?.photos?.[0];
      if (typeof url === "string") urls.push(url);
    }
    if (urls.length) ExpoImage.prefetch(urls);
  }, [currentIndex, apiCards]);

  const hasMoreCards = currentIndex < discoverItems.length;
  const remaining = discoverItems.length - currentIndex;
  const canGoNext = currentIndex < discoverItems.length - 1;
  const canGoPrev = currentIndex > 0;
  // Backdrop is keyed by the focused card's sport — so browsing left/right
  // re-themes the full Discover page background, not only decisions.
  // prev/next themes feed the drag-tracked crossfade in DiscoverBackground.
  const topCard = hasMoreCards ? discoverItems[currentIndex] : null;
  const prevCard = currentIndex > 0 ? discoverItems[currentIndex - 1] : null;
  const nextCard =
    hasMoreCards && currentIndex + 1 < discoverItems.length
      ? discoverItems[currentIndex + 1]
      : null;
  // Memoize theme lookups so the references stay stable across re-renders
  // caused by unrelated state (snackbar, swipesRemaining, match overlay).
  // Combined with React.memo on DiscoverBackground, this keeps the backdrop
  // from re-rendering on every parent state tick — which would otherwise
  // re-create useAnimatedStyle worklets and risk a visible flicker.
  const sportTheme = useMemo(
    () => getSportTheme(topCard?.sport),
    [topCard?.sport],
  );
  const prevTheme = useMemo(
    () => (prevCard ? getSportTheme(prevCard.sport) : undefined),
    [prevCard?.sport],
  );
  const nextTheme = useMemo(
    () => (nextCard ? getSportTheme(nextCard.sport) : undefined),
    [nextCard?.sport],
  );
  // Refresh the refs used by the vertical commit handlers to capture the OLD
  // sport at the moment of commit (for the background crossfade).
  topCardSportRef.current = topCard?.sport;
  topCardThemeRef.current = sportTheme;
  const outOfSwipes =
    typeof swipesRemaining === "number" && swipesRemaining <= 0;
  const topCardName = (topCard as any)?.name ?? "this profile";

  // Rules-of-Hooks: every hook (useState/useEffect/useMemo/useCallback/useRef/
  // useSharedValue) must run unconditionally on every render. Keep these two
  // early returns BELOW all hooks so the call order is stable when fontsLoaded
  // flips from false to true or the parent role check redirects.
  if (!fontsLoaded) return null;
  if (isParent) return null;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <DiscoverBackground
        sport={topCard?.sport}
        sportTheme={sportTheme}
        prevSport={prevCard?.sport}
        prevTheme={prevTheme}
        nextSport={nextCard?.sport}
        nextTheme={nextTheme}
        outgoingSport={bgOutgoing?.sport}
        outgoingTheme={bgOutgoing?.theme}
        bgSwapProgress={bgSwapProgress}
        carouselTranslateX={carouselTranslateX}
        slotWidth={slotWidth}
        reducedMotion={reducedMotion}
      />
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>Hello, {displayName} 👋</Text>
          <Text style={styles.title}>{discoverTitle}</Text>
        </View>
        <View style={styles.headerActions}>
          <Pressable
            style={styles.notifyButton}
            onPress={() =>
              Alert.alert("Notifications", "No new notifications.")
            }
          >
            <Ionicons
              name="notifications-outline"
              size={22}
              color={theme.text}
            />
          </Pressable>
        </View>
      </View>

      <View style={styles.searchRow}>
        <View style={styles.searchBar}>
          <Ionicons name="search" size={20} color={theme.textMuted} />
          <TextInput
            style={styles.searchInput}
            placeholder="Find people..."
            placeholderTextColor={theme.inputPlaceholder}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery.length > 0 && (
            <Pressable onPress={() => setSearchQuery("")}>
              <Ionicons name="close-circle" size={18} color={theme.textMuted} />
            </Pressable>
          )}
        </View>
        <Pressable
          style={styles.filterButton}
          onPress={() => router.push("/preferences")}
        >
          <Ionicons name="options-outline" size={22} color={theme.text} />
        </Pressable>
      </View>

      {hasMoreCards && !isRecruiter && (
        <View style={styles.tabs}>
          <View style={styles.cardCounter}>
            <Text style={styles.cardCounterText}>{remaining} left</Text>
          </View>
        </View>
      )}

      <View style={styles.cardsContainer} onLayout={handleCardAreaLayout}>
          <View
            style={[
              styles.sportGlow,
              { backgroundColor: sportTheme.accent + "22" },
            ]}
            pointerEvents="none"
          />
          {hasMoreCards ? (
            <View
              style={[
                styles.deck,
                { width: cardWidth, height: cardHeight },
              ]}
            >
              {visibleCards.map(({ item, absoluteIndex }) => {
                const isFocused = absoluteIndex === currentIndex;
                const cardCanGesture =
                  isFocused && !swipeLock && !outOfSwipes;
                return (item as any).cardType === "athlete" ? (
                  <AthleteCard
                    key={item.id}
                    athlete={item as AthleteProfile}
                    absoluteIndex={absoluteIndex}
                    isFocused={isFocused}
                    isActive={isFocused}
                    cardWidth={cardWidth}
                    cardHeight={cardHeight}
                    slotWidth={slotWidth}
                    screenHeight={screenHeight}
                    focusedIndexSV={focusedIndexSV}
                    carouselTranslateX={carouselTranslateX}
                    onSwipeLeft={handleSwipeLeft}
                    onSwipeRight={handleSwipeRight}
                    goNext={goNext}
                    goPrev={goPrev}
                    canGoNext={canGoNext}
                    canGoPrev={canGoPrev}
                    canGesture={cardCanGesture}
                    trigger={isFocused ? pendingAction : null}
                    onTriggerHandled={handleTriggerHandled}
                  />
                ) : (
                  <DiscoverCard
                    key={item.id}
                    recruiter={item as RecruiterCard}
                    absoluteIndex={absoluteIndex}
                    isFocused={isFocused}
                    canGesture={cardCanGesture}
                    cardWidth={cardWidth}
                    cardHeight={cardHeight}
                    slotWidth={slotWidth}
                    screenHeight={screenHeight}
                    focusedIndexSV={focusedIndexSV}
                    carouselTranslateX={carouselTranslateX}
                    onSwipeLeft={handleSwipeLeft}
                    onSwipeRight={handleSwipeRight}
                    goNext={goNext}
                    goPrev={goPrev}
                    canGoNext={canGoNext}
                    canGoPrev={canGoPrev}
                    trigger={isFocused ? pendingAction : null}
                    onTriggerHandled={handleTriggerHandled}
                  />
                );
              })}
            </View>
          ) : apiCards === null ? (
            <View style={styles.emptyState}>
              <ActivityIndicator size="large" color={sportTheme.accent} />
              <Text style={styles.emptySubtitle}>Loading profiles…</Text>
            </View>
          ) : (
            <View style={styles.emptyState}>
              <Ionicons
                name={sportTheme.icon}
                size={64}
                color={sportTheme.accent}
              />
              <Text style={styles.emptyTitle}>You've seen everyone!</Text>
              <Text style={styles.emptySubtitle}>
                Check back later for new people, or widen your search.
              </Text>
              <Pressable
                style={styles.emptyAdjustButton}
                onPress={() => router.push("/preferences")}
              >
                <Ionicons
                  name="options-outline"
                  size={16}
                  color={theme.accentText}
                />
                <Text style={styles.emptyAdjustButtonText}>
                  Adjust Preferences
                </Text>
              </Pressable>
            </View>
          )}
        </View>

      {hasMoreCards && (
        <View
          style={[styles.actionsWrap, { paddingBottom: insets.bottom + 14 }]}
        >
          <LinearGradient
            colors={["transparent", "rgba(0,0,0,0.6)"]}
            style={styles.actionsScrim}
            pointerEvents="none"
          />
          {outOfSwipes ? (
            <Pressable
              style={({ pressed }) => [
                styles.lockedCta,
                pressed && styles.pressed,
              ]}
              onPress={goToSubscription}
              accessibilityRole="button"
              accessibilityLabel="Out of swipes. Upgrade to keep scouting."
            >
              <Ionicons name="lock-closed" size={18} color={brand.white} />
              <Text style={styles.lockedCtaText}>
                Out of swipes — Upgrade to keep scouting
              </Text>
            </Pressable>
          ) : (
            <>
              <View style={styles.hintRow}>
                <View style={styles.hintSide}>
                  <Animated.View style={draftBounceStyle}>
                    <Ionicons
                      name="chevron-up"
                      size={14}
                      color={semantic.success}
                    />
                  </Animated.View>
                  <Text
                    style={[
                      styles.hintLabel,
                      { color: semantic.success },
                    ]}
                  >
                    Draft
                  </Text>
                </View>
                <View style={styles.hintCenter}>
                  <Ionicons
                    name="chevron-back"
                    size={11}
                    color={theme.textSecondary}
                  />
                  <Text style={styles.hintBrowse}>swipe to browse</Text>
                  <Ionicons
                    name="chevron-forward"
                    size={11}
                    color={theme.textSecondary}
                  />
                </View>
                <View style={styles.hintSide}>
                  <Text
                    style={[styles.hintLabel, { color: semantic.error }]}
                  >
                    Pass
                  </Text>
                  <Animated.View style={passBounceStyle}>
                    <Ionicons
                      name="chevron-down"
                      size={14}
                      color={semantic.error}
                    />
                  </Animated.View>
                </View>
              </View>
              <View style={styles.actions}>
                <Pressable
                  style={({ pressed }) => [
                    styles.circleButton,
                    styles.passButton,
                    {
                      width: circleSize,
                      height: circleSize,
                      borderRadius: circleSize / 2,
                    },
                    pressed && styles.pressed,
                  ]}
                  onPress={triggerPass}
                  accessibilityRole="button"
                  accessibilityLabel={`Pass on ${topCardName}`}
                >
                  <Ionicons
                    name="arrow-down"
                    size={actionIconSize}
                    color={brand.white}
                  />
                </Pressable>
                <Pressable
                  style={({ pressed }) => [
                    styles.messageButton,
                    { height: messageHeight, borderRadius: messageHeight / 2 },
                    pressed && styles.pressed,
                  ]}
                  onPress={handleSendMessage}
                  accessibilityRole="button"
                  accessibilityLabel="Open messages"
                >
                  <Ionicons
                    name="chatbubble-outline"
                    size={20}
                    color={theme.text}
                  />
                  <Text style={styles.messageButtonText}>Messages</Text>
                </Pressable>
                <Pressable
                  style={({ pressed }) => [
                    styles.circleButton,
                    styles.draftButton,
                    {
                      width: circleSize,
                      height: circleSize,
                      borderRadius: circleSize / 2,
                    },
                    pressed && styles.pressed,
                  ]}
                  onPress={triggerDraft}
                  accessibilityRole="button"
                  accessibilityLabel={`Draft ${topCardName}`}
                >
                  <Ionicons
                    name="arrow-up"
                    size={actionIconSize}
                    color={brand.white}
                  />
                </Pressable>
              </View>
            </>
          )}
        </View>
      )}

      <Snackbar
        visible={snackbar.visible}
        message={snackbar.message}
        canUndo={snackbar.canUndo && !!lastSwipe}
        onUndo={handleUndo}
        onHide={hideSnackbar}
        bottomOffset={insets.bottom + 96}
        reducedMotion={reducedMotion}
      />

      {matchOverlay.visible && (
        <MatchOverlay
          recruiterName={matchOverlay.name}
          onDismiss={handleMatchDismiss}
          onMessage={handleSendMessage}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "transparent",
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
    backgroundColor: "transparent",
  },
  greeting: {
    fontSize: 14,
    fontFamily: "Poppins_400Regular",
    color: theme.textSecondary,
  },
  title: {
    fontSize: 24,
    fontFamily: "Poppins_700Bold",
    color: theme.text,
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  notifyButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: "transparent",
  },
  searchBar: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.45)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    borderRadius: 12,
    paddingHorizontal: 14,
    height: 44,
    gap: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    fontFamily: "Poppins_400Regular",
    color: theme.inputText,
  },
  filterButton: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  tabs: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 20,
    paddingBottom: 12,
    backgroundColor: "transparent",
  },
  cardCounter: {
    marginLeft: "auto",
    backgroundColor: "rgba(0,0,0,0.55)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  cardCounterText: {
    fontSize: 12,
    fontFamily: "Poppins_500Medium",
    color: theme.textSecondary,
  },
  parentDiscoverScroll: {
    flex: 1,
  },
  parentDiscoverContent: {
    paddingHorizontal: 16,
    paddingTop: 10,
    gap: 10,
  },
  parentSummaryCard: {
    backgroundColor: brand.primary,
    borderRadius: 14,
    padding: 14,
  },
  parentSummaryTitle: {
    fontSize: 16,
    fontFamily: "Poppins_700Bold",
    color: brand.white,
  },
  parentSummarySubtitle: {
    marginTop: 4,
    fontSize: 12,
    fontFamily: "Poppins_400Regular",
    color: "rgba(255,255,255,0.9)",
  },
  parentSectionTitle: {
    marginTop: 2,
    fontSize: 16,
    fontFamily: "Poppins_600SemiBold",
    color: theme.text,
  },
  parentRecruiterCard: {
    backgroundColor: theme.cardBg,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.cardBorder,
    padding: 14,
    gap: 6,
  },
  parentRecruiterTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  parentRecruiterName: {
    flex: 1,
    fontSize: 14,
    fontFamily: "Poppins_600SemiBold",
    color: theme.text,
  },
  parentRecruiterOrg: {
    fontSize: 13,
    fontFamily: "Poppins_500Medium",
    color: theme.textSecondary,
  },
  parentRecruiterMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  parentRecruiterMetaText: {
    fontSize: 12,
    fontFamily: "Poppins_400Regular",
    color: theme.textSecondary,
  },
  parentRecruiterTagRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 4,
  },
  parentTag: {
    backgroundColor: theme.surfaceSecondary,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  parentTagText: {
    fontSize: 11,
    fontFamily: "Poppins_500Medium",
    color: theme.textSecondary,
  },
  parentEmptyState: {
    marginTop: 8,
    borderRadius: 14,
    backgroundColor: theme.cardBg,
    borderWidth: 1,
    borderColor: theme.cardBorder,
    alignItems: "center",
    paddingVertical: 26,
    paddingHorizontal: 20,
  },
  parentEmptyTitle: {
    marginTop: 10,
    fontSize: 18,
    fontFamily: "Poppins_700Bold",
    color: theme.text,
  },
  parentEmptySubtitle: {
    marginTop: 6,
    fontSize: 13,
    textAlign: "center",
    fontFamily: "Poppins_400Regular",
    color: theme.textSecondary,
    lineHeight: 20,
  },
  parentAdjustButton: {
    marginTop: 12,
    height: 40,
    borderRadius: 20,
    paddingHorizontal: 18,
    backgroundColor: theme.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  parentAdjustButtonText: {
    fontSize: 13,
    fontFamily: "Poppins_600SemiBold",
    color: theme.accentText,
  },
  tab: {
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 20,
  },
  tabActive: {
    backgroundColor: theme.accent,
  },
  tabText: {
    fontSize: 14,
    fontFamily: "Poppins_500Medium",
    color: theme.textSecondary,
  },
  tabTextActive: {
    fontSize: 14,
    fontFamily: "Poppins_600SemiBold",
    color: theme.accentText,
  },
  cardsContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 0,
    paddingVertical: 4,
    overflow: "hidden",
  },
  deck: {
    position: "relative",
  },
  cardAbs: {
    position: "absolute",
    top: 0,
    left: 0,
  },
  sportGlow: {
    position: "absolute",
    top: -120,
    right: -80,
    width: 320,
    height: 320,
    borderRadius: 160,
    opacity: 0.7,
  },
  cardWrapper: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  card: {
    backgroundColor: theme.cardBg,
    borderRadius: 28,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.35,
    shadowRadius: 30,
    elevation: 14,
  },
  cardImage: {
    flex: 1,
    backgroundColor: theme.surface,
  },
  media: {
    ...StyleSheet.absoluteFillObject,
    width: "100%",
    height: "100%",
  },
  placeholderImage: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  cardTag: {
    position: "absolute",
    top: 18,
    left: 18,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(0,0,0,0.55)",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
  },
  cardTagText: {
    fontSize: 12,
    fontFamily: "Poppins_600SemiBold",
    color: brand.white,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 4,
    borderRadius: 28,
  },
  likeOverlay: {
    borderColor: semantic.success,
  },
  nopeOverlay: {
    borderColor: semantic.error,
  },
  overlayText: {
    fontSize: 42,
    fontFamily: "Poppins_800ExtraBold",
    letterSpacing: 4,
  },
  cardOverlay: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    padding: 22,
    paddingTop: 56,
  },
  overlayLocation: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 10,
  },
  overlayLocationText: {
    fontSize: 13,
    fontFamily: "Poppins_500Medium",
    color: "rgba(255,255,255,0.95)",
  },
  sportPill: {
    marginLeft: "auto",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
  },
  sportPillText: {
    fontSize: 11,
    fontFamily: "Poppins_600SemiBold",
    letterSpacing: 0.3,
  },
  overlayNameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  overlayName: {
    flex: 1,
    fontSize: 26,
    fontFamily: "Poppins_800ExtraBold",
    color: brand.white,
    letterSpacing: -0.4,
  },
  overlayOrg: {
    fontSize: 14,
    fontFamily: "Poppins_500Medium",
    color: "rgba(255,255,255,0.85)",
    marginTop: 4,
  },
  tagRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 12,
  },
  tag: {
    backgroundColor: "rgba(255,255,255,0.2)",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  tagText: {
    fontSize: 12,
    fontFamily: "Poppins_500Medium",
    color: brand.white,
  },
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    padding: 40,
  },
  emptyTitle: {
    fontSize: 20,
    fontFamily: "Poppins_700Bold",
    color: theme.text,
    marginTop: 16,
    textAlign: "center",
  },
  emptySubtitle: {
    fontSize: 14,
    fontFamily: "Poppins_400Regular",
    color: theme.textSecondary,
    marginTop: 8,
    textAlign: "center",
    lineHeight: 22,
  },
  emptyAdjustButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 20,
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: theme.accent,
    borderRadius: 24,
  },
  emptyAdjustButtonText: {
    fontSize: 15,
    fontFamily: "Poppins_600SemiBold",
    color: theme.accentText,
  },
  actionsWrap: {
    paddingHorizontal: 20,
    paddingTop: 18,
    backgroundColor: "transparent",
  },
  actionsScrim: {
    ...StyleSheet.absoluteFillObject,
  },
  lockedCta: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 16,
    paddingHorizontal: 18,
    backgroundColor: theme.surfaceElevated,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: theme.border,
  },
  lockedCtaText: {
    fontSize: 14,
    fontFamily: "Poppins_600SemiBold",
    color: brand.white,
  },
  snackbar: {
    position: "absolute",
    left: 16,
    right: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: theme.surfaceElevated,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.border,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 14,
    elevation: 12,
    zIndex: 50,
  },
  snackbarText: {
    flex: 1,
    fontSize: 13,
    fontFamily: "Poppins_500Medium",
    color: theme.text,
  },
  snackbarUndo: {
    fontSize: 12,
    fontFamily: "Poppins_700Bold",
    color: semantic.success,
    letterSpacing: 1,
  },
  hintRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingBottom: 10,
    paddingHorizontal: 4,
  },
  hintSide: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  hintCenter: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    opacity: 0.7,
  },
  hintLabel: {
    fontSize: 11,
    fontFamily: "Poppins_700Bold",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  hintBrowse: {
    fontSize: 10,
    fontFamily: "Poppins_500Medium",
    color: theme.textSecondary,
    letterSpacing: 0.5,
    textTransform: "lowercase",
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingTop: 4,
  },
  circleButton: {
    alignItems: "center",
    justifyContent: "center",
  },
  passButton: {
    backgroundColor: semantic.error,
  },
  messageButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: theme.surface,
    paddingHorizontal: 16,
  },
  messageButtonText: {
    fontSize: 16,
    fontFamily: "Poppins_600SemiBold",
    color: theme.text,
  },
  draftButton: {
    backgroundColor: semantic.success,
  },
  pressed: {
    transform: [{ scale: 0.96 }],
  },
  // Match celebration overlay
  matchOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 100,
  },
  matchOverlayInner: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 40,
  },
  matchEmoji: {
    fontSize: 72,
    marginBottom: 16,
  },
  matchTitle: {
    fontSize: 36,
    fontFamily: "Poppins_800ExtraBold",
    color: brand.white,
    textAlign: "center",
  },
  matchSubtitle: {
    fontSize: 16,
    fontFamily: "Poppins_400Regular",
    color: "rgba(255,255,255,0.85)",
    textAlign: "center",
    marginTop: 12,
    lineHeight: 24,
  },
  matchMessageButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 40,
    paddingHorizontal: 32,
    paddingVertical: 16,
    backgroundColor: brand.white,
    borderRadius: 30,
  },
  matchMessageButtonText: {
    fontSize: 16,
    fontFamily: "Poppins_700Bold",
    color: brand.primary,
  },
  matchKeepButton: {
    marginTop: 16,
    paddingVertical: 12,
    paddingHorizontal: 24,
  },
  matchKeepButtonText: {
    fontSize: 15,
    fontFamily: "Poppins_500Medium",
    color: "rgba(255,255,255,0.7)",
  },
});
