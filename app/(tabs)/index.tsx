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
import { useFocusEffect, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useSelector } from "react-redux";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  FadeIn,
  FadeOut,
  SlideInDown,
  SlideOutDown,
  useReducedMotion,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { BlurView } from "expo-blur";
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
import { MatchCelebration } from "@/components/match/MatchCelebration";
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
import { useRoleHomeRedirect } from "@/lib/roleRoutes";
import {
  rankingsService,
  starsForRank,
  DIVISION_LABEL,
  type RankingRow,
} from "@/services/rankings";
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
  draftLocked,
  onDraftBlocked,
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
  draftLocked?: boolean;
  onDraftBlocked?: () => void;
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

  const {
    gesture,
    cardAnimStyle,
    blurOverlayStyle,
    draftOverlayStyle,
    passOverlayStyle,
  } = useCarouselGesture({
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
    draftLocked,
    onDraftBlocked,
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
          // cardAnimStyle now drives zIndex/elevation off the LIVE visual
          // distance (single-threshold flip at half-slot) — the card crossing
          // toward centre takes the top BEFORE commit, no post-commit pop.
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
          {/* Blur overlay — always mounted; opacity is driven by the live
              visual distance (centre = 0, neighbour = 1), so emphasis tracks
              the swipe smoothly with no commit-time snap. */}
          <Animated.View
            pointerEvents="none"
            style={[StyleSheet.absoluteFill, blurOverlayStyle]}
          >
            <BlurView
              intensity={60}
              tint="dark"
              style={StyleSheet.absoluteFill}
            />
          </Animated.View>
        </View>
      </Animated.View>
    </GestureDetector>
  );
}

const DiscoverCard = React.memo(DiscoverCardImpl);

// ------------------------------------------------------------------
// DiscoverBackground — full-page sport-themed backdrop.
//
// Renders the centred card's sport gradient + bundled blurred hero, edge to
// edge (StyleSheet.absoluteFill behind everything). Sync with the cards is
// instant: the parent passes `key={topCard?.sport}`, so when the eager
// horizontal commit advances `currentIndex` the React reconciliation
// remounts this with the new theme on the SAME tick the centre card flips.
// No animated crossfade (that was the prior crash + desync source).
// ------------------------------------------------------------------
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

function DiscoverBackgroundImpl({
  sport,
  sportTheme,
}: {
  sport?: string;
  sportTheme: SportTheme;
}) {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <BackdropLayer sport={sport} sportTheme={sportTheme} />
      {/* Readable dark scrim so header / search / card text stay legible
          over the bundled hero image. */}
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
  const isAdmin = user?.role === "admin";
  // Focus-based redirect: parents → /(tabs)/home, admins →
  // /(tabs)/dashboard. Athletes + coaches + recruiters stay.
  const redirecting = useRoleHomeRedirect([
    "athlete",
    "coach",
    "recruiter",
  ]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const [swipeLock, setSwipeLock] = useState(false);
  const [cardAreaHeight, setCardAreaHeight] = useState(0);
  const [pendingAction, setPendingAction] = useState<SwipeTrigger>(null);
  const [matchOverlay, setMatchOverlay] = useState<{
    visible: boolean;
    name: string;
    matchId: string | null;
    avatar: string | null;
    cardType?: "athlete" | "recruiter";
  }>({
    visible: false,
    name: "",
    matchId: null,
    avatar: null,
  });
  const [apiCards, setApiCards] = useState<any[] | null>(null);
  const [swipesRemaining, setSwipesRemaining] = useState<number | null>(null);
  // Cursor-paging state. nextCursor=null after the last page; isFetchingMore
  // gates concurrent loads (another deck-near-end fire while one is in flight
  // would duplicate-fetch and waste an API round-trip). Both reset on every
  // preference/filter change in the effect below.
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const isFetchingMoreRef = useRef(false);
  const [lastSwipe, setLastSwipe] = useState<LastSwipe>(null);
  const [snackbar, setSnackbar] = useState<SnackbarState>({
    visible: false,
    message: "",
    canUndo: false,
  });
  // Athlete's own ranking row, surfaced as a chip in the header. Recruiters and
  // coaches share this screen but the backend returns null for them, so the
  // chip auto-hides — no role gate needed here.
  const [myRank, setMyRank] = useState<RankingRow | null>(null);
  const reducedMotion = useReducedMotion();
  const carouselTranslateX = useSharedValue(0);
  const focusedIndexSV = useSharedValue(0);
  const bounceY = useSharedValue(0);

  // Preload every bundled sport image once on mount so swiping never waits on
  // Metro to serve an asset on first view (dev). After this, each card + its
  // background is warm in cache and swaps in the same frame the card commits.
  useEffect(() => {
    Asset.loadAsync(SPORT_IMAGES).catch(() => {});
  }, []);

  // Pull the caller's own ranking row whenever this screen comes into focus.
  // Service has a graceful try/catch → null fallback, so a failure or non-
  // athlete role just hides the chip without disturbing the swipe deck.
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      rankingsService.getMyRank().then((row) => {
        if (!cancelled) setMyRank(row);
      });
      return () => {
        cancelled = true;
      };
    }, []),
  );

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
        city: preferences.city || undefined,
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
        setNextCursor(res.hasMore ? (res.nextCursor ?? null) : null);
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
        setNextCursor(null);
      });
  }, [isParent, preferences]);

  // Fetch the next page. De-duped by id so a row that appears on two pages
  // (the boundary row is `<= cursor` on one side, never the other — but if
  // a new signup lands AT exactly the cursor we still guard). Concurrent
  // calls are suppressed via isFetchingMoreRef so a fast burst of "near end"
  // ticks doesn't double-fetch.
  const loadMore = useCallback(() => {
    if (isFetchingMoreRef.current) return;
    if (!nextCursor) return;
    isFetchingMoreRef.current = true;
    discoverService
      .getFeed({
        sport: preferences.sport !== "all" ? preferences.sport : undefined,
        distanceKm: preferences.distanceKm ?? undefined,
        includeInternational: preferences.includeInternational,
        country: preferences.country || undefined,
        city: preferences.city || undefined,
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
        cursor: nextCursor,
      })
      .then((res) => {
        setApiCards((prev) => {
          const base = prev ?? [];
          const seen = new Set(base.map((c: any) => c.id));
          const fresh = (res.cards || []).filter((c: any) => !seen.has(c.id));
          return [...base, ...fresh];
        });
        setSwipesRemaining(res.swipesRemaining);
        setNextCursor(res.hasMore ? (res.nextCursor ?? null) : null);
        const urls = (res.cards || [])
          .map((c: any) => c.imageUrl || c.photos?.[0])
          .filter((u: any) => typeof u === "string");
        if (urls.length) ExpoImage.prefetch(urls);
      })
      .catch(() => {
        // Swallow — we keep the cards we already have; the empty-state copy
        // covers the "you've seen everyone" terminal case.
      })
      .finally(() => {
        isFetchingMoreRef.current = false;
      });
  }, [nextCursor, preferences]);

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
    // Hard reset of the carousel UI-thread state — no settle spring should
    // survive a search/preference change.
    focusedIndexSV.value = 0;
    carouselTranslateX.value = 0;
  }, [isRecruiter, preferences, searchQuery, focusedIndexSV, carouselTranslateX]);

  useEffect(() => {
    setPendingAction(null);
  }, [currentIndex]);

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

  // Ref that mirrors currentIndex so event handlers can read it WITHOUT going
  // through a setCurrentIndex updater — updaters run during React render and
  // Reanimated 4 (correctly) warns when a SharedValue is written during render.
  // The ref is updated in a useEffect below.
  const currentIndexRef = useRef(0);

  const handleSwipeLeft = useCallback(() => {
    setSwipeLock(true);
    const cur = currentIndexRef.current;
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
    // SharedValue writes outside any React updater — render-safe. Worklet
    // still sees the new focused index in the same UI tick because these
    // writes are immediate on the UI thread, and the setCurrentIndex below
    // is just for React's render bookkeeping.
    focusedIndexSV.value = next;
    carouselTranslateX.value = 0;
    setCurrentIndex(next);
    // Short button-mash debounce — bridges the gap between the trigger effect
    // resetting pendingAction and the React commit advancing currentIndex.
    setTimeout(() => setSwipeLock(false), 80);
  }, [discoverItems, focusedIndexSV, carouselTranslateX]);

  const handleSwipeRight = useCallback(() => {
    setSwipeLock(true);
    const cur = currentIndexRef.current;
    const current = discoverItems[cur];
    const name =
      (current as RecruiterCard)?.name ??
      (current as AthleteProfile)?.name ??
      "";
    const targetId = current?.id;
    // Best-effort avatar for the celebration: recruiter cards carry `imageUrl`,
    // athlete cards carry `photos[0]`. Only real (string URL) media is passed —
    // bundled require()'d fallbacks (numbers) resolve to initials instead.
    const cardType = (current as any)?.cardType as
      | "athlete"
      | "recruiter"
      | undefined;
    const rawAvatar =
      cardType === "athlete"
        ? (current as AthleteProfile)?.photos?.[0]
        : (current as RecruiterCard)?.imageUrl;
    const avatar = typeof rawAvatar === "string" ? rawAvatar : null;
    setLastSwipe({ index: cur, action: "draft", name });

    if (targetId) {
      discoverService
        .swipe(targetId, "draft")
        .then((res) => {
          setSwipesRemaining(res.swipesRemaining);
          if (res.matched) {
            setMatchOverlay({
              visible: true,
              name,
              matchId: res.matchId,
              avatar,
              cardType,
            });
            successNotify();
          } else {
            setSnackbar({
              visible: true,
              message: name ? `Drafted ${name}` : "Drafted",
              canUndo: true,
            });
          }
        })
        .catch((err: any) => {
          const status = err?.response?.status;
          // Monthly Draft quota exhausted (backend rejects the Draft). Don't
          // fake a "Drafted" — surface the out-of-Drafts lock + upgrade CTA.
          if (status === 429 || status === 403) {
            setSwipesRemaining(0);
            setSnackbar({
              visible: true,
              message: "Out of Drafts this month — upgrade for unlimited",
              canUndo: false,
            });
            return;
          }
          // Honest copy on transient network error — no fake "Game On!"
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
    setCurrentIndex(next);
    setTimeout(() => setSwipeLock(false), 80);
  }, [discoverItems, focusedIndexSV, carouselTranslateX]);

  const handleMatchDismiss = useCallback(() => {
    setMatchOverlay({ visible: false, name: "", matchId: null, avatar: null });
  }, []);

  const handleSendMessage = useCallback(() => {
    // Chat is only reachable after a match — open the match thread directly.
    // The chat route's [threadId] param IS the matchId.
    const id = matchOverlay.matchId;
    setMatchOverlay({ visible: false, name: "", matchId: null, avatar: null });
    if (id) {
      router.push({ pathname: "/chat/[threadId]", params: { threadId: id } });
    } else {
      // Defensive: a match with no id (shouldn't happen) still lands somewhere useful.
      router.push("/(tabs)/matches");
    }
  }, [router, matchOverlay.matchId]);

  const triggerPass = useCallback(() => {
    if (swipeLock || pendingAction) return;
    setPendingAction("pass");
  }, [swipeLock, pendingAction]);

  const triggerDraft = useCallback(() => {
    if (swipeLock || pendingAction) return;
    setPendingAction("draft");
  }, [swipeLock, pendingAction]);

  // Out of monthly Drafts: a Draft is blocked (card snaps back) but passing
  // stays free. Surface the upgrade nudge without locking the deck.
  const handleDraftBlocked = useCallback(() => {
    setSnackbar({
      visible: true,
      message: "Out of Drafts this month — upgrade for unlimited",
      canUndo: false,
    });
  }, []);

  const handleTriggerHandled = useCallback(() => {
    setPendingAction(null);
  }, []);

  // goNext/goPrev are now JS-state-only.
  //   - Gesture commit path: the worklet already advanced focusedIndexSV and
  //     started a fast settle spring on carouselTranslateX. These callbacks
  //     just bring React's currentIndex up to date — they MUST NOT reset
  //     carouselTranslateX or they would cancel the in-flight spring.
  //   - A11y/button path: setCurrentIndex change triggers the sync useEffect
  //     below, which mirrors focusedIndexSV. No drag is in progress on this
  //     path so carouselTranslateX is already at 0.
  const goNext = useCallback(() => {
    setCurrentIndex((cur) =>
      Math.min(cur + 1, Math.max(0, discoverItems.length - 1)),
    );
  }, [discoverItems.length]);

  const goPrev = useCallback(() => {
    setCurrentIndex((cur) => Math.max(cur - 1, 0));
  }, []);

  // Sync focusedIndexSV + currentIndexRef with currentIndex on any path.
  // Crucially, do NOT reset carouselTranslateX here — a gesture-driven commit
  // has a settle spring on it that this would cancel mid-flight.
  useEffect(() => {
    focusedIndexSV.value = currentIndex;
    currentIndexRef.current = currentIndex;
  }, [currentIndex, focusedIndexSV]);

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
    setMatchOverlay({ visible: false, name: "", matchId: null, avatar: null });
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

  // Incremental load — fire when there are <= 4 cards left after the focused
  // index AND the backend signalled another page exists. loadMore() guards
  // against concurrent invocations so a rapid swipe burst won't double-fetch.
  useEffect(() => {
    if (!apiCards) return;
    if (!nextCursor) return;
    const remainingAhead = apiCards.length - currentIndex;
    if (remainingAhead <= 4) {
      loadMore();
    }
  }, [currentIndex, apiCards, nextCursor, loadMore]);

  const hasMoreCards = currentIndex < discoverItems.length;
  const remaining = discoverItems.length - currentIndex;
  const canGoNext = currentIndex < discoverItems.length - 1;
  const canGoPrev = currentIndex > 0;
  // Backdrop is keyed by the centred card's sport. The eager-commit gesture
  // path advances currentIndex AT threshold-cross, so the new topCard /
  // sportTheme / DiscoverBackground key all flip on the SAME React commit
  // the front card flips — instant swap, no animated crossfade machinery.
  const topCard = hasMoreCards ? discoverItems[currentIndex] : null;
  const sportTheme = useMemo(
    () => getSportTheme(topCard?.sport),
    [topCard?.sport],
  );
  const outOfSwipes =
    typeof swipesRemaining === "number" && swipesRemaining <= 0;
  const topCardName = (topCard as any)?.name ?? "this profile";

  // Rules-of-Hooks: every hook (useState/useEffect/useMemo/useCallback/useRef/
  // useSharedValue) must run unconditionally on every render. Keep these two
  // early returns BELOW all hooks so the call order is stable when fontsLoaded
  // flips from false to true or the parent role check redirects.
  if (!fontsLoaded) return null;
  if (redirecting) return null;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Full-page sport backdrop — sits underneath the padded content area
          via StyleSheet.absoluteFill, so it reaches edge-to-edge (status bar
          through tab bar). `key` forces a clean unmount/remount on each
          sport change so the swap is instant with no leftover state. */}
      <DiscoverBackground
        key={topCard?.sport ?? "none"}
        sport={topCard?.sport}
        sportTheme={sportTheme}
      />
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>Hello, {displayName} 👋</Text>
          <Text style={styles.title}>{discoverTitle}</Text>
        </View>
        <View style={styles.headerActions}>
          {isRecruiter && (
            <Pressable
              style={({ pressed }) => [
                styles.topProspectsChip,
                pressed && styles.pressed,
              ]}
              onPress={() => router.push("/rankings")}
              accessibilityRole="button"
              accessibilityLabel="Open top prospects rankings"
            >
              <Ionicons name="trophy" size={14} color={semantic.warning} />
              <Text style={styles.topProspectsText}>Top Prospects</Text>
            </Pressable>
          )}
          {myRank &&
            (myRank.division === "CA" || myRank.division === "US") && (
              <Pressable
                style={({ pressed }) => [
                  styles.rankChip,
                  pressed && styles.pressed,
                ]}
                onPress={() => router.push("/rankings")}
                accessibilityRole="button"
                accessibilityLabel={`Your rank: number ${myRank.division_rank} in ${DIVISION_LABEL[myRank.division]} ${myRank.sport}. Open rankings.`}
              >
                <Text style={styles.rankChipHash}>
                  #{myRank.division_rank}
                </Text>
                <Text style={styles.rankChipMeta} numberOfLines={1}>
                  {DIVISION_LABEL[myRank.division]} · {myRank.sport}
                </Text>
                <View style={styles.rankChipStars}>
                  {(() => {
                    const filled = starsForRank(
                      myRank.division_rank,
                      myRank.cohort_size,
                    );
                    return [1, 2, 3, 4, 5].map((i) => (
                      <Ionicons
                        key={i}
                        name={i <= filled ? "star" : "star-outline"}
                        size={10}
                        color={i <= filled ? semantic.warning : theme.textMuted}
                      />
                    ));
                  })()}
                </View>
              </Pressable>
            )}
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
          {hasMoreCards ? (
            <View
              style={[
                styles.deck,
                { width: cardWidth, height: cardHeight },
              ]}
            >
              {visibleCards.map(({ item, absoluteIndex }) => {
                const isFocused = absoluteIndex === currentIndex;
                // Gesture stays live when out of Drafts so PASS still works;
                // the Draft (up) is intercepted per-card via draftLocked.
                const cardCanGesture = isFocused && !swipeLock;
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
                    draftLocked={outOfSwipes}
                    onDraftBlocked={handleDraftBlocked}
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
                    draftLocked={outOfSwipes}
                    onDraftBlocked={handleDraftBlocked}
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
            <>
              <Pressable
                style={({ pressed }) => [
                  styles.lockedCta,
                  pressed && styles.pressed,
                ]}
                onPress={goToSubscription}
                accessibilityRole="button"
                accessibilityLabel="Out of Drafts this month. Upgrade for unlimited Drafts."
              >
                <Ionicons name="lock-closed" size={18} color={brand.white} />
                <Text style={styles.lockedCtaText}>
                  Out of Drafts this month — Upgrade for unlimited
                </Text>
              </Pressable>
              {/* Passing stays free even when Drafts are used up. */}
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
              </View>
            </>
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

      <MatchCelebration
        visible={matchOverlay.visible}
        matchId={matchOverlay.matchId}
        otherName={matchOverlay.name}
        otherAvatar={matchOverlay.avatar}
        otherCardType={matchOverlay.cardType}
        myName={user?.name}
        myRole={user?.role}
        onMessage={handleSendMessage}
        onDismiss={handleMatchDismiss}
      />
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
  rankChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    maxWidth: 200,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 18,
    backgroundColor: "rgba(0,0,0,0.45)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
  },
  rankChipHash: {
    fontSize: 12,
    fontFamily: "Poppins_800ExtraBold",
    color: semantic.warning,
    letterSpacing: 0.2,
  },
  rankChipMeta: {
    flexShrink: 1,
    fontSize: 11,
    fontFamily: "Poppins_500Medium",
    color: "rgba(255,255,255,0.85)",
  },
  rankChipStars: {
    flexDirection: "row",
    gap: 1,
  },
  topProspectsChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 18,
    backgroundColor: "rgba(0,0,0,0.45)",
    borderWidth: 1,
    borderColor: "rgba(253,203,110,0.45)",
  },
  topProspectsText: {
    fontSize: 12,
    fontFamily: "Poppins_700Bold",
    color: brand.white,
    letterSpacing: 0.2,
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
});
