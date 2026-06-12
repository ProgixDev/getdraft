import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useSelector } from "react-redux";
import { Ionicons } from "@expo/vector-icons";
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
import { adminService, AdminUserRow } from "@/services/admin";
import { useRoleHomeRedirect } from "@/lib/roleRoutes";

type FilterId =
  | "all"
  | "athlete"
  | "coach"
  | "recruiter"
  | "parent"
  | "admin"
  | "kyc_pending"
  | "kyc_declined"
  | "banned";

const FILTERS: { id: FilterId; label: string }[] = [
  { id: "all", label: "All" },
  { id: "athlete", label: "Athletes" },
  { id: "coach", label: "Coaches" },
  { id: "recruiter", label: "Recruiters" },
  { id: "parent", label: "Parents" },
  { id: "kyc_pending", label: "KYC pending" },
  { id: "kyc_declined", label: "KYC declined" },
  { id: "banned", label: "Banned" },
];

function roleLabel(role: AdminUserRow["role"]) {
  switch (role) {
    case "athlete":
      return "Athlete";
    case "coach":
      return "Coach";
    case "recruiter":
      return "Recruiter";
    case "parent":
      return "Parent";
    case "admin":
      return "Admin";
  }
}

function timeAgo(iso?: string): string {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "";
  const diff = Math.max(0, Date.now() - then);
  const d = Math.floor(diff / 86400000);
  if (d >= 1) return `${d}d`;
  const h = Math.floor(diff / 3600000);
  if (h >= 1) return `${h}h`;
  const m = Math.floor(diff / 60000);
  return `${m}m`;
}

export default function AdminUsersTab() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const user = useSelector((s: RootState) => s.auth.user);
  const params = useLocalSearchParams<{ filter?: string }>();
  const [fontsLoaded] = useFonts({
    Poppins_400Regular,
    Poppins_500Medium,
    Poppins_600SemiBold,
    Poppins_700Bold,
    Poppins_800ExtraBold,
  });

  const [filter, setFilter] = useState<FilterId>("all");
  const [search, setSearch] = useState("");
  const [rows, setRows] = useState<AdminUserRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  // Honor deep-link filter from the dashboard (kyc_pending / kyc_declined / banned).
  useEffect(() => {
    const incoming = params.filter as FilterId | undefined;
    if (incoming && FILTERS.some((f) => f.id === incoming)) setFilter(incoming);
  }, [params.filter]);

  const fetchUsers = useCallback(async (f: FilterId) => {
    setLoading(true);
    setError(false);
    try {
      // Server-side filters end-to-end now: roles are passed as `role`,
      // KYC/banned flags as `flag`. The old client-side slice over the
      // first 100 rows disagreed with the dashboard's full-table counts
      // past the first page.
      const isRoleFilter = ["athlete", "coach", "recruiter", "parent", "admin"]
        .includes(f);
      const flag =
        f === "kyc_pending" || f === "kyc_declined" || f === "banned"
          ? f
          : undefined;
      const page = await adminService.getUsers(
        1,
        100,
        isRoleFilter ? f : undefined,
        flag,
      );
      setRows(page.users);
    } catch {
      setError(true);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const redirecting = useRoleHomeRedirect(["admin"]);

  useFocusEffect(
    useCallback(() => {
      if (user?.role !== "admin") return;
      fetchUsers(filter);
    }, [user?.role, filter, fetchUsers]),
  );

  const filtered = useMemo(() => {
    if (!rows) return [];
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((u) =>
      [u.name, u.email, u.phone, u.role]
        .filter((v): v is string => !!v)
        .some((s) => s.toLowerCase().includes(q)),
    );
  }, [rows, search]);

  if (!fontsLoaded) return null;
  if (redirecting) return null;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={styles.eyebrow}>DIRECTORY</Text>
        <Text style={styles.title}>Users</Text>
        {rows && (
          <Text style={styles.countLine}>
            {filtered.length} of {rows.length}
          </Text>
        )}
      </View>

      <View style={styles.searchWrap}>
        <Ionicons name="search" size={16} color={theme.textMuted} />
        <TextInput
          style={styles.searchInput}
          value={search}
          onChangeText={setSearch}
          placeholder="Search name, email, or phone"
          placeholderTextColor={theme.inputPlaceholder}
          autoCapitalize="none"
          autoCorrect={false}
        />
        {search.length > 0 && (
          <Pressable onPress={() => setSearch("")} hitSlop={8}>
            <Ionicons
              name="close-circle"
              size={16}
              color={theme.textMuted}
            />
          </Pressable>
        )}
      </View>

      <FlatList
        data={FILTERS}
        keyExtractor={(f) => f.id}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterRow}
        style={styles.filterScroll}
        renderItem={({ item: f }) => (
          <Pressable
            onPress={() => setFilter(f.id)}
            style={({ pressed }) => [
              styles.filterPill,
              filter === f.id && styles.filterPillActive,
              pressed && { opacity: 0.85 },
            ]}
          >
            <Text
              style={[
                styles.filterPillText,
                filter === f.id && styles.filterPillTextActive,
              ]}
            >
              {f.label}
            </Text>
          </Pressable>
        )}
      />

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={theme.text} />
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Ionicons
            name="cloud-offline-outline"
            size={42}
            color={theme.textMuted}
          />
          <Text style={styles.emptyTitle}>Couldn&apos;t load users</Text>
          <Pressable style={styles.retry} onPress={() => fetchUsers(filter)}>
            <Text style={styles.retryText}>Try again</Text>
          </Pressable>
        </View>
      ) : filtered.length === 0 ? (
        <View style={styles.center}>
          <Ionicons
            name="people-outline"
            size={42}
            color={theme.textMuted}
          />
          <Text style={styles.emptyTitle}>No matches</Text>
          <Text style={styles.emptySub}>
            Try a different filter or clear the search.
          </Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(u) => u.id}
          contentContainerStyle={[
            styles.listContent,
            { paddingBottom: insets.bottom + 24 },
          ]}
          ItemSeparatorComponent={() => <View style={styles.divider} />}
          renderItem={({ item }) => <UserRow row={item} />}
          keyboardShouldPersistTaps="handled"
        />
      )}
    </View>
  );
}

function UserRow({ row }: { row: AdminUserRow }) {
  const router = useRouter();
  const initials = (row.name ?? row.email ?? "?")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase())
    .join("");

  const kyc = row.kyc_status;
  const kycColor =
    kyc === "approved"
      ? semantic.success
      : kyc === "pending"
        ? semantic.warning
        : kyc === "in_review"
          ? semantic.info
          : kyc === "declined"
            ? semantic.error
            : theme.textMuted;

  return (
    <Pressable
      style={({ pressed }) => [styles.userRow, pressed && styles.pressed]}
      onPress={() =>
        router.push({
          pathname: "/user/[userId]",
          params: { userId: row.id },
        })
      }
      accessibilityRole="button"
      accessibilityLabel={`Open ${row.name ?? "user"}`}
    >
      {row.avatar_url ? (
        <Image source={{ uri: row.avatar_url }} style={styles.avatar} />
      ) : (
        <View style={styles.avatarFallback}>
          <Text style={styles.avatarInitials}>{initials || "?"}</Text>
        </View>
      )}
      <View style={{ flex: 1, gap: 2 }}>
        <View style={styles.nameRow}>
          <Text style={styles.userName} numberOfLines={1}>
            {row.name ?? "—"}
          </Text>
          {row.is_banned && (
            <View style={styles.bannedPill}>
              <Text style={styles.bannedPillText}>BANNED</Text>
            </View>
          )}
        </View>
        <Text style={styles.userMeta} numberOfLines={1}>
          {row.email ?? row.phone ?? "—"}
        </Text>
      </View>
      <View style={{ alignItems: "flex-end", gap: 2 }}>
        <View style={[styles.rolePill, { borderColor: theme.cardBorder }]}>
          <Text style={styles.rolePillText}>{roleLabel(row.role)}</Text>
        </View>
        <View style={styles.kycRow}>
          <View style={[styles.kycDot, { backgroundColor: kycColor }]} />
          <Text style={styles.kycLabel}>
            {kyc ?? "none"}
            {row.created_at ? ` · ${timeAgo(row.created_at)}` : ""}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.bg },
  header: { paddingHorizontal: 18, paddingTop: 6, paddingBottom: 12 },
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
  countLine: {
    marginTop: 4,
    fontSize: 11,
    fontFamily: "Poppins_500Medium",
    color: theme.textMuted,
  },

  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 14,
    paddingHorizontal: 12,
    height: 42,
    borderRadius: 12,
    backgroundColor: theme.inputBg,
    borderWidth: 1,
    borderColor: theme.inputBorder,
    gap: 8,
    marginBottom: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    fontFamily: "Poppins_500Medium",
    color: theme.inputText,
  },

  filterScroll: { flexGrow: 0 },
  filterRow: { paddingHorizontal: 14, gap: 6, paddingBottom: 10 },
  filterPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.cardBorder,
  },
  filterPillActive: {
    backgroundColor: theme.accent,
    borderColor: theme.accent,
  },
  filterPillText: {
    fontSize: 11,
    fontFamily: "Poppins_600SemiBold",
    color: theme.textSecondary,
  },
  filterPillTextActive: { color: theme.accentText },

  listContent: { paddingHorizontal: 14 },
  divider: { height: 1, backgroundColor: theme.border, marginVertical: 4 },

  userRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 10,
  },
  pressed: { opacity: 0.75 },
  avatar: { width: 40, height: 40, borderRadius: 20 },
  avatarFallback: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: theme.surface,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: theme.cardBorder,
  },
  avatarInitials: {
    fontSize: 13,
    fontFamily: "Poppins_700Bold",
    color: theme.text,
  },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  userName: {
    fontSize: 14,
    fontFamily: "Poppins_700Bold",
    color: theme.text,
    flexShrink: 1,
  },
  userMeta: {
    fontSize: 11,
    fontFamily: "Poppins_500Medium",
    color: theme.textMuted,
  },
  rolePill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    borderWidth: 1,
  },
  rolePillText: {
    fontSize: 10,
    fontFamily: "Poppins_600SemiBold",
    color: theme.textSecondary,
    letterSpacing: 0.4,
  },
  kycRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  kycDot: { width: 6, height: 6, borderRadius: 3 },
  kycLabel: {
    fontSize: 10,
    fontFamily: "Poppins_500Medium",
    color: theme.textMuted,
    textTransform: "capitalize",
  },
  bannedPill: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: "rgba(231,76,60,0.2)",
  },
  bannedPillText: {
    fontSize: 8,
    fontFamily: "Poppins_700Bold",
    color: semantic.errorLight,
    letterSpacing: 1,
  },

  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 6 },
  emptyTitle: {
    marginTop: 8,
    fontSize: 15,
    fontFamily: "Poppins_700Bold",
    color: theme.text,
  },
  emptySub: {
    fontSize: 12,
    fontFamily: "Poppins_500Medium",
    color: theme.textMuted,
    textAlign: "center",
    paddingHorizontal: 24,
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
});
