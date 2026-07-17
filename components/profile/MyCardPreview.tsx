import React from "react";
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { Image as ExpoImage } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { brand, semantic, theme } from "@/config/colors";
import { getSportTheme } from "@/constants/sportThemes";
import { getContentWidth } from "@/lib/responsive";

// ------------------------------------------------------------------
// My Card — "see my own card" (client request, Patrick 17/07).
// A STATIC replica of the Discover card so users see exactly how they
// appear to scouts. Two surfaces share ONE card face:
//   • MyCardMini    — a small tappable preview embedded on the profile
//                     (Patrick: "a smaller preview is exactly what I meant")
//   • MyCardPreview — the full-size card in a modal, opened from the mini.
// Deliberately gesture-free: no reanimated, no carousel shared values, no
// video autoplay — just the visual layer, style-matched to AthleteCard /
// DiscoverCard. If those cards change their look, mirror it here.
// ------------------------------------------------------------------

export interface MyCardData {
  /** athlete → "Available for Recruitment" card; coach/agent → recruiter card */
  role: "athlete" | "coach" | "agent";
  name: string;
  sport?: string | null;
  /** athlete only */
  position?: string | null;
  /** athlete only */
  level?: string | null;
  /** recruiter only */
  organization?: string | null;
  bio?: string | null;
  location?: string | null;
  verified: boolean;
  photos: (string | number)[];
  avatarUrl?: string | null;
}

// Font size set for the full card; the mini scales these down proportionally.
const FULL = {
  name: 26,
  tag: 12,
  loc: 13,
  pill: 11,
  org: 14,
  bio: 13,
  tagTop: 18,
  tagLeft: 18,
  pad: 22,
  padTop: 56,
  radius: 28,
  check: 20,
  diamond: 12,
  locIcon: 14,
};

function pickImage(data: MyCardData): string | number | null {
  const { role, photos, avatarUrl } = data;
  // Same media pick order as the live feed: athletes lead with their first
  // gallery photo; recruiters lead with avatar, falling back to gallery.
  return role === "athlete"
    ? (photos[0] ?? avatarUrl ?? null)
    : (avatarUrl ?? photos[0] ?? null);
}

/**
 * The card visual. `scale` shrinks every dimension so the mini and the full
 * card are the exact same design at two sizes — no divergence to maintain.
 */
function CardFace({
  data,
  width,
  height,
  scale = 1,
}: {
  data: MyCardData;
  width: number;
  height: number;
  scale?: number;
}) {
  const isAthlete = data.role === "athlete";
  const sportTheme = getSportTheme(data.sport ?? undefined);
  const sportAccent = sportTheme.accent;
  const imageSource = pickImage(data);
  const s = (n: number) => Math.round(n * scale);

  const nameLine = isAthlete
    ? [data.name, data.position].filter(Boolean).join(", ")
    : `${data.name}, ${data.role === "agent" ? "Agent" : "Coach"}`;
  const subLine = isAthlete
    ? [data.level, data.sport].filter(Boolean).join(" • ")
    : (data.organization ?? "");

  return (
    <View
      style={[
        styles.card,
        { width, height, borderRadius: s(FULL.radius) },
      ]}
    >
      <View style={styles.cardImage}>
        {imageSource ? (
          <ExpoImage
            source={imageSource}
            placeholder={sportTheme.image}
            placeholderContentFit="cover"
            style={styles.media}
            contentFit="cover"
            cachePolicy="memory-disk"
            transition={0}
          />
        ) : (
          <View style={styles.placeholderImage}>
            <Ionicons
              name={isAthlete ? "person" : "briefcase"}
              size={s(72)}
              color={theme.textMuted}
            />
          </View>
        )}

        <View
          style={[
            styles.cardTag,
            {
              top: s(FULL.tagTop),
              left: s(FULL.tagLeft),
              paddingHorizontal: s(12),
              paddingVertical: s(6),
              borderRadius: s(20),
              gap: s(6),
              borderColor: sportAccent + "55",
            },
          ]}
        >
          <Ionicons name="diamond" size={s(FULL.diamond)} color={brand.white} />
          <Text style={[styles.cardTagText, { fontSize: s(FULL.tag) }]}>
            {isAthlete ? "Available for Recruitment" : "Open to Recruiting"}
          </Text>
        </View>

        <LinearGradient
          colors={["transparent", "rgba(0,0,0,0.55)", "rgba(0,0,0,0.92)"]}
          style={[
            styles.cardOverlay,
            { padding: s(FULL.pad), paddingTop: s(FULL.padTop) },
          ]}
          locations={[0, 0.55, 1]}
        >
          <View style={[styles.overlayLocation, { gap: s(6), marginBottom: s(10) }]}>
            <Ionicons name="location" size={s(FULL.locIcon)} color={brand.white} />
            <Text style={[styles.overlayLocationText, { fontSize: s(FULL.loc) }]}>
              {data.location ?? ""}
            </Text>
            {!!data.sport && (
              <View
                style={[
                  styles.sportPill,
                  {
                    paddingHorizontal: s(10),
                    paddingVertical: s(4),
                    borderRadius: s(12),
                    backgroundColor: sportAccent + "33",
                    borderColor: sportAccent,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.sportPillText,
                    { fontSize: s(FULL.pill), color: sportAccent },
                  ]}
                >
                  {data.sport}
                </Text>
              </View>
            )}
          </View>
          <View style={[styles.overlayNameRow, { gap: s(8) }]}>
            <Text
              style={[styles.overlayName, { fontSize: s(FULL.name) }]}
              numberOfLines={1}
            >
              {nameLine}
            </Text>
            {data.verified && (
              <Ionicons
                name="checkmark-circle"
                size={s(FULL.check)}
                color={semantic.success}
              />
            )}
          </View>
          {!!subLine && (
            <Text
              style={[styles.overlayOrg, { fontSize: s(FULL.org), marginTop: s(4) }]}
            >
              {subLine}
            </Text>
          )}
          {!!data.bio && (
            <Text
              style={[styles.overlayBio, { fontSize: s(FULL.bio), marginTop: s(8) }]}
              numberOfLines={2}
            >
              {data.bio}
            </Text>
          )}
        </LinearGradient>
      </View>
    </View>
  );
}

// ------------------------------------------------------------------
// MyCardMini — compact preview embedded on the profile. Tapping opens the
// full modal. Shows a header row + the scaled card face + an expand hint.
// ------------------------------------------------------------------
export function MyCardMini({
  data,
  onPress,
}: {
  data: MyCardData;
  onPress: () => void;
}) {
  const isAthlete = data.role === "athlete";
  // Compact portrait, centred. ~64% of the content column reads clearly as
  // "your card" without dominating the profile scroll.
  const cardWidth = Math.min(getContentWidth() * 0.62, 230);
  const cardHeight = cardWidth * 1.4;
  const scale = cardWidth / (Math.min(getContentWidth() * 0.86, 360));

  return (
    <View style={styles.miniSection}>
      <View style={styles.miniHeader}>
        <Text style={styles.miniTitle}>My Card</Text>
        <Text style={styles.miniSubtitle}>
          {isAthlete ? "How scouts see you" : "How athletes see you"}
        </Text>
      </View>

      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel="Enlarge my card"
        style={({ pressed }) => [
          styles.miniCardWrap,
          pressed && styles.miniCardPressed,
        ]}
      >
        <CardFace
          data={data}
          width={cardWidth}
          height={cardHeight}
          scale={scale}
        />
        <View style={styles.expandBadge}>
          <Ionicons name="expand" size={16} color={brand.white} />
        </View>
      </Pressable>

      <Text style={styles.miniHint}>Tap to enlarge</Text>
    </View>
  );
}

// ------------------------------------------------------------------
// MyCardPreview — full-size card in a modal.
// ------------------------------------------------------------------
export function MyCardPreview({
  visible,
  onClose,
  data,
}: {
  visible: boolean;
  onClose: () => void;
  data: MyCardData;
}) {
  const { height: screenHeight } = useWindowDimensions();
  const isAthlete = data.role === "athlete";
  const cardWidth = Math.min(getContentWidth() * 0.86, 360);
  const cardHeight = Math.min(cardWidth * 1.45, screenHeight * 0.72);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        <Text style={styles.heading}>
          {isAthlete ? "How coaches & agents see you" : "How athletes see you"}
        </Text>

        <CardFace data={data} width={cardWidth} height={cardHeight} scale={1} />

        {!data.photos.length && (
          <Text style={styles.hint}>
            Add photos to your profile so scouts see the real you.
          </Text>
        )}

        <Pressable
          style={({ pressed }) => [
            styles.closeButton,
            pressed && styles.closeButtonPressed,
          ]}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close card preview"
        >
          <Text style={styles.closeButtonText}>Close</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  // ----- shared card face (clone of AthleteCard shell) -----
  card: {
    backgroundColor: theme.cardBg,
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
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.55)",
    borderWidth: 1,
  },
  cardTagText: {
    fontFamily: "Poppins_600SemiBold",
    color: brand.white,
  },
  cardOverlay: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
  },
  overlayLocation: {
    flexDirection: "row",
    alignItems: "center",
  },
  overlayLocationText: {
    fontFamily: "Poppins_500Medium",
    color: "rgba(255,255,255,0.95)",
  },
  sportPill: {
    marginLeft: "auto",
    borderWidth: 1,
  },
  sportPillText: {
    fontFamily: "Poppins_600SemiBold",
    letterSpacing: 0.3,
  },
  overlayNameRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  overlayName: {
    flex: 1,
    fontFamily: "Poppins_800ExtraBold",
    color: brand.white,
    letterSpacing: -0.4,
  },
  overlayOrg: {
    fontFamily: "Poppins_500Medium",
    color: "rgba(255,255,255,0.85)",
  },
  overlayBio: {
    fontFamily: "Poppins_400Regular",
    color: "rgba(255,255,255,0.85)",
  },
  // ----- mini (inline on profile) -----
  miniSection: {
    alignItems: "center",
    marginHorizontal: 16,
    marginBottom: 16,
    paddingVertical: 18,
    backgroundColor: theme.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: theme.border,
  },
  miniHeader: {
    alignItems: "center",
    marginBottom: 14,
  },
  miniTitle: {
    fontSize: 16,
    fontFamily: "Poppins_700Bold",
    color: theme.text,
  },
  miniSubtitle: {
    fontSize: 12,
    fontFamily: "Poppins_400Regular",
    color: theme.textMuted,
    marginTop: 2,
  },
  miniCardWrap: {
    position: "relative",
  },
  miniCardPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.98 }],
  },
  expandBadge: {
    position: "absolute",
    top: 10,
    right: 10,
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.55)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
  },
  miniHint: {
    fontSize: 12,
    fontFamily: "Poppins_500Medium",
    color: theme.textSecondary,
    marginTop: 12,
  },
  // ----- modal -----
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.88)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  heading: {
    fontSize: 15,
    fontFamily: "Poppins_600SemiBold",
    color: theme.textSecondary,
    marginBottom: 16,
  },
  hint: {
    fontSize: 13,
    fontFamily: "Poppins_400Regular",
    color: theme.textMuted,
    marginTop: 14,
    textAlign: "center",
  },
  closeButton: {
    marginTop: 18,
    paddingHorizontal: 36,
    paddingVertical: 12,
    borderRadius: 24,
    backgroundColor: "rgba(255,255,255,0.12)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
  },
  closeButtonPressed: {
    backgroundColor: "rgba(255,255,255,0.2)",
  },
  closeButtonText: {
    fontSize: 15,
    fontFamily: "Poppins_600SemiBold",
    color: brand.white,
  },
});
