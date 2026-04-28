import React, { useEffect, useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSelector } from 'react-redux';
import {
  useFonts,
  Poppins_400Regular,
  Poppins_500Medium,
  Poppins_600SemiBold,
  Poppins_700Bold,
} from '@expo-google-fonts/poppins';
import { brand, neutral, semantic, theme } from '@/config/colors';
import { RootState } from '@/store';
import { mockParentChatThreads, ParentChatMessage } from '@/constants/parentData';
import { chatService } from '@/services/chat';

export default function ParentChatScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const user = useSelector((state: RootState) => state.auth.user);
  const { threadId } = useLocalSearchParams<{ threadId?: string }>();
  const [draft, setDraft] = useState('');
  const [messages, setMessages] = useState<ParentChatMessage[]>([]);

  const [fontsLoaded] = useFonts({
    Poppins_400Regular,
    Poppins_500Medium,
    Poppins_600SemiBold,
    Poppins_700Bold,
  });

  const thread = useMemo(
    () => (threadId ? mockParentChatThreads[String(threadId)] : undefined),
    [threadId]
  );

  // Load messages from API, fallback to mock
  useEffect(() => {
    if (!threadId) return;
    chatService
      .getMessages(String(threadId))
      .then((res) => {
        const apiMessages = (res.messages || res || []).map((m: any) => ({
          id: m.id,
          sender: m.sender_id === user?.id ? 'parent' : 'recruiter',
          text: m.text,
          sentAt: m.created_at || 'Now',
        }));
        if (apiMessages.length > 0) {
          setMessages(apiMessages);
        } else {
          setMessages(thread?.messages ?? []);
        }
      })
      .catch(() => {
        setMessages(thread?.messages ?? []);
      });

    // Connect WebSocket
    if (user?.id) {
      chatService.connectSocket(user.id).then(() => {
        chatService.joinThread(String(threadId));
        const socket = chatService.getSocket();
        socket?.on('new_message', (msg: any) => {
          setMessages((prev) => [
            ...prev,
            {
              id: msg.id,
              sender: msg.senderId === user?.id ? 'parent' : 'recruiter',
              text: msg.text,
              sentAt: msg.createdAt || 'Now',
            },
          ]);
        });
      });
    }

    return () => {
      if (threadId) chatService.leaveThread(String(threadId));
    };
  }, [threadId, user?.id]);

  const handleSend = () => {
    const text = draft.trim();
    if (!text) return;

    // Send via WebSocket (real-time) or REST fallback
    const socket = chatService.getSocket();
    if (socket?.connected && threadId) {
      chatService.sendSocketMessage(String(threadId), text);
    } else if (threadId) {
      chatService.sendMessage(String(threadId), text).catch(() => {});
    }

    setMessages((prev) => [
      ...prev,
      {
        id: `local-${Date.now()}`,
        sender: 'parent',
        text,
        sentAt: 'Now',
      },
    ]);
    setDraft('');
  };

  const handleAskForCall = () => {
    setMessages((prev) => [
      ...prev,
      {
        id: `call-${Date.now()}`,
        sender: 'parent',
        text: 'Would you be available for a quick call this week to discuss next steps?',
        sentAt: 'Now',
      },
    ]);
  };

  if (!fontsLoaded) return null;

  if (!thread || user?.role !== 'parent') {
    return (
      <View style={[styles.emptyContainer, { paddingTop: insets.top + 20 }]}>
        <Ionicons name="chatbox-ellipses-outline" size={54} color={neutral.gray400} />
        <Text style={styles.emptyTitle}>Conversation not available</Text>
        <Pressable style={styles.backButton} onPress={() => router.back()}>
          <Text style={styles.backButtonText}>Go Back</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={[styles.container, { paddingTop: insets.top }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.header}>
        <Pressable style={styles.headerIconButton} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={22} color={theme.text} />
        </Pressable>
        <View style={styles.headerCenter}>
          <View style={styles.headerTitleRow}>
            <Text style={styles.headerTitle}>{thread.recruiterName}</Text>
            {thread.verified && (
              <Ionicons name="checkmark-circle" size={16} color={semantic.success} />
            )}
          </View>
          <Text style={styles.headerSubtitle}>
            {thread.recruiterRole} • {thread.organization}
          </Text>
          <Text style={styles.headerChild}>Regarding {thread.childName}</Text>
        </View>
        <View style={styles.headerIconButton} />
      </View>

      <View style={styles.actionsBar}>
        <Pressable style={styles.callButton} onPress={handleAskForCall}>
          <Ionicons name="call-outline" size={16} color={theme.accentText} />
          <Text style={styles.callButtonText}>Ask for a call</Text>
        </Pressable>
      </View>

      <ScrollView
        style={styles.messagesScroll}
        contentContainerStyle={[styles.messagesContent, { paddingBottom: insets.bottom + 18 }]}
        showsVerticalScrollIndicator={false}
      >
        {messages.map((message) => {
          const isParentMessage = message.sender === 'parent';
          return (
            <View
              key={message.id}
              style={[
                styles.bubbleRow,
                isParentMessage ? styles.bubbleRowRight : styles.bubbleRowLeft,
              ]}
            >
              <View
                style={[
                  styles.bubble,
                  isParentMessage ? styles.parentBubble : styles.recruiterBubble,
                ]}
              >
                <Text
                  style={[
                    styles.bubbleText,
                    isParentMessage ? styles.parentBubbleText : styles.recruiterBubbleText,
                  ]}
                >
                  {message.text}
                </Text>
                <Text
                  style={[
                    styles.timeText,
                    isParentMessage ? styles.parentTimeText : styles.recruiterTimeText,
                  ]}
                >
                  {message.sentAt}
                </Text>
              </View>
            </View>
          );
        })}
      </ScrollView>

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
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerIconButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCenter: {
    flex: 1,
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  headerTitle: {
    fontSize: 16,
    fontFamily: 'Poppins_700Bold',
    color: theme.text,
  },
  headerSubtitle: {
    fontSize: 12,
    fontFamily: 'Poppins_500Medium',
    color: theme.textSecondary,
  },
  headerChild: {
    fontSize: 11,
    fontFamily: 'Poppins_400Regular',
    color: theme.textMuted,
  },
  actionsBar: {
    backgroundColor: theme.headerBg,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
    alignItems: 'flex-start',
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  callButtonText: {
    fontSize: 12,
    fontFamily: 'Poppins_600SemiBold',
    color: theme.accentText,
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
    flexDirection: 'row',
  },
  bubbleRowLeft: {
    justifyContent: 'flex-start',
  },
  bubbleRowRight: {
    justifyContent: 'flex-end',
  },
  bubble: {
    maxWidth: '82%',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  recruiterBubble: {
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.cardBorder,
  },
  parentBubble: {
    backgroundColor: brand.primary,
  },
  bubbleText: {
    fontSize: 13,
    lineHeight: 19,
    fontFamily: 'Poppins_400Regular',
  },
  recruiterBubbleText: {
    color: theme.text,
  },
  parentBubbleText: {
    color: brand.white,
  },
  timeText: {
    marginTop: 4,
    fontSize: 10,
    fontFamily: 'Poppins_500Medium',
  },
  recruiterTimeText: {
    color: theme.textMuted,
  },
  parentTimeText: {
    color: 'rgba(255,255,255,0.85)',
  },
  composer: {
    borderTopWidth: 1,
    borderTopColor: theme.border,
    backgroundColor: theme.headerBg,
    paddingHorizontal: 12,
    paddingTop: 10,
    flexDirection: 'row',
    alignItems: 'flex-end',
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
    fontFamily: 'Poppins_400Regular',
    color: theme.inputText,
  },
  sendButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: theme.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: theme.bg,
    paddingHorizontal: 24,
  },
  emptyTitle: {
    marginTop: 12,
    fontSize: 18,
    fontFamily: 'Poppins_600SemiBold',
    color: theme.text,
  },
  backButton: {
    marginTop: 14,
    height: 42,
    borderRadius: 21,
    paddingHorizontal: 18,
    backgroundColor: theme.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backButtonText: {
    color: theme.accentText,
    fontSize: 13,
    fontFamily: 'Poppins_600SemiBold',
  },
});
