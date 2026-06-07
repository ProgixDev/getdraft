import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSelector } from "react-redux";
import {
  useFonts,
  Poppins_400Regular,
  Poppins_500Medium,
  Poppins_600SemiBold,
  Poppins_700Bold,
} from "@expo-google-fonts/poppins";
import { brand, neutral, semantic, theme } from "@/config/colors";
import { RootState } from "@/store";
import { chatService } from "@/services/chat";
import type { Socket } from "socket.io-client";

type ChatMessage = {
  id: string;
  mine: boolean;
  text: string;
  sentAt: string;
};

type ChatHeader = {
  recruiterName: string;
  recruiterRole: string;
  organization: string;
  verified: boolean;
};

function formatTime(iso?: string): string {
  if (!iso) return "Now";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Now";
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export default function ChatScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const user = useSelector((state: RootState) => state.auth.user);
  const { threadId } = useLocalSearchParams<{ threadId?: string }>();
  const matchId = threadId ? String(threadId) : null;

  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [header, setHeader] = useState<ChatHeader | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const [fontsLoaded] = useFonts({
    Poppins_400Regular,
    Poppins_500Medium,
    Poppins_600SemiBold,
    Poppins_700Bold,
  });

  useEffect(() => {
    if (!matchId || !user?.id) return;
    let cancelled = false;
    setLoading(true);
    setLoadError(false);

    Promise.all([
      chatService
        .getThreads()
        .then((rows) =>
          (rows ?? []).find((r: any) => r.id === matchId) ?? null,
        )
        .catch(() => null),
      chatService.getMessages(matchId),
    ])
      .then(([h, msgs]) => {
        if (cancelled) return;
        if (h) {
          setHeader({
            recruiterName: h.recruiterName ?? "",
            recruiterRole: h.recruiterRole ?? "",
            organization: h.organization ?? "",
            verified: !!h.verified,
          });
        }
        const list = Array.isArray(msgs) ? msgs : (msgs?.messages ?? []);
        setMessages(
          (list ?? []).map((m: any) => ({
            id: String(m.id),
            mine: m.sender_id === user.id,
            text: m.text ?? "",
            sentAt: formatTime(m.created_at),
          })),
        );
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setLoadError(true);
        setLoading(false);
      });

    chatService.markRead(matchId).catch(() => {});

    let activeSocket: Socket | null = null;
    const onNewMessage = (msg: any) => {
      if (cancelled) return;
      const realId = String(msg.id ?? `live-${Date.now()}`);
      const mine = msg.senderId === user.id || msg.sender_id === user.id;
      const incoming: ChatMessage = {
        id: realId,
        mine,
        text: msg.text ?? "",
        sentAt: formatTime(msg.createdAt ?? msg.created_at),
      };
      setMessages((prev) => {
        if (prev.some((m) => m.id === realId)) return prev;
        if (mine) {
          const i = prev.findIndex(
            (m) => m.id.startsWith("local-") || m.id.startsWith("call-"),
          );
          if (i !== -1) {
            const copy = [...prev];
            copy[i] = incoming;
            return copy;
          }
        }
        return [...prev, incoming];
      });
    };

    chatService.connectSocket().then((s) => {
      if (cancelled) return;
      activeSocket = s;
      s.off("new_message", onNewMessage);
      s.on("new_message", onNewMessage);
      const joinNow = () => chatService.joinThread(matchId);
      if (s.connected) joinNow();
      s.on("connect", joinNow);
    });

    return () => {
      cancelled = true;
      chatService.leaveThread(matchId);
      activeSocket?.off("new_message", onNewMessage);
    };
  }, [matchId, user?.id]);

  const handleSend = () => {
    const text = draft.trim();
    if (!text || !matchId) return;

    const optimisticId = `local-${Date.now()}`;
    setMessages((prev) => [
      ...prev,
      { id: optimisticId, mine: true, text, sentAt: "Now" },
    ]);
    setDraft("");

    const socket = chatService.getSocket();
    if (socket?.connected) {
      chatService.sendSocketMessage(matchId, text);
    } else {
      chatService.sendMessage(matchId, text).catch(() => {});
    }
  };

  const handleAskForCall = () => {
    if (!matchId) return;
    const text =
      "Would you be available for a quick call this week to discuss next steps?";
    setMessages((prev) => [
      ...prev,
      { id: `call-${Date.now()}`, mine: true, text, sentAt: "Now" },
    ]);
    const socket = chatService.getSocket();
    if (socket?.connected) {
      chatService.sendSocketMessage(matchId, text);
    } else {
      chatService.sendMessage(matchId, text).catch(() => {});
    }
  };

  if (!fontsLoaded) return null;

  if (!matchId) {
    return (
      <View style={[styles.emptyContainer, { paddingTop: insets.top + 20 }]}>
        <Ionicons
          name="chatbox-ellipses-outline"
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

  const headerTitle = header?.recruiterName || "Conversation";
  const headerSubtitle =
    header && (header.recruiterRole || header.organization)
      ? [header.recruiterRole, header.organization].filter(Boolean).join(" • ")
      : "";

  return (
    <KeyboardAvoidingView
      style={[styles.container, { paddingTop: insets.top }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={styles.header}>
        <Pressable
          style={styles.headerIconButton}
          onPress={() => router.back()}
        >
          <Ionicons name="chevron-back" size={22} color={theme.text} />
        </Pressable>
        <View style={styles.headerCenter}>
          <View style={styles.headerTitleRow}>
            <Text style={styles.headerTitle}>{headerTitle}</Text>
            {header?.verified && (
              <Ionicons
                name="checkmark-circle"
                size={16}
                color={semantic.success}
              />
            )}
          </View>
          {headerSubtitle ? (
            <Text style={styles.headerSubtitle}>{headerSubtitle}</Text>
          ) : null}
        </View>
        <View style={styles.headerIconButton} />
      </View>

      <View style={styles.actionsBar}>
        <Pressable style={styles.callButton} onPress={handleAskForCall}>
          <Ionicons name="call-outline" size={16} color={theme.accentText} />
          <Text style={styles.callButtonText}>Ask for a call</Text>
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
        <Pressable style={styles.sendButton} onPress={handleSend}>
          <Ionicons name="send" size={18} color={theme.accentText} />
        </Pressable>
      </View>
    </KeyboardAvoidingView>
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
  headerCenter: {
    flex: 1,
  },
  headerTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
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
  },
  actionsBar: {
    backgroundColor: theme.headerBg,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
    alignItems: "flex-start",
    paddingLeft: 12,
    paddingRight: 12,
    paddingTop: 8,
    paddingBottom: 10,
  },
  callButton: {
    height: 36,
    borderRadius: 18,
    paddingHorizontal: 12,
    backgroundColor: theme.accent,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  callButtonText: {
    fontSize: 12,
    fontFamily: "Poppins_600SemiBold",
    color: theme.accentText,
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
