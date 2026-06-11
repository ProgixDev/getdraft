import React, { useCallback, useMemo, useState } from "react";
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
} from "react-native";
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
import { uploadsService, UploadBucket } from "@/services/uploads";
import { pickAndUploadMedia } from "@/services/media";
import { useRoleHomeRedirect } from "@/lib/roleRoutes";

const { width } = Dimensions.get("window");
const PHOTO_SIZE = (width - 48) / 3 - 8;
const VIDEO_HEIGHT = 180;
const BANNER_HEIGHT = 140;

function comingSoon(feature: string) {
  Alert.alert(feature, "This feature is coming soon!", [{ text: "OK" }]);
}

function pathFromPublicUrl(url: string, bucket: UploadBucket): string | null {
  const marker = `/${bucket}/`;
  const idx = url.indexOf(marker);
  if (idx === -1) return null;
  try {
    return decodeURIComponent(url.slice(idx + marker.length));
  } catch {
    return null;
  }
}

const ATHLETE_DTO_FIELDS = [
  "sport",
  "position",
  "level",
  "bio",
  "class_year",
  "gpa",
  "height",
  "weight",
  "forty_yard_dash",
  "awards",
  "photos",
  "videos",
] as const;

const RECRUITER_DTO_FIELDS = [
  "organization",
  "sport",
  "role_type",
  "tags",
  "bio",
  "photos",
  "videos",
] as const;

function pickFields<T extends string>(
  src: any,
  keys: readonly T[],
): Record<string, any> {
  const out: Record<string, any> = {};
  for (const k of keys) {
    const v = src?.[k];
    if (v != null) out[k] = v;
  }
  return out;
}

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
  const [uploading, setUploading] = useState<null | "photos" | "videos">(null);
  const [reloadKey, setReloadKey] = useState(0);

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
    }, [isAthlete, isRecruiter, isParent, reloadKey]),
  );

  const handleAddMedia = useCallback(
    async (kind: "photos" | "videos") => {
      if (uploading) return;
      if (!isAthlete && !isRecruiter) {
        comingSoon("Add Media");
        return;
      }
      setUploading(kind);
      try {
        // Validate the profile FIRST. Previously pickAndUploadMedia
        // (gallery picker + storage upload) ran before this check, so a
        // user without a complete profile saw "Set up your profile" only
        // after their files were already in storage with no owning row
        // to claim them — orphaned bytes, no cleanup path.
        let current: any = {};
        try {
          current = isAthlete
            ? await profilesService.getAthleteProfile()
            : await profilesService.getRecruiterProfile();
        } catch {
          /* 404 = no profile yet */
        }
        if (isAthlete && !current?.sport) {
          Alert.alert(
            "Set up your profile first",
            "Add your sport and position before uploading media. Tap the pencil to edit your profile.",
          );
          return;
        }
        if (
          isRecruiter &&
          (!current?.organization || !current?.sport || !current?.role_type)
        ) {
          Alert.alert(
            "Set up your profile first",
            "Add your organization, sport, and role before uploading media. Tap the pencil to edit your profile.",
          );
          return;
        }

        const newUrls = await pickAndUploadMedia(
          kind === "videos" ? "video" : "image",
          kind,
          {
            allowsMultipleSelection: kind === "photos",
            selectionLimit: kind === "photos" ? 6 : 1,
          },
        );
        if (newUrls.length === 0) return;
        const merged = pickFields(
          current,
          isAthlete ? ATHLETE_DTO_FIELDS : RECRUITER_DTO_FIELDS,
        );
        const existing: string[] = Array.isArray(current[kind])
          ? current[kind]
          : [];
        merged[kind] = [...existing, ...newUrls];
        if (isAthlete) {
          await profilesService.upsertAthleteProfile(merged);
        } else {
          await profilesService.upsertRecruiterProfile(merged);
        }
        setReloadKey((k) => k + 1);
      } catch (err: any) {
        Alert.alert(
          "Upload failed",
          err?.message ?? "Something went wrong while uploading.",
        );
      } finally {
        setUploading(null);
      }
    },
    [uploading, isAthlete, isRecruiter],
  );

  const handleDeleteMedia = useCallback(
    (kind: "photos" | "videos", url: string) => {
      if (uploading) return;
      if (!isAthlete && !isRecruiter) return;
      Alert.alert(
        kind === "videos" ? "Delete this video?" : "Delete this photo?",
        "This cannot be undone.",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Delete",
            style: "destructive",
            onPress: async () => {
              setUploading(kind);
              try {
                let current: any = {};
                try {
                  current = isAthlete
                    ? await profilesService.getAthleteProfile()
                    : await profilesService.getRecruiterProfile();
                } catch {
                  /* 404 — nothing to delete from */
                  return;
                }
                const existing: string[] = Array.isArray(current[kind])
                  ? current[kind]
                  : [];
                const next = existing.filter((u: string) => u !== url);
                if (next.length === existing.length) {
                  // URL wasn't in the array (e.g. mock data). Skip.
                  return;
                }

                const bucket: UploadBucket =
                  kind === "videos" ? "videos" : "photos";
                const path = pathFromPublicUrl(url, bucket);
                if (path) {
                  await uploadsService.deleteFile(bucket, path).catch(() => {
                    // If storage delete fails (already gone, race), still strip from profile
                  });
                }

                const merged = pickFields(
                  current,
                  isAthlete ? ATHLETE_DTO_FIELDS : RECRUITER_DTO_FIELDS,
                );
                merged[kind] = next;
                if (isAthlete) {
                  await profilesService.upsertAthleteProfile(merged);
                } else {
                  await profilesService.upsertRecruiterProfile(merged);
                }
                setReloadKey((k) => k + 1);
              } catch (err: any) {
                Alert.alert(
                  "Could not delete",
                  err?.message ?? "Try again in a moment.",
                );
              } finally {
                setUploading(null);
              }
            },
          },
        ],
      );
    },
    [uploading, isAthlete, isRecruiter],
  );

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

        {/* Photos */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>
              {isParent ? "Child's Photos" : "Photos"}
            </Text>
            <Pressable
              onPress={() => handleAddMedia("photos")}
              disabled={uploading !== null}
            >
              {uploading === "photos" ? (
                <ActivityIndicator size="small" color={theme.text} />
              ) : (
                <Text style={styles.addText}>+ Add</Text>
              )}
            </Pressable>
          </View>
          <View style={styles.photoGrid}>
            {photos.length > 0 ? (
              photos.map((photo, i) => (
                <Pressable
                  key={i}
                  style={styles.photoItem}
                  onLongPress={() => {
                    if (typeof photo === "string") {
                      handleDeleteMedia("photos", photo);
                    }
                  }}
                  delayLongPress={400}
                >
                  <Image
                    source={typeof photo === "string" ? { uri: photo } : photo}
                    style={styles.photoImage}
                    resizeMode="cover"
                  />
                </Pressable>
              ))
            ) : (
              <View style={styles.emptyMedia}>
                <Ionicons
                  name="images-outline"
                  size={40}
                  color={theme.textMuted}
                />
                <Text style={styles.emptyMediaText}>
                  {isParent
                    ? "Child athlete hasn't added photos yet"
                    : "Add photos to your profile"}
                </Text>
                <Pressable
                  style={styles.addMediaButton}
                  onPress={() =>
                    isParent
                      ? comingSoon("Request Uploads")
                      : handleAddMedia("photos")
                  }
                  disabled={uploading !== null}
                >
                  <Text style={styles.addMediaButtonText}>
                    {isParent ? "Request Uploads" : "Add Photos"}
                  </Text>
                </Pressable>
              </View>
            )}
          </View>
        </View>

        {/* Videos */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>
              {isParent ? "Child's Videos" : "Videos"}
            </Text>
            <Pressable
              onPress={() => handleAddMedia("videos")}
              disabled={uploading !== null}
            >
              {uploading === "videos" ? (
                <ActivityIndicator size="small" color={theme.text} />
              ) : (
                <Text style={styles.addText}>+ Add</Text>
              )}
            </Pressable>
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
                        params: { url: video, title: `Highlight Reel ${i + 1}` },
                      });
                    } else {
                      comingSoon("Video Player");
                    }
                  }}
                  onLongPress={() => {
                    if (typeof video === "string") {
                      handleDeleteMedia("videos", video);
                    }
                  }}
                  delayLongPress={400}
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
                  {isParent
                    ? "Child athlete hasn't added highlight videos"
                    : "Add highlight videos"}
                </Text>
                <Pressable
                  style={styles.addMediaButton}
                  onPress={() =>
                    isParent
                      ? comingSoon("Request Uploads")
                      : handleAddMedia("videos")
                  }
                  disabled={uploading !== null}
                >
                  <Text style={styles.addMediaButtonText}>
                    {isParent ? "Request Uploads" : "Add Videos"}
                  </Text>
                </Pressable>
              </View>
            )}
          </View>
        </View>
      </ScrollView>
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
});
