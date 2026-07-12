import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useSelector } from "react-redux";
import { Ionicons } from "@expo/vector-icons";
import { VideoView, useVideoPlayer } from "expo-video";
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
  guardianLinksService,
  GuardianLink,
  GuardianLinkStatus,
} from "@/services/guardianLinks";
import { useRoleHomeRedirect } from "@/lib/roleRoutes";

type LinkWithVideo = GuardianLink & { video_url?: string };

const STATUS_TABS: { id: GuardianLinkStatus | "all"; label: string }[] = [
  { id: "pending_admin", label: "In review" },
  { id: "approved", label: "Approved" },
  { id: "declined", label: "Declined" },
  { id: "all", label: "All" },
];

function relationshipLabel(r: string): string {
  return (
    ({
      parent: "Parent",
      legal_guardian: "Legal guardian",
      step_parent: "Step-parent",
      sibling: "Sibling",
      aunt_uncle: "Aunt / Uncle",
      grandparent: "Grandparent",
      other: "Other",
    } as Record<string, string>)[r] ?? r
  );
}

export default function AdminReviewsTab() {
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

  const [tab, setTab] = useState<GuardianLinkStatus | "all">("pending_admin");
  const [links, setLinks] = useState<LinkWithVideo[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState<{
    id: string;
    action: "approve" | "decline";
  } | null>(null);
  const [notesPrompt, setNotesPrompt] = useState<{
    title: string;
    confirmLabel: string;
    destructive: boolean;
    onConfirm: (notes?: string) => void;
  } | null>(null);
  const [notesDraft, setNotesDraft] = useState("");

  const refresh = useCallback(
    async (status: GuardianLinkStatus | "all", mode: "initial" | "refresh") => {
      if (mode === "initial") setLoading(true);
      else setRefreshing(true);
      setLoadError(false);
      try {
        const list = await guardianLinksService.adminList(
          status === "all" ? undefined : status,
        );
        setLinks(list);
      } catch {
        // Don't fall through to "Queue is clear" — show a retry state.
        setLoadError(true);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [],
  );

  const redirecting = useRoleHomeRedirect(["admin"]);

  useFocusEffect(
    useCallback(() => {
      if (user?.role !== "admin") return;
      refresh(tab, "initial");
    }, [user?.role, tab, refresh]),
  );

  const decide = useCallback(
    (link: LinkWithVideo, decision: "approved" | "declined") => {
      if (busy) return;
      const title =
        decision === "approved" ? "Approve link?" : "Decline link?";
      const confirmLabel = decision === "approved" ? "Approve" : "Decline";
      const destructive = decision === "declined";
      const run = async (notes?: string) => {
        setBusy({
          id: link.id,
          action: decision === "approved" ? "approve" : "decline",
        });
        try {
          if (decision === "approved") {
            await guardianLinksService.adminApprove(link.id, notes);
          } else {
            await guardianLinksService.adminDecline(link.id, notes);
          }
          await refresh(tab, "refresh");
        } catch (err: any) {
          const msg =
            err?.response?.data?.message ??
            err?.message ??
            "Action failed.";
          Alert.alert("Could not save", String(msg));
        } finally {
          setBusy(null);
        }
      };
      if (Platform.OS === "ios" && typeof Alert.prompt === "function") {
        Alert.prompt(
          title,
          "Optional notes (visible to admin only).",
          [
            { text: "Cancel", style: "cancel" },
            {
              text: confirmLabel,
              style: destructive ? "destructive" : "default",
              onPress: (notes?: string) => run(notes || undefined),
            },
          ],
          "plain-text",
          "",
        );
        return;
      }
      // Android has no Alert.prompt — use an in-app modal so admins can
      // still attach optional notes to the decision.
      setNotesDraft("");
      setNotesPrompt({ title, confirmLabel, destructive, onConfirm: run });
    },
    [busy, refresh, tab],
  );

  if (!fontsLoaded) return null;
  if (redirecting) return null;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={styles.eyebrow}>QUEUE</Text>
        <Text style={styles.title}>Guardian reviews</Text>
      </View>

      <View style={styles.tabs}>
        {STATUS_TABS.map((t) => (
          <Pressable
            key={t.id}
            onPress={() => setTab(t.id)}
            style={({ pressed }) => [
              styles.tabPill,
              tab === t.id && styles.tabPillActive,
              pressed && { opacity: 0.85 },
            ]}
          >
            <Text
              style={[
                styles.tabPillText,
                tab === t.id && styles.tabPillTextActive,
              ]}
            >
              {t.label}
            </Text>
          </Pressable>
        ))}
      </View>

      {loading && links.length === 0 ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={theme.text} />
        </View>
      ) : loadError ? (
        <View style={styles.center}>
          <Ionicons
            name="cloud-offline-outline"
            size={48}
            color={theme.textMuted}
          />
          <Text style={styles.emptyTitle}>Couldn&apos;t load</Text>
          <Text style={styles.emptySub}>
            The review queue didn&apos;t load. Check your connection.
          </Text>
          <Pressable style={styles.retry} onPress={() => refresh(tab, "initial")}>
            <Text style={styles.retryText}>Try again</Text>
          </Pressable>
        </View>
      ) : links.length === 0 ? (
        <View style={styles.center}>
          <Ionicons
            name="checkmark-done-outline"
            size={48}
            color={theme.textMuted}
          />
          <Text style={styles.emptyTitle}>Queue is clear</Text>
          <Text style={styles.emptySub}>
            No guardian links match this filter.
          </Text>
        </View>
      ) : (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={[
            styles.scrollContent,
            { paddingBottom: insets.bottom + 24 },
          ]}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => refresh(tab, "refresh")}
              tintColor={theme.text}
            />
          }
          showsVerticalScrollIndicator={false}
        >
          {links.map((link) => (
            <ReviewCard
              key={link.id}
              link={link}
              busyAction={busy?.id === link.id ? busy.action : null}
              onApprove={() => decide(link, "approved")}
              onDecline={() => decide(link, "declined")}
            />
          ))}
        </ScrollView>
      )}

      {notesPrompt && (
        <Modal
          transparent
          animationType="fade"
          visible
          onRequestClose={() => setNotesPrompt(null)}
        >
          <View style={styles.modalBackdrop}>
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>{notesPrompt.title}</Text>
              <Text style={styles.modalSub}>
                Optional notes (visible to admin only).
              </Text>
              <TextInput
                style={styles.modalInput}
                value={notesDraft}
                onChangeText={setNotesDraft}
                placeholder="Notes"
                placeholderTextColor={theme.inputPlaceholder}
                multiline
              />
              <View style={styles.modalActions}>
                <Pressable
                  style={styles.modalCancelBtn}
                  onPress={() => setNotesPrompt(null)}
                >
                  <Text style={styles.modalCancelText}>Cancel</Text>
                </Pressable>
                <Pressable
                  style={[
                    styles.modalConfirmBtn,
                    notesPrompt.destructive && styles.modalConfirmBtnDestructive,
                  ]}
                  onPress={() => {
                    const { onConfirm } = notesPrompt;
                    const notes = notesDraft.trim();
                    setNotesPrompt(null);
                    onConfirm(notes || undefined);
                  }}
                >
                  <Text
                    style={[
                      styles.modalConfirmText,
                      notesPrompt.destructive &&
                        styles.modalConfirmTextDestructive,
                    ]}
                  >
                    {notesPrompt.confirmLabel}
                  </Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>
      )}
    </View>
  );
}

function ReviewCard({
  link,
  busyAction,
  onApprove,
  onDecline,
}: {
  link: LinkWithVideo;
  busyAction: "approve" | "decline" | null;
  onApprove: () => void;
  onDecline: () => void;
}) {
  const player = useVideoPlayer(link.video_url ?? null, (p) => {
    p.loop = false;
    p.muted = true;
  });
  const isPending = link.status === "pending_admin";

  return (
    <View style={styles.card}>
      {/* identity row */}
      <View style={styles.identityRow}>
        <View style={styles.idCol}>
          <Text style={styles.idLabel}>GUARDIAN</Text>
          <View style={styles.peerRow}>
            {link.guardian?.avatar_url ? (
              <Image
                source={{ uri: link.guardian.avatar_url }}
                style={styles.avatar}
              />
            ) : (
              <View style={styles.avatarFallback}>
                <Ionicons
                  name="person"
                  size={16}
                  color={theme.textMuted}
                />
              </View>
            )}
            <View style={{ flex: 1 }}>
              <Text style={styles.peerName} numberOfLines={1}>
                {link.guardian?.name ?? "Unknown"}
              </Text>
              <Text style={styles.peerSub} numberOfLines={1}>
                {relationshipLabel(link.relationship)}
              </Text>
            </View>
          </View>
        </View>
        <Ionicons
          name="arrow-forward"
          size={16}
          color={theme.textMuted}
          style={{ marginHorizontal: 6, marginTop: 22 }}
        />
        <View style={styles.idCol}>
          <Text style={styles.idLabel}>ATHLETE</Text>
          <View style={styles.peerRow}>
            {link.athlete?.avatar_url ? (
              <Image
                source={{ uri: link.athlete.avatar_url }}
                style={styles.avatar}
              />
            ) : (
              <View style={styles.avatarFallback}>
                <Ionicons name="trophy" size={14} color={theme.textMuted} />
              </View>
            )}
            <View style={{ flex: 1 }}>
              <Text style={styles.peerName} numberOfLines={1}>
                {link.athlete?.name ?? "Unknown"}
              </Text>
              <Text style={styles.peerSub} numberOfLines={1}>
                Athlete
              </Text>
            </View>
          </View>
        </View>
      </View>

      {/* declaration video */}
      {link.video_url ? (
        <View style={styles.videoFrame}>
          <VideoView
            player={player}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            nativeControls
          />
        </View>
      ) : (
        <View style={styles.videoFramePlaceholder}>
          <Ionicons name="videocam-off-outline" size={28} color={theme.textMuted} />
          <Text style={styles.peerSub}>No video</Text>
        </View>
      )}

      {/* status / notes */}
      <View style={styles.statusRow}>
        <View
          style={[
            styles.statusPill,
            link.status === "approved" && styles.statusPillApproved,
            link.status === "declined" && styles.statusPillDeclined,
          ]}
        >
          <Text
            style={[
              styles.statusPillText,
              link.status === "approved" && styles.statusPillTextApproved,
              link.status === "declined" && styles.statusPillTextDeclined,
            ]}
          >
            {link.status?.replace("_", " ").toUpperCase()}
          </Text>
        </View>
        {!!link.admin_notes && (
          <Text style={styles.notesText} numberOfLines={2}>
            “{link.admin_notes}”
          </Text>
        )}
      </View>

      {/* decision buttons */}
      {isPending && (
        <View style={styles.actionsRow}>
          <Pressable
            style={[styles.declineBtn, !!busyAction && { opacity: 0.5 }]}
            onPress={onDecline}
            disabled={!!busyAction}
          >
            {busyAction === "decline" ? (
              <ActivityIndicator color={semantic.error} />
            ) : (
              <>
                <Ionicons name="close" size={18} color={semantic.error} />
                <Text style={styles.declineBtnText}>Decline</Text>
              </>
            )}
          </Pressable>
          <Pressable
            style={[styles.approveBtn, !!busyAction && { opacity: 0.5 }]}
            onPress={onApprove}
            disabled={!!busyAction}
          >
            {busyAction === "approve" ? (
              <ActivityIndicator color={theme.accentText} />
            ) : (
              <>
                <Ionicons name="checkmark" size={18} color={theme.accentText} />
                <Text style={styles.approveBtnText}>Approve</Text>
              </>
            )}
          </Pressable>
        </View>
      )}
    </View>
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

  tabs: {
    flexDirection: "row",
    paddingHorizontal: 14,
    gap: 6,
    marginBottom: 10,
  },
  tabPill: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.cardBorder,
  },
  tabPillActive: {
    backgroundColor: theme.accent,
    borderColor: theme.accent,
  },
  tabPillText: {
    fontSize: 12,
    fontFamily: "Poppins_600SemiBold",
    color: theme.textSecondary,
  },
  tabPillTextActive: { color: theme.accentText },

  scrollContent: { paddingHorizontal: 14 },

  card: {
    backgroundColor: theme.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: theme.cardBorder,
    padding: 14,
    marginBottom: 12,
    gap: 12,
  },
  identityRow: { flexDirection: "row", alignItems: "flex-start", gap: 4 },
  idCol: { flex: 1 },
  idLabel: {
    fontSize: 9,
    fontFamily: "Poppins_700Bold",
    letterSpacing: 1.5,
    color: theme.textMuted,
    marginBottom: 6,
  },
  peerRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  avatar: { width: 32, height: 32, borderRadius: 16 },
  avatarFallback: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: theme.surfaceSecondary,
    alignItems: "center",
    justifyContent: "center",
  },
  peerName: {
    fontSize: 13,
    fontFamily: "Poppins_700Bold",
    color: theme.text,
  },
  peerSub: {
    fontSize: 11,
    fontFamily: "Poppins_500Medium",
    color: theme.textMuted,
  },

  videoFrame: {
    aspectRatio: 16 / 9,
    borderRadius: 10,
    overflow: "hidden",
    backgroundColor: "#000",
  },
  videoFramePlaceholder: {
    aspectRatio: 16 / 9,
    borderRadius: 10,
    backgroundColor: theme.surfaceSecondary,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },

  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  statusPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: theme.surfaceSecondary,
  },
  statusPillApproved: { backgroundColor: "rgba(0,184,148,0.18)" },
  statusPillDeclined: { backgroundColor: "rgba(231,76,60,0.18)" },
  statusPillText: {
    fontSize: 9,
    fontFamily: "Poppins_700Bold",
    letterSpacing: 1,
    color: theme.textSecondary,
  },
  statusPillTextApproved: { color: semantic.successLight },
  statusPillTextDeclined: { color: semantic.errorLight },
  notesText: {
    flex: 1,
    fontSize: 11,
    fontFamily: "Poppins_400Regular",
    color: theme.textSecondary,
    fontStyle: "italic",
  },

  actionsRow: { flexDirection: "row", gap: 8 },
  declineBtn: {
    flex: 1,
    height: 42,
    borderRadius: 21,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: theme.surfaceSecondary,
    borderWidth: 1,
    borderColor: "rgba(231,76,60,0.3)",
  },
  declineBtnText: {
    fontSize: 13,
    fontFamily: "Poppins_700Bold",
    color: semantic.error,
  },
  approveBtn: {
    flex: 1.4,
    height: 42,
    borderRadius: 21,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: theme.accent,
  },
  approveBtnText: {
    fontSize: 13,
    fontFamily: "Poppins_700Bold",
    color: theme.accentText,
  },

  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 6 },
  emptyTitle: {
    marginTop: 8,
    fontSize: 16,
    fontFamily: "Poppins_700Bold",
    color: theme.text,
  },
  emptySub: {
    fontSize: 12,
    fontFamily: "Poppins_500Medium",
    color: theme.textMuted,
    textAlign: "center",
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

  modalBackdrop: {
    flex: 1,
    backgroundColor: theme.overlay,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  modalCard: {
    width: "100%",
    backgroundColor: theme.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: theme.cardBorder,
    padding: 18,
    gap: 10,
  },
  modalTitle: {
    fontSize: 16,
    fontFamily: "Poppins_700Bold",
    color: theme.text,
  },
  modalSub: {
    fontSize: 12,
    fontFamily: "Poppins_500Medium",
    color: theme.textMuted,
  },
  modalInput: {
    minHeight: 72,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: theme.inputBorder,
    backgroundColor: theme.inputBg,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
    fontFamily: "Poppins_500Medium",
    color: theme.inputText,
    textAlignVertical: "top",
  },
  modalActions: { flexDirection: "row", gap: 8, marginTop: 4 },
  modalCancelBtn: {
    flex: 1,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.surfaceSecondary,
    borderWidth: 1,
    borderColor: theme.cardBorder,
  },
  modalCancelText: {
    fontSize: 13,
    fontFamily: "Poppins_700Bold",
    color: theme.textSecondary,
  },
  modalConfirmBtn: {
    flex: 1.4,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.accent,
  },
  modalConfirmBtnDestructive: { backgroundColor: semantic.error },
  modalConfirmText: {
    fontSize: 13,
    fontFamily: "Poppins_700Bold",
    color: theme.accentText,
  },
  modalConfirmTextDestructive: { color: "#FFFFFF" },
});
