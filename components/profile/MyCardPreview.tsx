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
// MyCardPreview — "see my own card" (client request, Patrick 17/07).
// A STATIC replica of the Discover card so users can see exactly how
// they appear to scouts. Deliberately gesture-free: no reanimated, no
// carousel shared values, no video autoplay — just the visual layer,
// style-matched to AthleteCard / DiscoverCard. If those cards change
// their look, mirror it here.
// ------------------------------------------------------------------

export interface MyCardPreviewProps {
  visible: boolean;
  onClose: () => void;
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

export function MyCardPreview({
  visible,
  onClose,
  role,
  name,
  sport,
  position,
  level,
  organization,
  bio,
  location,
  verified,
  photos,
  avatarUrl,
}: MyCardPreviewProps) {
  const { height: screenHeight } = useWindowDimensions();
  const isAthlete = role === "athlete";
  const sportTheme = getSportTheme(sport ?? undefined);
  const sportAccent = sportTheme.accent;

  // Same media pick order as the live feed: athletes lead with their first
  // gallery photo; recruiters lead with avatar, falling back to gallery.
  const imageSource = isAthlete
    ? (photos[0] ?? avatarUrl ?? null)
    : (avatarUrl ?? photos[0] ?? null);

  const cardWidth = Math.min(getContentWidth() * 0.86, 360);
  const cardHeight = Math.min(cardWidth * 1.45, screenHeight * 0.72);

  const nameLine = isAthlete
    ? [name, position].filter(Boolean).join(", ")
    : `${name}, ${role === "agent" ? "Agent" : "Coach"}`;
  const subLine = isAthlete
    ? [level, sport].filter(Boolean).join(" • ")
    : (organization ?? "");

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        <Text style={styles.heading}>
          {isAthlete
            ? "How coaches & agents see you"
            : "How athletes see you"}
        </Text>

        <View style={[styles.card, { width: cardWidth, height: cardHeight }]}>
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
                  size={72}
                  color={theme.textMuted}
                />
              </View>
            )}

            <View style={[styles.cardTag, { borderColor: sportAccent + "55" }]}>
              <Ionicons name="diamond" size={12} color={brand.white} />
              <Text style={styles.cardTagText}>
                {isAthlete ? "Available for Recruitment" : "Open to Recruiting"}
              </Text>
            </View>

            <LinearGradient
              colors={["transparent", "rgba(0,0,0,0.55)", "rgba(0,0,0,0.92)"]}
              style={styles.cardOverlay}
              locations={[0, 0.55, 1]}
            >
              <View style={styles.overlayLocation}>
                <Ionicons name="location" size={14} color={brand.white} />
                <Text style={styles.overlayLocationText}>
                  {location ?? ""}
                </Text>
                {!!sport && (
                  <View
                    style={[
                      styles.sportPill,
                      {
                        backgroundColor: sportAccent + "33",
                        borderColor: sportAccent,
                      },
                    ]}
                  >
                    <Text style={[styles.sportPillText, { color: sportAccent }]}>
                      {sport}
                    </Text>
                  </View>
                )}
              </View>
              <View style={styles.overlayNameRow}>
                <Text style={styles.overlayName} numberOfLines={1}>
                  {nameLine}
                </Text>
                {verified && (
                  <Ionicons
                    name="checkmark-circle"
                    size={20}
                    color={semantic.success}
                  />
                )}
              </View>
              {!!subLine && <Text style={styles.overlayOrg}>{subLine}</Text>}
              {!!bio && (
                <Text style={styles.overlayBio} numberOfLines={2}>
                  {bio}
                </Text>
              )}
            </LinearGradient>
          </View>
        </View>

        {!photos.length && (
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
  // Visual clone of the Discover card shell (AthleteCard styles).
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
