import React, { useEffect, useMemo } from "react";
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { Image as ExpoImage } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import {
  useFonts,
  Poppins_400Regular,
  Poppins_500Medium,
  Poppins_600SemiBold,
  Poppins_700Bold,
  Poppins_800ExtraBold,
} from "@expo-google-fonts/poppins";
import { brand, semantic } from "@/config/colors";
import type { UserRole } from "@/store/slices/authSlice";

const ACCENT = semantic.infoDark; // #0984E3 brand blue
const CONFETTI_COLORS = [
  semantic.success,
  semantic.info,
  semantic.warning,
  "#FFFFFF",
  semantic.successLight,
];

export interface MatchCelebrationProps {
  visible: boolean;
  /** The match thread id — routes "Send a Message" to /chat/[threadId]. */
  matchId: string | null;
  /** The user we matched with. */
  otherName: string;
  otherAvatar?: string | null;
  /** Whether the matched profile is an athlete or a recruiter (coach/agent). */
  otherCardType?: "athlete" | "recruiter";
  /** The current user, for the left-hand avatar + role-aware copy. */
  myName?: string;
  myAvatar?: string | null;
  myRole?: UserRole;
  /** Navigate to the match chat. */
  onMessage: () => void;
  /** Dismiss back to Discover ("Keep Scouting"). */
  onDismiss: () => void;
}

function initials(name?: string): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

function firstName(name?: string): string {
  if (!name) return "them";
  return name.trim().split(/\s+/)[0] || name;
}

type UnlockRow = { icon: keyof typeof Ionicons.glyphMap; title: string; sub: string };

// Role-aware "what this match unlocks". Chat + full-profile are universal; the
// third line reflects who the two parties are.
function unlockRows(
  otherCardType: "athlete" | "recruiter" | undefined,
  myRole: UserRole | undefined,
  other: string,
): UnlockRow[] {
  // Guardian proxy: a parent Drafts on behalf of their athlete, so the match is
  // athlete<->recruiter and the parent is NOT in that chat thread. Promising
  // "message each other" (or calling them a player) would be wrong on both
  // counts — recruiters reach the guardian through outreach instead.
  if (myRole === "parent") {
    return [
      {
        icon: "trophy",
        title: "Your athlete got drafted back",
        sub: `${other} drafted your athlete too`,
      },
      {
        icon: "chatbubble-ellipses",
        title: `${other} can now reach out`,
        sub: "Messages come to you as the guardian",
      },
      {
        icon: "person-circle",
        title: "See their full profile",
        sub: "Who they are and who they scout for",
      },
    ];
  }

  const rows: UnlockRow[] = [
    {
      icon: "chatbubble-ellipses",
      title: "Message each other",
      sub: "Chat unlocks once you both Draft",
    },
    {
      icon: "person-circle",
      title: "See each other's full profile",
      sub: "Stats, media and the full story",
    },
  ];

  const iAmRecruiter = myRole === "recruiter" || myRole === "coach";
  if (otherCardType === "recruiter" && !iAmRecruiter) {
    rows.push({
      icon: "trophy",
      title: "Talk recruiting",
      sub: `${other} is scouting players like you`,
    });
  } else if (otherCardType === "athlete" && iAmRecruiter) {
    rows.push({
      icon: "clipboard",
      title: "Start the conversation",
      sub: `${other} is on your Draft Board`,
    });
  } else {
    rows.push({
      icon: "people",
      title: "You're connected",
      sub: "Grow your network on GetDraft",
    });
  }
  return rows;
}

// ── Confetti ──────────────────────────────────────────────────────
function ConfettiPiece({
  index,
  width,
  height,
}: {
  index: number;
  width: number;
  height: number;
}) {
  const fall = useSharedValue(0);
  const startX = useMemo(() => Math.random() * Math.max(width - 12, 0), [width]);
  const size = 6 + (index % 3) * 3;
  const color = CONFETTI_COLORS[index % CONFETTI_COLORS.length];
  const dir = index % 2 === 0 ? 1 : -1;

  useEffect(() => {
    const delay = (index * 130) % 1500;
    const duration = 2600 + (index % 5) * 360;
    fall.value = withDelay(
      delay,
      withRepeat(withTiming(1, { duration, easing: Easing.linear }), -1, false),
    );
    return () => cancelAnimation(fall);
  }, [fall, index]);

  const style = useAnimatedStyle(() => {
    const p = fall.value;
    const fadeIn = p < 0.08 ? p / 0.08 : 1;
    const fadeOut = p > 0.85 ? (1 - p) / 0.15 : 1;
    return {
      transform: [
        { translateY: p * (height + 60) - 40 },
        { translateX: Math.sin(p * Math.PI * 2 + index) * 20 * dir },
        { rotate: `${p * 360 * dir}deg` },
      ],
      opacity: Math.max(0, Math.min(fadeIn, fadeOut)) * 0.9,
    };
  });

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.confetti,
        { left: startX, width: size, height: size * 0.45, backgroundColor: color },
        style,
      ]}
    />
  );
}

function Confetti({ width, height }: { width: number; height: number }) {
  const pieces = useMemo(() => Array.from({ length: 14 }, (_, i) => i), []);
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {pieces.map((i) => (
        <ConfettiPiece key={i} index={i} width={width} height={height} />
      ))}
    </View>
  );
}

// ── Avatar ────────────────────────────────────────────────────────
function Avatar({ uri, name }: { uri?: string | null; name?: string }) {
  const valid = typeof uri === "string" && uri.length > 0;
  return (
    <View style={styles.avatarRing}>
      {valid ? (
        <ExpoImage
          source={{ uri: uri as string }}
          style={styles.avatarImg}
          contentFit="cover"
          cachePolicy="memory-disk"
        />
      ) : (
        <View style={[styles.avatarImg, styles.avatarFallback]}>
          <Text style={styles.avatarInitials}>{initials(name)}</Text>
        </View>
      )}
    </View>
  );
}

// On-brand 3D handshake (replaces the procedural WebGL hands). Transparent
// PNG — the green glow is drawn behind it by styles.middleGlow.
const HANDSHAKE_IMG = require("../../assets/images/handshake.png");

export function MatchCelebration({
  visible,
  matchId,
  otherName,
  otherAvatar,
  otherCardType,
  myName,
  myAvatar,
  myRole,
  onMessage,
  onDismiss,
}: MatchCelebrationProps) {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const reducedMotion = useReducedMotion();

  useFonts({
    Poppins_400Regular,
    Poppins_500Medium,
    Poppins_600SemiBold,
    Poppins_700Bold,
    Poppins_800ExtraBold,
  });

  // ── Entrance animation values (safe Reanimated timing — matches the
  // LogoAnimation/withSequence pattern proven on this app; no per-frame JS
  // worklets like the stats counter that previously crashed Hermes). ──
  const backdrop = useSharedValue(0);
  const titleScale = useSharedValue(0.6);
  const titleOpacity = useSharedValue(0);
  const leftX = useSharedValue(-44);
  const rightX = useSharedValue(44);
  const avatarsOpacity = useSharedValue(0);
  const linkScale = useSharedValue(0);
  const subtitleOpacity = useSharedValue(0);
  const middleOpacity = useSharedValue(0);
  const handshakeScale = useSharedValue(0.7);
  const bottomY = useSharedValue(28);
  const bottomOpacity = useSharedValue(0);

  useEffect(() => {
    if (!visible) return;

    if (reducedMotion) {
      // Land everything at its final value instantly.
      backdrop.value = 1;
      titleScale.value = 1;
      titleOpacity.value = 1;
      leftX.value = 0;
      rightX.value = 0;
      avatarsOpacity.value = 1;
      linkScale.value = 1;
      subtitleOpacity.value = 1;
      middleOpacity.value = 1;
      handshakeScale.value = 1;
      bottomY.value = 0;
      bottomOpacity.value = 1;
      return;
    }

    // Reset to start, then stagger in.
    backdrop.value = 0;
    titleScale.value = 0.6;
    titleOpacity.value = 0;
    leftX.value = -44;
    rightX.value = 44;
    avatarsOpacity.value = 0;
    linkScale.value = 0;
    subtitleOpacity.value = 0;
    middleOpacity.value = 0;
    handshakeScale.value = 0.7;
    bottomY.value = 28;
    bottomOpacity.value = 0;

    const easeOut = Easing.bezier(0.25, 0.1, 0.25, 1);

    backdrop.value = withTiming(1, { duration: 260, easing: easeOut });
    titleOpacity.value = withDelay(80, withTiming(1, { duration: 360 }));
    titleScale.value = withDelay(
      80,
      withSequence(
        withTiming(1.08, { duration: 380, easing: easeOut }),
        withTiming(1, { duration: 220, easing: Easing.inOut(Easing.ease) }),
      ),
    );
    avatarsOpacity.value = withDelay(180, withTiming(1, { duration: 300 }));
    leftX.value = withDelay(
      180,
      withTiming(0, { duration: 560, easing: Easing.out(Easing.cubic) }),
    );
    rightX.value = withDelay(
      180,
      withTiming(0, { duration: 560, easing: Easing.out(Easing.cubic) }),
    );
    linkScale.value = withDelay(
      640,
      withSequence(
        withTiming(1.25, { duration: 240, easing: easeOut }),
        withTiming(1, { duration: 200, easing: Easing.inOut(Easing.ease) }),
      ),
    );
    subtitleOpacity.value = withDelay(560, withTiming(1, { duration: 380 }));
    middleOpacity.value = withDelay(420, withTiming(1, { duration: 520 }));
    handshakeScale.value = withDelay(
      420,
      withSequence(
        withTiming(1.06, { duration: 380, easing: easeOut }),
        withTiming(1, { duration: 240, easing: Easing.inOut(Easing.ease) }),
      ),
    );
    bottomOpacity.value = withDelay(620, withTiming(1, { duration: 420 }));
    bottomY.value = withDelay(
      620,
      withTiming(0, { duration: 460, easing: Easing.out(Easing.cubic) }),
    );

    return () => {
      cancelAnimation(backdrop);
      cancelAnimation(titleScale);
      cancelAnimation(titleOpacity);
      cancelAnimation(leftX);
      cancelAnimation(rightX);
      cancelAnimation(avatarsOpacity);
      cancelAnimation(linkScale);
      cancelAnimation(subtitleOpacity);
      cancelAnimation(middleOpacity);
      cancelAnimation(handshakeScale);
      cancelAnimation(bottomY);
      cancelAnimation(bottomOpacity);
    };
  }, [visible, reducedMotion]);

  const backdropStyle = useAnimatedStyle(() => ({ opacity: backdrop.value }));
  const titleStyle = useAnimatedStyle(() => ({
    opacity: titleOpacity.value,
    transform: [{ scale: titleScale.value }],
  }));
  const leftAvatarStyle = useAnimatedStyle(() => ({
    opacity: avatarsOpacity.value,
    transform: [{ translateX: leftX.value }],
  }));
  const rightAvatarStyle = useAnimatedStyle(() => ({
    opacity: avatarsOpacity.value,
    transform: [{ translateX: rightX.value }],
  }));
  const linkStyle = useAnimatedStyle(() => ({
    opacity: avatarsOpacity.value,
    transform: [{ scale: linkScale.value }],
  }));
  const subtitleStyle = useAnimatedStyle(() => ({ opacity: subtitleOpacity.value }));
  const middleStyle = useAnimatedStyle(() => ({ opacity: middleOpacity.value }));
  const handshakeStyle = useAnimatedStyle(() => ({
    transform: [{ scale: handshakeScale.value }],
  }));
  const bottomStyle = useAnimatedStyle(() => ({
    opacity: bottomOpacity.value,
    transform: [{ translateY: bottomY.value }],
  }));

  const rows = useMemo(
    () => unlockRows(otherCardType, myRole, firstName(otherName)),
    [otherCardType, myRole, otherName],
  );

  const middleHeight = Math.max(238, Math.min(Math.round(height * 0.34), 360));

  return (
    <Modal
      visible={visible}
      transparent
      statusBarTranslucent
      animationType="none"
      onRequestClose={onDismiss}
    >
      <View style={styles.root}>
        {/* Backdrop */}
        <Animated.View style={[StyleSheet.absoluteFill, backdropStyle]}>
          <LinearGradient
            colors={["#0B0E12", "#070809"]}
            style={StyleSheet.absoluteFill}
          />
          {/* Brand glow pooled behind the headline */}
          <View
            style={[
              styles.brandGlow,
              { top: insets.top + 40, left: width / 2 - 150 },
            ]}
          />
          <LinearGradient
            colors={["rgba(9,132,227,0.12)", "transparent"]}
            style={styles.topWash}
          />
        </Animated.View>

        {!reducedMotion && <Confetti width={width} height={height} />}

        <View
          style={[
            styles.content,
            { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 18 },
          ]}
        >
          {/* Close */}
          <Pressable
            onPress={onDismiss}
            hitSlop={12}
            style={styles.closeBtn}
            accessibilityRole="button"
            accessibilityLabel="Close"
          >
            <Ionicons name="close" size={22} color="rgba(255,255,255,0.7)" />
          </Pressable>

          {/* ── TOP: headline + avatars ── */}
          <View style={styles.top}>
            <Animated.View style={[styles.kicker, titleStyle]}>
              <Ionicons name="flash" size={13} color="#0A0A0A" />
              <Text style={styles.kickerText}>GAME ON</Text>
            </Animated.View>
            <Animated.Text style={[styles.title, titleStyle]}>
              It&apos;s a Draft!
            </Animated.Text>

            <View
              style={styles.avatarRow}
              accessible
              accessibilityLabel={`You and ${otherName} drafted each other`}
            >
              <Animated.View style={[styles.avatarCol, leftAvatarStyle]}>
                <Avatar uri={myAvatar} name={myName} />
                <Text style={styles.avatarName} numberOfLines={1}>
                  You
                </Text>
              </Animated.View>

              <Animated.View style={[styles.linkBadge, linkStyle]}>
                <Ionicons name="flash" size={18} color="#0A0A0A" />
              </Animated.View>

              <Animated.View style={[styles.avatarCol, rightAvatarStyle]}>
                <Avatar uri={otherAvatar} name={otherName} />
                <Text style={styles.avatarName} numberOfLines={1}>
                  {firstName(otherName)}
                </Text>
              </Animated.View>
            </View>

            <Animated.Text style={[styles.subtitle, subtitleStyle]}>
              You and {firstName(otherName)} both hit Draft.
            </Animated.Text>
          </View>

          {/* ── MIDDLE: handshake ── */}
          <Animated.View
            style={[styles.middle, { height: middleHeight }, middleStyle]}
          >
            <View style={styles.middleGlow} />
            <Animated.View style={[styles.handshakeWrap, handshakeStyle]}>
              <ExpoImage
                source={HANDSHAKE_IMG}
                style={styles.handshakeImg}
                contentFit="contain"
                transition={200}
                accessibilityLabel="It's a Draft — handshake"
              />
            </Animated.View>
          </Animated.View>

          {/* ── BOTTOM: what's unlocked + CTAs ── */}
          <Animated.View style={[styles.bottom, bottomStyle]}>
            <View style={styles.unlockCard}>
              <Text style={styles.unlockHeading}>What you can do now</Text>
              {rows.map((r) => (
                <View key={r.title} style={styles.unlockRow}>
                  <View style={styles.unlockIcon}>
                    <Ionicons name={r.icon} size={16} color={ACCENT} />
                  </View>
                  <View style={styles.unlockTextWrap}>
                    <Text style={styles.unlockTitle}>{r.title}</Text>
                    <Text style={styles.unlockSub} numberOfLines={1}>
                      {r.sub}
                    </Text>
                  </View>
                </View>
              ))}
            </View>

            <Pressable
              style={({ pressed }) => [
                styles.primaryCta,
                pressed && styles.pressed,
              ]}
              onPress={onMessage}
              accessibilityRole="button"
              accessibilityLabel={
                myRole === "parent"
                  ? "Open your inbox"
                  : `Send a message to ${otherName}`
              }
            >
              <Ionicons name="chatbubble" size={18} color="#0A0A0A" />
              {/* A guardian isn't in their athlete's chat thread, so don't
                  promise them a conversation they can't open. */}
              <Text style={styles.primaryCtaText}>
                {myRole === "parent" ? "Go to Inbox" : "Send a Message"}
              </Text>
            </Pressable>

            <Pressable
              style={({ pressed }) => [
                styles.secondaryCta,
                pressed && styles.pressed,
              ]}
              onPress={onDismiss}
              accessibilityRole="button"
              accessibilityLabel="Keep scouting"
            >
              <Text style={styles.secondaryCtaText}>Keep Scouting</Text>
            </Pressable>
          </Animated.View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#070809",
  },
  brandGlow: {
    position: "absolute",
    width: 300,
    height: 300,
    borderRadius: 150,
    backgroundColor: "rgba(9,132,227,0.16)",
  },
  topWash: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 260,
  },
  content: {
    flex: 1,
    paddingHorizontal: 22,
    justifyContent: "space-between",
  },
  closeBtn: {
    position: "absolute",
    top: 8,
    right: 14,
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    zIndex: 10,
  },
  // ── TOP ──
  top: {
    alignItems: "center",
    paddingTop: 18,
  },
  kicker: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
    backgroundColor: ACCENT,
  },
  kickerText: {
    fontSize: 12,
    fontFamily: "Poppins_800ExtraBold",
    color: "#0A0A0A",
    letterSpacing: 2,
  },
  title: {
    marginTop: 12,
    fontSize: 40,
    lineHeight: 46,
    fontFamily: "Poppins_800ExtraBold",
    color: "#FFFFFF",
    textAlign: "center",
    letterSpacing: -0.5,
  },
  avatarRow: {
    marginTop: 20,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  avatarCol: {
    alignItems: "center",
    width: 96,
  },
  avatarRing: {
    width: 78,
    height: 78,
    borderRadius: 39,
    padding: 3,
    backgroundColor: "rgba(255,255,255,0.10)",
    borderWidth: 2,
    borderColor: ACCENT,
  },
  avatarImg: {
    flex: 1,
    borderRadius: 36,
  },
  avatarFallback: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#1C2128",
  },
  avatarInitials: {
    fontSize: 24,
    fontFamily: "Poppins_700Bold",
    color: "#FFFFFF",
  },
  avatarName: {
    marginTop: 8,
    fontSize: 13,
    fontFamily: "Poppins_600SemiBold",
    color: "rgba(255,255,255,0.85)",
    maxWidth: 96,
  },
  linkBadge: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginHorizontal: -6,
    marginBottom: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: ACCENT,
    borderWidth: 3,
    borderColor: "#070809",
    zIndex: 5,
    shadowColor: ACCENT,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 10,
    elevation: 8,
  },
  subtitle: {
    marginTop: 14,
    fontSize: 15,
    fontFamily: "Poppins_400Regular",
    color: "rgba(255,255,255,0.65)",
    textAlign: "center",
  },
  // ── MIDDLE ──
  middle: {
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
  middleGlow: {
    position: "absolute",
    width: 240,
    height: 240,
    borderRadius: 120,
    backgroundColor: "rgba(9,132,227,0.10)",
  },
  handshakeWrap: {
    width: "100%",
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
  handshakeImg: {
    width: "92%",
    height: "92%",
  },
  // ── BOTTOM ──
  bottom: {
    width: "100%",
  },
  unlockCard: {
    borderRadius: 20,
    padding: 16,
    backgroundColor: "rgba(255,255,255,0.045)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    gap: 12,
  },
  unlockHeading: {
    fontSize: 13,
    fontFamily: "Poppins_700Bold",
    color: "rgba(255,255,255,0.55)",
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  unlockRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  unlockIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(9,132,227,0.12)",
  },
  unlockTextWrap: {
    flex: 1,
  },
  unlockTitle: {
    fontSize: 14,
    fontFamily: "Poppins_600SemiBold",
    color: "#FFFFFF",
  },
  unlockSub: {
    marginTop: 1,
    fontSize: 12,
    fontFamily: "Poppins_400Regular",
    color: "rgba(255,255,255,0.5)",
  },
  primaryCta: {
    marginTop: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    height: 54,
    borderRadius: 27,
    backgroundColor: ACCENT,
    shadowColor: ACCENT,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 8,
  },
  primaryCtaText: {
    fontSize: 16,
    fontFamily: "Poppins_700Bold",
    color: "#0A0A0A",
    letterSpacing: 0.2,
  },
  secondaryCta: {
    marginTop: 10,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryCtaText: {
    fontSize: 15,
    fontFamily: "Poppins_600SemiBold",
    color: "rgba(255,255,255,0.6)",
  },
  pressed: {
    opacity: 0.85,
    transform: [{ scale: 0.985 }],
  },
  confetti: {
    position: "absolute",
    top: 0,
    borderRadius: 2,
  },
});
