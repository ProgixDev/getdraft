import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import {
  KeyboardProvider,
  KeyboardStickyView,
} from "react-native-keyboard-controller";
import { Image as ExpoImage } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { useSelector } from "react-redux";
import { useRouter } from "expo-router";
import {
  useFonts,
  Poppins_400Regular,
  Poppins_500Medium,
  Poppins_600SemiBold,
  Poppins_700Bold,
} from "@expo-google-fonts/poppins";

import { brand, theme } from "@/config/colors";
import { PHONE_MAX_WIDTH } from "@/lib/responsive";
import { RootState } from "@/store";
import { postsService, type CommentItem } from "@/services/posts";
import { usersService } from "@/services/users";

const { height: SCREEN_HEIGHT } = Dimensions.get("window");
const SHEET_HEIGHT = SCREEN_HEIGHT * 0.75;
const HEART_RED = "#FF3040";
const EMOJI_QUICK_ROW = ["❤️", "🙌", "😂", "😮", "😢", "👏", "🔥"];

function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "";
  const diff = Math.max(0, Date.now() - then);
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d`;
  return new Date(iso).toLocaleDateString();
}

function pluralLikes(n: number) {
  return `${n} ${n === 1 ? "like" : "likes"}`;
}

interface CommentsSheetProps {
  postId: string | null;
  visible: boolean;
  onClose: () => void;
  onCountChange?: (n: number) => void;
}

interface ReplyTarget {
  commentId: string;
  authorName: string;
}

export default function CommentsSheet({
  postId,
  visible,
  onClose,
  onCountChange,
}: CommentsSheetProps) {
  const me = useSelector((s: RootState) => s.auth.user);
  // The redux User type doesn't carry the avatar — login/signup payloads
  // don't include it — so the previous `s.auth.user.avatarUrl` selector was
  // always null and the composer never showed the user's photo. Fetch it on
  // open via /users/me (the same path more.tsx/profile.tsx use) and cache it.
  const [myAvatar, setMyAvatar] = useState<string | null>(null);
  const [fontsLoaded] = useFonts({
    Poppins_400Regular,
    Poppins_500Medium,
    Poppins_600SemiBold,
    Poppins_700Bold,
  });

  const [comments, setComments] = useState<CommentItem[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [text, setText] = useState("");
  const [replyTo, setReplyTo] = useState<ReplyTarget | null>(null);
  const [sending, setSending] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [expandedReplies, setExpandedReplies] = useState<Set<string>>(new Set());
  const inputRef = useRef<TextInput | null>(null);

  const totalCount = useMemo(
    () =>
      comments.reduce((sum, c) => sum + 1 + (c.replies?.length ?? 0), 0),
    [comments],
  );

  useEffect(() => {
    if (!visible || !postId) {
      setComments([]);
      setLoaded(false);
      setText("");
      setReplyTo(null);
      setErrorMsg(null);
      setExpandedReplies(new Set());
      return;
    }
    let cancelled = false;
    setLoading(true);
    setLoaded(false);
    postsService
      .getComments(postId)
      .then((rows) => {
        if (cancelled) return;
        setComments(rows ?? []);
        setLoaded(true);
      })
      .catch((err: any) => {
        if (cancelled) return;
        setComments([]);
        setErrorMsg(err?.response?.data?.message ?? "Failed to load comments.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [visible, postId]);

  // Lazily fetch /users/me on first open to populate the composer avatar.
  // Cached: only re-fetches if the avatar is still unknown next time the
  // sheet opens (the request is cheap and we cache in state).
  useEffect(() => {
    if (!visible) return;
    if (myAvatar) return;
    let cancelled = false;
    usersService
      .getMe()
      .then((u: any) => {
        if (!cancelled) setMyAvatar(u?.avatar_url ?? null);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [visible, myAvatar]);

  // Only propagate the count to the feed AFTER a successful load — a network
  // failure left totalCount at 0 and clobbered the badge on the post card,
  // making popular posts look empty whenever the comments endpoint hiccuped.
  useEffect(() => {
    if (visible && loaded) onCountChange?.(totalCount);
  }, [totalCount, visible, loaded, onCountChange]);

  const startReply = useCallback((c: CommentItem) => {
    setReplyTo({ commentId: c.id, authorName: c.author?.name ?? "user" });
    setExpandedReplies((prev) => {
      const next = new Set(prev);
      next.add(c.id);
      return next;
    });
    setTimeout(() => inputRef.current?.focus(), 30);
  }, []);

  const toggleReplies = useCallback((parentId: string) => {
    setExpandedReplies((prev) => {
      const next = new Set(prev);
      if (next.has(parentId)) next.delete(parentId);
      else next.add(parentId);
      return next;
    });
  }, []);

  const appendEmoji = useCallback((e: string) => {
    setText((prev) => (prev.length === 0 ? e : prev + e));
    setTimeout(() => inputRef.current?.focus(), 10);
  }, []);

  const send = useCallback(async () => {
    if (!postId) return;
    const t = text.trim();
    if (!t) return;
    setErrorMsg(null);
    setSending(true);
    try {
      const created = await postsService.addComment(
        postId,
        t,
        replyTo?.commentId,
      );
      setText("");
      const normalized: CommentItem = {
        ...created,
        likesCount: created.likesCount ?? 0,
        likedByMe: created.likedByMe ?? false,
      };
      if (replyTo) {
        const parentId = replyTo.commentId;
        setComments((prev) =>
          prev.map((c) =>
            c.id === parentId
              ? { ...c, replies: [...(c.replies ?? []), normalized] }
              : c,
          ),
        );
        setExpandedReplies((prev) => {
          const next = new Set(prev);
          next.add(parentId);
          return next;
        });
      } else {
        setComments((prev) => [...prev, { ...normalized, replies: [] }]);
      }
      setReplyTo(null);
    } catch (err: any) {
      const msg =
        err?.response?.data?.message ?? err?.message ?? "Could not send.";
      setErrorMsg(Array.isArray(msg) ? msg.join(", ") : String(msg));
    } finally {
      setSending(false);
    }
  }, [postId, text, replyTo]);

  const toggleLike = useCallback(
    async (commentId: string, parentId: string | null) => {
      let prevSnapshot: CommentItem | null = null;
      let nextLiked = false;
      setComments((prev) =>
        prev.map((c) => {
          if (parentId === null && c.id === commentId) {
            prevSnapshot = c;
            nextLiked = !c.likedByMe;
            return {
              ...c,
              likedByMe: nextLiked,
              likesCount: Math.max(0, c.likesCount + (nextLiked ? 1 : -1)),
            };
          }
          if (parentId !== null && c.id === parentId) {
            return {
              ...c,
              replies: (c.replies ?? []).map((r) => {
                if (r.id !== commentId) return r;
                prevSnapshot = r;
                nextLiked = !r.likedByMe;
                return {
                  ...r,
                  likedByMe: nextLiked,
                  likesCount: Math.max(
                    0,
                    r.likesCount + (nextLiked ? 1 : -1),
                  ),
                };
              }),
            };
          }
          return c;
        }),
      );
      try {
        if (nextLiked) await postsService.likeComment(commentId);
        else await postsService.unlikeComment(commentId);
      } catch {
        if (!prevSnapshot) return;
        const snap = prevSnapshot;
        setComments((prev) =>
          prev.map((c) => {
            if (parentId === null && c.id === commentId) return snap;
            if (parentId !== null && c.id === parentId) {
              return {
                ...c,
                replies: (c.replies ?? []).map((r) =>
                  r.id === commentId ? snap : r,
                ),
              };
            }
            return c;
          }),
        );
      }
    },
    [],
  );

  const deleteOne = useCallback(
    async (commentId: string, parentId: string | null) => {
      try {
        await postsService.deleteComment(commentId);
        if (parentId) {
          setComments((prev) =>
            prev.map((c) =>
              c.id === parentId
                ? {
                    ...c,
                    replies: (c.replies ?? []).filter((r) => r.id !== commentId),
                  }
                : c,
            ),
          );
        } else {
          setComments((prev) => prev.filter((c) => c.id !== commentId));
        }
      } catch (err: any) {
        const msg = err?.response?.data?.message ?? "Could not delete.";
        setErrorMsg(String(msg));
      }
    },
    [],
  );

  if (!fontsLoaded) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <KeyboardProvider>
      <View style={styles.root}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <View style={styles.sheetWrap}>
          <View style={[styles.sheet, { height: SHEET_HEIGHT }]}>
            <View style={styles.grabberRow}>
              <View style={styles.grabber} />
            </View>
            <View style={styles.header}>
              <Text style={styles.title}>Comments</Text>
              <Pressable
                onPress={onClose}
                style={styles.closeBtn}
                accessibilityLabel="Close comments"
                hitSlop={8}
              >
                <Ionicons name="chevron-down" size={20} color={theme.text} />
              </Pressable>
            </View>
            <View style={styles.headerDivider} />

            {loading ? (
              <View style={styles.centered}>
                <ActivityIndicator color={theme.text} />
              </View>
            ) : comments.length === 0 ? (
              <View style={styles.centered}>
                <Text style={styles.emptyTitle}>No comments yet</Text>
                <Text style={styles.emptyHint}>Start the conversation.</Text>
              </View>
            ) : (
              <ScrollView
                style={styles.list}
                contentContainerStyle={styles.listContent}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode="interactive"
                showsVerticalScrollIndicator={false}
              >
                {comments.map((c) => {
                  const expanded = expandedReplies.has(c.id);
                  const replyCount = c.replies?.length ?? 0;
                  return (
                    <View key={c.id} style={styles.commentBlock}>
                      <CommentRow
                        comment={c}
                        isReply={false}
                        isMine={me?.id === c.author?.id}
                        onReply={() => startReply(c)}
                        onLike={() => toggleLike(c.id, null)}
                        onDelete={() => deleteOne(c.id, null)}
                      />
                      {replyCount > 0 && (
                        <View style={styles.repliesContainer}>
                          <Pressable
                            onPress={() => toggleReplies(c.id)}
                            style={styles.repliesToggleRow}
                          >
                            <View style={styles.repliesToggleDash} />
                            <Text style={styles.repliesToggleText}>
                              {expanded
                                ? "Hide replies"
                                : `View replies (${replyCount})`}
                            </Text>
                          </Pressable>
                          {expanded &&
                            (c.replies ?? []).map((r) => (
                              <CommentRow
                                key={r.id}
                                comment={r}
                                isReply
                                isMine={me?.id === r.author?.id}
                                onLike={() => toggleLike(r.id, c.id)}
                                onDelete={() => deleteOne(r.id, c.id)}
                              />
                            ))}
                        </View>
                      )}
                    </View>
                  );
                })}
              </ScrollView>
            )}

            {errorMsg && <Text style={styles.errorMsg}>{errorMsg}</Text>}

            <KeyboardStickyView offset={{ closed: 0, opened: 0 }}>
              {replyTo && (
                <View style={styles.replyChip}>
                  <Text style={styles.replyChipText}>
                    Replying to{" "}
                    <Text style={styles.replyChipName}>
                      {replyTo.authorName}
                    </Text>
                  </Text>
                  <Pressable onPress={() => setReplyTo(null)} hitSlop={8}>
                    <Ionicons name="close" size={14} color={theme.text} />
                  </Pressable>
                </View>
              )}

              <View style={styles.emojiQuickRow}>
                {EMOJI_QUICK_ROW.map((e) => (
                  <Pressable
                    key={e}
                    onPress={() => appendEmoji(e)}
                    style={({ pressed }) => [
                      styles.emojiQuickBtn,
                      pressed && styles.pressed,
                    ]}
                  >
                    <Text style={styles.emojiQuickText}>{e}</Text>
                  </Pressable>
                ))}
              </View>

              <View style={styles.composer}>
                {myAvatar ? (
                  <ExpoImage
                    source={{ uri: myAvatar }}
                    style={styles.composerAvatar}
                    contentFit="cover"
                  />
                ) : (
                  <View style={[styles.composerAvatar, styles.avatarFallback]}>
                    <Ionicons
                      name="person"
                      size={14}
                      color={theme.textMuted}
                    />
                  </View>
                )}
                <TextInput
                  ref={inputRef}
                  value={text}
                  onChangeText={setText}
                  placeholder={
                    replyTo
                      ? `Reply to ${replyTo.authorName}…`
                      : "Add a comment…"
                  }
                  placeholderTextColor={theme.inputPlaceholder}
                  style={styles.composerInput}
                  multiline
                  maxLength={2000}
                  editable={!sending}
                />
                {text.trim().length > 0 && (
                  <Pressable
                    onPress={send}
                    disabled={sending}
                    style={({ pressed }) => [
                      styles.postBtn,
                      pressed && styles.pressed,
                    ]}
                    accessibilityLabel="Post comment"
                    hitSlop={6}
                  >
                    {sending ? (
                      <ActivityIndicator
                        size="small"
                        color={theme.accentText}
                      />
                    ) : (
                      <Text style={styles.postBtnText}>Post</Text>
                    )}
                  </Pressable>
                )}
              </View>
            </KeyboardStickyView>
          </View>
        </View>
      </View>
      </KeyboardProvider>
    </Modal>
  );
}

function CommentRow({
  comment,
  isReply,
  isMine,
  onReply,
  onLike,
  onDelete,
}: {
  comment: CommentItem;
  isReply: boolean;
  isMine: boolean;
  onReply?: () => void;
  onLike: () => void;
  onDelete: () => void;
}) {
  const router = useRouter();
  const avatarSize = isReply ? 28 : 36;
  const authorId = comment.author?.id;
  const openAuthor = authorId
    ? () => router.push({ pathname: "/user/[userId]", params: { userId: authorId } })
    : undefined;
  return (
    <Pressable
      onLongPress={isMine ? onDelete : undefined}
      delayLongPress={350}
      style={({ pressed }) => [
        styles.commentRow,
        isReply && styles.commentRowReply,
        pressed && isMine && styles.pressed,
      ]}
    >
      <Pressable
        onPress={openAuthor}
        disabled={!openAuthor}
        accessibilityRole={openAuthor ? "button" : undefined}
        accessibilityLabel={
          openAuthor ? `Open ${comment.author?.name ?? "user"}'s profile` : undefined
        }
      >
        {comment.author?.avatarUrl ? (
          <ExpoImage
            source={{ uri: comment.author.avatarUrl }}
            style={{
              width: avatarSize,
              height: avatarSize,
              borderRadius: avatarSize / 2,
              backgroundColor: theme.surface,
            }}
            contentFit="cover"
          />
        ) : (
          <View
            style={[
              {
                width: avatarSize,
                height: avatarSize,
                borderRadius: avatarSize / 2,
                backgroundColor: theme.surface,
              },
              styles.avatarFallback,
            ]}
          >
            <Ionicons
              name="person"
              size={isReply ? 12 : 16}
              color={theme.textMuted}
            />
          </View>
        )}
      </Pressable>
      <View style={styles.commentBody}>
        <Text style={styles.commentText}>
          <Text style={styles.commentAuthor}>
            {comment.author?.name || "someone"}
          </Text>
          {"  "}
          {comment.text}
        </Text>
        <View style={styles.metaRow}>
          <Text style={styles.metaTime}>{timeAgo(comment.createdAt)}</Text>
          {comment.likesCount > 0 && (
            <Text style={styles.metaText}>{pluralLikes(comment.likesCount)}</Text>
          )}
          {onReply && (
            <Pressable onPress={onReply} hitSlop={6}>
              <Text style={styles.metaReply}>Reply</Text>
            </Pressable>
          )}
          {isMine && (
            <Pressable onPress={onDelete} hitSlop={6}>
              <Ionicons
                name="trash-outline"
                size={12}
                color={theme.textMuted}
              />
            </Pressable>
          )}
        </View>
      </View>
      <Pressable
        onPress={onLike}
        style={styles.likeBtn}
        hitSlop={8}
        accessibilityLabel={comment.likedByMe ? "Unlike comment" : "Like comment"}
      >
        <Ionicons
          name={comment.likedByMe ? "heart" : "heart-outline"}
          size={16}
          color={comment.likedByMe ? HEART_RED : theme.text}
        />
      </Pressable>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: "flex-end",
    alignItems: "center",
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.55)",
  },
  sheetWrap: {
    width: "100%",
    maxWidth: PHONE_MAX_WIDTH,
    alignSelf: "center",
  },
  sheet: {
    backgroundColor: theme.cardBg,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingHorizontal: 14,
    paddingTop: 6,
    paddingBottom: 12,
  },
  grabberRow: {
    alignItems: "center",
    paddingVertical: 6,
  },
  grabber: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: theme.border,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 4,
    position: "relative",
  },
  title: {
    fontSize: 15,
    fontFamily: "Poppins_700Bold",
    color: theme.text,
  },
  closeBtn: {
    position: "absolute",
    right: 0,
    top: 0,
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  headerDivider: {
    height: 1,
    backgroundColor: theme.border,
    marginHorizontal: -14,
    marginTop: 4,
    marginBottom: 6,
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  emptyTitle: {
    fontSize: 15,
    fontFamily: "Poppins_700Bold",
    color: theme.text,
  },
  emptyHint: {
    fontSize: 12,
    fontFamily: "Poppins_400Regular",
    color: theme.textSecondary,
  },
  list: {
    flexGrow: 1,
    flexShrink: 1,
  },
  listContent: {
    paddingTop: 4,
    // Composer + emoji row stay anchored below the list when the keyboard is
    // closed; once it opens the composer rises onto the keyboard and would
    // otherwise overlap the last few comments. Reserve room so the user can
    // scroll the bottom of the list out from behind the sticky composer.
    paddingBottom: 160,
    gap: 14,
  },
  commentBlock: {
    gap: 6,
  },
  repliesContainer: {
    paddingLeft: 44,
    gap: 10,
    marginTop: 4,
  },
  repliesToggleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 2,
  },
  repliesToggleDash: {
    width: 22,
    height: 1,
    backgroundColor: theme.border,
  },
  repliesToggleText: {
    fontSize: 12,
    fontFamily: "Poppins_600SemiBold",
    color: theme.textSecondary,
  },
  commentRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  commentRowReply: {
    paddingTop: 0,
  },
  avatarFallback: {
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: theme.border,
  },
  commentBody: {
    flex: 1,
    paddingTop: 2,
  },
  commentText: {
    fontSize: 13,
    fontFamily: "Poppins_400Regular",
    color: theme.text,
    lineHeight: 18,
  },
  commentAuthor: {
    fontFamily: "Poppins_600SemiBold",
    color: theme.text,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    marginTop: 4,
  },
  metaTime: {
    fontSize: 11,
    fontFamily: "Poppins_500Medium",
    color: theme.textMuted,
  },
  metaText: {
    fontSize: 11,
    fontFamily: "Poppins_600SemiBold",
    color: theme.textSecondary,
  },
  metaReply: {
    fontSize: 11,
    fontFamily: "Poppins_600SemiBold",
    color: theme.textSecondary,
  },
  likeBtn: {
    minWidth: 24,
    paddingTop: 4,
    alignItems: "center",
    justifyContent: "center",
  },
  errorMsg: {
    color: "#FF7675",
    fontSize: 12,
    fontFamily: "Poppins_500Medium",
    textAlign: "center",
    marginTop: 4,
  },
  replyChip: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 6,
    marginHorizontal: -14,
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: theme.surface,
    borderTopWidth: 1,
    borderTopColor: theme.border,
  },
  replyChipText: {
    fontSize: 12,
    fontFamily: "Poppins_500Medium",
    color: theme.textSecondary,
  },
  replyChipName: {
    fontFamily: "Poppins_700Bold",
    color: theme.text,
  },
  emojiQuickRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
    marginHorizontal: -14,
    paddingHorizontal: 14,
    borderTopWidth: 1,
    borderTopColor: theme.border,
  },
  emojiQuickBtn: {
    paddingVertical: 4,
    paddingHorizontal: 4,
  },
  emojiQuickText: {
    fontSize: 22,
  },
  composer: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
    paddingTop: 6,
  },
  composerAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: theme.surface,
  },
  composerInput: {
    flex: 1,
    minHeight: 38,
    maxHeight: 110,
    borderWidth: 1,
    borderColor: theme.inputBorder,
    backgroundColor: theme.inputBg,
    borderRadius: 19,
    paddingHorizontal: 14,
    paddingVertical: 9,
    fontFamily: "Poppins_400Regular",
    color: theme.inputText,
    fontSize: 13,
  },
  postBtn: {
    paddingHorizontal: 4,
    paddingVertical: 8,
  },
  postBtnText: {
    fontSize: 13,
    fontFamily: "Poppins_700Bold",
    color: "#1DA1F2",
  },
  pressed: {
    opacity: 0.85,
  },
});
