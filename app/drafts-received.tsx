import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { Image as ExpoImage } from "expo-image";
import { useRouter } from "expo-router";
import {
  useFonts,
  Poppins_400Regular,
  Poppins_500Medium,
  Poppins_600SemiBold,
  Poppins_700Bold,
} from "@expo-google-fonts/poppins";
import { brand, theme } from "@/config/colors";
import { discoverService } from "@/services/discover";
import { useRoleHomeRedirect } from "@/lib/roleRoutes";

interface DrafterSwiper {
  id: string;
  name: string;
  avatar_url?: string | null;
  role?: string | null;
  location?: string | null;
}

interface DrafterRow {
  swiper: DrafterSwiper;
  created_at: string;
  is_super?: boolean;
}

function formatTimeAgo(iso?: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const diffMs = Date.now() - date.getTime();
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return "Just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;
  return date.toLocaleDateString();
}

export default function DraftsReceivedScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  // Drafts are between athletes and recruiters — parents/admin bounce home.
  const redirecting = useRoleHomeRedirect(["athlete", "coach", "recruiter"]);
  const [fontsLoaded] = useFonts({
    Poppins_400Regular,
    Poppins_500Medium,
    Poppins_600SemiBold,
    Poppins_700Bold,
  });

  const [rows, setRows] = useState<DrafterRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);

  const load = useCallback(async (mode: "initial" | "refresh") => {
    try {
      if (mode === "initial") setLoading(true);
      else setRefreshing(true);
      setError(null);
      const data = (await discoverService.whoDraftedMe()) as DrafterRow[];
      setRows(Array.isArray(data) ? data.filter((r) => r?.swiper?.id) : []);
    } catch (e: any) {
      setError(e?.response?.data?.message || "Couldn't load your drafts");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load("initial");
  }, [load]);

  const handleDraftBack = useCallback(
    async (swiperId: string, name: string) => {
      if (pendingId) return;
      setPendingId(swiperId);
      try {
        const res = await discoverService.swipe(swiperId, "draft");
        setRows((prev) => prev.filter((r) => r.swiper.id !== swiperId));
        if (res.matched) {
          Alert.alert("Game On!", `You matched with ${name}.`);
        }
      } catch (e: any) {
        Alert.alert(
          "Couldn't draft back",
          e?.response?.data?.message || "Please try again.",
        );
      } finally {
        setPendingId(null);
      }
    },
    [pendingId],
  );

  if (redirecting || !fontsLoaded) return null;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [
            styles.backBtn,
            pressed && { opacity: 0.7 },
          ]}
          accessibilityLabel="Back"
          hitSlop={10}
        >
          <Ionicons name="chevron-back" size={22} color={theme.text} />
        </Pressable>
        <Text style={styles.title}>Who Drafted You</Text>
        <View style={styles.headerSpacer} />
      </View>

      {loading ? (
        <View style={styles.content}>
          <ActivityIndicator size="large" color={theme.text} />
        </View>
      ) : error ? (
        <View style={styles.content}>
          <Ionicons name="warning-outline" size={56} color={theme.textMuted} />
          <Text style={styles.emptyTitle}>Couldn&apos;t load</Text>
          <Text style={styles.emptySubtitle}>{error}</Text>
          <Pressable
            style={styles.retryBtn}
            onPress={() => load("initial")}
          >
            <Text style={styles.retryBtnText}>Try again</Text>
          </Pressable>
        </View>
      ) : rows.length === 0 ? (
        <ScrollView
          contentContainerStyle={styles.emptyScroll}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => load("refresh")}
              tintColor={theme.text}
            />
          }
        >
          <View style={styles.content}>
            <Ionicons name="trophy-outline" size={64} color={theme.textMuted} />
            <Text style={styles.emptyTitle}>No new drafts yet</Text>
            <Text style={styles.emptySubtitle}>Keep Scouting</Text>
            <Pressable
              style={styles.discoverButton}
              onPress={() => router.replace("/(tabs)")}
            >
              <Ionicons
                name="compass-outline"
                size={18}
                color={theme.accentText}
              />
              <Text style={styles.discoverButtonText}>Open Discover</Text>
            </Pressable>
          </View>
        </ScrollView>
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[
            styles.scrollContent,
            { paddingBottom: insets.bottom + 24 },
          ]}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => load("refresh")}
              tintColor={theme.text}
            />
          }
        >
          <View style={styles.hero}>
            <Ionicons name="flame" size={22} color={brand.white} />
            <View style={styles.heroTextWrap}>
              <Text style={styles.heroTitle}>
                {rows.length} {rows.length === 1 ? "person" : "people"} drafted
                you
              </Text>
              <Text style={styles.heroSubtitle}>
                Draft back to make it a match.
              </Text>
            </View>
          </View>

          <View style={styles.list}>
            {rows.map((r) => {
              const s = r.swiper;
              const isPending = pendingId === s.id;
              return (
                <View key={s.id} style={styles.card}>
                  <View style={styles.cardRow}>
                    {s.avatar_url ? (
                      <ExpoImage
                        source={{ uri: s.avatar_url }}
                        style={styles.avatar}
                        contentFit="cover"
                      />
                    ) : (
                      <View style={[styles.avatar, styles.avatarFallback]}>
                        <Ionicons
                          name="person"
                          size={22}
                          color={theme.textMuted}
                        />
                      </View>
                    )}
                    <View style={styles.cardText}>
                      <View style={styles.cardTopLine}>
                        <Text style={styles.name} numberOfLines={1}>
                          {s.name || "Unnamed"}
                        </Text>
                        <Text style={styles.time}>
                          {formatTimeAgo(r.created_at)}
                        </Text>
                      </View>
                      <View style={styles.metaRow}>
                        {r.is_super ? (
                          <View style={styles.superChip}>
                            <Ionicons name="star" size={11} color="#1A1A1A" />
                            <Text style={styles.superChipText}>Super Draft</Text>
                          </View>
                        ) : null}
                        {s.role ? (
                          <View style={styles.roleChip}>
                            <Text style={styles.roleChipText}>{s.role}</Text>
                          </View>
                        ) : null}
                        {s.location ? (
                          <View style={styles.locationRow}>
                            <Ionicons
                              name="location-outline"
                              size={12}
                              color={theme.textMuted}
                            />
                            <Text style={styles.locationText} numberOfLines={1}>
                              {s.location}
                            </Text>
                          </View>
                        ) : null}
                      </View>
                    </View>
                  </View>
                  <Pressable
                    style={({ pressed }) => [
                      styles.draftBackBtn,
                      pressed && { opacity: 0.85 },
                      isPending && { opacity: 0.7 },
                    ]}
                    onPress={() => handleDraftBack(s.id, s.name || "them")}
                    disabled={isPending}
                  >
                    {isPending ? (
                      <ActivityIndicator size="small" color={theme.accentText} />
                    ) : (
                      <>
                        <Ionicons
                          name="flash"
                          size={16}
                          color={theme.accentText}
                        />
                        <Text style={styles.draftBackText}>Draft back</Text>
                      </>
                    )}
                  </Pressable>
                </View>
              );
            })}
          </View>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.bg,
  },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: theme.headerBg,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  headerSpacer: {
    width: 36,
  },
  title: {
    flex: 1,
    textAlign: "center",
    fontSize: 18,
    fontFamily: "Poppins_600SemiBold",
    color: theme.text,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    gap: 14,
  },
  emptyScroll: {
    flexGrow: 1,
  },
  hero: {
    borderRadius: 16,
    backgroundColor: brand.primary,
    padding: 14,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  heroTextWrap: {
    flex: 1,
  },
  heroTitle: {
    fontSize: 15,
    fontFamily: "Poppins_600SemiBold",
    color: brand.white,
  },
  heroSubtitle: {
    marginTop: 2,
    fontSize: 12,
    lineHeight: 18,
    fontFamily: "Poppins_400Regular",
    color: "rgba(255,255,255,0.9)",
  },
  list: {
    gap: 10,
  },
  card: {
    borderRadius: 14,
    backgroundColor: theme.cardBg,
    borderWidth: 1,
    borderColor: theme.cardBorder,
    padding: 14,
    gap: 12,
  },
  cardRow: {
    flexDirection: "row",
    gap: 12,
    alignItems: "center",
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: theme.surface,
  },
  avatarFallback: {
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: theme.border,
  },
  cardText: {
    flex: 1,
    gap: 6,
  },
  cardTopLine: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  name: {
    flexShrink: 1,
    fontSize: 15,
    fontFamily: "Poppins_700Bold",
    color: theme.text,
  },
  time: {
    fontSize: 11,
    fontFamily: "Poppins_500Medium",
    color: theme.textMuted,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  },
  superChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: "#F5A623",
  },
  superChipText: {
    fontSize: 10,
    fontFamily: "Poppins_700Bold",
    color: "#1A1A1A",
  },
  roleChip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: theme.badgeBg,
  },
  roleChipText: {
    fontSize: 10,
    fontFamily: "Poppins_600SemiBold",
    color: theme.badgeText,
    textTransform: "capitalize",
  },
  locationRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    flexShrink: 1,
  },
  locationText: {
    fontSize: 12,
    fontFamily: "Poppins_400Regular",
    color: theme.textSecondary,
    flexShrink: 1,
  },
  draftBackBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: theme.accent,
    borderRadius: 999,
    paddingVertical: 10,
  },
  draftBackText: {
    fontSize: 14,
    fontFamily: "Poppins_600SemiBold",
    color: theme.accentText,
  },
  content: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 40,
  },
  emptyTitle: {
    fontSize: 20,
    fontFamily: "Poppins_600SemiBold",
    color: theme.text,
    marginTop: 16,
  },
  emptySubtitle: {
    fontSize: 14,
    fontFamily: "Poppins_400Regular",
    color: theme.textSecondary,
    marginTop: 8,
    textAlign: "center",
  },
  discoverButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 20,
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: theme.accent,
    borderRadius: 24,
  },
  discoverButtonText: {
    fontSize: 15,
    fontFamily: "Poppins_600SemiBold",
    color: theme.accentText,
  },
  retryBtn: {
    marginTop: 20,
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: theme.accent,
    borderRadius: 24,
  },
  retryBtnText: {
    fontSize: 15,
    fontFamily: "Poppins_600SemiBold",
    color: theme.accentText,
  },
});
