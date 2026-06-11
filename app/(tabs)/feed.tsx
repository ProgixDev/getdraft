import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AccessibilityInfo,
  ActivityIndicator,
  Dimensions,
  FlatList,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
  type ViewToken,
} from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { Image as ExpoImage } from "expo-image";
import { VideoView, useVideoPlayer } from "expo-video";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import {
  useFonts,
  Poppins_400Regular,
  Poppins_500Medium,
  Poppins_600SemiBold,
  Poppins_700Bold,
} from "@expo-google-fonts/poppins";

import { brand, theme } from "@/config/colors";
import { postsService, type PostItem, type PostKind } from "@/services/posts";
import CommentsSheet from "@/components/posts/CommentsSheet";
import { useRoleHomeRedirect } from "@/lib/roleRoutes";

const { height: SCREEN_HEIGHT, width: SCREEN_WIDTH } = Dimensions.get("window");

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
  const w = Math.floor(d / 7);
  if (w < 5) return `${w}w`;
  return new Date(iso).toLocaleDateString();
}

export default function FeedScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  // Feed is athletes-only. Anyone else lands on their role's home via
  // useRoleHomeRedirect (focus-based, survives back-navigation).
  const redirecting = useRoleHomeRedirect(["athlete"]);
  const [fontsLoaded] = useFonts({
    Poppins_400Regular,
    Poppins_500Medium,
    Poppins_600SemiBold,
    Poppins_700Bold,
  });

  const [kind, setKind] = useState<PostKind>("post");
  const [posts, setPosts] = useState<PostItem[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [commentsForPost, setCommentsForPost] = useState<string | null>(null);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReducedMotion).catch(() => {});
    const sub = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      setReducedMotion,
    );
    return () => sub.remove();
  }, []);

  const load = useCallback(
    async (k: PostKind, p: number, mode: "replace" | "append" | "refresh") => {
      try {
        if (mode === "replace") setLoading(true);
        if (mode === "refresh") setRefreshing(true);
        if (mode === "append") setLoadingMore(true);
        setErrorMsg(null);
        const res = await postsService.getFeed(k, p, 20);
        setPosts((prev) =>
          mode === "append" ? [...prev, ...res.posts] : res.posts,
        );
        setHasMore(res.hasMore);
        setPage(p);
      } catch (err: any) {
        const msg =
          err?.response?.data?.message ?? err?.message ?? "Failed to load feed";
        setErrorMsg(String(msg));
        if (mode !== "append") setPosts([]);
      } finally {
        setLoading(false);
        setRefreshing(false);
        setLoadingMore(false);
      }
    },
    [],
  );

  useFocusEffect(
    useCallback(() => {
      load(kind, 1, "replace");
    }, [kind, load]),
  );

  const onRefresh = useCallback(() => load(kind, 1, "refresh"), [kind, load]);
  const onEndReached = useCallback(() => {
    if (loadingMore || !hasMore || loading) return;
    load(kind, page + 1, "append");
  }, [hasMore, kind, load, loading, loadingMore, page]);

  const handleLikeToggle = useCallback(async (post: PostItem) => {
    const willLike = !post.likedByMe;
    setPosts((prev) =>
      prev.map((p) =>
        p.id === post.id
          ? {
              ...p,
              likedByMe: willLike,
              likesCount: Math.max(0, p.likesCount + (willLike ? 1 : -1)),
            }
          : p,
      ),
    );
    try {
      if (willLike) await postsService.likePost(post.id);
      else await postsService.unlikePost(post.id);
    } catch {
      setPosts((prev) =>
        prev.map((p) =>
          p.id === post.id
            ? {
                ...p,
                likedByMe: post.likedByMe,
                likesCount: post.likesCount,
              }
            : p,
        ),
      );
    }
  }, []);

  const handleCommentCountChange = useCallback(
    (postId: string, count: number) => {
      setPosts((prev) =>
        prev.map((p) => (p.id === postId ? { ...p, commentsCount: count } : p)),
      );
    },
    [],
  );

  const handleSheetCountChange = useCallback(
    (n: number) => {
      if (commentsForPost) handleCommentCountChange(commentsForPost, n);
    },
    [commentsForPost, handleCommentCountChange],
  );

  if (!fontsLoaded) return null;

  const isReels = kind === "reel";

  if (redirecting) return null;

  return (
    <View style={[styles.container, isReels && styles.containerReels]}>
      <View
        style={[
          styles.header,
          isReels && styles.headerOverlay,
          { paddingTop: insets.top + 6 },
        ]}
      >
        <Text style={[styles.title, isReels && styles.titleOverlay]}>Feed</Text>

        <View style={styles.toggleWrap}>
          <Pressable
            onPress={() => setKind("post")}
            style={({ pressed }) => [
              styles.toggleBtn,
              kind === "post" && styles.toggleBtnActive,
              pressed && styles.pressed,
            ]}
          >
            <Ionicons
              name="images"
              size={14}
              color={kind === "post" ? theme.accentText : theme.text}
            />
            <Text
              style={[
                styles.toggleText,
                kind === "post" && styles.toggleTextActive,
              ]}
            >
              Posts
            </Text>
          </Pressable>
          <Pressable
            onPress={() => setKind("reel")}
            style={({ pressed }) => [
              styles.toggleBtn,
              kind === "reel" && styles.toggleBtnActive,
              pressed && styles.pressed,
            ]}
          >
            <Ionicons
              name="play"
              size={14}
              color={kind === "reel" ? theme.accentText : theme.text}
            />
            <Text
              style={[
                styles.toggleText,
                kind === "reel" && styles.toggleTextActive,
              ]}
            >
              Reels
            </Text>
          </Pressable>
        </View>

        <Pressable
          style={({ pressed }) => [
            styles.plusButton,
            pressed && styles.pressed,
          ]}
          onPress={() => router.push("/post-create")}
          accessibilityLabel="Create post"
        >
          <Ionicons name="add" size={22} color={brand.white} />
        </Pressable>
      </View>

      {isReels ? (
        <ReelsList
          posts={posts}
          loading={loading}
          refreshing={refreshing}
          onRefresh={onRefresh}
          onEndReached={onEndReached}
          loadingMore={loadingMore}
          onLikeToggle={handleLikeToggle}
          onOpenComments={(id) => setCommentsForPost(id)}
          reducedMotion={reducedMotion}
          headerHeight={insets.top + 60}
          tabBarHeight={68 + insets.bottom}
          errorMsg={errorMsg}
        />
      ) : (
        <PostsList
          posts={posts}
          loading={loading}
          refreshing={refreshing}
          onRefresh={onRefresh}
          onEndReached={onEndReached}
          loadingMore={loadingMore}
          onLikeToggle={handleLikeToggle}
          onOpenComments={(id) => setCommentsForPost(id)}
          insetsBottom={insets.bottom}
          errorMsg={errorMsg}
        />
      )}

      <CommentsSheet
        postId={commentsForPost}
        visible={commentsForPost !== null}
        onClose={() => setCommentsForPost(null)}
        onCountChange={handleSheetCountChange}
      />
    </View>
  );
}

// ---- DOUBLE-TAP HELPERS ----

const DOUBLE_TAP_DELAY = 260;

function useDoubleTap({
  onSingle,
  onDouble,
}: {
  onSingle?: () => void;
  onDouble: () => void;
}) {
  const lastTapAt = useRef(0);
  const pending = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (pending.current) clearTimeout(pending.current);
    },
    [],
  );

  return useCallback(() => {
    const now = Date.now();
    if (now - lastTapAt.current < DOUBLE_TAP_DELAY) {
      lastTapAt.current = 0;
      if (pending.current) {
        clearTimeout(pending.current);
        pending.current = null;
      }
      onDouble();
    } else {
      lastTapAt.current = now;
      if (onSingle) {
        pending.current = setTimeout(() => {
          pending.current = null;
          onSingle();
        }, DOUBLE_TAP_DELAY);
      }
    }
  }, [onDouble, onSingle]);
}

function useHeartBurst() {
  const scale = useSharedValue(0);
  const opacity = useSharedValue(0);

  const trigger = useCallback(() => {
    scale.value = 0.6;
    opacity.value = 0;
    scale.value = withSequence(
      withTiming(1.15, { duration: 160, easing: Easing.out(Easing.cubic) }),
      withTiming(0, { duration: 260, easing: Easing.in(Easing.cubic) }),
    );
    opacity.value = withSequence(
      withTiming(1, { duration: 80 }),
      withTiming(0, { duration: 320 }),
    );
  }, [scale, opacity]);

  const style = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  return { trigger, style };
}

function HeartBurst({ size = 110, style }: { size?: number; style: any }) {
  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.heartBurst, style]}
    >
      <Ionicons name="heart" size={size} color="#FF4D6D" />
    </Animated.View>
  );
}

// ---- POSTS LIST ----

interface PostsListProps {
  posts: PostItem[];
  loading: boolean;
  refreshing: boolean;
  onRefresh: () => void;
  onEndReached: () => void;
  loadingMore: boolean;
  onLikeToggle: (p: PostItem) => void;
  onOpenComments: (id: string) => void;
  insetsBottom: number;
  errorMsg: string | null;
}

function PostsList({
  posts,
  loading,
  refreshing,
  onRefresh,
  onEndReached,
  loadingMore,
  onLikeToggle,
  onOpenComments,
  insetsBottom,
  errorMsg,
}: PostsListProps) {
  if (loading && !refreshing) {
    return (
      <View style={styles.centerFill}>
        <ActivityIndicator size="large" color={theme.text} />
      </View>
    );
  }
  if (posts.length === 0) {
    return (
      <View style={styles.centerFill}>
        <Ionicons name="images-outline" size={36} color={theme.textMuted} />
        <Text style={styles.emptyTitle}>No posts yet</Text>
        <Text style={styles.emptyHint}>Be the first to share a moment.</Text>
        {errorMsg && <Text style={styles.errorTextInline}>{errorMsg}</Text>}
      </View>
    );
  }
  return (
    <FlatList
      data={posts}
      keyExtractor={(p) => p.id}
      contentContainerStyle={{ paddingBottom: insetsBottom + 90 }}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={theme.text}
        />
      }
      onEndReached={onEndReached}
      onEndReachedThreshold={0.4}
      ListFooterComponent={
        loadingMore ? (
          <View style={{ paddingVertical: 16 }}>
            <ActivityIndicator color={theme.text} />
          </View>
        ) : null
      }
      renderItem={({ item }) => (
        <PostCard
          post={item}
          onLikeToggle={onLikeToggle}
          onOpenComments={onOpenComments}
        />
      )}
    />
  );
}

function PostCard({
  post,
  onLikeToggle,
  onOpenComments,
}: {
  post: PostItem;
  onLikeToggle: (p: PostItem) => void;
  onOpenComments: (id: string) => void;
}) {
  const heart = useHeartBurst();
  const handleDoubleTapLike = useCallback(() => {
    heart.trigger();
    if (!post.likedByMe) onLikeToggle(post);
  }, [heart, onLikeToggle, post]);
  const onMediaPress = useDoubleTap({ onDouble: handleDoubleTapLike });

  return (
    <View style={styles.card}>
      <View style={styles.cardAuthorRow}>
        {post.author?.avatarUrl ? (
          <ExpoImage
            source={{ uri: post.author.avatarUrl }}
            style={styles.cardAvatar}
            contentFit="cover"
          />
        ) : (
          <View style={[styles.cardAvatar, styles.cardAvatarFallback]}>
            <Ionicons name="person" size={16} color={theme.textMuted} />
          </View>
        )}
        <View style={{ flex: 1 }}>
          <Text style={styles.cardAuthorName} numberOfLines={1}>
            {post.author?.name || "Someone"}
          </Text>
          <Text style={styles.cardTime}>{timeAgo(post.createdAt)}</Text>
        </View>
      </View>

      <Pressable
        onPress={onMediaPress}
        style={styles.cardMediaWrap}
        accessibilityLabel="Double-tap to like"
      >
        <ExpoImage
          source={{ uri: post.mediaUrl }}
          style={styles.cardImage}
          contentFit="cover"
          transition={180}
        />
        <HeartBurst style={heart.style} />
      </Pressable>

      <View style={styles.cardActions}>
        <Pressable
          style={({ pressed }) => [styles.actionBtn, pressed && styles.pressed]}
          onPress={() => onLikeToggle(post)}
          accessibilityLabel={post.likedByMe ? "Unlike" : "Like"}
        >
          <Ionicons
            name={post.likedByMe ? "heart" : "heart-outline"}
            size={22}
            color={post.likedByMe ? "#FF4D6D" : theme.text}
          />
          <Text style={styles.actionCount}>{post.likesCount}</Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [styles.actionBtn, pressed && styles.pressed]}
          onPress={() => onOpenComments(post.id)}
          accessibilityLabel="Open comments"
        >
          <Ionicons name="chatbubble-outline" size={20} color={theme.text} />
          <Text style={styles.actionCount}>{post.commentsCount}</Text>
        </Pressable>
      </View>

      {post.caption ? (
        <Text style={styles.cardCaption}>
          <Text style={styles.cardCaptionAuthor}>
            {post.author?.name || "Someone"}{" "}
          </Text>
          {post.caption}
        </Text>
      ) : null}
    </View>
  );
}

// ---- REELS LIST ----

interface ReelsListProps {
  posts: PostItem[];
  loading: boolean;
  refreshing: boolean;
  onRefresh: () => void;
  onEndReached: () => void;
  loadingMore: boolean;
  onLikeToggle: (p: PostItem) => void;
  onOpenComments: (id: string) => void;
  reducedMotion: boolean;
  headerHeight: number;
  tabBarHeight: number;
  errorMsg: string | null;
}

function ReelsList({
  posts,
  loading,
  refreshing,
  onRefresh,
  onEndReached,
  loadingMore,
  onLikeToggle,
  onOpenComments,
  reducedMotion,
  headerHeight,
  tabBarHeight,
  errorMsg,
}: ReelsListProps) {
  const itemHeight = SCREEN_HEIGHT - tabBarHeight;
  const [activeId, setActiveId] = useState<string | null>(null);

  const viewabilityConfig = useRef({
    itemVisiblePercentThreshold: 70,
  }).current;

  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      const first = viewableItems[0];
      if (first?.item) setActiveId((first.item as PostItem).id);
    },
  ).current;

  if (loading && !refreshing) {
    return (
      <View style={[styles.centerFill, styles.reelsCenterFill]}>
        <ActivityIndicator size="large" color={brand.white} />
      </View>
    );
  }
  if (posts.length === 0) {
    return (
      <View style={[styles.centerFill, styles.reelsCenterFill]}>
        <Ionicons name="film-outline" size={36} color="rgba(255,255,255,0.5)" />
        <Text style={[styles.emptyTitle, { color: brand.white }]}>
          No reels yet
        </Text>
        <Text style={[styles.emptyHint, { color: "rgba(255,255,255,0.7)" }]}>
          Share a quick video to get started.
        </Text>
        {errorMsg && (
          <Text style={styles.errorTextInline}>{errorMsg}</Text>
        )}
      </View>
    );
  }

  return (
    <FlatList
      data={posts}
      keyExtractor={(p) => p.id}
      style={styles.reelsList}
      pagingEnabled
      snapToInterval={itemHeight}
      decelerationRate="fast"
      showsVerticalScrollIndicator={false}
      onViewableItemsChanged={onViewableItemsChanged}
      viewabilityConfig={viewabilityConfig}
      onEndReached={onEndReached}
      onEndReachedThreshold={0.6}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={brand.white}
        />
      }
      ListFooterComponent={
        loadingMore ? (
          <View style={{ paddingVertical: 16 }}>
            <ActivityIndicator color={brand.white} />
          </View>
        ) : null
      }
      renderItem={({ item }) => (
        <ReelItem
          post={item}
          isActive={item.id === activeId}
          height={itemHeight}
          topInset={headerHeight}
          autoplay={!reducedMotion}
          onLikeToggle={onLikeToggle}
          onOpenComments={onOpenComments}
        />
      )}
    />
  );
}

function ReelItem({
  post,
  isActive,
  height,
  topInset,
  autoplay,
  onLikeToggle,
  onOpenComments,
}: {
  post: PostItem;
  isActive: boolean;
  height: number;
  topInset: number;
  autoplay: boolean;
  onLikeToggle: (p: PostItem) => void;
  onOpenComments: (id: string) => void;
}) {
  const player = useVideoPlayer(post.mediaUrl, (p) => {
    p.loop = true;
    p.muted = true;
  });
  const [muted, setMuted] = useState(true);
  const [userPaused, setUserPaused] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const heart = useHeartBurst();

  useEffect(() => {
    if (!player) return;
    if (fullscreen) {
      if (!userPaused) player.play();
      return;
    }
    if (isActive && autoplay && !userPaused) {
      player.play();
    } else {
      player.pause();
    }
  }, [isActive, autoplay, userPaused, player, fullscreen]);

  const singleTapPlayPause = useCallback(() => {
    if (!isActive) return;
    if (userPaused) {
      setUserPaused(false);
      player.play();
    } else {
      setUserPaused(true);
      player.pause();
    }
  }, [isActive, userPaused, player]);

  const doubleTapLike = useCallback(() => {
    heart.trigger();
    if (!post.likedByMe) onLikeToggle(post);
  }, [heart, onLikeToggle, post]);

  const onMediaPress = useDoubleTap({
    onSingle: singleTapPlayPause,
    onDouble: doubleTapLike,
  });

  return (
    <View style={[styles.reelItem, { height }]}>
      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={onMediaPress}
        onLongPress={() => {
          const next = !muted;
          setMuted(next);
          player.muted = next;
        }}
      >
        {!fullscreen && (
          <VideoView
            player={player}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            nativeControls={false}
          />
        )}
      </Pressable>
      <HeartBurst style={heart.style} size={160} />

      <View
        pointerEvents="box-none"
        style={[styles.reelOverlay, { paddingTop: topInset }]}
      >
        <View style={styles.reelActionsCol} pointerEvents="auto">
          <Pressable
            style={({ pressed }) => [
              styles.reelActionBtn,
              pressed && styles.pressed,
            ]}
            onPress={() => onLikeToggle(post)}
            accessibilityLabel={post.likedByMe ? "Unlike" : "Like"}
          >
            <Ionicons
              name={post.likedByMe ? "heart" : "heart-outline"}
              size={32}
              color={post.likedByMe ? "#FF4D6D" : brand.white}
            />
            <Text style={styles.reelActionCount}>{post.likesCount}</Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [
              styles.reelActionBtn,
              pressed && styles.pressed,
            ]}
            onPress={() => onOpenComments(post.id)}
            accessibilityLabel="Open comments"
          >
            <Ionicons name="chatbubble" size={28} color={brand.white} />
            <Text style={styles.reelActionCount}>{post.commentsCount}</Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [
              styles.reelActionBtn,
              pressed && styles.pressed,
            ]}
            onPress={() => {
              const next = !muted;
              setMuted(next);
              player.muted = next;
            }}
            accessibilityLabel={muted ? "Unmute" : "Mute"}
          >
            <Ionicons
              name={muted ? "volume-mute" : "volume-high"}
              size={26}
              color={brand.white}
            />
          </Pressable>
          <Pressable
            style={({ pressed }) => [
              styles.reelActionBtn,
              pressed && styles.pressed,
            ]}
            onPress={() => setFullscreen(true)}
            accessibilityLabel="Enter fullscreen"
          >
            <Ionicons name="expand" size={26} color={brand.white} />
          </Pressable>
        </View>

        <View style={styles.reelBottom} pointerEvents="auto">
          <View style={styles.reelAuthorRow}>
            {post.author?.avatarUrl ? (
              <ExpoImage
                source={{ uri: post.author.avatarUrl }}
                style={styles.reelAvatar}
                contentFit="cover"
              />
            ) : (
              <View style={[styles.reelAvatar, styles.cardAvatarFallback]}>
                <Ionicons name="person" size={14} color={theme.textMuted} />
              </View>
            )}
            <Text style={styles.reelAuthorName} numberOfLines={1}>
              {post.author?.name || "Someone"}
            </Text>
            <Text style={styles.reelTime}>· {timeAgo(post.createdAt)}</Text>
          </View>
          {post.caption ? (
            <Text style={styles.reelCaption} numberOfLines={3}>
              {post.caption}
            </Text>
          ) : null}
        </View>
      </View>

      <Modal
        visible={fullscreen}
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setFullscreen(false)}
      >
        <View style={styles.fsRoot}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => {
              if (userPaused) {
                setUserPaused(false);
                player.play();
              } else {
                setUserPaused(true);
                player.pause();
              }
            }}
          >
            {fullscreen && (
              <VideoView
                player={player}
                style={StyleSheet.absoluteFill}
                contentFit="contain"
                nativeControls={false}
              />
            )}
          </Pressable>
          <Pressable
            style={({ pressed }) => [
              styles.fsExitBtn,
              pressed && styles.pressed,
            ]}
            onPress={() => setFullscreen(false)}
            accessibilityLabel="Exit fullscreen"
            hitSlop={10}
          >
            <Ionicons name="contract" size={26} color={brand.white} />
          </Pressable>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.bg,
  },
  containerReels: {
    backgroundColor: "#000",
  },
  header: {
    paddingHorizontal: 14,
    paddingBottom: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: theme.headerBg,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  headerOverlay: {
    backgroundColor: "rgba(0,0,0,0.55)",
    borderBottomColor: "transparent",
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    zIndex: 10,
  },
  title: {
    fontSize: 20,
    fontFamily: "Poppins_700Bold",
    color: theme.text,
  },
  titleOverlay: {
    color: brand.white,
  },
  toggleWrap: {
    flexDirection: "row",
    backgroundColor: theme.surface,
    borderRadius: 999,
    padding: 4,
    flex: 1,
    marginHorizontal: 8,
    borderWidth: 1,
    borderColor: theme.border,
  },
  toggleBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 8,
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
  plusButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: brand.primary,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: theme.border,
  },
  centerFill: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  reelsCenterFill: {
    backgroundColor: "#000",
  },
  emptyTitle: {
    fontSize: 14,
    fontFamily: "Poppins_600SemiBold",
    color: theme.text,
    marginTop: 6,
  },
  emptyHint: {
    fontSize: 12,
    fontFamily: "Poppins_400Regular",
    color: theme.textSecondary,
  },
  errorTextInline: {
    marginTop: 10,
    fontSize: 12,
    fontFamily: "Poppins_500Medium",
    color: "#FF7675",
  },
  card: {
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  cardAuthorRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 10,
  },
  cardAvatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: theme.surface,
  },
  cardAvatarFallback: {
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: theme.border,
  },
  cardAuthorName: {
    fontSize: 13,
    fontFamily: "Poppins_600SemiBold",
    color: theme.text,
  },
  cardTime: {
    marginTop: 1,
    fontSize: 11,
    fontFamily: "Poppins_400Regular",
    color: theme.textMuted,
  },
  cardMediaWrap: {
    width: SCREEN_WIDTH - 28,
    height: SCREEN_WIDTH - 28,
    borderRadius: 14,
    overflow: "hidden",
    backgroundColor: theme.surface,
  },
  cardImage: {
    width: "100%",
    height: "100%",
  },
  heartBurst: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
    textShadowColor: "rgba(0,0,0,0.4)",
    textShadowRadius: 8,
  },
  cardActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 18,
    marginTop: 10,
  },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  actionCount: {
    fontSize: 13,
    fontFamily: "Poppins_600SemiBold",
    color: theme.text,
  },
  cardCaption: {
    marginTop: 8,
    fontSize: 13,
    fontFamily: "Poppins_400Regular",
    color: theme.text,
    lineHeight: 19,
  },
  cardCaptionAuthor: {
    fontFamily: "Poppins_600SemiBold",
  },
  reelsList: {
    flex: 1,
    backgroundColor: "#000",
  },
  reelItem: {
    width: SCREEN_WIDTH,
    backgroundColor: "#000",
  },
  reelOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "flex-end",
    paddingBottom: 20,
    paddingHorizontal: 14,
  },
  reelActionsCol: {
    position: "absolute",
    right: 12,
    bottom: 110,
    alignItems: "center",
    gap: 18,
  },
  reelActionBtn: {
    alignItems: "center",
    gap: 4,
  },
  reelActionCount: {
    color: brand.white,
    fontSize: 12,
    fontFamily: "Poppins_600SemiBold",
    textShadowColor: "rgba(0,0,0,0.55)",
    textShadowRadius: 2,
  },
  reelBottom: {
    paddingRight: 64,
    gap: 8,
  },
  reelAuthorRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  reelAvatar: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: theme.surface,
  },
  reelAuthorName: {
    color: brand.white,
    fontSize: 13,
    fontFamily: "Poppins_600SemiBold",
    flexShrink: 1,
  },
  reelTime: {
    color: "rgba(255,255,255,0.75)",
    fontSize: 12,
    fontFamily: "Poppins_400Regular",
  },
  reelCaption: {
    color: brand.white,
    fontSize: 13,
    fontFamily: "Poppins_400Regular",
    lineHeight: 18,
    textShadowColor: "rgba(0,0,0,0.6)",
    textShadowRadius: 2,
  },
  pressed: {
    opacity: 0.85,
  },
  fsRoot: {
    flex: 1,
    backgroundColor: "#000",
  },
  fsExitBtn: {
    position: "absolute",
    top: Platform.OS === "ios" ? 50 : 28,
    right: 14,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(0,0,0,0.55)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    alignItems: "center",
    justifyContent: "center",
  },
});
