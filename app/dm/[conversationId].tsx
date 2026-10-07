import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  AppState,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { KeyboardStickyView } from "react-native-keyboard-controller";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Image as ExpoImage } from "expo-image";
import { useSelector } from "react-redux";
import {
  useFonts,
  Poppins_400Regular,
  Poppins_500Medium,
  Poppins_600SemiBold,
  Poppins_700Bold,
} from "@expo-google-fonts/poppins";
import type { Socket } from "socket.io-client";

import { brand, neutral, semantic, theme } from "@/config/colors";
import { RootState } from "@/store";
import { chatService } from "@/services/chat";
import { conversationsService } from "@/services/conversations";
import { roleDisplayLabel } from "@/lib/roles";
import { apiErrorMessage } from "@/services/api";
import { findOptimistic, usePendingSends } from "@/hooks/use-pending-sends";
import { ReportSheet, type ReportTarget } from "@/components/ReportSheet";
import { openSafetyMenu } from "@/lib/safetyMenu";

type DmMessage = {
  id: string;
  mine: boolean;
  text: string;
  sentAt: string;
  failed?: boolean;
  /** Why the server refused it, when it said. */
  failReason?: string;
};

const isOptimistic = (id: string) => id.startsWith("local-");

function formatTime(iso?: string): string {
  if (!iso) return "Now";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Now";
  const time = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  if (sameDay) return time;
  const day = d.toLocaleDateString([], { month: "short", day: "numeric" });
  return `${day}, ${time}`;
}

export default function DmScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const user = useSelector((state: RootState) => state.auth.user);
  const params = useLocalSearchParams<{
    conversationId?: string;
    otherName?: string;
    otherAvatarUrl?: string;
    otherRole?: string;
  }>();
  const conversationId = params.conversationId
    ? String(params.conversationId)
    : null;
  const initialOtherName = params.otherName ? String(params.otherName) : "";
  const initialOtherAvatar = params.otherAvatarUrl
    ? String(params.otherAvatarUrl)
    : null;
  const initialOtherRole = params.otherRole ? String(params.otherRole) : "";

  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState<DmMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  // Bumped by the Retry button on the load-error state to run the load again.
  const [reloadKey, setReloadKey] = useState(0);
  const [otherName, setOtherName] = useState(initialOtherName);
  const [otherAvatar, setOtherAvatar] = useState<string | null>(
    initialOtherAvatar,
  );
  const [otherRole, setOtherRole] = useState(initialOtherRole);
  // Tracked so the header avatar tap routes to the right /user/[id].
  const [otherUserId, setOtherUserId] = useState<string | null>(null);
  const [reportTarget, setReportTarget] = useState<ReportTarget | null>(null);
  const scrollRef = useRef<ScrollView>(null);

  const markFailed = (id: string, reason?: string) =>
    setMessages((prev) =>
      prev.map((m) =>
        m.id === id ? { ...m, failed: true, failReason: reason } : m,
      ),
    );
  const pending = usePendingSends((id) => markFailed(id));

  const [fontsLoaded] = useFonts({
    Poppins_400Regular,
    Poppins_500Medium,
    Poppins_600SemiBold,
    Poppins_700Bold,
  });

  useEffect(() => {
    if (!conversationId || !user?.id) return;
    let cancelled = false;
    setLoading(true);
    setLoadError(false);

    Promise.all([
      conversationsService.getMessages(conversationId),
      conversationsService.getInbox().catch(() => [] as any[]),
    ])
      .then(([msgs, inbox]) => {
        if (cancelled) return;
        const row = (inbox ?? []).find((c: any) => c.id === conversationId);
        if (row?.otherUser) {
          if (!initialOtherName) setOtherName(row.otherUser.name ?? "");
          if (!initialOtherAvatar) setOtherAvatar(row.otherUser.avatarUrl ?? null);
          if (!initialOtherRole) setOtherRole(row.otherUser.role ?? "");
          if (row.otherUser.id) setOtherUserId(String(row.otherUser.id));
        }
        setMessages(
          (msgs ?? []).map((m) => ({
            id: String(m.id),
            mine: m.senderId === user.id,
            text: m.text ?? "",
            sentAt: formatTime(m.createdAt),
          })),
        );
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setLoadError(true);
        setLoading(false);
      });

    conversationsService.markRead(conversationId).catch(() => {});

    let activeSocket: Socket | null = null;
    const onNewDm = (msg: any) => {
      if (cancelled) return;
      if (msg?.conversationId && msg.conversationId !== conversationId) return;
      const realId = String(msg.id ?? `live-${Date.now()}`);
      const mine = msg.senderId === user.id;
      const incoming: DmMessage = {
        id: realId,
        mine,
        text: msg.text ?? "",
        sentAt: formatTime(msg.createdAt),
      };
      setMessages((prev) => {
        if (prev.some((m) => m.id === realId)) return prev;
        if (mine) {
          const i = findOptimistic(prev, incoming.text, isOptimistic);
          if (i !== -1) {
            pending.clear(prev[i].id);
            const copy = [...prev];
            copy[i] = incoming;
            return copy;
          }
        }
        return [...prev, incoming];
      });
      if (!mine) conversationsService.markRead(conversationId).catch(() => {});
    };

    // A refused send comes back only as an "error" event (blocked, no
    // match any more, too fast, too long); it refers to the oldest send
    // still waiting. With none waiting it changes nothing on screen.
    const onSocketError = (err: any) => {
      if (cancelled) return;
      const id = pending.oldest();
      if (!id) return;
      pending.clear(id);
      markFailed(id, typeof err?.message === "string" ? err.message : undefined);
    };

    const joinNow = () => conversationsService.joinConversation(conversationId);
    // Re-bind listeners + rejoin whenever we (re)connect. After a background
    // cycle chatService may hand back a fresh socket; without re-binding here
    // the screen stops receiving new_dm and DMs silently die until remount.
    const bindSocket = (s: Socket) => {
      if (cancelled) return;
      activeSocket = s;
      s.off("new_dm", onNewDm);
      s.on("new_dm", onNewDm);
      s.off("error", onSocketError);
      s.on("error", onSocketError);
      if (s.connected) joinNow();
      s.off("connect", joinNow);
      s.on("connect", joinNow);
    };

    chatService.connectSocket().then(bindSocket);

    const appStateSub = AppState.addEventListener("change", (state) => {
      if (state !== "active" || cancelled) return;
      const s = chatService.getSocket();
      if (!s || !s.connected) {
        chatService.connectSocket().then(bindSocket);
      } else if (s !== activeSocket) {
        bindSocket(s);
      }
    });

    return () => {
      cancelled = true;
      appStateSub.remove();
      conversationsService.leaveConversation(conversationId);
      activeSocket?.off("new_dm", onNewDm);
      activeSocket?.off("error", onSocketError);
      activeSocket?.off("connect", joinNow);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId, user?.id, reloadKey]);

  const handleSend = () => {
    const text = draft.trim();
    if (!text || !conversationId) return;

    const optimisticId = `local-${Date.now()}`;
    setMessages((prev) => [
      ...prev,
      { id: optimisticId, mine: true, text, sentAt: "Now" },
    ]);
    setDraft("");

    deliver(optimisticId, text);
  };

  // Send via socket when connected, otherwise REST. A socket send waits for
  // its echo (see usePendingSends); a REST send is confirmed by its reply.
  // Either failure flags the bubble so the user can tap it to retry.
  const deliver = (messageId: string, text: string) => {
    if (!conversationId) return;
    const socket = chatService.getSocket();
    if (socket?.connected) {
      pending.start(messageId);
      conversationsService.sendDm(conversationId, text);
    } else {
      conversationsService
        .sendMessage(conversationId, text)
        .then((saved: any) => {
          if (!saved?.id) return;
          const realId = String(saved.id);
          setMessages((prev) =>
            prev.some((m) => m.id === realId)
              ? prev.filter((m) => m.id !== messageId)
              : prev.map((m) =>
                  m.id === messageId
                    ? { ...m, id: realId, sentAt: formatTime(saved.createdAt) }
                    : m,
                ),
          );
        })
        .catch((err) =>
          markFailed(messageId, apiErrorMessage(err, "") || undefined),
        );
    }
  };

  const handleRetry = (message: DmMessage) => {
    setMessages((prev) =>
      prev.map((m) =>
        m.id === message.id
          ? { ...m, failed: false, failReason: undefined }
          : m,
      ),
    );
    deliver(message.id, message.text);
  };

  if (!fontsLoaded) return null;

  if (!conversationId) {
    return (
      <View style={[styles.emptyContainer, { paddingTop: insets.top + 20 }]}>
        <Ionicons
          name="chatbubble-ellipses-outline"
          size={54}
          color={neutral.gray400}
        />
        <Text style={styles.emptyTitle}>Conversation not available</Text>
        <Pressable style={styles.backButton} onPress={() => router.back()}>
          <Text style={styles.backButtonText}>Go Back</Text>
        </Pressable>
      </View>
    );
  }

  const headerTitle = otherName || "Conversation";
  // The raw role ("athlete", "recruiter") read as a label: Athlete, Agent...
  const headerSubtitle = roleDisplayLabel(otherRole) ?? "";

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable
          style={styles.headerIconButton}
          onPress={() => router.back()}
        >
          <Ionicons name="chevron-back" size={22} color={theme.text} />
        </Pressable>
        <Pressable
          style={styles.headerAvatarWrap}
          onPress={
            otherUserId
              ? () =>
                  router.push({
                    pathname: "/user/[userId]",
                    params: { userId: otherUserId },
                  })
              : undefined
          }
          disabled={!otherUserId}
          accessibilityRole={otherUserId ? "button" : undefined}
          accessibilityLabel={
            otherUserId ? `Open ${otherName || "user"}'s profile` : undefined
          }
        >
          {otherAvatar ? (
            <ExpoImage
              source={{ uri: otherAvatar }}
              style={styles.headerAvatar}
              contentFit="cover"
            />
          ) : (
            <View style={[styles.headerAvatar, styles.headerAvatarFallback]}>
              <Ionicons name="person" size={16} color={theme.textMuted} />
            </View>
          )}
        </Pressable>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {headerTitle}
          </Text>
          {headerSubtitle ? (
            <Text style={styles.headerSubtitle} numberOfLines={1}>
              {headerSubtitle}
            </Text>
          ) : null}
        </View>
        {/* Overflow menu. A DM had no way to report or block from inside
            the conversation, the place abuse is actually seen. */}
        <Pressable
          style={styles.headerIconButton}
          disabled={!otherUserId}
          accessibilityRole="button"
          accessibilityLabel="More options"
          onPress={() =>
            otherUserId &&
            openSafetyMenu({
              userId: otherUserId,
              name: otherName,
              onReport: setReportTarget,
              onBlocked: () => router.back(),
            })
          }
        >
          <Ionicons
            name="ellipsis-horizontal"
            size={20}
            color={otherUserId ? theme.text : "transparent"}
          />
        </Pressable>
      </View>

      {loading ? (
        <View style={styles.centerWrap}>
          <ActivityIndicator size="large" color={theme.text} />
        </View>
      ) : loadError ? (
        <View style={styles.centerWrap}>
          <Ionicons
            name="warning-outline"
            size={48}
            color={theme.textMuted}
          />
          <Text style={styles.emptyMsgTitle}>Couldn&apos;t load messages</Text>
          <Pressable
            style={styles.backButton}
            onPress={() => setReloadKey((k) => k + 1)}
            accessibilityRole="button"
          >
            <Text style={styles.backButtonText}>Retry</Text>
          </Pressable>
        </View>
      ) : messages.length === 0 ? (
        <View style={styles.centerWrap}>
          <Ionicons
            name="chatbubbles-outline"
            size={56}
            color={theme.textMuted}
          />
          <Text style={styles.emptyMsgTitle}>No messages yet</Text>
          <Text style={styles.emptyMsgSubtitle}>
            Say hello to get the conversation started.
          </Text>
        </View>
      ) : (
        <ScrollView
          ref={scrollRef}
          style={styles.messagesScroll}
          contentContainerStyle={[
            styles.messagesContent,
            { paddingBottom: insets.bottom + 18 },
          ]}
          showsVerticalScrollIndicator={false}
          keyboardDismissMode="interactive"
          keyboardShouldPersistTaps="handled"
          onContentSizeChange={() =>
            scrollRef.current?.scrollToEnd({ animated: false })
          }
        >
          {messages.map((message) => (
            <View key={message.id}>
              <View
                style={[
                  styles.bubbleRow,
                  message.mine ? styles.bubbleRowRight : styles.bubbleRowLeft,
                ]}
              >
                <View
                  style={[
                    styles.bubble,
                    message.mine ? styles.mineBubble : styles.theirBubble,
                  ]}
                >
                  <Text
                    style={[
                      styles.bubbleText,
                      message.mine ? styles.mineBubbleText : styles.theirBubbleText,
                    ]}
                  >
                    {message.text}
                  </Text>
                  <Text
                    style={[
                      styles.timeText,
                      message.mine ? styles.mineTimeText : styles.theirTimeText,
                    ]}
                  >
                    {message.sentAt}
                  </Text>
                </View>
              </View>
              {message.failed && (
                <Pressable
                  style={styles.failedRow}
                  onPress={() => handleRetry(message)}
                  hitSlop={6}
                >
                  <Text style={styles.failedText}>
                    Not sent — tap to retry
                    {message.failReason ? `\n${message.failReason}` : ""}
                  </Text>
                </Pressable>
              )}
            </View>
          ))}
        </ScrollView>
      )}

      <KeyboardStickyView offset={{ closed: 0, opened: 0 }}>
        <View style={[styles.composer, { paddingBottom: insets.bottom + 10 }]}>
          <View style={styles.inputWrap}>
            <TextInput
              value={draft}
              onChangeText={setDraft}
              placeholder="Type a message…"
              placeholderTextColor={theme.inputPlaceholder}
              style={styles.input}
              multiline
              // The server's cap; longer text was refused with no sign.
              maxLength={2000}
            />
          </View>
          <Pressable
            style={({ pressed }) => [
              styles.sendButton,
              (!draft.trim()) && styles.sendButtonDisabled,
              pressed && { opacity: 0.85 },
            ]}
            onPress={handleSend}
            disabled={!draft.trim()}
          >
            <Ionicons name="send" size={18} color={theme.accentText} />
          </Pressable>
        </View>
      </KeyboardStickyView>

      <ReportSheet
        visible={!!reportTarget}
        target={reportTarget}
        onClose={() => setReportTarget(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.bg,
  },
  header: {
    backgroundColor: theme.headerBg,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
    paddingHorizontal: 10,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  headerIconButton: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  headerAvatarWrap: {
    width: 36,
    height: 36,
  },
  headerAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: theme.surface,
  },
  headerAvatarFallback: {
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: theme.border,
  },
  headerCenter: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 16,
    fontFamily: "Poppins_700Bold",
    color: theme.text,
  },
  headerSubtitle: {
    fontSize: 12,
    fontFamily: "Poppins_500Medium",
    color: theme.textSecondary,
    textTransform: "capitalize",
  },
  centerWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 24,
  },
  emptyMsgTitle: {
    marginTop: 4,
    fontSize: 17,
    fontFamily: "Poppins_600SemiBold",
    color: theme.text,
  },
  emptyMsgSubtitle: {
    fontSize: 13,
    fontFamily: "Poppins_400Regular",
    color: theme.textSecondary,
    textAlign: "center",
  },
  messagesScroll: {
    flex: 1,
  },
  messagesContent: {
    paddingHorizontal: 12,
    paddingTop: 12,
    gap: 8,
  },
  bubbleRow: {
    flexDirection: "row",
  },
  bubbleRowLeft: {
    justifyContent: "flex-start",
  },
  bubbleRowRight: {
    justifyContent: "flex-end",
  },
  bubble: {
    maxWidth: "82%",
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  theirBubble: {
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.cardBorder,
  },
  mineBubble: {
    backgroundColor: brand.primary,
  },
  bubbleText: {
    fontSize: 13,
    lineHeight: 19,
    fontFamily: "Poppins_400Regular",
  },
  theirBubbleText: {
    color: theme.text,
  },
  mineBubbleText: {
    color: brand.white,
  },
  timeText: {
    marginTop: 4,
    fontSize: 10,
    fontFamily: "Poppins_500Medium",
  },
  theirTimeText: {
    color: theme.textMuted,
  },
  mineTimeText: {
    color: "rgba(255,255,255,0.85)",
  },
  failedRow: {
    alignItems: "flex-end",
    marginTop: 2,
    paddingRight: 4,
  },
  failedText: {
    fontSize: 11,
    fontFamily: "Poppins_500Medium",
    color: semantic.error,
  },
  composer: {
    borderTopWidth: 1,
    borderTopColor: theme.border,
    backgroundColor: theme.headerBg,
    paddingHorizontal: 12,
    paddingTop: 10,
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
  },
  inputWrap: {
    flex: 1,
    maxHeight: 110,
    borderWidth: 1,
    borderColor: theme.inputBorder,
    borderRadius: 18,
    backgroundColor: theme.inputBg,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  input: {
    fontSize: 14,
    fontFamily: "Poppins_400Regular",
    color: theme.inputText,
  },
  sendButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: theme.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  sendButtonDisabled: {
    opacity: 0.55,
  },
  emptyContainer: {
    flex: 1,
    alignItems: "center",
    backgroundColor: theme.bg,
    paddingHorizontal: 24,
  },
  emptyTitle: {
    marginTop: 12,
    fontSize: 18,
    fontFamily: "Poppins_600SemiBold",
    color: theme.text,
  },
  backButton: {
    marginTop: 14,
    height: 42,
    borderRadius: 21,
    paddingHorizontal: 18,
    backgroundColor: theme.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  backButtonText: {
    color: theme.accentText,
    fontSize: 13,
    fontFamily: "Poppins_600SemiBold",
  },
});
