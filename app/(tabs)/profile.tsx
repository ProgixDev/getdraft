import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  StyleSheet,
  Text,
  ScrollView,
  Pressable,
  Image,
  Dimensions,
  Alert,
  ActivityIndicator,
  Modal,
} from "react-native";
import { VideoView, useVideoPlayer } from "expo-video";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useSelector } from "react-redux";
import { useFocusEffect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import {
  useFonts,
  Poppins_400Regular,
  Poppins_500Medium,
  Poppins_600SemiBold,
  Poppins_700Bold,
} from "@expo-google-fonts/poppins";
import { brand, semantic, theme } from "@/config/colors";
import { RootState } from "@/store";
import type { MediaSource } from "@/constants/discoverData";
import { profilesService } from "@/services/profiles";
import { usersService } from "@/services/users";
import { matchesService } from "@/services/matches";
import { useRoleHomeRedirect } from "@/lib/roleRoutes";
import { postsService, type PostItem } from "@/services/posts";
import CommentsSheet from "@/components/posts/CommentsSheet";

const { width } = Dimensions.get("window");
const PHOTO_SIZE = (width - 48) / 3 - 8;
const VIDEO_HEIGHT = 180;
const BANNER_HEIGHT = 140;

function comingSoon(feature: string) {
  Alert.alert(feature, "This feature is coming soon!", [{ text: "OK" }]);
}

// Demo seed for the IG grid — surfaces a populated grid in offline /
// pre-seed environments. Real data always wins; this only kicks in when
// the API errors. (Empty success = "you haven't posted yet" empty state.)
const MOCK_GRID_PHOTOS: PostItem[] = [
  "https://images.unsplash.com/photo-1574629810360-7efbbe195018?w=600",
  "https://images.unsplash.com/photo-1521412644187-c49fa049e84d?w=600",
  "https://images.unsplash.com/photo-1546519638-68e109498ffc?w=600",
  "https://images.unsplash.com/photo-1517649763962-0c623066013b?w=600",
  "https://images.unsplash.com/photo-1530549387789-4c1017266635?w=600",
  "https://images.unsplash.com/photo-1487466365202-1afdb86c764e?w=600",
].map((url, i) => ({
  id: `mock-post-${i}`,
  kind: "post",
  mediaUrl: url,
  mediaType: "image",
  thumbnailUrl: null,
  caption: null,
  likesCount: 0,
  commentsCount: 0,
  likedByMe: false,
  createdAt: new Date().toISOString(),
  author: null,
}));

const MOCK_GRID_REELS: PostItem[] = [
  "https://images.unsplash.com/photo-1551698618-1dfe5d97d256?w=600",
  "https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=600",
  "https://images.unsplash.com/photo-1502035818146-acab10b2ee21?w=600",
].map((url, i) => ({
  id: `mock-reel-${i}`,
  kind: "reel",
  mediaUrl: url,
  mediaType: "video",
  thumbnailUrl: url,
  caption: null,
  likesCount: 0,
  commentsCount: 0,
  likedByMe: false,
  createdAt: new Date().toISOString(),
  author: null,
}));

type NormalizedAthleteProfile = {
  sport?: string;
  position?: string;
  level?: string;
  bio?: string;
  classYear?: string;
  gpa?: number;
  height?: string;
  weight?: string;
  fortyYardDash?: string;
  awards: string[];
  photos: MediaSource[];
  videos: MediaSource[];
  profileViews: number;
  likesReceived: number;
};

type NormalizedRecruiterProfile = {
  organization?: string;
  sport?: string;
  roleType?: "agent" | "coach";
  bio?: string;
  photos: MediaSource[];
  videos: MediaSource[];
  verified?: boolean;
  tags: string[];
};

type NormalizedParentProfile = {
  relationship?: string;
  childAthleteId?: string;
  childClassYear?: string;
  bio?: string;
};

function getCompleteness(profile: NormalizedAthleteProfile) {
  const checks = [
    { label: "Bio", done: !!profile.bio, weight: 15 },
    { label: "Photos", done: profile.photos.length > 0, weight: 20 },
    { label: "Highlight video", done: profile.videos.length > 0, weight: 20 },
    {
      label: "Position & level",
      done: !!(profile.position && profile.level),
      weight: 15,
    },
    { label: "Class year", done: !!profile.classYear, weight: 10 },
    { label: "GPA", done: !!profile.gpa, weight: 10 },
    {
      label: "Height & weight",
      done: !!(profile.height && profile.weight),
      weight: 10,
    },
  ];
  const score = checks.reduce((sum, c) => sum + (c.done ? c.weight : 0), 0);
  const missing = checks.filter((c) => !c.done).map((c) => c.label);
  return { score, missing };
}

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const user = useSelector((state: RootState) => state.auth.user);

  const [fontsLoaded] = useFonts({
    Poppins_400Regular,
    Poppins_500Medium,
    Poppins_600SemiBold,
    Poppins_700Bold,
  });

  const isAthlete = user?.role === "athlete";
  const isRecruiter = user?.role === "recruiter" || user?.role === "coach";
  const isParent = user?.role === "parent";

  // Admins have no athletic/parent profile schema. Phase 3 of the role
  // experience leaves a minimal admin profile (see fix(admin) follow-up
  // commit); until then they bounce to their dashboard via the shared
  // role-redirect hook.
  const redirecting = useRoleHomeRedirect([
    "athlete",
    "coach",
    "recruiter",
    "parent",
  ]);

  const [me, setMe] = useState<any | null>(null);
  const [profileRaw, setProfileRaw] = useState<any | null>(null);
  const [childRaw, setChildRaw] = useState<any | null>(null);
  const [matchesCount, setMatchesCount] = useState<number>(0);
  const [loading, setLoading] = useState(true);

  // Instagram-style grid below the profile header (athletes only —
  // see hasIgGrid). Reels = video posts, Saved = bookmarks (D2).
  // Each tab lazy-fetches once per focus; mock fallback only kicks
  // in on API errors so an empty success keeps the empty state.
  type GridTab = "posts" | "reels" | "saved";
  const [gridTab, setGridTab] = useState<GridTab>("posts");
  const [myPosts, setMyPosts] = useState<PostItem[] | null>(null);
  const [myReels, setMyReels] = useState<PostItem[] | null>(null);
  const [savedPosts, setSavedPosts] = useState<PostItem[] | null>(null);
  // Wired in D4 — the press handler is shared between D3 and D4.
  const [openedPost, setOpenedPost] = useState<PostItem | null>(null);
  // Live state for the detail modal. Initialised from openedPost on open
  // and kept in sync with the underlying posts/reels/saved arrays so the
  // grid tiles reflect the latest like/save state after the modal closes.
  const [detailLiked, setDetailLiked] = useState(false);
  const [detailLikeCount, setDetailLikeCount] = useState(0);
  const [detailSaved, setDetailSaved] = useState(false);
  const [detailCommentCount, setDetailCommentCount] = useState(0);
  const [commentsVisible, setCommentsVisible] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      setLoading(true);
      const profileFetch = isAthlete
        ? profilesService.getAthleteProfile()
        : isRecruiter
          ? profilesService.getRecruiterProfile()
          : isParent
            ? profilesService.getParentProfile()
            : Promise.resolve(null);

      Promise.all([
        usersService.getMe().catch(() => null),
        profileFetch.catch(() => null),
      ]).then(([meRow, p]) => {
        if (cancelled) return;
        setMe(meRow);
        setProfileRaw(p);
        if (isParent && p?.child_athlete_id) {
          usersService
            .getPublicUser(p.child_athlete_id)
            .then((c) => {
              if (!cancelled) setChildRaw(c);
            })
            .catch(() => {});
        }
        setLoading(false);
      });

      if (isAthlete || isRecruiter) {
        matchesService
          .getMatches()
          .then((m) => {
            if (!cancelled) setMatchesCount(Array.isArray(m) ? m.length : 0);
          })
          .catch(() => {});
      }

      return () => {
        cancelled = true;
      };
    }, [isAthlete, isRecruiter, isParent]),
  );

  // Fetch the three grid tabs on profile focus. Run in parallel for
  // speed; each promise has its own try/catch → mock fallback so a
  // single failure (e.g. backend offline) only swaps THAT tab to mocks
  // and doesn't blank the rest. Athletes-only — the only role that
  // posts to the feed has the only IG-style grid.
  useFocusEffect(
    useCallback(() => {
      if (!isAthlete || !user?.id) return;
      let cancelled = false;
      const userId = user.id;
      postsService
        .getUserPosts(userId, "post")
        .then((r) => !cancelled && setMyPosts(r.posts))
        .catch(() => !cancelled && setMyPosts(MOCK_GRID_PHOTOS));
      postsService
        .getUserPosts(userId, "reel")
        .then((r) => !cancelled && setMyReels(r.posts))
        .catch(() => !cancelled && setMyReels(MOCK_GRID_REELS));
      postsService
        .getSavedPosts()
        .then((r) => !cancelled && setSavedPosts(r.posts))
        .catch(() => !cancelled && setSavedPosts([]));
      return () => {
        cancelled = true;
      };
    }, [isAthlete, user?.id]),
  );

  // Hydrate detail-modal state from the tapped post. Saved-by-me is
  // derived by intersecting with the Saved tab's array (the only
  // saved-state source we have client-side) — good enough for the
  // profile context, the only place this modal opens from.
  useEffect(() => {
    if (!openedPost) return;
    setDetailLiked(openedPost.likedByMe);
    setDetailLikeCount(openedPost.likesCount);
    setDetailCommentCount(openedPost.commentsCount);
    const isSaved =
      savedPosts?.some((p) => p.id === openedPost.id) ?? false;
    setDetailSaved(isSaved);
  }, [openedPost, savedPosts]);

  // Apply a delta to whichever grid arrays contain this post so the
  // tiles reflect the new state when the modal closes. Used for both
  // like and save toggles below.
  const updatePostInGrids = useCallback(
    (postId: string, patch: Partial<PostItem>) => {
      const apply = (list: PostItem[] | null) =>
        list ? list.map((p) => (p.id === postId ? { ...p, ...patch } : p)) : list;
      setMyPosts((prev) => apply(prev));
      setMyReels((prev) => apply(prev));
      setSavedPosts((prev) => apply(prev));
    },
    [],
  );

  const handleDetailLike = useCallback(async () => {
    if (!openedPost) return;
    const willLike = !detailLiked;
    setDetailLiked(willLike);
    setDetailLikeCount((c) => Math.max(0, c + (willLike ? 1 : -1)));
    updatePostInGrids(openedPost.id, {
      likedByMe: willLike,
      likesCount: Math.max(
        0,
        openedPost.likesCount + (willLike ? 1 : -1),
      ),
    });
    try {
      if (willLike) await postsService.likePost(openedPost.id);
      else await postsService.unlikePost(openedPost.id);
    } catch {
      // Roll back on failure.
      setDetailLiked(!willLike);
      setDetailLikeCount((c) => Math.max(0, c + (willLike ? -1 : 1)));
      updatePostInGrids(openedPost.id, {
        likedByMe: openedPost.likedByMe,
        likesCount: openedPost.likesCount,
      });
    }
  }, [openedPost, detailLiked, updatePostInGrids]);

  const handleDetailSave = useCallback(async () => {
    if (!openedPost) return;
    const willSave = !detailSaved;
    setDetailSaved(willSave);
    try {
      const res = willSave
        ? await postsService.savePost(openedPost.id)
        : await postsService.unsavePost(openedPost.id);
      if (res === null) {
        // Service-level failure already swallowed; roll back so the
        // bookmark icon matches reality.
        setDetailSaved(!willSave);
        return;
      }
      // Update the Saved tab so the bookmark survives until next refresh.
      if (willSave) {
        setSavedPosts((prev) =>
          prev && !prev.some((p) => p.id === openedPost.id)
            ? [openedPost, ...prev]
            : prev,
        );
      } else {
        setSavedPosts((prev) =>
          prev ? prev.filter((p) => p.id !== openedPost.id) : prev,
        );
      }
    } catch {
      setDetailSaved(!willSave);
    }
  }, [openedPost, detailSaved]);

  const handleDetailCommentCount = useCallback(
    (n: number) => {
      setDetailCommentCount(n);
      if (openedPost) {
        updatePostInGrids(openedPost.id, { commentsCount: n });
      }
    },
    [openedPost, updatePostInGrids],
  );

  const closeDetail = useCallback(() => {
    setCommentsVisible(false);
    setOpenedPost(null);
  }, []);

  const athleteProfile = useMemo<NormalizedAthleteProfile | null>(() => {
    if (!isAthlete || !profileRaw) return null;
    return {
      sport: profileRaw.sport,
      position: profileRaw.position,
      level: profileRaw.level,
      bio: profileRaw.bio,
      classYear: profileRaw.class_year,
      gpa: profileRaw.gpa != null ? Number(profileRaw.gpa) : undefined,
      height: profileRaw.height,
      weight: profileRaw.weight,
      fortyYardDash: profileRaw.forty_yard_dash,
      awards: profileRaw.awards ?? [],
      photos: (profileRaw.photos ?? []) as MediaSource[],
      videos: (profileRaw.videos ?? []) as MediaSource[],
      profileViews: profileRaw.profile_views ?? 0,
      likesReceived: profileRaw.likes_received ?? 0,
    };
  }, [isAthlete, profileRaw]);

  const recruiterProfile = useMemo<NormalizedRecruiterProfile | null>(() => {
    if (!isRecruiter || !profileRaw) return null;
    return {
      organization: profileRaw.organization,
      sport: profileRaw.sport,
      roleType: profileRaw.role_type as "agent" | "coach" | undefined,
      bio: profileRaw.bio,
      photos: (profileRaw.photos ?? []) as MediaSource[],
      videos: (profileRaw.videos ?? []) as MediaSource[],
      verified: profileRaw.verified,
      tags: profileRaw.tags ?? [],
    };
  }, [isRecruiter, profileRaw]);

  const parentProfile = useMemo<NormalizedParentProfile | null>(() => {
    if (!isParent || !profileRaw) return null;
    return {
      relationship: profileRaw.relationship,
      childAthleteId: profileRaw.child_athlete_id,
      childClassYear: profileRaw.child_class_year,
      bio: profileRaw.bio,
    };
  }, [isParent, profileRaw]);

  const photos: MediaSource[] =
    athleteProfile?.photos ?? recruiterProfile?.photos ?? [];
  const videos: MediaSource[] =
    athleteProfile?.videos ?? recruiterProfile?.videos ?? [];

  const avatarSource: MediaSource | null = useMemo(() => {
    if (me?.avatar_url) return me.avatar_url as MediaSource;
    if (photos[0]) return photos[0];
    return null;
  }, [me?.avatar_url, photos]);

  const completeness =
    athleteProfile && athleteProfile.bio !== undefined
      ? getCompleteness(athleteProfile)
      : null;

  if (!fontsLoaded) return null;
  if (redirecting) return null;

  const displayName = me?.name ?? user?.name ?? "User";
  const location: string | null = me?.location ?? null;

  const roleLabel =
    user?.role === "recruiter"
      ? "Agent / Recruiter"
      : user?.role === "coach"
        ? "Coach"
        : user?.role === "athlete"
          ? "Athlete"
          : user?.role === "parent"
            ? "Parent"
            : "User";

  const richRoleLabel =
    isAthlete && athleteProfile?.position && athleteProfile.level
      ? `${athleteProfile.position} · ${athleteProfile.level}`
      : roleLabel;

  if (loading) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <Text style={styles.title}>Profile</Text>
        </View>
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={theme.text} />
        </View>
      </View>
    );
  }

  const hasAnyProfile = !!(athleteProfile || recruiterProfile || parentProfile);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={styles.title}>Profile</Text>
        <Pressable
          style={styles.editButton}
          onPress={() => router.push("/edit-profile")}
        >
          <Ionicons name="pencil-outline" size={22} color={theme.text} />
        </Pressable>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: insets.bottom + 24 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Avatar / Banner Section */}
        <View style={styles.avatarSection}>
          <LinearGradient
            colors={["#1a1a2e", "#16213e", "#0f3460"]}
            style={styles.banner}
          />
          <View style={styles.avatarWrapper}>
            <View style={styles.avatarPlaceholder}>
              {avatarSource ? (
                <Image
                  source={
                    typeof avatarSource === "string"
                      ? { uri: avatarSource }
                      : avatarSource
                  }
                  style={styles.avatarImage}
                  resizeMode="cover"
                />
              ) : (
                <Ionicons
                  name={
                    user?.role === "recruiter" || user?.role === "coach"
                      ? "briefcase"
                      : user?.role === "parent"
                        ? "people"
                        : "person"
                  }
                  size={64}
                  color={theme.textMuted}
                />
              )}
            </View>
            <Pressable
              style={styles.avatarEditBadge}
              onPress={() => router.push("/edit-profile")}
            >
              <Ionicons name="camera" size={14} color={brand.white} />
            </Pressable>
          </View>
          <Text style={styles.name}>{displayName}</Text>
          <View style={styles.roleBadge}>
            <Text style={styles.roleText}>{richRoleLabel}</Text>
          </View>
          {isAthlete && athleteProfile && (
            <View style={styles.sportRow}>
              <Ionicons
                name="american-football"
                size={14}
                color={theme.textSecondary}
              />
              <Text style={styles.sportText}>{athleteProfile.sport}</Text>
              {athleteProfile.classYear && (
                <>
                  <Text style={styles.sportDot}>·</Text>
                  <Text style={styles.sportText}>
                    Class of {athleteProfile.classYear}
                  </Text>
                </>
              )}
            </View>
          )}
        </View>

        {/* Athlete Stats Bar */}
        {isAthlete && athleteProfile && (
          <View style={styles.statsBar}>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{athleteProfile.profileViews}</Text>
              <Text style={styles.statLabel}>Profile Views</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{athleteProfile.likesReceived}</Text>
              <Text style={styles.statLabel}>Likes</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{matchesCount}</Text>
              <Text style={styles.statLabel}>Matches</Text>
            </View>
          </View>
        )}

        {/* Profile Completeness (athletes only) */}
        {isAthlete && completeness && completeness.score < 100 && (
          <View style={styles.completenessCard}>
            <View style={styles.completenessHeader}>
              <Text style={styles.completenessTitle}>Profile Strength</Text>
              <Text style={styles.completenessScore}>
                {completeness.score}%
              </Text>
            </View>
            <View style={styles.progressTrack}>
              <View
                style={[
                  styles.progressFill,
                  { width: `${completeness.score}%` },
                ]}
              />
            </View>
            {completeness.missing.length > 0 && (
              <View style={styles.missingList}>
                <Text style={styles.missingLabel}>
                  Add to boost your profile:
                </Text>
                {completeness.missing.map((item) => (
                  <View key={item} style={styles.missingItem}>
                    <Ionicons
                      name="add-circle-outline"
                      size={14}
                      color={semantic.info}
                    />
                    <Text style={styles.missingItemText}>{item}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        )}

        {/* About Section */}
        {hasAnyProfile && (
          <View style={styles.infoSection}>
            <Text style={styles.sectionTitle}>About</Text>
            {athleteProfile && (
              <>
                {athleteProfile.sport && athleteProfile.position && (
                  <View style={styles.infoRow}>
                    <Ionicons name="football" size={18} color={theme.textMuted} />
                    <Text style={styles.infoText}>
                      {athleteProfile.sport} · {athleteProfile.position}
                    </Text>
                  </View>
                )}
                {athleteProfile.level && (
                  <View style={styles.infoRow}>
                    <Ionicons name="school" size={18} color={theme.textMuted} />
                    <Text style={styles.infoText}>{athleteProfile.level}</Text>
                  </View>
                )}
                {athleteProfile.height && athleteProfile.weight && (
                  <View style={styles.infoRow}>
                    <Ionicons name="body" size={18} color={theme.textMuted} />
                    <Text style={styles.infoText}>
                      {athleteProfile.height} · {athleteProfile.weight}
                    </Text>
                  </View>
                )}
                {athleteProfile.gpa !== undefined && (
                  <View style={styles.infoRow}>
                    <Ionicons name="star" size={18} color={theme.textMuted} />
                    <Text style={styles.infoText}>
                      GPA: {athleteProfile.gpa.toFixed(1)}
                    </Text>
                  </View>
                )}
                {athleteProfile.fortyYardDash && (
                  <View style={styles.infoRow}>
                    <Ionicons name="timer" size={18} color={theme.textMuted} />
                    <Text style={styles.infoText}>
                      40-yard dash: {athleteProfile.fortyYardDash}
                    </Text>
                  </View>
                )}
              </>
            )}
            {recruiterProfile && (
              <>
                {recruiterProfile.organization && (
                  <View style={styles.infoRow}>
                    <Ionicons
                      name="briefcase"
                      size={18}
                      color={theme.textMuted}
                    />
                    <Text style={styles.infoText}>
                      {recruiterProfile.organization}
                    </Text>
                  </View>
                )}
                {recruiterProfile.sport && (
                  <View style={styles.infoRow}>
                    <Ionicons name="football" size={18} color={theme.textMuted} />
                    <Text style={styles.infoText}>{recruiterProfile.sport}</Text>
                  </View>
                )}
              </>
            )}
            {parentProfile && childRaw && (
              <>
                {parentProfile.relationship && (
                  <View style={styles.infoRow}>
                    <Ionicons name="people" size={18} color={theme.textMuted} />
                    <Text style={styles.infoText}>
                      {parentProfile.relationship} of {childRaw.name}
                    </Text>
                  </View>
                )}
                {parentProfile.childClassYear && (
                  <View style={styles.infoRow}>
                    <Ionicons name="school" size={18} color={theme.textMuted} />
                    <Text style={styles.infoText}>
                      Class of {parentProfile.childClassYear}
                    </Text>
                  </View>
                )}
              </>
            )}
            {location && (
              <View style={styles.infoRow}>
                <Ionicons name="location" size={18} color={theme.textMuted} />
                <Text style={styles.infoText}>{location}</Text>
              </View>
            )}
            {(athleteProfile?.bio ||
              recruiterProfile?.bio ||
              parentProfile?.bio) && (
              <Text style={styles.bio}>
                {athleteProfile?.bio ??
                  recruiterProfile?.bio ??
                  parentProfile?.bio}
              </Text>
            )}
          </View>
        )}

        {/* Awards & Achievements (athletes only) */}
        {isAthlete && athleteProfile && athleteProfile.awards.length > 0 && (
          <View style={styles.infoSection}>
            <Text style={styles.sectionTitle}>Awards & Achievements</Text>
            {athleteProfile.awards.map((award) => (
              <View key={award} style={styles.awardRow}>
                <Ionicons name="trophy" size={16} color="#F5A623" />
                <Text style={styles.awardText}>{award}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Athletes: Posts / Reels / Saved IG-style grid. The grid is
            athlete-only because athletes are the only role that posts to
            the social feed — recruiters and parents don't, so an empty
            Posts/Reels for them would read as broken. */}
        {isAthlete && (
          <View style={styles.gridSection}>
            <View style={styles.gridTabs}>
              {(["posts", "reels", "saved"] as const).map((tab) => {
                const active = tab === gridTab;
                const icon =
                  tab === "posts"
                    ? active
                      ? "grid"
                      : "grid-outline"
                    : tab === "reels"
                      ? active
                        ? "play-circle"
                        : "play-circle-outline"
                      : active
                        ? "bookmark"
                        : "bookmark-outline";
                return (
                  <Pressable
                    key={tab}
                    style={[styles.gridTab, active && styles.gridTabActive]}
                    onPress={() => setGridTab(tab)}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: active }}
                  >
                    <Ionicons
                      name={icon as any}
                      size={20}
                      color={active ? theme.text : theme.textMuted}
                    />
                  </Pressable>
                );
              })}
            </View>

            <GridContent
              tab={gridTab}
              posts={
                gridTab === "posts"
                  ? myPosts
                  : gridTab === "reels"
                    ? myReels
                    : savedPosts
              }
              onTilePress={setOpenedPost}
            />
          </View>
        )}

        {/* Recruiters: keep a small read-only thumbnail strip of their
            showcase photos if they have any. Editing now lives in
            edit-profile (the pencil up top), so this is display only. */}
        {isRecruiter && photos.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Photos</Text>
            </View>
            <View style={styles.photoGrid}>
              {photos.map((photo, i) => (
                <View key={i} style={styles.photoItem}>
                  <Image
                    source={typeof photo === "string" ? { uri: photo } : photo}
                    style={styles.photoImage}
                    resizeMode="cover"
                  />
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Parents: unchanged view of their child's media plus the
            Request Uploads stub. Parents can't post; this is the
            window onto their athlete's profile. */}
        {isParent && (
          <>
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Child&apos;s Photos</Text>
              </View>
              <View style={styles.photoGrid}>
                {photos.length > 0 ? (
                  photos.map((photo, i) => (
                    <View key={i} style={styles.photoItem}>
                      <Image
                        source={
                          typeof photo === "string" ? { uri: photo } : photo
                        }
                        style={styles.photoImage}
                        resizeMode="cover"
                      />
                    </View>
                  ))
                ) : (
                  <View style={styles.emptyMedia}>
                    <Ionicons
                      name="images-outline"
                      size={40}
                      color={theme.textMuted}
                    />
                    <Text style={styles.emptyMediaText}>
                      Child athlete hasn&apos;t added photos yet
                    </Text>
                    <Pressable
                      style={styles.addMediaButton}
                      onPress={() => comingSoon("Request Uploads")}
                    >
                      <Text style={styles.addMediaButtonText}>
                        Request Uploads
                      </Text>
                    </Pressable>
                  </View>
                )}
              </View>
            </View>

            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Child&apos;s Videos</Text>
              </View>
              <View style={styles.videoSection}>
                {videos.length > 0 ? (
                  videos.map((video, i) => (
                    <Pressable
                      key={i}
                      style={styles.videoItem}
                      onPress={() => {
                        if (typeof video === "string") {
                          router.push({
                            pathname: "/video",
                            params: {
                              url: video,
                              title: `Highlight Reel ${i + 1}`,
                            },
                          });
                        } else {
                          comingSoon("Video Player");
                        }
                      }}
                    >
                      <View style={styles.videoPlaceholder}>
                        <Ionicons
                          name="play-circle"
                          size={48}
                          color={brand.white}
                        />
                        <Text style={styles.videoLabel}>
                          Highlight Reel {i + 1}
                        </Text>
                      </View>
                    </Pressable>
                  ))
                ) : (
                  <View style={styles.emptyMedia}>
                    <Ionicons
                      name="videocam-outline"
                      size={40}
                      color={theme.textMuted}
                    />
                    <Text style={styles.emptyMediaText}>
                      Child athlete hasn&apos;t added highlight videos
                    </Text>
                    <Pressable
                      style={styles.addMediaButton}
                      onPress={() => comingSoon("Request Uploads")}
                    >
                      <Text style={styles.addMediaButtonText}>
                        Request Uploads
                      </Text>
                    </Pressable>
                  </View>
                )}
              </View>
            </View>
          </>
        )}
      </ScrollView>

      {/* Post / reel detail. Uses the same like + comment + save
          contract as the feed; the CommentsSheet itself is the
          existing component (a Modal of its own, stacks on top).
          Closing the outer modal also dismisses comments via
          closeDetail so we don't leak the second-layer open state. */}
      <Modal
        visible={openedPost !== null}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={closeDetail}
      >
        {openedPost && (
          <DetailModalContents
            post={openedPost}
            liked={detailLiked}
            likeCount={detailLikeCount}
            saved={detailSaved}
            commentCount={detailCommentCount}
            onLike={handleDetailLike}
            onSave={handleDetailSave}
            onComments={() => setCommentsVisible(true)}
            onClose={closeDetail}
          />
        )}
        <CommentsSheet
          postId={openedPost?.id ?? null}
          visible={commentsVisible}
          onClose={() => setCommentsVisible(false)}
          onCountChange={handleDetailCommentCount}
        />
      </Modal>
    </View>
  );
}

// Detail modal body — kept outside ProfileScreen so the useVideoPlayer
// hook only mounts when a post is actually opened. Otherwise we'd be
// creating an idle player for every render of the profile.
function DetailModalContents({
  post,
  liked,
  likeCount,
  saved,
  commentCount,
  onLike,
  onSave,
  onComments,
  onClose,
}: {
  post: PostItem;
  liked: boolean;
  likeCount: number;
  saved: boolean;
  commentCount: number;
  onLike: () => void;
  onSave: () => void;
  onComments: () => void;
  onClose: () => void;
}) {
  const isReel = post.kind === "reel";
  // Hooks rule: useVideoPlayer must run unconditionally each render.
  // For photo posts we pass a never-played URL — cheap, no playback.
  const player = useVideoPlayer(post.mediaUrl, (p) => {
    p.loop = true;
    p.muted = true;
  });
  useEffect(() => {
    if (!isReel || !player) return;
    player.play();
    return () => {
      player.pause();
    };
  }, [isReel, player]);
  return (
    <View style={styles.detailContainer}>
      <View style={styles.detailHeader}>
        <Pressable
          onPress={onClose}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Close"
        >
          <Ionicons name="chevron-down" size={26} color={theme.text} />
        </Pressable>
        <Text style={styles.detailTitle}>
          {isReel ? "Reel" : "Post"}
        </Text>
        <View style={{ width: 26 }} />
      </View>

      <View style={styles.detailMediaWrap}>
        {isReel ? (
          <VideoView
            player={player}
            style={styles.detailMedia}
            contentFit="cover"
            nativeControls={false}
          />
        ) : (
          <Image
            source={{ uri: post.mediaUrl }}
            style={styles.detailMedia}
            resizeMode="cover"
          />
        )}
      </View>

      <View style={styles.detailActions}>
        <Pressable
          style={({ pressed }) => [
            styles.detailActionBtn,
            pressed && { opacity: 0.7 },
          ]}
          onPress={onLike}
          accessibilityRole="button"
          accessibilityLabel={liked ? "Unlike" : "Like"}
        >
          <Ionicons
            name={liked ? "heart" : "heart-outline"}
            size={26}
            color={liked ? "#FF4D6D" : theme.text}
          />
          <Text style={styles.detailActionCount}>{likeCount}</Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [
            styles.detailActionBtn,
            pressed && { opacity: 0.7 },
          ]}
          onPress={onComments}
          accessibilityRole="button"
          accessibilityLabel="Open comments"
        >
          <Ionicons name="chatbubble-outline" size={24} color={theme.text} />
          <Text style={styles.detailActionCount}>{commentCount}</Text>
        </Pressable>
        <View style={{ flex: 1 }} />
        <Pressable
          style={({ pressed }) => [
            styles.detailActionBtn,
            pressed && { opacity: 0.7 },
          ]}
          onPress={onSave}
          accessibilityRole="button"
          accessibilityLabel={saved ? "Remove bookmark" : "Save"}
        >
          <Ionicons
            name={saved ? "bookmark" : "bookmark-outline"}
            size={24}
            color={saved ? brand.primary : theme.text}
          />
        </Pressable>
      </View>

      {post.caption ? (
        <Text style={styles.detailCaption}>{post.caption}</Text>
      ) : null}
    </View>
  );
}

// 3-column thumbnail grid for the athlete IG section. Lives outside
// the screen body to keep the component flat — the screen is already
// long. Press-handler is passed in so D4 can wire the detail modal.
function GridContent({
  tab,
  posts,
  onTilePress,
}: {
  tab: "posts" | "reels" | "saved";
  posts: PostItem[] | null;
  onTilePress: (post: PostItem) => void;
}) {
  if (posts === null) {
    return (
      <View style={styles.gridLoading}>
        <ActivityIndicator size="small" color={theme.text} />
      </View>
    );
  }
  if (posts.length === 0) {
    const copy =
      tab === "posts"
        ? "Share your first post from the Feed tab."
        : tab === "reels"
          ? "Post a highlight reel and it'll show up here."
          : "Bookmark posts and reels to find them again here.";
    const icon =
      tab === "posts"
        ? "grid-outline"
        : tab === "reels"
          ? "play-circle-outline"
          : "bookmark-outline";
    return (
      <View style={styles.gridEmpty}>
        <Ionicons name={icon as any} size={40} color={theme.textMuted} />
        <Text style={styles.gridEmptyText}>{copy}</Text>
      </View>
    );
  }
  return (
    <View style={styles.gridTiles}>
      {posts.map((p) => {
        const thumb = p.thumbnailUrl ?? p.mediaUrl;
        return (
          <Pressable
            key={p.id}
            style={styles.gridTile}
            onPress={() => onTilePress(p)}
            accessibilityRole="button"
            accessibilityLabel={
              p.kind === "reel" ? "Open reel" : "Open post"
            }
          >
            <Image
              source={{ uri: thumb }}
              style={styles.gridTileImage}
              resizeMode="cover"
            />
            {p.kind === "reel" && (
              <View style={styles.gridTileReelBadge}>
                <Ionicons name="play" size={14} color={brand.white} />
              </View>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.bg,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: theme.headerBg,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  title: {
    fontSize: 24,
    fontFamily: "Poppins_700Bold",
    color: theme.text,
  },
  editButton: {
    padding: 8,
  },
  loadingWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    gap: 16,
  },
  avatarSection: {
    backgroundColor: theme.cardBg,
    borderRadius: 16,
    overflow: "hidden",
    alignItems: "center",
    paddingBottom: 24,
  },
  banner: {
    width: "100%",
    height: BANNER_HEIGHT,
  },
  avatarWrapper: {
    marginTop: -(BANNER_HEIGHT / 2 + 10),
    position: "relative",
  },
  avatarPlaceholder: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: theme.surface,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    borderWidth: 4,
    borderColor: theme.surface,
  },
  avatarImage: {
    width: "100%",
    height: "100%",
  },
  avatarEditBadge: {
    position: "absolute",
    bottom: 4,
    right: 4,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: brand.primary,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: theme.surface,
  },
  name: {
    fontSize: 22,
    fontFamily: "Poppins_700Bold",
    color: theme.text,
    marginTop: 12,
  },
  roleBadge: {
    marginTop: 6,
    paddingHorizontal: 16,
    paddingVertical: 6,
    backgroundColor: theme.badgeBg,
    borderRadius: 20,
  },
  roleText: {
    fontSize: 14,
    fontFamily: "Poppins_500Medium",
    color: theme.badgeText,
  },
  sportRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 8,
  },
  sportText: {
    fontSize: 13,
    fontFamily: "Poppins_400Regular",
    color: theme.textSecondary,
  },
  sportDot: {
    fontSize: 13,
    color: theme.textMuted,
  },
  statsBar: {
    backgroundColor: theme.cardBg,
    borderRadius: 16,
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 20,
  },
  statItem: {
    flex: 1,
    alignItems: "center",
  },
  statValue: {
    fontSize: 24,
    fontFamily: "Poppins_700Bold",
    color: theme.text,
  },
  statLabel: {
    fontSize: 12,
    fontFamily: "Poppins_400Regular",
    color: theme.textSecondary,
    marginTop: 2,
  },
  statDivider: {
    width: 1,
    height: 36,
    backgroundColor: theme.border,
  },
  completenessCard: {
    backgroundColor: theme.cardBg,
    borderRadius: 16,
    padding: 20,
  },
  completenessHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  completenessTitle: {
    fontSize: 16,
    fontFamily: "Poppins_600SemiBold",
    color: theme.text,
  },
  completenessScore: {
    fontSize: 16,
    fontFamily: "Poppins_700Bold",
    color: semantic.success,
  },
  progressTrack: {
    height: 8,
    backgroundColor: theme.border,
    borderRadius: 4,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    backgroundColor: semantic.success,
    borderRadius: 4,
  },
  missingList: {
    marginTop: 14,
    gap: 8,
  },
  missingLabel: {
    fontSize: 13,
    fontFamily: "Poppins_500Medium",
    color: theme.textSecondary,
    marginBottom: 4,
  },
  missingItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  missingItemText: {
    fontSize: 13,
    fontFamily: "Poppins_400Regular",
    color: theme.textSecondary,
  },
  infoSection: {
    backgroundColor: theme.cardBg,
    borderRadius: 16,
    padding: 20,
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 10,
  },
  infoText: {
    fontSize: 15,
    fontFamily: "Poppins_400Regular",
    color: theme.text,
  },
  bio: {
    fontSize: 14,
    fontFamily: "Poppins_400Regular",
    color: theme.textSecondary,
    marginTop: 12,
    lineHeight: 22,
  },
  awardRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 8,
  },
  awardText: {
    fontSize: 14,
    fontFamily: "Poppins_500Medium",
    color: theme.text,
  },
  section: {
    backgroundColor: theme.cardBg,
    borderRadius: 16,
    padding: 20,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontFamily: "Poppins_600SemiBold",
    color: theme.text,
  },
  addText: {
    fontSize: 14,
    fontFamily: "Poppins_600SemiBold",
    color: theme.text,
  },
  photoGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  photoItem: {
    width: PHOTO_SIZE,
    height: PHOTO_SIZE,
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: theme.surface,
  },
  photoImage: {
    width: "100%",
    height: "100%",
  },
  videoSection: {
    gap: 12,
  },
  videoItem: {
    height: VIDEO_HEIGHT,
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: theme.surfaceSecondary,
  },
  videoPlaceholder: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  videoLabel: {
    fontSize: 13,
    fontFamily: "Poppins_500Medium",
    color: "rgba(255,255,255,0.8)",
  },
  emptyMedia: {
    alignItems: "center",
    paddingVertical: 32,
    borderWidth: 2,
    borderStyle: "dashed",
    borderColor: theme.borderLight,
    borderRadius: 12,
    width: "100%",
  },
  emptyMediaText: {
    fontSize: 14,
    fontFamily: "Poppins_400Regular",
    color: theme.textSecondary,
    marginTop: 12,
    textAlign: "center",
    paddingHorizontal: 20,
  },
  addMediaButton: {
    marginTop: 12,
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: theme.accent,
    borderRadius: 20,
  },
  addMediaButtonText: {
    fontSize: 14,
    fontFamily: "Poppins_600SemiBold",
    color: theme.accentText,
  },
  gridSection: {
    backgroundColor: theme.cardBg,
    borderRadius: 16,
    overflow: "hidden",
  },
  gridTabs: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  gridTab: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 14,
  },
  gridTabActive: {
    borderBottomWidth: 2,
    borderBottomColor: theme.text,
  },
  gridLoading: {
    alignItems: "center",
    paddingVertical: 40,
  },
  gridEmpty: {
    alignItems: "center",
    paddingVertical: 40,
    paddingHorizontal: 30,
    gap: 10,
  },
  gridEmptyText: {
    fontSize: 13,
    fontFamily: "Poppins_400Regular",
    color: theme.textSecondary,
    textAlign: "center",
    lineHeight: 20,
  },
  gridTiles: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  gridTile: {
    width: "33.3333%",
    aspectRatio: 1,
    padding: 1,
    backgroundColor: theme.surface,
    position: "relative",
  },
  gridTileImage: {
    flex: 1,
    backgroundColor: theme.surface,
  },
  gridTileReelBadge: {
    position: "absolute",
    top: 8,
    right: 8,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.55)",
  },
  detailContainer: {
    flex: 1,
    backgroundColor: theme.bg,
  },
  detailHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  detailTitle: {
    fontSize: 16,
    fontFamily: "Poppins_600SemiBold",
    color: theme.text,
  },
  detailMediaWrap: {
    width: "100%",
    aspectRatio: 1,
    backgroundColor: theme.surface,
  },
  detailMedia: {
    flex: 1,
    width: "100%",
  },
  detailActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 18,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  detailActionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  detailActionCount: {
    fontSize: 14,
    fontFamily: "Poppins_600SemiBold",
    color: theme.text,
  },
  detailCaption: {
    paddingHorizontal: 16,
    fontSize: 14,
    fontFamily: "Poppins_400Regular",
    color: theme.text,
    lineHeight: 22,
  },
});
