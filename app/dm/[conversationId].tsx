import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
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

import { brand, neutral, theme } from "@/config/colors";
import { RootState } from "@/store";
import { chatService } from "@/services/chat";
import { conversationsService } from "@/services/conversations";

type DmMessage = {
  id: string;
  mine: boolean;
  text: string;
  sentAt: string;
};

function formatTime(iso?: string): string {
  if (!iso) return "Now";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Now";
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
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
  const [otherName, setOtherName] = useState(initialOtherName);
  const [otherAvatar, setOtherAvatar] = useState<string | null>(
    initialOtherAvatar,
  );
  const [otherRole, setOtherRole] = useState(initialOtherRole);
  // Tracked so the header avatar tap routes to the right /user/[id].
  const [otherUserId, setOtherUserId] = useState<string | null>(null);

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
          const i = prev.findIndex((m) => m.id.startsWith("local-"));
          if (i !== -1) {
            const copy = [...prev];
            copy[i] = incoming;
            return copy;
          }
        }
        return [...prev, incoming];
      });
      if (!mine) conversationsService.markRead(conversationId).catch(() => {});
    };

    chatService.connectSocket().then((s) => {
      if (cancelled) return;
      activeSocket = s;
      s.off("new_dm", onNewDm);
      s.on("new_dm", onNewDm);
      const joinNow = () => conversationsService.joinConversation(conversationId);
      if (s.connected) joinNow();
      s.on("connect", joinNow);
    });

    return () => {
      cancelled = true;
      conversationsService.leaveConversation(conversationId);
      activeSocket?.off("new_dm", onNewDm);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId, user?.id]);

  const handleSend = () => {
    const text = draft.trim();
    if (!text || !conversationId) return;

    const optimisticId = `local-${Date.now()}`;
    setMessages((prev) => [
      ...prev,
      { id: optimisticId, mine: true, text, sentAt: "Now" },
    ]);
    setDraft("");

    const socket = chatService.getSocket();
    if (socket?.connected) {
      conversationsService.sendDm(conversationId, text);
    } else {
      conversationsService.sendMessage(conversationId, text).catch(() => {});
    }
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
  const headerSubtitle = otherRole || "";

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
        <View style={styles.headerIconButton} />
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
          style={styles.messagesScroll}
          contentContainerStyle={[
            styles.messagesContent,
            { paddingBottom: insets.bottom + 18 },
          ]}
          showsVerticalScrollIndicator={false}
          keyboardDismissMode="interactive"
          keyboardShouldPersistTaps="handled"
        >
          {messages.map((message) => (
            <View
              key={message.id}
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
          ))}
        </ScrollView>
      )}

      <KeyboardStickyView offset={{ closed: 0, opened: 0 }}>
        <View style={[styles.composer, { paddingBottom: insets.bottom + 10 }]}>
          <View style={styles.inputWrap}>
            <TextInput
              value={draft}
              onChangeText={setDraft}
              placeholder="Type a message..."
              placeholderTextColor={theme.inputPlaceholder}
              style={styles.input}
              multiline
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
