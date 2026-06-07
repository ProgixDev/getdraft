import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  StyleSheet,
  Text,
  ScrollView,
  Pressable,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { Image as ExpoImage } from "expo-image";
import { useSelector } from "react-redux";
import { useFocusEffect, useRouter } from "expo-router";
import type { Socket } from "socket.io-client";
import {
  useFonts,
  Poppins_500Medium,
  Poppins_400Regular,
  Poppins_600SemiBold,
  Poppins_700Bold,
} from "@expo-google-fonts/poppins";
import { brand, semantic, theme } from "@/config/colors";
import { RootState } from "@/store";
import type { RecruiterParentOutreach } from "@/constants/parentData";
import type { AthleteMatch } from "@/constants/discoverData";
import { matchesService } from "@/services/matches";
import { outreachService } from "@/services/outreach";
import {
  conversationsService,
  type ConversationItem,
} from "@/services/conversations";
import { chatService } from "@/services/chat";
import { discoverService } from "@/services/discover";

type DraftBoardView = "received" | "sent" | "matches" | "messages";

type IonName = React.ComponentProps<typeof Ionicons>["name"];

interface PeerSummary {
  id: string;
  name: string;
  avatar_url?: string | null;
  role?: string | null;
  location?: string | null;
}

interface ReceivedRow {
  swiper: PeerSummary;
  created_at: string;
}

interface SentRow {
  swiped: PeerSummary;
  created_at: string;
  matched: boolean;
}

function formatMessageTime(iso?: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const diffMs = Date.now() - date.getTime();
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return "now";
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d`;
  return date.toLocaleDateString();
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

export default function MatchesScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const user = useSelector((state: RootState) => state.auth.user);
  const [fontsLoaded] = useFonts({
    Poppins_500Medium,
    Poppins_400Regular,
    Poppins_600SemiBold,
    Poppins_700Bold,
  });

  const isParent = user?.role === "parent";

  const [view, setView] = useState<DraftBoardView>(
    isParent ? "matches" : "received",
  );
  const [athleteMatches, setAthleteMatches] = useState<AthleteMatch[]>([]);
  const [parentMessages, setParentMessages] = useState<RecruiterParentOutreach[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [inbox, setInbox] = useState<ConversationItem[]>([]);
  const [inboxLoading, setInboxLoading] = useState(false);
  const [inboxRefreshing, setInboxRefreshing] = useState(false);
  const [inboxError, setInboxError] = useState(false);
  const inboxLoadedOnce = useRef(false);

  const [received, setReceived] = useState<ReceivedRow[]>([]);
  const [receivedLoading, setReceivedLoading] = useState(false);
  const [receivedRefreshing, setReceivedRefreshing] = useState(false);
  const [receivedError, setReceivedError] = useState(false);
  const receivedLoadedOnce = useRef(false);

  const [sent, setSent] = useState<SentRow[]>([]);
  const [sentLoading, setSentLoading] = useState(false);
  const [sentRefreshing, setSentRefreshing] = useState(false);
  const [sentError, setSentError] = useState(false);
  const sentLoadedOnce = useRef(false);

  const [inFlight, setInFlight] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);
    const fetcher = isParent
      ? outreachService.getOutreachList()
      : matchesService.getMatches();
    fetcher
      .then((rows) => {
        if (cancelled) return;
        if (isParent) setParentMessages((rows ?? []) as RecruiterParentOutreach[]);
        else setAthleteMatches((rows ?? []) as AthleteMatch[]);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isParent]);

  const totalUnread = useMemo(
    () => athleteMatches.reduce((sum, m) => sum + (m.unreadCount || 0), 0),
    [athleteMatches],
  );

  const totalInboxUnread = useMemo(
    () => inbox.reduce((sum, c) => sum + (c.unreadCount || 0), 0),
    [inbox],
  );

  const sentPending = useMemo(() => sent.filter((s) => !s.matched), [sent]);

  const loadInbox = useCallback(
    async (mode: "initial" | "refresh" | "silent") => {
      try {
        if (mode === "initial") setInboxLoading(true);
        if (mode === "refresh") setInboxRefreshing(true);
        setInboxError(false);
        const rows = await conversationsService.getInbox();
        setInbox(rows ?? []);
        inboxLoadedOnce.current = true;
      } catch {
        setInboxError(true);
      } finally {
        setInboxLoading(false);
        setInboxRefreshing(false);
      }
    },
    [],
  );

  const loadReceived = useCallback(
    async (mode: "initial" | "refresh" | "silent") => {
      try {
        if (mode === "initial") setReceivedLoading(true);
        if (mode === "refresh") setReceivedRefreshing(true);
        setReceivedError(false);
        const rows = (await discoverService.whoDraftedMe()) as ReceivedRow[];
        setReceived(
          Array.isArray(rows) ? rows.filter((r) => r?.swiper?.id) : [],
        );
        receivedLoadedOnce.current = true;
      } catch {
        setReceivedError(true);
      } finally {
        setReceivedLoading(false);
        setReceivedRefreshing(false);
      }
    },
    [],
  );

  const loadSent = useCallback(
    async (mode: "initial" | "refresh" | "silent") => {
      try {
        if (mode === "initial") setSentLoading(true);
        if (mode === "refresh") setSentRefreshing(true);
        setSentError(false);
        const rows = (await discoverService.myDrafts()) as SentRow[];
        setSent(Array.isArray(rows) ? rows.filter((r) => r?.swiped?.id) : []);
        sentLoadedOnce.current = true;
      } catch {
        setSentError(true);
      } finally {
        setSentLoading(false);
        setSentRefreshing(false);
      }
    },
    [],
  );

  useFocusEffect(
    useCallback(() => {
      if (view !== "messages") return;
      loadInbox(inboxLoadedOnce.current ? "silent" : "initial");
    }, [view, loadInbox]),
  );

  useFocusEffect(
    useCallback(() => {
      if (isParent) return;
      if (view !== "received") return;
      loadReceived(receivedLoadedOnce.current ? "silent" : "initial");
    }, [isParent, view, loadReceived]),
  );

  useFocusEffect(
    useCallback(() => {
      if (isParent) return;
      if (view !== "sent") return;
      loadSent(sentLoadedOnce.current ? "silent" : "initial");
    }, [isParent, view, loadSent]),
  );

  useEffect(() => {
    if (view !== "messages") return;
    let cancelled = false;
    let activeSocket: Socket | null = null;
    const onNewDm = (msg: any) => {
      if (cancelled || !msg?.conversationId) return;
      const incomingFromMe = msg.senderId === user?.id;
      setInbox((prev) => {
        const idx = prev.findIndex((c) => c.id === msg.conversationId);
        if (idx === -1) {
          loadInbox("silent");
          return prev;
        }
        const target = prev[idx];
        const updated: ConversationItem = {
          ...target,
          lastMessage: msg.text ?? target.lastMessage,
          lastMessageAt: msg.createdAt ?? target.lastMessageAt,
          unreadCount: incomingFromMe
            ? target.unreadCount
            : (target.unreadCount || 0) + 1,
        };
        const next = [updated, ...prev.filter((_, i) => i !== idx)];
        return next;
      });
    };
    chatService.connectSocket().then((s) => {
      if (cancelled) return;
      activeSocket = s;
      s.off("new_dm", onNewDm);
      s.on("new_dm", onNewDm);
    });
    return () => {
      cancelled = true;
      activeSocket?.off("new_dm", onNewDm);
    };
  }, [view, user?.id, loadInbox]);

  const handleAccept = useCallback(
    async (swiperId: string, name: string) => {
      if (inFlight) return;
      setInFlight(swiperId);
      try {
        const res = await discoverService.swipe(swiperId, "draft");
        setReceived((prev) => prev.filter((r) => r.swiper.id !== swiperId));
        if (res.matched) {
          Alert.alert("Game On!", `You matched with ${name}.`);
        }
      } catch (e: any) {
        Alert.alert(
          "Couldn't accept",
          e?.response?.data?.message || "Please try again.",
        );
      } finally {
        setInFlight(null);
      }
    },
    [inFlight],
  );

  const handleRefuse = useCallback(
    async (swiperId: string) => {
      if (inFlight) return;
      setInFlight(swiperId);
      try {
        await discoverService.swipe(swiperId, "pass");
        setReceived((prev) => prev.filter((r) => r.swiper.id !== swiperId));
      } catch (e: any) {
        Alert.alert(
          "Couldn't refuse",
          e?.response?.data?.message || "Please try again.",
        );
      } finally {
        setInFlight(null);
      }
    },
    [inFlight],
  );

  const handleWithdraw = useCallback(
    (peer: PeerSummary) => {
      if (inFlight) return;
      Alert.alert(
        "Withdraw draft",
        `Withdraw your draft for ${peer.name || "this user"}?`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Withdraw",
            style: "destructive",
            onPress: async () => {
              setInFlight(peer.id);
              try {
                await discoverService.withdrawDraft(peer.id);
                setSent((prev) => prev.filter((s) => s.swiped.id !== peer.id));
              } catch (e: any) {
                Alert.alert(
                  "Couldn't withdraw",
                  e?.response?.data?.message || "Please try again.",
                );
              } finally {
                setInFlight(null);
              }
            },
          },
        ],
      );
    },
    [inFlight],
  );

  const handleChatWith = useCallback(
    async (peer: PeerSummary) => {
      if (inFlight) return;
      setInFlight(peer.id);
      try {
        const conv = await conversationsService.getOrCreate(peer.id);
        router.push({
          pathname: "/dm/[conversationId]",
          params: {
            conversationId: conv.id,
            otherName: conv.otherUser?.name || peer.name || "",
            otherAvatarUrl: conv.otherUser?.avatarUrl || peer.avatar_url || "",
            otherRole: conv.otherUser?.role || peer.role || "",
          },
        });
      } catch (e: any) {
        Alert.alert(
          "Couldn't open chat",
          e?.response?.data?.message || "Please try again.",
        );
      } finally {
        setInFlight(null);
      }
    },
    [inFlight, router],
  );

  if (!fontsLoaded) return null;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={styles.title}>
          {isParent ? "Recruiter Outreach" : "Draft Board"}
        </Text>
        {view === "matches" && !isParent && totalUnread > 0 && (
          <View style={styles.headerBadge}>
            <Text style={styles.headerBadgeText}>{totalUnread} new</Text>
          </View>
        )}
        {view === "messages" && (
          <Pressable
            style={({ pressed }) => [
              styles.composeBtn,
              pressed && { opacity: 0.85 },
            ]}
            onPress={() => router.push("/new-message")}
            accessibilityLabel="New message"
          >
            <Ionicons name="create-outline" size={18} color={brand.white} />
          </Pressable>
        )}
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.tabsScroll}
        contentContainerStyle={styles.tabsRow}
      >
        {isParent ? (
          <>
            <TabPill
              icon="trophy"
              label="Matches"
              active={view === "matches"}
              onPress={() => setView("matches")}
            />
            <TabPill
              icon="chatbubbles"
              label="Messages"
              active={view === "messages"}
              onPress={() => setView("messages")}
              badge={totalInboxUnread}
            />
          </>
        ) : (
          <>
            <TabPill
              icon="download-outline"
              label="Received"
              active={view === "received"}
              onPress={() => setView("received")}
              badge={received.length}
            />
            <TabPill
              icon="send-outline"
              label="Sent"
              active={view === "sent"}
              onPress={() => setView("sent")}
              badge={sentPending.length}
            />
            <TabPill
              icon="trophy"
              label="Matches"
              active={view === "matches"}
              onPress={() => setView("matches")}
            />
            <TabPill
              icon="chatbubbles"
              label="Messages"
              active={view === "messages"}
              onPress={() => setView("messages")}
              badge={totalInboxUnread}
            />
          </>
        )}
      </ScrollView>

      {view === "messages" ? (
        <MessagesInbox
          inbox={inbox}
          loading={inboxLoading}
          refreshing={inboxRefreshing}
          error={inboxError}
          insetsBottom={insets.bottom}
          onRefresh={() => loadInbox("refresh")}
          onCompose={() => router.push("/new-message")}
          onOpen={(c) =>
            router.push({
              pathname: "/dm/[conversationId]",
              params: {
                conversationId: c.id,
                otherName: c.otherUser.name,
                otherAvatarUrl: c.otherUser.avatarUrl ?? "",
                otherRole: c.otherUser.role ?? "",
              },
            })
          }
        />
      ) : view === "received" && !isParent ? (
        <ReceivedList
          rows={received}
          loading={receivedLoading}
          refreshing={receivedRefreshing}
          error={receivedError}
          insetsBottom={insets.bottom}
          inFlightId={inFlight}
          onRefresh={() => loadReceived("refresh")}
          onAccept={handleAccept}
          onRefuse={handleRefuse}
          onChat={handleChatWith}
          onDiscover={() => router.replace("/(tabs)")}
        />
      ) : view === "sent" && !isParent ? (
        <SentList
          rows={sentPending}
          loading={sentLoading}
          refreshing={sentRefreshing}
          error={sentError}
          insetsBottom={insets.bottom}
          inFlightId={inFlight}
          onRefresh={() => loadSent("refresh")}
          onChat={handleChatWith}
          onWithdraw={handleWithdraw}
          onDiscover={() => router.replace("/(tabs)")}
        />
      ) : loading ? (
        <View style={styles.content}>
          <ActivityIndicator size="large" color={theme.text} />
        </View>
      ) : error ? (
        <View style={styles.content}>
          <Ionicons name="warning-outline" size={64} color={theme.textMuted} />
          <Text style={styles.emptyTitle}>Couldn&apos;t load</Text>
          <Text style={styles.emptySubtitle}>
            Check your connection and try again.
          </Text>
        </View>
      ) : isParent ? (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[
            styles.scrollContent,
            { paddingBottom: insets.bottom + 24 },
          ]}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.parentHero}>
            <Ionicons name="mail-open-outline" size={22} color={brand.white} />
            <View style={styles.heroTextWrap}>
              <Text style={styles.parentHeroTitle}>
                Messages for Your Child Athlete
              </Text>
              <Text style={styles.parentHeroSubtitle}>
                Verified recruiters reaching out to discuss opportunities.
              </Text>
            </View>
          </View>

          {parentMessages.length === 0 ? (
            <View style={styles.content}>
              <Ionicons name="mail-outline" size={64} color={theme.textMuted} />
              <Text style={styles.emptyTitle}>No recruiter messages yet</Text>
              <Text style={styles.emptySubtitle}>
                New outreach from agents and coaches will appear here.
              </Text>
            </View>
          ) : (
            <View style={styles.list}>
              {parentMessages.map((message) => (
                <Pressable
                  key={message.id}
                  style={({ pressed }) => [
                    styles.card,
                    pressed && styles.cardPressed,
                  ]}
                  onPress={() =>
                    router.push({
                      pathname: "/chat/[threadId]",
                      params: { threadId: message.id },
                    })
                  }
                >
                  <View style={styles.cardTopRow}>
                    <View style={styles.senderWrap}>
                      <Text style={styles.senderName}>
                        {message.recruiterName} • {message.recruiterRole}
                      </Text>
                      {message.verified && (
                        <Ionicons
                          name="checkmark-circle"
                          size={16}
                          color={semantic.success}
                        />
                      )}
                    </View>
                    <Text style={styles.sentAt}>{formatTimeAgo(message.sentAt)}</Text>
                  </View>

                  <Text style={styles.organization}>
                    {message.organization}
                  </Text>
                  <Text style={styles.childLine}>
                    Regarding: {message.childName}
                  </Text>
                  <Text style={styles.messagePreview} numberOfLines={3}>
                    {message.message}
                  </Text>

                  <View style={styles.cardBottomRow}>
                    <View
                      style={[
                        styles.statusPill,
                        message.status === "New"
                          ? styles.statusPillNew
                          : message.status === "In Review"
                            ? styles.statusPillReview
                            : styles.statusPillResponded,
                      ]}
                    >
                      <Text style={styles.statusText}>{message.status}</Text>
                    </View>
                    {message.unreadCount > 0 ? (
                      <View style={styles.unreadBadge}>
                        <Text style={styles.unreadText}>
                          {message.unreadCount}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                </Pressable>
              ))}
            </View>
          )}
        </ScrollView>
      ) : (
        // Matches list — same shape for athletes / coaches / recruiters; the
        // backend returns the OTHER party's info regardless of which side you
        // are on. Parents are handled in the branch above.
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[
            styles.scrollContent,
            { paddingBottom: insets.bottom + 24 },
          ]}
          showsVerticalScrollIndicator={false}
        >
          {athleteMatches.length === 0 ? (
            <View style={styles.content}>
              <Ionicons
                name="clipboard-outline"
                size={64}
                color={theme.textMuted}
              />
              <Text style={styles.emptyTitle}>No drafts yet</Text>
              <Text style={styles.emptySubtitle}>
                Keep scouting to build your draft board
              </Text>
              <Pressable
                style={styles.discoverButton}
                onPress={() => router.replace("/(tabs)")}
              >
                <Ionicons
                  name="compass-outline"
                  size={18}
                  color={theme.accentText}
                />
                <Text style={styles.discoverButtonText}>Go to Discover</Text>
              </Pressable>
            </View>
          ) : (
            <>
              <View style={styles.athleteHero}>
                <Ionicons name="trophy" size={22} color={brand.white} />
                <View style={styles.heroTextWrap}>
                  <Text style={styles.parentHeroTitle}>Your Draft Board</Text>
                  <Text style={styles.parentHeroSubtitle}>
                    {athleteMatches.length} mutual draft
                    {athleteMatches.length !== 1 ? "s" : ""}
                  </Text>
                </View>
              </View>
              <View style={styles.list}>
                {athleteMatches.map((match: AthleteMatch) => (
                  <Pressable
                    key={match.id}
                    style={({ pressed }) => [
                      styles.card,
                      pressed && styles.cardPressed,
                    ]}
                    onPress={() =>
                      router.push({
                        pathname: "/chat/[threadId]",
                        params: { threadId: match.id },
                      })
                    }
                  >
                    <View style={styles.cardTopRow}>
                      <View style={styles.senderWrap}>
                        <Text style={styles.senderName}>
                          {match.recruiterName}
                        </Text>
                        {match.verified && (
                          <Ionicons
                            name="checkmark-circle"
                            size={16}
                            color={semantic.success}
                          />
                        )}
                      </View>
                      <Text style={styles.sentAt}>{formatTimeAgo(match.matchedAt)}</Text>
                    </View>

                    {/* Role row only when the other party actually has a
                        recruiter profile — otherwise it would display a
                        misleading default "Agent · " for athlete matches. */}
                    {match.organization ? (
                      <Text style={styles.matchRoleRow}>
                        {match.recruiterRole === "agent" ? "Agent" : "Coach"} ·{" "}
                        {match.organization}
                      </Text>
                    ) : null}

                    {match.location ? (
                      <View style={styles.matchLocationRow}>
                        <Ionicons
                          name="location-outline"
                          size={13}
                          color={theme.textMuted}
                        />
                        <Text style={styles.matchLocationText}>
                          {match.location}
                        </Text>
                      </View>
                    ) : null}

                    {match.lastMessage && (
                      <Text style={styles.messagePreview} numberOfLines={2}>
                        {match.lastMessage}
                      </Text>
                    )}

                    <View style={styles.cardBottomRow}>
                      <Pressable
                        style={styles.messageButton}
                        onPress={() =>
                          router.push({
                            pathname: "/chat/[threadId]",
                            params: { threadId: match.id },
                          })
                        }
                      >
                        <Ionicons
                          name="chatbubble-outline"
                          size={14}
                          color={brand.white}
                        />
                        <Text style={styles.messageButtonText}>Chat</Text>
                      </Pressable>
                      {match.unreadCount > 0 ? (
                        <View style={styles.unreadBadge}>
                          <Text style={styles.unreadText}>
                            {match.unreadCount}
                          </Text>
                        </View>
                      ) : null}
                    </View>
                  </Pressable>
                ))}
              </View>
            </>
          )}
        </ScrollView>
      )}
    </View>
  );
}

function TabPill({
  icon,
  label,
  active,
  onPress,
  badge,
}: {
  icon: IonName;
  label: string;
  active: boolean;
  onPress: () => void;
  badge?: number;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.tabPill,
        active && styles.tabPillActive,
        pressed && { opacity: 0.85 },
      ]}
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
    >
      <Ionicons
        name={icon}
        size={14}
        color={active ? theme.accentText : theme.text}
      />
      <Text style={[styles.tabPillText, active && styles.tabPillTextActive]}>
        {label}
      </Text>
      {!!badge && badge > 0 ? (
        <View style={styles.tabBadge}>
          <Text style={styles.tabBadgeText}>
            {badge > 99 ? "99+" : badge}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}

function PeerCardHeader({
  peer,
  timeIso,
  rightExtra,
}: {
  peer: PeerSummary;
  timeIso: string;
  rightExtra?: React.ReactNode;
}) {
  return (
    <View style={styles.peerRow}>
      {peer.avatar_url ? (
        <ExpoImage
          source={{ uri: peer.avatar_url }}
          style={styles.peerAvatar}
          contentFit="cover"
        />
      ) : (
        <View style={[styles.peerAvatar, styles.peerAvatarFallback]}>
          <Ionicons name="person" size={20} color={theme.textMuted} />
        </View>
      )}
      <View style={styles.peerText}>
        <View style={styles.peerTopLine}>
          <Text style={styles.peerName} numberOfLines={1}>
            {peer.name || "Unnamed"}
          </Text>
          <Text style={styles.peerTime}>{formatTimeAgo(timeIso)}</Text>
        </View>
        <View style={styles.peerMetaRow}>
          {peer.role ? (
            <View style={styles.roleChip}>
              <Text style={styles.roleChipText}>{peer.role}</Text>
            </View>
          ) : null}
          {peer.location ? (
            <View style={styles.locationRow}>
              <Ionicons
                name="location-outline"
                size={12}
                color={theme.textMuted}
              />
              <Text style={styles.locationText} numberOfLines={1}>
                {peer.location}
              </Text>
            </View>
          ) : null}
          {rightExtra}
        </View>
      </View>
    </View>
  );
}

function ReceivedList({
  rows,
  loading,
  refreshing,
  error,
  insetsBottom,
  inFlightId,
  onRefresh,
  onAccept,
  onRefuse,
  onChat,
  onDiscover,
}: {
  rows: ReceivedRow[];
  loading: boolean;
  refreshing: boolean;
  error: boolean;
  insetsBottom: number;
  inFlightId: string | null;
  onRefresh: () => void;
  onAccept: (id: string, name: string) => void;
  onRefuse: (id: string) => void;
  onChat: (peer: PeerSummary) => void;
  onDiscover: () => void;
}) {
  if (loading) {
    return (
      <View style={styles.content}>
        <ActivityIndicator size="large" color={theme.text} />
      </View>
    );
  }
  if (error) {
    return (
      <View style={styles.content}>
        <Ionicons name="warning-outline" size={64} color={theme.textMuted} />
        <Text style={styles.emptyTitle}>Couldn&apos;t load</Text>
        <Text style={styles.emptySubtitle}>
          Check your connection and try again.
        </Text>
      </View>
    );
  }
  if (rows.length === 0) {
    return (
      <ScrollView
        contentContainerStyle={styles.emptyScroll}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={theme.text}
          />
        }
      >
        <View style={styles.content}>
          <Ionicons name="trophy-outline" size={64} color={theme.textMuted} />
          <Text style={styles.emptyTitle}>No drafts received yet</Text>
          <Text style={styles.emptySubtitle}>Keep Scouting</Text>
          <Pressable style={styles.discoverButton} onPress={onDiscover}>
            <Ionicons
              name="compass-outline"
              size={18}
              color={theme.accentText}
            />
            <Text style={styles.discoverButtonText}>Open Discover</Text>
          </Pressable>
        </View>
      </ScrollView>
    );
  }
  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={[
        styles.scrollContent,
        { paddingBottom: insetsBottom + 24 },
      ]}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={theme.text}
        />
      }
    >
      <View style={styles.list}>
        {rows.map((r) => {
          const isPending = inFlightId === r.swiper.id;
          return (
            <View key={r.swiper.id} style={styles.card}>
              <PeerCardHeader peer={r.swiper} timeIso={r.created_at} />
              <View style={styles.actionRow}>
                <Pressable
                  style={({ pressed }) => [
                    styles.actionPrimary,
                    pressed && { opacity: 0.85 },
                    isPending && { opacity: 0.7 },
                  ]}
                  onPress={() => onAccept(r.swiper.id, r.swiper.name)}
                  disabled={isPending}
                >
                  {isPending ? (
                    <ActivityIndicator
                      size="small"
                      color={theme.accentText}
                    />
                  ) : (
                    <>
                      <Ionicons
                        name="flash"
                        size={14}
                        color={theme.accentText}
                      />
                      <Text style={styles.actionPrimaryText}>Accept</Text>
                    </>
                  )}
                </Pressable>
                <Pressable
                  style={({ pressed }) => [
                    styles.actionDanger,
                    pressed && { opacity: 0.85 },
                    isPending && { opacity: 0.7 },
                  ]}
                  onPress={() => onRefuse(r.swiper.id)}
                  disabled={isPending}
                >
                  <Ionicons
                    name="close"
                    size={14}
                    color={semantic.error}
                  />
                  <Text style={styles.actionDangerText}>Refuse</Text>
                </Pressable>
                <Pressable
                  style={({ pressed }) => [
                    styles.actionGhost,
                    pressed && { opacity: 0.85 },
                    isPending && { opacity: 0.7 },
                  ]}
                  onPress={() => onChat(r.swiper)}
                  disabled={isPending}
                >
                  <Ionicons
                    name="chatbubbles-outline"
                    size={14}
                    color={theme.text}
                  />
                  <Text style={styles.actionGhostText}>Chat</Text>
                </Pressable>
              </View>
            </View>
          );
        })}
      </View>
    </ScrollView>
  );
}

function SentList({
  rows,
  loading,
  refreshing,
  error,
  insetsBottom,
  inFlightId,
  onRefresh,
  onChat,
  onWithdraw,
  onDiscover,
}: {
  rows: SentRow[];
  loading: boolean;
  refreshing: boolean;
  error: boolean;
  insetsBottom: number;
  inFlightId: string | null;
  onRefresh: () => void;
  onChat: (peer: PeerSummary) => void;
  onWithdraw: (peer: PeerSummary) => void;
  onDiscover: () => void;
}) {
  if (loading) {
    return (
      <View style={styles.content}>
        <ActivityIndicator size="large" color={theme.text} />
      </View>
    );
  }
  if (error) {
    return (
      <View style={styles.content}>
        <Ionicons name="warning-outline" size={64} color={theme.textMuted} />
        <Text style={styles.emptyTitle}>Couldn&apos;t load</Text>
        <Text style={styles.emptySubtitle}>
          Check your connection and try again.
        </Text>
      </View>
    );
  }
  if (rows.length === 0) {
    return (
      <ScrollView
        contentContainerStyle={styles.emptyScroll}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={theme.text}
          />
        }
      >
        <View style={styles.content}>
          <Ionicons name="send-outline" size={64} color={theme.textMuted} />
          <Text style={styles.emptyTitle}>No drafts sent yet</Text>
          <Text style={styles.emptySubtitle}>Keep Scouting</Text>
          <Pressable style={styles.discoverButton} onPress={onDiscover}>
            <Ionicons
              name="compass-outline"
              size={18}
              color={theme.accentText}
            />
            <Text style={styles.discoverButtonText}>Go to Discover</Text>
          </Pressable>
        </View>
      </ScrollView>
    );
  }
  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={[
        styles.scrollContent,
        { paddingBottom: insetsBottom + 24 },
      ]}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={theme.text}
        />
      }
    >
      <View style={styles.list}>
        {rows.map((r) => {
          const isPending = inFlightId === r.swiped.id;
          return (
            <View key={r.swiped.id} style={styles.card}>
              <PeerCardHeader
                peer={r.swiped}
                timeIso={r.created_at}
                rightExtra={
                  <View style={styles.pendingBadge}>
                    <Text style={styles.pendingBadgeText}>Pending</Text>
                  </View>
                }
              />
              <View style={styles.actionRow}>
                <Pressable
                  style={({ pressed }) => [
                    styles.actionGhost,
                    pressed && { opacity: 0.85 },
                    isPending && { opacity: 0.7 },
                  ]}
                  onPress={() => onChat(r.swiped)}
                  disabled={isPending}
                >
                  <Ionicons
                    name="chatbubbles-outline"
                    size={14}
                    color={theme.text}
                  />
                  <Text style={styles.actionGhostText}>Chat</Text>
                </Pressable>
                <Pressable
                  style={({ pressed }) => [
                    styles.actionDanger,
                    pressed && { opacity: 0.85 },
                    isPending && { opacity: 0.7 },
                  ]}
                  onPress={() => onWithdraw(r.swiped)}
                  disabled={isPending}
                >
                  {isPending ? (
                    <ActivityIndicator size="small" color={semantic.error} />
                  ) : (
                    <>
                      <Ionicons
                        name="trash-outline"
                        size={14}
                        color={semantic.error}
                      />
                      <Text style={styles.actionDangerText}>Withdraw</Text>
                    </>
                  )}
                </Pressable>
              </View>
            </View>
          );
        })}
      </View>
    </ScrollView>
  );
}

function MessagesInbox({
  inbox,
  loading,
  refreshing,
  error,
  insetsBottom,
  onRefresh,
  onCompose,
  onOpen,
}: {
  inbox: ConversationItem[];
  loading: boolean;
  refreshing: boolean;
  error: boolean;
  insetsBottom: number;
  onRefresh: () => void;
  onCompose: () => void;
  onOpen: (c: ConversationItem) => void;
}) {
  if (loading) {
    return (
      <View style={styles.content}>
        <ActivityIndicator size="large" color={theme.text} />
      </View>
    );
  }
  if (error) {
    return (
      <View style={styles.content}>
        <Ionicons name="warning-outline" size={64} color={theme.textMuted} />
        <Text style={styles.emptyTitle}>Couldn&apos;t load messages</Text>
      </View>
    );
  }
  if (inbox.length === 0) {
    return (
      <View style={styles.content}>
        <Ionicons name="mail-outline" size={64} color={theme.textMuted} />
        <Text style={styles.emptyTitle}>No messages yet</Text>
        <Text style={styles.emptySubtitle}>Start a conversation.</Text>
        <Pressable style={styles.discoverButton} onPress={onCompose}>
          <Ionicons name="create-outline" size={18} color={theme.accentText} />
          <Text style={styles.discoverButtonText}>New message</Text>
        </Pressable>
      </View>
    );
  }
  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={[
        styles.inboxContent,
        { paddingBottom: insetsBottom + 24 },
      ]}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={theme.text}
        />
      }
      showsVerticalScrollIndicator={false}
    >
      {inbox.map((c) => (
        <Pressable
          key={c.id}
          onPress={() => onOpen(c)}
          style={({ pressed }) => [
            styles.inboxRow,
            pressed && styles.cardPressed,
          ]}
        >
          {c.otherUser.avatarUrl ? (
            <ExpoImage
              source={{ uri: c.otherUser.avatarUrl }}
              style={styles.inboxAvatar}
              contentFit="cover"
            />
          ) : (
            <View style={[styles.inboxAvatar, styles.inboxAvatarFallback]}>
              <Ionicons name="person" size={18} color={theme.textMuted} />
            </View>
          )}
          <View style={styles.inboxText}>
            <View style={styles.inboxTopRow}>
              <Text style={styles.inboxName} numberOfLines={1}>
                {c.otherUser.name || "Unnamed"}
              </Text>
              <Text style={styles.inboxTime}>
                {formatMessageTime(c.lastMessageAt)}
              </Text>
            </View>
            <View style={styles.inboxBottomRow}>
              <Text
                style={[
                  styles.inboxPreview,
                  c.unreadCount > 0 && styles.inboxPreviewUnread,
                ]}
                numberOfLines={1}
              >
                {c.lastMessage || "Tap to start the conversation"}
              </Text>
              {c.unreadCount > 0 && (
                <View style={styles.inboxUnreadBadge}>
                  <Text style={styles.inboxUnreadText}>
                    {c.unreadCount > 99 ? "99+" : c.unreadCount}
                  </Text>
                </View>
              )}
            </View>
            {c.otherUser.role ? (
              <Text style={styles.inboxRole}>{c.otherUser.role}</Text>
            ) : null}
          </View>
        </Pressable>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.bg,
  },
  header: {
    paddingHorizontal: 24,
    paddingVertical: 16,
    backgroundColor: theme.headerBg,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  composeBtn: {
    marginLeft: "auto",
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: brand.primary,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: theme.border,
  },
  // A horizontal scroller MUST NOT take vertical flex — otherwise it grows
  // to fill the column and centers the pills mid-screen. Pin it to content
  // height so it sits right under the header.
  tabsScroll: {
    flexGrow: 0,
    flexShrink: 0,
  },
  tabsRow: {
    paddingHorizontal: 16,
    paddingTop: 12,
    gap: 8,
    alignItems: "center",
  },
  tabPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.border,
  },
  tabPillActive: {
    backgroundColor: theme.accent,
    borderColor: theme.accent,
  },
  tabPillText: {
    fontSize: 12,
    fontFamily: "Poppins_600SemiBold",
    color: theme.text,
  },
  tabPillTextActive: {
    color: theme.accentText,
  },
  tabBadge: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 5,
    backgroundColor: semantic.error,
    alignItems: "center",
    justifyContent: "center",
  },
  tabBadgeText: {
    color: brand.white,
    fontSize: 10,
    fontFamily: "Poppins_700Bold",
  },
  inboxContent: {
    paddingHorizontal: 14,
    paddingTop: 14,
    gap: 6,
  },
  inboxRow: {
    flexDirection: "row",
    gap: 12,
    padding: 12,
    borderRadius: 14,
    backgroundColor: theme.cardBg,
    borderWidth: 1,
    borderColor: theme.cardBorder,
  },
  inboxAvatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: theme.surface,
  },
  inboxAvatarFallback: {
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: theme.border,
  },
  inboxText: {
    flex: 1,
  },
  inboxTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  inboxName: {
    fontSize: 14,
    fontFamily: "Poppins_700Bold",
    color: theme.text,
    flexShrink: 1,
  },
  inboxTime: {
    fontSize: 11,
    fontFamily: "Poppins_500Medium",
    color: theme.textMuted,
  },
  inboxBottomRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 4,
  },
  inboxPreview: {
    flex: 1,
    fontSize: 12,
    fontFamily: "Poppins_400Regular",
    color: theme.textSecondary,
  },
  inboxPreviewUnread: {
    color: theme.text,
    fontFamily: "Poppins_600SemiBold",
  },
  inboxUnreadBadge: {
    minWidth: 22,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 6,
    backgroundColor: semantic.error,
    alignItems: "center",
    justifyContent: "center",
  },
  inboxUnreadText: {
    color: brand.white,
    fontSize: 11,
    fontFamily: "Poppins_700Bold",
  },
  inboxRole: {
    marginTop: 2,
    fontSize: 11,
    fontFamily: "Poppins_500Medium",
    color: theme.textMuted,
    textTransform: "capitalize",
  },
  title: {
    fontSize: 24,
    fontFamily: "Poppins_600SemiBold",
    color: theme.text,
  },
  headerBadge: {
    backgroundColor: semantic.error,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  headerBadgeText: {
    fontSize: 12,
    fontFamily: "Poppins_600SemiBold",
    color: brand.white,
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
  athleteHero: {
    borderRadius: 16,
    backgroundColor: brand.primary,
    padding: 14,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  parentHero: {
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
  parentHeroTitle: {
    fontSize: 15,
    fontFamily: "Poppins_600SemiBold",
    color: brand.white,
  },
  parentHeroSubtitle: {
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
  cardPressed: {
    opacity: 0.9,
  },
  cardTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
  },
  senderWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexShrink: 1,
  },
  senderName: {
    fontSize: 15,
    fontFamily: "Poppins_600SemiBold",
    color: theme.text,
  },
  sentAt: {
    fontSize: 12,
    fontFamily: "Poppins_500Medium",
    color: theme.textMuted,
  },
  organization: {
    fontSize: 13,
    fontFamily: "Poppins_500Medium",
    color: theme.textSecondary,
  },
  matchRoleRow: {
    fontSize: 13,
    fontFamily: "Poppins_500Medium",
    color: theme.textSecondary,
  },
  matchLocationRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  matchLocationText: {
    fontSize: 12,
    fontFamily: "Poppins_400Regular",
    color: theme.textSecondary,
  },
  childLine: {
    fontSize: 12,
    fontFamily: "Poppins_500Medium",
    color: theme.textSecondary,
  },
  messagePreview: {
    fontSize: 13,
    lineHeight: 20,
    fontFamily: "Poppins_400Regular",
    color: theme.textSecondary,
  },
  cardBottomRow: {
    marginTop: 4,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  messageButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: brand.primary,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 16,
  },
  messageButtonText: {
    fontSize: 13,
    fontFamily: "Poppins_600SemiBold",
    color: brand.white,
  },
  statusPill: {
    paddingHorizontal: 10,
    height: 26,
    borderRadius: 13,
    justifyContent: "center",
  },
  statusPillNew: {
    backgroundColor: "rgba(231, 76, 60, 0.2)",
  },
  statusPillReview: {
    backgroundColor: "rgba(253, 203, 110, 0.2)",
  },
  statusPillResponded: {
    backgroundColor: "rgba(0, 184, 148, 0.2)",
  },
  statusText: {
    fontSize: 11,
    fontFamily: "Poppins_600SemiBold",
    color: theme.text,
  },
  unreadBadge: {
    minWidth: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: semantic.error,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 6,
  },
  unreadText: {
    fontSize: 11,
    fontFamily: "Poppins_600SemiBold",
    color: brand.white,
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
  peerRow: {
    flexDirection: "row",
    gap: 12,
    alignItems: "center",
  },
  peerAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: theme.surface,
  },
  peerAvatarFallback: {
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: theme.border,
  },
  peerText: {
    flex: 1,
    gap: 6,
  },
  peerTopLine: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  peerName: {
    flexShrink: 1,
    fontSize: 15,
    fontFamily: "Poppins_700Bold",
    color: theme.text,
  },
  peerTime: {
    fontSize: 11,
    fontFamily: "Poppins_500Medium",
    color: theme.textMuted,
  },
  peerMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
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
  actionRow: {
    flexDirection: "row",
    gap: 8,
  },
  actionPrimary: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: theme.accent,
  },
  actionPrimaryText: {
    fontSize: 13,
    fontFamily: "Poppins_600SemiBold",
    color: theme.accentText,
  },
  actionDanger: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: semantic.error,
  },
  actionDangerText: {
    fontSize: 13,
    fontFamily: "Poppins_600SemiBold",
    color: semantic.error,
  },
  actionGhost: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: theme.border,
    backgroundColor: theme.surface,
  },
  actionGhostText: {
    fontSize: 13,
    fontFamily: "Poppins_600SemiBold",
    color: theme.text,
  },
  pendingBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: theme.badgeBg,
  },
  pendingBadgeText: {
    fontSize: 10,
    fontFamily: "Poppins_600SemiBold",
    color: theme.badgeText,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
});
