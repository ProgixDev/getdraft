import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useSelector } from "react-redux";
import {
  useFonts,
  Poppins_400Regular,
  Poppins_500Medium,
  Poppins_600SemiBold,
  Poppins_700Bold,
  Poppins_800ExtraBold,
} from "@expo-google-fonts/poppins";
import { brand, semantic, theme } from "@/config/colors";
import { RootState } from "@/store";
import {
  adminService,
  AdminQueueCounts,
  AdminStats,
} from "@/services/admin";

type IonName = React.ComponentProps<typeof Ionicons>["name"];

export default function AdminDashboardScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const user = useSelector((s: RootState) => s.auth.user);
  const [fontsLoaded] = useFonts({
    Poppins_400Regular,
    Poppins_500Medium,
    Poppins_600SemiBold,
    Poppins_700Bold,
    Poppins_800ExtraBold,
  });

  const [stats, setStats] = useState<AdminStats | null>(null);
  const [queue, setQueue] = useState<AdminQueueCounts | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);

  const load = useCallback(async (mode: "initial" | "refresh") => {
    if (mode === "initial") setLoading(true);
    else setRefreshing(true);
    setError(false);
    try {
      const [s, q] = await Promise.all([
        adminService.getStats(),
        adminService.getQueueCounts(),
      ]);
      setStats(s);
      setQueue(q);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (user?.role !== "admin") {
        router.replace("/(tabs)");
        return;
      }
      load("initial");
    }, [user?.role, load, router]),
  );

  if (!fontsLoaded) return null;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={styles.eyebrow}>GETDRAFT · ADMIN</Text>
        <Text style={styles.title}>Dashboard</Text>
      </View>

      {loading && !stats ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={theme.text} />
        </View>
      ) : error && !stats ? (
        <View style={styles.center}>
          <Ionicons
            name="cloud-offline-outline"
            size={48}
            color={theme.textMuted}
          />
          <Text style={styles.emptyTitle}>Couldn&apos;t load stats</Text>
          <Pressable style={styles.retry} onPress={() => load("initial")}>
            <Text style={styles.retryText}>Try again</Text>
          </Pressable>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[
            styles.scrollContent,
            { paddingBottom: insets.bottom + 24 },
          ]}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => load("refresh")}
              tintColor={theme.text}
            />
          }
          showsVerticalScrollIndicator={false}
        >
          {/* Action queues — what the admin should DO right now */}
          <Text style={styles.sectionLabel}>Needs attention</Text>
          <View style={styles.queueRow}>
            <QueueCard
              icon="shield-checkmark-outline"
              label="Guardian reviews"
              value={queue?.pendingGuardianReviews ?? 0}
              accent={semantic.warning}
              onPress={() => router.push("/(tabs)/reviews")}
            />
            <QueueCard
              icon="finger-print-outline"
              label="KYC pending"
              value={queue?.kycPending ?? 0}
              accent={semantic.info}
              onPress={() =>
                router.push({
                  pathname: "/(tabs)/users",
                  params: { filter: "kyc_pending" },
                })
              }
            />
          </View>
          <View style={styles.queueRow}>
            <QueueCard
              icon="close-circle-outline"
              label="KYC declined"
              value={queue?.kycDeclined ?? 0}
              accent={semantic.error}
              onPress={() =>
                router.push({
                  pathname: "/(tabs)/users",
                  params: { filter: "kyc_declined" },
                })
              }
            />
            <QueueCard
              icon="ban-outline"
              label="Banned"
              value={queue?.bannedTotal ?? 0}
              accent={theme.textSecondary}
              onPress={() =>
                router.push({
                  pathname: "/(tabs)/users",
                  params: { filter: "banned" },
                })
              }
            />
          </View>

          {/* Platform headcount */}
          <Text style={styles.sectionLabel}>Platform</Text>
          <View style={styles.bigCard}>
            <Text style={styles.bigCardLabel}>Total users</Text>
            <Text style={styles.bigCardValue}>
              {stats?.totalUsers?.toLocaleString() ?? "—"}
            </Text>
            <View style={styles.deltaRow}>
              <Ionicons name="trending-up" size={14} color={semantic.success} />
              <Text style={styles.delta}>
                +{queue?.signupsLast24h ?? 0} in last 24h
              </Text>
            </View>
          </View>

          <Text style={styles.sectionLabel}>By role</Text>
          <View style={styles.roleGrid}>
            <RoleTile
              icon="trophy-outline"
              label="Athletes"
              value={stats?.byRole.athlete ?? 0}
            />
            <RoleTile
              icon="briefcase-outline"
              label="Coaches"
              value={stats?.byRole.coach ?? 0}
            />
            <RoleTile
              icon="search-outline"
              label="Recruiters"
              value={stats?.byRole.recruiter ?? 0}
            />
            <RoleTile
              icon="people-outline"
              label="Parents"
              value={stats?.byRole.parent ?? 0}
            />
          </View>

          <Text style={styles.sectionLabel}>Activity</Text>
          <View style={styles.row}>
            <StatRow
              icon="git-merge-outline"
              label="Active matches"
              value={stats?.totalMatches ?? 0}
            />
            <StatRow
              icon="chatbubbles-outline"
              label="Messages sent"
              value={stats?.totalMessages ?? 0}
            />
          </View>
        </ScrollView>
      )}
    </View>
  );
}

function QueueCard({
  icon,
  label,
  value,
  accent,
  onPress,
}: {
  icon: IonName;
  label: string;
  value: number;
  accent: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={({ pressed }) => [
        styles.queueCard,
        { borderLeftColor: accent },
        pressed && styles.pressed,
      ]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${value}`}
    >
      <View style={[styles.queueIcon, { backgroundColor: `${accent}22` }]}>
        <Ionicons name={icon} size={18} color={accent} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.queueLabel}>{label}</Text>
        <Text style={styles.queueValue}>{value}</Text>
      </View>
      <Ionicons name="chevron-forward" size={16} color={theme.textMuted} />
    </Pressable>
  );
}

function RoleTile({
  icon,
  label,
  value,
}: {
  icon: IonName;
  label: string;
  value: number;
}) {
  return (
    <View style={styles.roleTile}>
      <Ionicons name={icon} size={18} color={theme.text} />
      <Text style={styles.roleTileValue}>{value.toLocaleString()}</Text>
      <Text style={styles.roleTileLabel}>{label}</Text>
    </View>
  );
}

function StatRow({
  icon,
  label,
  value,
}: {
  icon: IonName;
  label: string;
  value: number;
}) {
  return (
    <View style={styles.statRow}>
      <Ionicons name={icon} size={16} color={theme.textSecondary} />
      <Text style={styles.statRowLabel}>{label}</Text>
      <Text style={styles.statRowValue}>{value.toLocaleString()}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.bg },
  header: {
    paddingHorizontal: 18,
    paddingTop: 6,
    paddingBottom: 12,
  },
  eyebrow: {
    fontSize: 10,
    fontFamily: "Poppins_700Bold",
    letterSpacing: 2,
    color: theme.textMuted,
    marginBottom: 4,
  },
  title: {
    fontSize: 30,
    fontFamily: "Poppins_800ExtraBold",
    color: theme.text,
    letterSpacing: -0.6,
  },
  scrollContent: { paddingHorizontal: 14, paddingTop: 6 },

  sectionLabel: {
    fontSize: 11,
    fontFamily: "Poppins_700Bold",
    letterSpacing: 1.5,
    color: theme.textMuted,
    textTransform: "uppercase",
    marginTop: 16,
    marginBottom: 8,
    marginLeft: 4,
  },

  queueRow: { flexDirection: "row", gap: 10, marginBottom: 10 },
  queueCard: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: theme.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.cardBorder,
    borderLeftWidth: 3,
    paddingVertical: 12,
    paddingHorizontal: 12,
    gap: 10,
  },
  queueIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
  },
  queueLabel: {
    fontSize: 11,
    fontFamily: "Poppins_500Medium",
    color: theme.textSecondary,
  },
  queueValue: {
    fontSize: 18,
    fontFamily: "Poppins_700Bold",
    color: theme.text,
    marginTop: 1,
  },

  bigCard: {
    backgroundColor: theme.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: theme.cardBorder,
    padding: 16,
  },
  bigCardLabel: {
    fontSize: 11,
    fontFamily: "Poppins_500Medium",
    color: theme.textMuted,
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  bigCardValue: {
    fontSize: 38,
    fontFamily: "Poppins_800ExtraBold",
    color: theme.text,
    marginTop: 4,
    letterSpacing: -1,
  },
  deltaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 4,
  },
  delta: {
    fontSize: 12,
    fontFamily: "Poppins_500Medium",
    color: semantic.success,
  },

  roleGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  roleTile: {
    flex: 1,
    minWidth: "47%",
    backgroundColor: theme.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.cardBorder,
    padding: 14,
    gap: 6,
  },
  roleTileValue: {
    fontSize: 22,
    fontFamily: "Poppins_700Bold",
    color: theme.text,
    letterSpacing: -0.4,
  },
  roleTileLabel: {
    fontSize: 11,
    fontFamily: "Poppins_500Medium",
    color: theme.textSecondary,
  },

  row: { gap: 8 },
  statRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: theme.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.cardBorder,
    paddingVertical: 12,
    paddingHorizontal: 14,
    gap: 10,
  },
  statRowLabel: {
    flex: 1,
    fontSize: 13,
    fontFamily: "Poppins_500Medium",
    color: theme.text,
  },
  statRowValue: {
    fontSize: 14,
    fontFamily: "Poppins_700Bold",
    color: theme.text,
  },

  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  emptyTitle: {
    marginTop: 8,
    fontSize: 14,
    fontFamily: "Poppins_600SemiBold",
    color: theme.text,
  },
  retry: {
    marginTop: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: theme.accent,
  },
  retryText: {
    fontSize: 13,
    fontFamily: "Poppins_600SemiBold",
    color: theme.accentText,
  },

  pressed: { opacity: 0.75 },
});
