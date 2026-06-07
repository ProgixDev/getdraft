import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  StyleSheet,
  Text,
  ScrollView,
  Pressable,
  ActivityIndicator,
  RefreshControl,
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

type DraftBoardView = "matches" | "messages";

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
  const isAthlete = user?.role === "athlete";

  const [view, setView] = useState<DraftBoardView>("matches");
  const [athleteMatches, setAthleteMatches] = useState<AthleteMatch[]>([]);
  const [parentMessages, setParentMessages] = useState<RecruiterParentOutreach[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [inbox, setInbox] = useState<ConversationItem[]>([]);
  const [inboxLoading, setInboxLoading] = useState(false);
  const [inboxRefreshing, setInboxRefreshing] = useState(false);
  const [inboxError, setInboxError] = useState(false);
  const inboxLoadedOnce = useRef(false);

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

  useFocusEffect(
    useCallback(() => {
      if (view !== "messages") return;
      loadInbox(inboxLoadedOnce.current ? "silent" : "initial");
    }, [view, loadInbox]),
  );

  // Live: bump the relevant row when a DM arrives.
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
          // New conversation we don't know about yet — refetch the inbox.
          loadInbox("silent");
          return prev;
        }
        const target = prev[idx];
        const updated: ConversationItem = {
          ...target,
          lastMessage: msg.text ?? target.lastMessage,
          lastMessageAt: msg.createdAt ?? target.lastMessageAt,
          unreadCount:
            incomingFromMe
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

  if (!fontsLoaded) return null;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={styles.title}>
          {isParent ? "Recruiter Outreach" : "Draft Board"}
        </Text>
        {view === "matches" && isAthlete && totalUnread > 0 && (
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

      <View style={styles.toggleWrap}>
        <Pressable
          onPress={() => setView("matches")}
          style={({ pressed }) => [
            styles.toggleBtn,
            view === "matches" && styles.toggleBtnActive,
            pressed && { opacity: 0.85 },
          ]}
        >
          <Ionicons
            name="trophy"
            size={14}
            color={view === "matches" ? theme.accentText : theme.text}
          />
          <Text
            style={[
              styles.toggleText,
              view === "matches" && styles.toggleTextActive,
            ]}
          >
            Matches
          </Text>
        </Pressable>
        <Pressable
          onPress={() => setView("messages")}
          style={({ pressed }) => [
            styles.toggleBtn,
            view === "messages" && styles.toggleBtnActive,
            pressed && { opacity: 0.85 },
          ]}
        >
          <Ionicons
            name="chatbubbles"
            size={14}
            color={view === "messages" ? theme.accentText : theme.text}
          />
          <Text
            style={[
              styles.toggleText,
              view === "messages" && styles.toggleTextActive,
            ]}
          >
            Messages
          </Text>
          {totalInboxUnread > 0 && (
            <View style={styles.toggleBadge}>
              <Text style={styles.toggleBadgeText}>
                {totalInboxUnread > 9 ? "9+" : totalInboxUnread}
              </Text>
            </View>
          )}
        </Pressable>
      </View>

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
      ) : isAthlete ? (
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
                    {athleteMatches.length} recruiter
                    {athleteMatches.length !== 1 ? "s" : ""} drafted by you
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

                    <Text style={styles.matchRoleRow}>
                      {match.recruiterRole === "agent" ? "Agent" : "Coach"} ·{" "}
                      {match.organization}
                    </Text>

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
                        <Text style={styles.messageButtonText}>Message</Text>
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
      ) : (
        <View style={styles.content}>
          <Ionicons
            name="clipboard-outline"
            size={64}
            color={theme.textMuted}
          />
          <Text style={styles.emptyTitle}>No drafts yet</Text>
          <Text style={styles.emptySubtitle}>
            Start discovering to build your draft board
          </Text>
        </View>
      )}
    </View>
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
  toggleWrap: {
    flexDirection: "row",
    gap: 6,
    backgroundColor: theme.surface,
    marginHorizontal: 16,
    marginTop: 12,
    padding: 4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: theme.border,
  },
  toggleBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 9,
    borderRadius: 999,
  },
  toggleBtnActive: {
    backgroundColor: theme.accent,
  },
  toggleText: {
    fontSize: 12,
    fontFamily: "Poppins_600SemiBold",
    color: theme.text,
  },
  toggleTextActive: {
    color: theme.accentText,
  },
  toggleBadge: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 5,
    backgroundColor: semantic.error,
    alignItems: "center",
    justifyContent: "center",
  },
  toggleBadgeText: {
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
    gap: 8,
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
});
