import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useSelector } from "react-redux";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import Animated, { FadeIn, FadeInDown, ZoomIn } from "react-native-reanimated";
import {
  useFonts,
  Poppins_400Regular,
  Poppins_500Medium,
  Poppins_600SemiBold,
  Poppins_700Bold,
  Poppins_800ExtraBold,
} from "@expo-google-fonts/poppins";
import { brand, neutral, semantic, theme } from "@/config/colors";
import { RootState } from "@/store";
import { usersService } from "@/services/users";
import {
  guardianLinksService,
  GuardianLink,
} from "@/services/guardianLinks";
import { outreachService } from "@/services/outreach";
import { kycService } from "@/services/kyc";

type IonName = React.ComponentProps<typeof Ionicons>["name"];

interface OutreachItem {
  id: string;
  recruiterName: string;
  recruiterRole: string;
  organization: string;
  childName: string;
  message: string;
  sentAt: string;
  verified: boolean;
  status: string;
  unreadCount: number;
}

const RELATIONSHIP_LABEL: Record<string, string> = {
  parent: "Parent",
  legal_guardian: "Legal guardian",
  step_parent: "Step-parent",
  sibling: "Sibling",
  aunt_uncle: "Aunt / Uncle",
  grandparent: "Grandparent",
  other: "Other",
};

function timeAgo(iso?: string | null): string {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "";
  const diff = Math.max(0, Date.now() - then);
  const m = Math.floor(diff / 60000);
  if (m < 1) return "now";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d`;
  return new Date(iso).toLocaleDateString();
}

export default function GuardianHomeScreen() {
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

  const [me, setMe] = useState<any | null>(null);
  const [link, setLink] = useState<GuardianLink | null>(null);
  const [kycApproved, setKycApproved] = useState(false);
  const [outreach, setOutreach] = useState<OutreachItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);

  const load = useCallback(async (mode: "initial" | "refresh") => {
    if (mode === "initial") setLoading(true);
    else setRefreshing(true);
    setError(false);
    try {
      const [meRow, linkRow, kyc, outreachRows] = await Promise.all([
        usersService.getMe().catch(() => null),
        guardianLinksService.getMyLink().catch(() => null),
        kycService.getStatus().catch(() => null),
        outreachService.getOutreachList().catch(() => [] as any[]),
      ]);
      setMe(meRow);
      setLink(linkRow);
      setKycApproved(kyc?.kycStatus === "approved");
      setOutreach((outreachRows ?? []) as OutreachItem[]);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (user?.role !== "parent") {
        router.replace("/(tabs)");
        return;
      }
      load("initial");
    }, [user?.role, load, router]),
  );

  if (!fontsLoaded) return null;

  const approved = link?.status === "approved";
  const pendingReview = link?.status === "pending_admin";
  const declined = link?.status === "declined";
  const pendingVideo = link?.status === "pending_video";
  const noLink = !link;

  const athleteName = link?.athlete?.name ?? "your athlete";
  const relationshipLabel = link?.relationship
    ? RELATIONSHIP_LABEL[link.relationship] ?? "Guardian"
    : "Guardian";
  const greetingFirstName = me?.name?.split(" ")[0] ?? "there";

  const recentOutreach = useMemo(() => outreach.slice(0, 4), [outreach]);
  const totalUnread = outreach.reduce(
    (acc, o) => acc + (o.unreadCount || 0),
    0,
  );

  if (loading && !me) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={theme.text} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <ScrollView
        style={{ flex: 1 }}
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
        <View style={styles.header}>
          <Text style={styles.eyebrow}>GUARDIAN</Text>
          <Text style={styles.greeting}>Hi, {greetingFirstName}.</Text>
          <Text style={styles.subhead}>
            Watch over {athleteName}&apos;s recruiting journey.
          </Text>
        </View>

        {error && (
          <View style={styles.errorPill}>
            <Ionicons
              name="cloud-offline-outline"
              size={14}
              color={semantic.errorLight}
            />
            <Text style={styles.errorPillText}>
              Some data couldn&apos;t be refreshed.
            </Text>
          </View>
        )}

        {/* Link status — the headline */}
        {approved ? (
          <ApprovedHero
            athleteName={athleteName}
            relationshipLabel={relationshipLabel}
            approvedAt={link?.decided_at}
            avatarUrl={link?.athlete?.avatar_url}
          />
        ) : pendingReview ? (
          <StatusHero
            tone="warning"
            title="Submitted for review"
            subtitle={`Admin is reviewing your declaration for ${athleteName}. Usually within 24 hours.`}
            cta="Re-record video"
            onCta={() => router.push("/guardian-link")}
          />
        ) : declined ? (
          <StatusHero
            tone="error"
            title="Link declined"
            subtitle={
              link?.admin_notes
                ? `Admin note: "${link.admin_notes}". Restart your link below.`
                : `Admin couldn't verify your link with ${athleteName}.`
            }
            cta="Start over"
            onCta={() => router.push("/guardian-link")}
          />
        ) : pendingVideo ? (
          <StatusHero
            tone="info"
            title="Finish your declaration"
            subtitle={`You scanned ${athleteName}'s QR — record your declaration video to complete the link.`}
            cta="Continue"
            onCta={() => router.push("/guardian-link")}
          />
        ) : noLink ? (
          <StatusHero
            tone="info"
            title="Link your athlete"
            subtitle="Scan your athlete's QR code to start the guardian verification."
            cta="Get started"
            onCta={() => router.push("/guardian-link")}
          />
        ) : null}

        {/* Verification badges */}
        <View style={styles.verificationRow}>
          <VerificationChip
            label="Identity"
            ok={kycApproved}
            okText="Verified"
            pendingText="Pending"
          />
          <VerificationChip
            label="Guardian link"
            ok={approved}
            okText="Approved"
            pendingText={
              declined
                ? "Declined"
                : pendingReview
                  ? "In review"
                  : pendingVideo
                    ? "Video due"
                    : "Not started"
            }
          />
        </View>

        {/* Who's scouting */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionLabel}>Who&apos;s scouting your athlete</Text>
          {outreach.length > 0 && (
            <Pressable
              onPress={() => router.push("/(tabs)/matches")}
              hitSlop={6}
            >
              <Text style={styles.sectionLink}>
                See all{totalUnread > 0 ? ` (${totalUnread} new)` : ""}
              </Text>
            </Pressable>
          )}
        </View>

        {outreach.length === 0 ? (
          <View style={styles.emptyCard}>
            <Ionicons
              name="search-outline"
              size={26}
              color={theme.textMuted}
            />
            <Text style={styles.emptyTitle}>No recruiter outreach yet</Text>
            <Text style={styles.emptySub}>
              Coaches and recruiters who reach out to {athleteName} will appear
              here.
            </Text>
          </View>
        ) : (
          <View style={styles.outreachList}>
            {recentOutreach.map((o) => (
              <Pressable
                key={o.id}
                style={({ pressed }) => [
                  styles.outreachRow,
                  pressed && styles.pressed,
                ]}
                onPress={() => router.push("/(tabs)/matches")}
                accessibilityRole="button"
              >
                <View style={styles.outreachIcon}>
                  <Ionicons
                    name={o.recruiterRole === "Coach" ? "school" : "briefcase"}
                    size={18}
                    color={theme.text}
                  />
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <View style={styles.outreachNameRow}>
                    <Text style={styles.outreachName} numberOfLines={1}>
                      {o.recruiterName || "Recruiter"}
                    </Text>
                    {o.verified && (
                      <Ionicons
                        name="checkmark-circle"
                        size={13}
                        color={semantic.success}
                      />
                    )}
                  </View>
                  <Text style={styles.outreachMeta} numberOfLines={1}>
                    {[o.recruiterRole, o.organization]
                      .filter(Boolean)
                      .join(" · ")}
                  </Text>
                  <Text style={styles.outreachSnippet} numberOfLines={1}>
                    {o.message}
                  </Text>
                </View>
                <View style={{ alignItems: "flex-end", gap: 4 }}>
                  <Text style={styles.outreachTime}>{timeAgo(o.sentAt)}</Text>
                  {o.unreadCount > 0 && (
                    <View style={styles.unreadDot}>
                      <Text style={styles.unreadDotText}>{o.unreadCount}</Text>
                    </View>
                  )}
                </View>
              </Pressable>
            ))}
          </View>
        )}

        {/* Quick actions */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionLabel}>Quick actions</Text>
        </View>
        <View style={styles.actionGrid}>
          <ActionTile
            icon="videocam-outline"
            label="Replay declaration"
            onPress={() => router.push("/guardian-link")}
          />
          <ActionTile
            icon="people-outline"
            label="Link details"
            onPress={() => router.push("/guardian-link")}
          />
          <ActionTile
            icon="person-circle-outline"
            label="My profile"
            onPress={() => router.push("/(tabs)/profile")}
          />
          <ActionTile
            icon="settings-outline"
            label="Settings"
            onPress={() => router.push("/settings")}
          />
        </View>
      </ScrollView>
    </View>
  );
}

function ApprovedHero({
  athleteName,
  relationshipLabel,
  approvedAt,
  avatarUrl,
}: {
  athleteName: string;
  relationshipLabel: string;
  approvedAt?: string | null;
  avatarUrl?: string | null;
}) {
  const initials = athleteName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");
  const approvedDate = approvedAt
    ? new Date(approvedAt).toLocaleDateString(undefined, {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : null;
  return (
    <LinearGradient
      colors={["#0a4d8f", brand.primary]}
      style={styles.approvedCard}
    >
      <Animated.View
        entering={ZoomIn.duration(400).springify()}
        style={styles.seal}
      >
        <View style={styles.sealInner}>
          <Ionicons
            name="checkmark"
            size={28}
            color={semantic.successLight}
          />
        </View>
      </Animated.View>
      <Animated.View
        entering={FadeInDown.delay(100).duration(400)}
        style={styles.verifiedPill}
      >
        <Ionicons
          name="shield-checkmark"
          size={11}
          color={semantic.successLight}
        />
        <Text style={styles.verifiedPillText}>VERIFIED GUARDIAN</Text>
      </Animated.View>
      <Animated.View
        entering={FadeInDown.delay(160).duration(400)}
        style={{ alignItems: "center", marginBottom: 14 }}
      >
        <Text style={styles.approvedTitle}>You&apos;re linked!</Text>
      </Animated.View>
      <Animated.View
        entering={FadeIn.delay(220).duration(450)}
        style={styles.credentialRow}
      >
        {avatarUrl ? (
          <Image source={{ uri: avatarUrl }} style={styles.credentialAvatar} />
        ) : (
          <View style={styles.credentialAvatarFallback}>
            <Text style={styles.credentialInitials}>{initials || "A"}</Text>
          </View>
        )}
        <View style={{ flex: 1 }}>
          <Text style={styles.credentialOverline}>ATHLETE</Text>
          <Text style={styles.credentialName} numberOfLines={1}>
            {athleteName}
          </Text>
        </View>
      </Animated.View>
      <View style={styles.credentialDivider} />
      <View style={styles.credentialMetaRow}>
        <Text style={styles.credentialMetaLabel}>Relationship</Text>
        <Text style={styles.credentialMetaValue}>{relationshipLabel}</Text>
      </View>
      {approvedDate && (
        <View style={styles.credentialMetaRow}>
          <Text style={styles.credentialMetaLabel}>Approved on</Text>
          <Text style={styles.credentialMetaValue}>{approvedDate}</Text>
        </View>
      )}
    </LinearGradient>
  );
}

function StatusHero({
  tone,
  title,
  subtitle,
  cta,
  onCta,
}: {
  tone: "info" | "warning" | "error";
  title: string;
  subtitle: string;
  cta: string;
  onCta: () => void;
}) {
  const accent =
    tone === "error"
      ? semantic.error
      : tone === "warning"
        ? semantic.warning
        : semantic.info;
  const icon: IonName =
    tone === "error"
      ? "alert-circle"
      : tone === "warning"
        ? "hourglass"
        : "shield-outline";
  return (
    <View style={[styles.statusCard, { borderLeftColor: accent }]}>
      <View style={[styles.statusIcon, { backgroundColor: `${accent}22` }]}>
        <Ionicons name={icon} size={20} color={accent} />
      </View>
      <Text style={styles.statusTitle}>{title}</Text>
      <Text style={styles.statusSub}>{subtitle}</Text>
      <Pressable
        style={({ pressed }) => [styles.statusCta, pressed && styles.pressed]}
        onPress={onCta}
        accessibilityRole="button"
      >
        <Text style={styles.statusCtaText}>{cta}</Text>
        <Ionicons name="arrow-forward" size={16} color={theme.accentText} />
      </Pressable>
    </View>
  );
}

function VerificationChip({
  label,
  ok,
  okText,
  pendingText,
}: {
  label: string;
  ok: boolean;
  okText: string;
  pendingText: string;
}) {
  return (
    <View style={styles.verifChip}>
      <View
        style={[
          styles.verifDot,
          { backgroundColor: ok ? semantic.success : semantic.warning },
        ]}
      />
      <View style={{ flex: 1 }}>
        <Text style={styles.verifLabel}>{label}</Text>
        <Text style={styles.verifValue}>{ok ? okText : pendingText}</Text>
      </View>
      <Ionicons
        name={ok ? "checkmark-circle" : "time-outline"}
        size={16}
        color={ok ? semantic.success : semantic.warning}
      />
    </View>
  );
}

function ActionTile({
  icon,
  label,
  onPress,
}: {
  icon: IonName;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={({ pressed }) => [styles.actionTile, pressed && styles.pressed]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Ionicons name={icon} size={20} color={theme.text} />
      <Text style={styles.actionTileLabel}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.bg },
  center: {
    flex: 1,
    backgroundColor: theme.bg,
    alignItems: "center",
    justifyContent: "center",
  },
  scrollContent: { paddingHorizontal: 14, paddingTop: 6 },

  header: { paddingHorizontal: 4, paddingBottom: 12 },
  eyebrow: {
    fontSize: 10,
    fontFamily: "Poppins_700Bold",
    letterSpacing: 2,
    color: theme.textMuted,
    marginBottom: 4,
  },
  greeting: {
    fontSize: 28,
    fontFamily: "Poppins_800ExtraBold",
    color: theme.text,
    letterSpacing: -0.6,
  },
  subhead: {
    marginTop: 4,
    fontSize: 13,
    fontFamily: "Poppins_500Medium",
    color: theme.textSecondary,
  },

  errorPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginBottom: 10,
    backgroundColor: "rgba(231,76,60,0.14)",
    borderRadius: 999,
    alignSelf: "flex-start",
  },
  errorPillText: {
    fontSize: 11,
    fontFamily: "Poppins_500Medium",
    color: semantic.errorLight,
  },

  // ── Approved hero ──
  approvedCard: {
    borderRadius: 20,
    paddingTop: 20,
    paddingBottom: 18,
    paddingHorizontal: 18,
    marginBottom: 12,
    alignItems: "center",
  },
  seal: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: "rgba(0,184,148,0.14)",
    borderWidth: 1,
    borderColor: "rgba(85,239,196,0.35)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  sealInner: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "rgba(0,184,148,0.28)",
    alignItems: "center",
    justifyContent: "center",
  },
  verifiedPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "rgba(0,184,148,0.16)",
    borderWidth: 1,
    borderColor: "rgba(85,239,196,0.4)",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    marginBottom: 10,
  },
  verifiedPillText: {
    fontSize: 9,
    fontFamily: "Poppins_700Bold",
    color: semantic.successLight,
    letterSpacing: 1.4,
  },
  approvedTitle: {
    fontSize: 22,
    fontFamily: "Poppins_800ExtraBold",
    color: brand.white,
    letterSpacing: -0.4,
  },
  credentialRow: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "stretch",
    gap: 12,
    backgroundColor: "rgba(255,255,255,0.07)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    borderRadius: 14,
    padding: 12,
  },
  credentialAvatar: { width: 44, height: 44, borderRadius: 22 },
  credentialAvatarFallback: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(0,184,148,0.2)",
    borderWidth: 1.5,
    borderColor: semantic.successLight,
    alignItems: "center",
    justifyContent: "center",
  },
  credentialInitials: {
    fontSize: 15,
    fontFamily: "Poppins_800ExtraBold",
    color: brand.white,
  },
  credentialOverline: {
    fontSize: 9,
    fontFamily: "Poppins_700Bold",
    color: "rgba(255,255,255,0.5)",
    letterSpacing: 2,
  },
  credentialName: {
    fontSize: 15,
    fontFamily: "Poppins_700Bold",
    color: brand.white,
  },
  credentialDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: "rgba(255,255,255,0.16)",
    alignSelf: "stretch",
    marginTop: 10,
    marginBottom: 6,
  },
  credentialMetaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 4,
    alignSelf: "stretch",
  },
  credentialMetaLabel: {
    fontSize: 11,
    fontFamily: "Poppins_500Medium",
    color: "rgba(255,255,255,0.55)",
  },
  credentialMetaValue: {
    fontSize: 12,
    fontFamily: "Poppins_700Bold",
    color: brand.white,
  },

  // ── Non-approved status hero ──
  statusCard: {
    backgroundColor: theme.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: theme.cardBorder,
    borderLeftWidth: 4,
    padding: 16,
    marginBottom: 12,
    gap: 8,
  },
  statusIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
  },
  statusTitle: {
    fontSize: 16,
    fontFamily: "Poppins_700Bold",
    color: theme.text,
    marginTop: 2,
  },
  statusSub: {
    fontSize: 12.5,
    fontFamily: "Poppins_400Regular",
    color: theme.textSecondary,
    lineHeight: 18,
  },
  statusCta: {
    marginTop: 6,
    height: 42,
    borderRadius: 21,
    backgroundColor: theme.accent,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    alignSelf: "flex-start",
    paddingHorizontal: 16,
  },
  statusCtaText: {
    fontSize: 13,
    fontFamily: "Poppins_700Bold",
    color: theme.accentText,
  },

  // ── Verification chips ──
  verificationRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 8,
  },
  verifChip: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: theme.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.cardBorder,
  },
  verifDot: { width: 8, height: 8, borderRadius: 4 },
  verifLabel: {
    fontSize: 10,
    fontFamily: "Poppins_600SemiBold",
    color: theme.textMuted,
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  verifValue: {
    fontSize: 13,
    fontFamily: "Poppins_700Bold",
    color: theme.text,
  },

  // ── Sections ──
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 18,
    marginBottom: 8,
    paddingHorizontal: 2,
  },
  sectionLabel: {
    fontSize: 11,
    fontFamily: "Poppins_700Bold",
    letterSpacing: 1.5,
    color: theme.textMuted,
    textTransform: "uppercase",
  },
  sectionLink: {
    fontSize: 12,
    fontFamily: "Poppins_600SemiBold",
    color: theme.text,
  },

  emptyCard: {
    backgroundColor: theme.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.cardBorder,
    padding: 18,
    alignItems: "center",
    gap: 6,
  },
  emptyTitle: {
    marginTop: 6,
    fontSize: 13.5,
    fontFamily: "Poppins_700Bold",
    color: theme.text,
  },
  emptySub: {
    fontSize: 11.5,
    fontFamily: "Poppins_400Regular",
    color: theme.textMuted,
    textAlign: "center",
    lineHeight: 17,
  },

  // ── Outreach ──
  outreachList: { gap: 8 },
  outreachRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    backgroundColor: theme.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.cardBorder,
    padding: 12,
  },
  outreachIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: theme.surfaceSecondary,
    alignItems: "center",
    justifyContent: "center",
  },
  outreachNameRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  outreachName: {
    fontSize: 13,
    fontFamily: "Poppins_700Bold",
    color: theme.text,
    maxWidth: 180,
  },
  outreachMeta: {
    fontSize: 11,
    fontFamily: "Poppins_500Medium",
    color: theme.textMuted,
  },
  outreachSnippet: {
    fontSize: 12,
    fontFamily: "Poppins_400Regular",
    color: theme.textSecondary,
    marginTop: 2,
  },
  outreachTime: {
    fontSize: 10,
    fontFamily: "Poppins_500Medium",
    color: theme.textMuted,
  },
  unreadDot: {
    minWidth: 18,
    height: 18,
    paddingHorizontal: 5,
    borderRadius: 9,
    backgroundColor: semantic.error,
    alignItems: "center",
    justifyContent: "center",
  },
  unreadDotText: {
    fontSize: 10,
    color: brand.white,
    fontFamily: "Poppins_700Bold",
  },

  // ── Action tiles ──
  actionGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  actionTile: {
    flex: 1,
    minWidth: "47%",
    backgroundColor: theme.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.cardBorder,
    paddingVertical: 14,
    paddingHorizontal: 14,
    gap: 8,
    alignItems: "flex-start",
  },
  actionTileLabel: {
    fontSize: 12.5,
    fontFamily: "Poppins_600SemiBold",
    color: theme.text,
  },

  pressed: { opacity: 0.8 },
});
