import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
// expo-image, NOT react-native's Image: the built-in one decodes remote
// photos at full resolution (a 2048x1536 upload is 12 MB of bitmap even at
// 320 kB on disk). In a list that is per-row, which overruns the Android
// heap and gets the process killed -- a grey screen ErrorBoundary cannot
// catch, because the crash is native. Glide downsamples to the view size.
import { Image } from "expo-image";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
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
import {
  rankingsService,
  starsForRank,
  DIVISION_LABEL,
  DIVISION_FLAG,
  RankingDivision,
  RankingRow,
} from "@/services/rankings";

const DIVISIONS: RankingDivision[] = ["CA", "US", "WORLD"];

/**
 * Which rank a row shows depends on the board being viewed. On World the
 * division numbers are meaningless -- every country's leader holds division
 * rank 1, so the list would render a column of #1s.
 */
function standing(row: RankingRow, division: RankingDivision) {
  return division === "WORLD"
    ? { rank: row.world_rank, cohort: row.world_cohort_size }
    : { rank: row.division_rank, cohort: row.cohort_size };
}
const MEDAL: Record<number, string> = {
  1: "#FFD700",
  2: "#C0C0C0",
  3: "#CD7F32",
};

function Stars({ count }: { count: number }) {
  return (
    <View style={styles.starsRow}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Ionicons
          key={i}
          name={i <= count ? "star" : "star-outline"}
          size={12}
          color={i <= count ? semantic.warning : theme.textMuted}
        />
      ))}
    </View>
  );
}

export default function RankingsScreen() {
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

  // World, not Canada: it is the only board guaranteed to have rows in it,
  // so a recruiter never opens Rankings to an empty screen. An athlete is
  // moved to their own board by the bootstrap below.
  const [division, setDivision] = useState<RankingDivision>("WORLD");
  const [sport, setSport] = useState<string | undefined>(undefined);
  const [sports, setSports] = useState<string[]>([]);
  const [rows, setRows] = useState<RankingRow[]>([]);
  const [myRank, setMyRank] = useState<RankingRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [bootstrapped, setBootstrapped] = useState(false);

  // First load: pull the athlete's own rank to seed the division + sport to
  // their cohort. Recruiters/parents stay on the world board.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const mine = await rankingsService.getMyRank();
      if (cancelled) return;
      setMyRank(mine);
      if (mine) {
        // Athletes outside CA/US sit in the OTHER bucket, which has no board
        // of its own -- send them to World rather than leaving them looking
        // at Canada's leaderboard with no row of their own on it.
        setDivision(mine.division === "OTHER" ? "WORLD" : mine.division);
        setSport(mine.sport);
      }
      setBootstrapped(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const loadSports = useCallback(async (div: RankingDivision) => {
    const list = await rankingsService.getSports(div);
    setSports(list);
  }, []);

  const loadRows = useCallback(
    async (div: RankingDivision, sp: string | undefined, mode: "initial" | "refresh") => {
      if (mode === "initial") setLoading(true);
      else setRefreshing(true);
      const list = await rankingsService.getRankings(div, sp);
      setRows(list);
      setLoading(false);
      setRefreshing(false);
    },
    [],
  );

  // Once the seed is resolved, (re)load whenever division/sport changes.
  useEffect(() => {
    if (!bootstrapped) return;
    loadSports(division);
    loadRows(division, sport, "initial");
  }, [bootstrapped, division, sport, loadSports, loadRows]);

  const onChangeDivision = useCallback((d: RankingDivision) => {
    setDivision(d);
    setSport(undefined); // reset sport when switching country
  }, []);

  if (!fontsLoaded) return null;

  // Every athlete now has a standing somewhere -- an OTHER-division athlete
  // on the world board -- so the chip no longer hides for anyone.
  const showMyRank = user?.role === "athlete" && !!myRank;
  // An OTHER-division athlete's real standing is the world one.
  const myBoard: RankingDivision =
    myRank && myRank.division === "OTHER" ? "WORLD" : (myRank?.division ?? "CA");
  const mine = myRank
    ? standing(myRank, myBoard)
    : { rank: 0, cohort: 0 };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={12}
          style={({ pressed }) => [styles.backBtn, pressed && styles.pressed]}
        >
          <Ionicons name="chevron-back" size={24} color={theme.text} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Rankings</Text>
          <Text style={styles.subtitle}>Top prospects by country &amp; sport</Text>
        </View>
        <Ionicons name="trophy" size={22} color={semantic.warning} />
      </View>

      <FlatList
        data={rows}
        keyExtractor={(r) => r.user_id}
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => loadRows(division, sport, "refresh")}
            tintColor={theme.text}
          />
        }
        ListHeaderComponent={
          <View>
            {/* Division toggle */}
            <View style={styles.toggleRow}>
              {DIVISIONS.map((d) => {
                const active = d === division;
                return (
                  <Pressable
                    key={d}
                    onPress={() => onChangeDivision(d)}
                    style={({ pressed }) => [
                      styles.toggleBtn,
                      active && styles.toggleBtnActive,
                      pressed && styles.pressed,
                    ]}
                  >
                    <Text style={styles.toggleFlag}>{DIVISION_FLAG[d]}</Text>
                    <Text
                      style={[
                        styles.toggleText,
                        active && styles.toggleTextActive,
                      ]}
                    >
                      {DIVISION_LABEL[d]}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {/* My rank banner */}
            {showMyRank && myRank && (
              <View style={styles.myRankCard}>
                <View style={styles.myRankBadge}>
                  <Text style={styles.myRankHash}>#{mine.rank}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.myRankTitle}>
                    You&apos;re #{mine.rank} of {mine.cohort}
                  </Text>
                  <Text style={styles.myRankMeta}>
                    {DIVISION_FLAG[myBoard]} {DIVISION_LABEL[myBoard]} · {myRank.sport}
                  </Text>
                </View>
                <Stars count={starsForRank(mine.rank, mine.cohort)} />
              </View>
            )}

            {/* Sport chips */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.chipsRow}
            >
              <Chip
                label="All Sports"
                active={!sport}
                onPress={() => setSport(undefined)}
              />
              {sports.map((s) => (
                <Chip
                  key={s}
                  label={s}
                  active={sport === s}
                  onPress={() => setSport(s)}
                />
              ))}
            </ScrollView>
          </View>
        }
        renderItem={({ item }) => (
          <RankRow
            row={item}
            highlight={item.user_id === user?.id}
            division={division}
          />
        )}
        ListEmptyComponent={
          loading ? (
            <View style={styles.center}>
              <ActivityIndicator size="large" color={theme.text} />
            </View>
          ) : (
            <View style={styles.center}>
              <Ionicons name="trophy-outline" size={40} color={theme.textMuted} />
              <Text style={styles.emptyText}>
                No ranked athletes in {DIVISION_LABEL[division]}
                {sport ? ` · ${sport}` : ""} yet.
              </Text>
            </View>
          )
        }
      />
    </View>
  );
}

function Chip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        active && styles.chipActive,
        pressed && styles.pressed,
      ]}
    >
      <Text style={[styles.chipText, active && styles.chipTextActive]}>
        {label}
      </Text>
    </Pressable>
  );
}

function RankRow({
  row,
  highlight,
  division,
}: {
  row: RankingRow;
  highlight: boolean;
  division: RankingDivision;
}) {
  const { rank, cohort } = standing(row, division);
  const medal = MEDAL[rank];
  const initials =
    (row.name ?? "?")
      .split(" ")
      .map((p) => p[0])
      .slice(0, 2)
      .join("")
      .toUpperCase() || "?";
  return (
    <View style={[styles.row, highlight && styles.rowHighlight]}>
      <View style={[styles.rankBadge, medal ? { borderColor: medal } : null]}>
        <Text style={[styles.rankNum, medal ? { color: medal } : null]}>
          {rank}
        </Text>
      </View>

      <View style={styles.avatar}>
        {row.avatar_url ? (
          <Image source={{ uri: row.avatar_url }} style={styles.avatarImg} />
        ) : (
          <Text style={styles.avatarInitials}>{initials}</Text>
        )}
      </View>

      <View style={{ flex: 1 }}>
        <View style={styles.nameRow}>
          <Text style={styles.name} numberOfLines={1}>
            {row.name ?? "Athlete"}
          </Text>
          {row.kyc_status === "approved" && (
            <Ionicons
              name="checkmark-circle"
              size={14}
              color={semantic.info}
            />
          )}
        </View>
        <Text style={styles.meta} numberOfLines={1}>
          {[row.position, row.level, row.sport].filter(Boolean).join(" · ")}
        </Text>
        <Stars count={starsForRank(rank, cohort)} />
      </View>

      <View style={styles.scoreBox}>
        <Text style={styles.scoreValue}>{Math.round(row.score)}</Text>
        <Text style={styles.scoreLabel}>SCORE</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.bg },
  pressed: { opacity: 0.6 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
    backgroundColor: theme.headerBg,
  },
  backBtn: { padding: 2 },
  title: { fontSize: 22, fontFamily: "Poppins_700Bold", color: theme.text },
  subtitle: {
    fontSize: 12,
    fontFamily: "Poppins_400Regular",
    color: theme.textSecondary,
  },
  toggleRow: {
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  toggleBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.border,
    backgroundColor: theme.cardBg,
  },
  toggleBtnActive: {
    backgroundColor: theme.accent,
    borderColor: theme.accent,
  },
  toggleFlag: { fontSize: 18 },
  toggleText: {
    fontSize: 15,
    fontFamily: "Poppins_600SemiBold",
    color: theme.text,
  },
  toggleTextActive: { color: theme.accentText },
  myRankCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginHorizontal: 16,
    marginTop: 8,
    padding: 14,
    borderRadius: 16,
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: semantic.warning,
  },
  myRankBadge: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(253,203,110,0.15)",
  },
  myRankHash: {
    fontSize: 16,
    fontFamily: "Poppins_800ExtraBold",
    color: semantic.warning,
  },
  myRankTitle: {
    fontSize: 15,
    fontFamily: "Poppins_700Bold",
    color: theme.text,
  },
  myRankMeta: {
    fontSize: 12,
    fontFamily: "Poppins_400Regular",
    color: theme.textSecondary,
    marginTop: 2,
  },
  chipsRow: {
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: theme.border,
    backgroundColor: theme.cardBg,
  },
  chipActive: { backgroundColor: theme.accent, borderColor: theme.accent },
  chipText: {
    fontSize: 13,
    fontFamily: "Poppins_500Medium",
    color: theme.textSecondary,
  },
  chipTextActive: { color: theme.accentText },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginHorizontal: 16,
    marginBottom: 10,
    padding: 12,
    borderRadius: 14,
    backgroundColor: theme.cardBg,
    borderWidth: 1,
    borderColor: theme.cardBorder,
  },
  rowHighlight: { borderColor: semantic.warning },
  rankBadge: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: theme.border,
    backgroundColor: theme.surface,
  },
  rankNum: {
    fontSize: 15,
    fontFamily: "Poppins_800ExtraBold",
    color: theme.textSecondary,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: brand.primaryLight,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  avatarImg: { width: "100%", height: "100%" },
  avatarInitials: {
    fontSize: 15,
    fontFamily: "Poppins_700Bold",
    color: brand.white,
  },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  name: {
    fontSize: 15,
    fontFamily: "Poppins_600SemiBold",
    color: theme.text,
    flexShrink: 1,
  },
  meta: {
    fontSize: 12,
    fontFamily: "Poppins_400Regular",
    color: theme.textSecondary,
    marginTop: 1,
    marginBottom: 4,
  },
  starsRow: { flexDirection: "row", gap: 1 },
  scoreBox: { alignItems: "center", minWidth: 46 },
  scoreValue: {
    fontSize: 18,
    fontFamily: "Poppins_800ExtraBold",
    color: theme.text,
  },
  scoreLabel: {
    fontSize: 9,
    fontFamily: "Poppins_500Medium",
    color: theme.textMuted,
    letterSpacing: 1,
  },
  center: { alignItems: "center", justifyContent: "center", paddingTop: 60, gap: 12 },
  emptyText: {
    fontSize: 14,
    fontFamily: "Poppins_400Regular",
    color: theme.textMuted,
    textAlign: "center",
    paddingHorizontal: 32,
  },
});
