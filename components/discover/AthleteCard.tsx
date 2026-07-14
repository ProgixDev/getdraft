import React, { useState, useEffect } from "react";
import { View, StyleSheet, Text, ActivityIndicator } from "react-native";
import { Image as ExpoImage } from "expo-image";
import { useVideoPlayer, VideoView } from "expo-video";
import { GestureDetector } from "react-native-gesture-handler";
import Animated, { useReducedMotion } from "react-native-reanimated";
import type { SharedValue } from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { BlurView } from "expo-blur";
import { brand, neutral, semantic, theme } from "@/config/colors";
import { AthleteProfile } from "@/constants/discoverData";
import { getSportTheme } from "@/constants/sportThemes";
import {
  useCarouselGesture,
  type SwipeTrigger,
} from "@/hooks/useCarouselGesture";

type MediaPhase = "video" | "image";

interface AthleteCardProps {
  athlete: AthleteProfile;
  absoluteIndex: number;
  isFocused: boolean;
  canGesture: boolean;
  isActive?: boolean;
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
  trigger?: SwipeTrigger;
  onTriggerHandled?: () => void;
  onOpenProfile?: () => void;
}

function AthleteCardImpl({
  athlete,
  absoluteIndex,
  isFocused,
  canGesture,
  isActive,
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
  onOpenProfile,
}: AthleteCardProps) {
  const reducedMotion = useReducedMotion();
  const active = isActive ?? isFocused;
  const sportAccent = getSportTheme(athlete.sport).accent;
  // Feed cards only carry `verified` for KYC-approved athletes — gate the
  // badge on it (same pattern as the recruiter card) instead of stamping
  // every athlete as verified.
  const isVerified =
    (athlete as AthleteProfile & { verified?: boolean }).verified === true;
  const accessibilityLabel = `${athlete.name}, ${athlete.position}, ${athlete.sport}, ${athlete.location}`;

  const hasVideo = athlete.videos.length > 0;
  const hasPhoto = athlete.photos.length > 0;
  const firstVideo = athlete.videos[0];
  const firstPhoto = athlete.photos[0];

  const [phase, setPhase] = useState<MediaPhase>(() =>
    active && hasVideo ? "video" : "image",
  );
  const [videoReady, setVideoReady] = useState(false);

  const videoSource: string | number = hasVideo ? firstVideo : "";

  const player = useVideoPlayer(videoSource, (p) => {
    p.loop = false;
    p.muted = true;
  });

  useEffect(() => {
    setVideoReady(false);
    setPhase(active && hasVideo ? "video" : "image");
    if (active && hasVideo && player) {
      player.play();
    }
  }, [athlete.id, active, hasVideo]);

  useEffect(() => {
    if (!player) return;
    const sub = player.addListener("statusChange", (e) => {
      if (e.status === "readyToPlay") {
        setVideoReady(true);
      }
    });
    const endSub = player.addListener("playToEnd", () => {
      if (hasPhoto) setPhase("image");
    });
    return () => {
      sub.remove();
      endSub.remove();
    };
  }, [player, hasPhoto]);

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
    trigger: trigger ?? null,
    onTriggerHandled,
    onTap: onOpenProfile,
  });

  const renderMedia = () => {
    if (active && phase === "video" && hasVideo && player) {
      return (
        <VideoView
          player={player}
          style={styles.media}
          contentFit="cover"
          nativeControls={false}
        />
      );
    }

    if (hasPhoto) {
      return (
        <ExpoImage
          source={firstPhoto}
          placeholder={getSportTheme(athlete.sport).image}
          placeholderContentFit="cover"
          style={styles.media}
          contentFit="cover"
          cachePolicy="memory-disk"
          transition={0}
          priority="high"
          recyclingKey={String(athlete.id)}
        />
      );
    }

    return (
      <View style={styles.placeholderImage}>
        <Ionicons name="person" size={72} color={theme.textMuted} />
      </View>
    );
  };

  return (
    <GestureDetector gesture={gesture}>
      <Animated.View
        accessible={isFocused}
        accessibilityLabel={accessibilityLabel}
        accessibilityActions={[
          { name: "activate", label: `Draft ${athlete.name}` },
          { name: "magicTap", label: `Pass on ${athlete.name}` },
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
          { width: cardWidth, height: cardHeight },
          // cardAnimStyle drives zIndex/elevation off the LIVE visual distance
          // so the centre-most card always sits on top — including mid-swipe.
          cardAnimStyle,
        ]}
      >
        <View style={styles.cardImage}>
          {renderMedia()}
          {active && phase === "video" && hasVideo && !videoReady && (
            <View style={styles.videoLoading}>
              <ActivityIndicator size="large" color={brand.white} />
            </View>
          )}

          <View
            style={[styles.cardTag, { borderColor: sportAccent + "55" }]}
          >
            <Ionicons name="diamond" size={12} color={brand.white} />
            <Text style={styles.cardTagText}>Available for Recruitment</Text>
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
              <Text style={styles.overlayLocationText}>{athlete.location}</Text>
              <View
                style={[
                  styles.sportPill,
                  { backgroundColor: sportAccent + "33", borderColor: sportAccent },
                ]}
              >
                <Text style={[styles.sportPillText, { color: sportAccent }]}>
                  {athlete.sport}
                </Text>
              </View>
            </View>
            <View style={styles.overlayNameRow}>
              <Text style={styles.overlayName} numberOfLines={1}>
                {athlete.name}, {athlete.position}
              </Text>
              {isVerified && (
                <Ionicons
                  name="checkmark-circle"
                  size={20}
                  color={semantic.success}
                />
              )}
            </View>
            <Text style={styles.overlayOrg}>
              {athlete.level} • {athlete.sport}
            </Text>
            {athlete.bio && (
              <Text style={styles.overlayBio} numberOfLines={2}>
                {athlete.bio}
              </Text>
            )}
          </LinearGradient>
          {/* Blur overlay — always mounted; opacity driven by live visual
              distance (centre = 0, neighbour = 1) so emphasis follows the
              finger continuously with no commit-time snap. */}
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

// Memoized so changing currentIndex doesn't re-render every visible card —
// only the focus-flipping ones whose props actually changed.
export const AthleteCard = React.memo(AthleteCardImpl);

const styles = StyleSheet.create({
  card: {
    position: "absolute",
    top: 0,
    left: 0,
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
  videoLoading: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: neutral.gray800,
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
  overlayBio: {
    fontSize: 13,
    fontFamily: "Poppins_400Regular",
    color: "rgba(255,255,255,0.85)",
    marginTop: 8,
  },
});
