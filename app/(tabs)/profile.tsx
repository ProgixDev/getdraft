import React, { useCallback, useState } from 'react';
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
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { useSelector } from 'react-redux';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import {
  useFonts,
  Poppins_400Regular,
  Poppins_500Medium,
  Poppins_600SemiBold,
  Poppins_700Bold,
} from '@expo-google-fonts/poppins';
import { brand, semantic, theme } from '@/config/colors';
import { RootState } from '@/store';
import {
  mockAthletes,
  mockAgentProfile,
  MediaSource,
  mockAthleteMatches,
  AthleteProfile,
  AgentProfile,
} from '@/constants/discoverData';
import { mockParentProfiles, ParentProfile } from '@/constants/parentData';
import { profilesService } from '@/services/profiles';
import { statsService } from '@/services/stats';
import { usersService } from '@/services/users';
import { uploadsService, UploadBucket } from '@/services/uploads';
import { pickAndUploadMedia } from '@/services/media';

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

type ProfileStats = { profileViews?: number; likesReceived?: number; matches?: number };
type MeUser = { location?: string; country?: string; avatar_url?: string };

const ATHLETE_DTO_FIELDS = [
  'sport', 'position', 'level', 'bio', 'class_year', 'gpa',
  'height', 'weight', 'forty_yard_dash', 'awards', 'photos', 'videos',
] as const;

const RECRUITER_DTO_FIELDS = [
  'organization', 'sport', 'role_type', 'tags', 'bio', 'photos', 'videos',
] as const;

function pickFields<T extends string>(src: any, keys: readonly T[]): Record<string, any> {
  const out: Record<string, any> = {};
  for (const k of keys) {
    const v = src?.[k];
    if (v != null) out[k] = v;
  }
  return out;
}

function normalizeAthleteApi(api: any, name: string, email: string): AthleteProfile {
  return {
    id: api?.id ?? '',
    email,
    name,
    sport: api?.sport ?? '',
    position: api?.position ?? '',
    level: api?.level ?? '',
    location: '',
    country: '',
    distanceKm: 0,
    photos: Array.isArray(api?.photos) ? (api.photos as MediaSource[]) : [],
    videos: Array.isArray(api?.videos) ? (api.videos as MediaSource[]) : [],
    bio: api?.bio,
    classYear: api?.class_year,
    gpa: api?.gpa,
    height: api?.height,
    weight: api?.weight,
    fortyYardDash: api?.forty_yard_dash,
    awards: Array.isArray(api?.awards) ? api.awards : undefined,
    profileViews: api?.profile_views,
    likesReceived: api?.likes_received,
  };
}

function normalizeAgentApi(api: any, name: string, email: string): AgentProfile {
  return {
    id: api?.id ?? '',
    email,
    name,
    organization: api?.organization ?? '',
    location: '',
    sport: api?.sport ?? '',
    photos: Array.isArray(api?.photos) ? (api.photos as MediaSource[]) : [],
    videos: Array.isArray(api?.videos) ? (api.videos as MediaSource[]) : [],
    bio: api?.bio,
  };
}

function normalizeParentApi(api: any, name: string, email: string): ParentProfile {
  return {
    email,
    name,
    relationship: api?.relationship ?? '',
    childAthleteEmail: '',
    childClassYear: api?.child_class_year ?? '',
    location: '',
    bio: api?.bio ?? '',
  };
}

const { width } = Dimensions.get('window');
const PHOTO_SIZE = (width - 48) / 3 - 8;
const VIDEO_HEIGHT = 180;
const BANNER_HEIGHT = 140;

function comingSoon(feature: string) {
  Alert.alert(feature, 'This feature is coming soon!', [{ text: 'OK' }]);
}

// Compute profile completeness for athletes
function getCompleteness(profile: {
  bio?: string;
  photos: MediaSource[];
  videos: MediaSource[];
  position?: string;
  level?: string;
  gpa?: number;
  height?: string;
  weight?: string;
  classYear?: string;
}) {
  const checks = [
    { label: 'Bio', done: !!profile.bio, weight: 15 },
    { label: 'Photos', done: profile.photos.length > 0, weight: 20 },
    { label: 'Highlight video', done: profile.videos.length > 0, weight: 20 },
    { label: 'Position & level', done: !!(profile.position && profile.level), weight: 15 },
    { label: 'Class year', done: !!profile.classYear, weight: 10 },
    { label: 'GPA', done: !!profile.gpa, weight: 10 },
    { label: 'Height & weight', done: !!(profile.height && profile.weight), weight: 10 },
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

  const isAthlete = user?.role === 'athlete';
  const isRecruiter = user?.role === 'recruiter' || user?.role === 'coach';
  const isParent = user?.role === 'parent';

  const [apiAthlete, setApiAthlete] = useState<AthleteProfile | null>(null);
  const [apiAgent, setApiAgent] = useState<AgentProfile | null>(null);
  const [apiParent, setApiParent] = useState<ParentProfile | null>(null);
  const [apiUser, setApiUser] = useState<MeUser | null>(null);
  const [apiStats, setApiStats] = useState<ProfileStats | null>(null);
  const [uploading, setUploading] = useState<null | 'photos' | 'videos'>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  const loadProfile = useCallback(async () => {
    if (!user) return;
    const name = user.name ?? '';
    const email = user.email;

    usersService.getMe()
      .then((data) => setApiUser(data ?? null))
      .catch(() => setApiUser(null));

    if (isAthlete) {
      profilesService.getAthleteProfile()
        .then((data) => { if (data) setApiAthlete(normalizeAthleteApi(data, name, email)); })
        .catch(() => setApiAthlete(null));
      if (user.id) {
        statsService.getProfileStats(user.id)
          .then((data) => setApiStats(data ?? null))
          .catch(() => setApiStats(null));
      }
    } else if (isRecruiter) {
      profilesService.getRecruiterProfile()
        .then((data) => { if (data) setApiAgent(normalizeAgentApi(data, name, email)); })
        .catch(() => setApiAgent(null));
    } else if (isParent) {
      profilesService.getParentProfile()
        .then((data) => { if (data) setApiParent(normalizeParentApi(data, name, email)); })
        .catch(() => setApiParent(null));
    }
  }, [user, isAthlete, isRecruiter, isParent]);

  useFocusEffect(useCallback(() => { loadProfile(); }, [loadProfile]));

  const handleAddMedia = useCallback(async (kind: 'photos' | 'videos') => {
    if (uploading || !user) return;
    if (!isAthlete && !isRecruiter) {
      comingSoon('Add Media');
      return;
    }
    setUploading(kind);
    try {
      const newUrls = await pickAndUploadMedia(
        kind === 'videos' ? 'video' : 'image',
        kind,
        { allowsMultipleSelection: kind === 'photos', selectionLimit: kind === 'photos' ? 6 : 1 },
      );
      if (newUrls.length === 0) return;

      if (isAthlete) {
        let current: any = {};
        try { current = await profilesService.getAthleteProfile(); } catch { /* 404 = no profile yet */ }
        if (!current?.sport) {
          Alert.alert(
            'Set up your profile first',
            'Add your sport and position before uploading media. Tap the pencil to edit your profile.',
          );
          return;
        }
        const merged = pickFields(current, ATHLETE_DTO_FIELDS);
        const existing: string[] = Array.isArray(current[kind]) ? current[kind] : [];
        merged[kind] = [...existing, ...newUrls];
        await profilesService.upsertAthleteProfile(merged);
      } else if (isRecruiter) {
        let current: any = {};
        try { current = await profilesService.getRecruiterProfile(); } catch { /* 404 */ }
        if (!current?.organization || !current?.sport || !current?.role_type) {
          Alert.alert(
            'Set up your profile first',
            'Add your organization, sport, and role before uploading media. Tap the pencil to edit your profile.',
          );
          return;
        }
        const merged = pickFields(current, RECRUITER_DTO_FIELDS);
        const existing: string[] = Array.isArray(current[kind]) ? current[kind] : [];
        merged[kind] = [...existing, ...newUrls];
        await profilesService.upsertRecruiterProfile(merged);
      }

      await loadProfile();
    } catch (err: any) {
      Alert.alert('Upload failed', err?.message ?? 'Something went wrong while uploading.');
    } finally {
      setUploading(null);
    }
  }, [uploading, user, isAthlete, isRecruiter, loadProfile]);

  const handleDeleteMedia = useCallback(async (kind: 'photos' | 'videos', url: string) => {
    if (uploading || !user) return;
    if (!isAthlete && !isRecruiter) return;
    Alert.alert(
      kind === 'videos' ? 'Delete this video?' : 'Delete this photo?',
      'This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
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
              const existing: string[] = Array.isArray(current[kind]) ? current[kind] : [];
              const next = existing.filter((u: string) => u !== url);
              if (next.length === existing.length) {
                // URL wasn't in the array (e.g. mock data). Skip.
                return;
              }

              const bucket: UploadBucket = kind === 'videos' ? 'videos' : 'photos';
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
              await loadProfile();
            } catch (err: any) {
              Alert.alert('Could not delete', err?.message ?? 'Try again in a moment.');
            } finally {
              setUploading(null);
            }
          },
        },
      ],
    );
  }, [uploading, user, isAthlete, isRecruiter, loadProfile]);

  const handleChangeAvatar = useCallback(async () => {
    if (uploadingAvatar || !user) return;
    setUploadingAvatar(true);
    try {
      const newUrls = await pickAndUploadMedia('image', 'avatars', {
        allowsMultipleSelection: false,
        selectionLimit: 1,
      });
      if (newUrls.length === 0) return;
      await usersService.updateMe({ avatar_url: newUrls[0] });
      await loadProfile();
    } catch (err: any) {
      Alert.alert('Upload failed', err?.message ?? 'Could not update your photo.');
    } finally {
      setUploadingAvatar(false);
    }
  }, [uploadingAvatar, user, loadProfile]);

  const athleteProfile = isAthlete
    ? apiAthlete ?? mockAthletes.find((a) => a.email === user?.email) ?? null
    : null;
  const agentProfile = isRecruiter
    ? apiAgent ?? (user?.email === mockAgentProfile.email ? mockAgentProfile : null)
    : null;
  const parentProfile = isParent
    ? apiParent ?? mockParentProfiles.find((p) => p.email === user?.email) ?? null
    : null;
  const childAthleteProfile = parentProfile
    ? mockAthletes.find((athlete) => athlete.email === (parentProfile as ParentProfile).childAthleteEmail)
    : null;

  const profileData = athleteProfile ?? agentProfile ?? childAthleteProfile;
  const photos: MediaSource[] = profileData?.photos ?? [];
  const videos: MediaSource[] = profileData?.videos ?? [];

  const profileViews = apiStats?.profileViews ?? athleteProfile?.profileViews ?? 0;
  const likesReceived = apiStats?.likesReceived ?? athleteProfile?.likesReceived ?? 0;
  const athleteMatches = apiStats?.matches
    ?? (isAthlete && user?.email ? (mockAthleteMatches[user.email] ?? []).length : 0);

  const completeness = isAthlete && athleteProfile
    ? getCompleteness(athleteProfile)
    : null;

  const displayLocation = apiUser?.location
    ?? parentProfile?.location
    ?? profileData?.location;

  if (!fontsLoaded) return null;

  const displayName = user?.name ?? 'User';
  const roleLabel =
    user?.role === 'recruiter'
      ? 'Agent / Recruiter'
      : user?.role === 'coach'
        ? 'Coach'
        : user?.role === 'athlete'
          ? 'Athlete'
          : user?.role === 'parent'
            ? 'Parent'
            : 'User';

  const richRoleLabel = isAthlete && athleteProfile
    ? `${athleteProfile.position} · ${athleteProfile.level}`
    : roleLabel;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={styles.title}>Profile</Text>
        <Pressable style={styles.editButton} onPress={() => router.push('/profile-edit')}>
          <Ionicons name="pencil-outline" size={22} color={theme.text} />
        </Pressable>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 24 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Avatar / Banner Section */}
        <View style={styles.avatarSection}>
          <LinearGradient
            colors={['#1a1a2e', '#16213e', '#0f3460']}
            style={styles.banner}
          />
          <View style={styles.avatarWrapper}>
            <View style={styles.avatarPlaceholder}>
              {apiUser?.avatar_url ? (
                <Image
                  source={{ uri: apiUser.avatar_url }}
                  style={styles.avatarImage}
                  resizeMode="cover"
                />
              ) : photos.length > 0 ? (
                <Image
                  source={typeof photos[0] === 'string' ? { uri: photos[0] } : photos[0]}
                  style={styles.avatarImage}
                  resizeMode="cover"
                />
              ) : (
                <Ionicons
                  name={
                    user?.role === 'recruiter' || user?.role === 'coach'
                      ? 'briefcase'
                      : user?.role === 'parent'
                        ? 'people'
                        : 'person'
                  }
                  size={64}
                  color={theme.textMuted}
                />
              )}
            </View>
            <Pressable
              style={[styles.avatarEditBadge, uploadingAvatar && styles.avatarEditBadgeDisabled]}
              onPress={handleChangeAvatar}
              disabled={uploadingAvatar}
            >
              {uploadingAvatar ? (
                <ActivityIndicator size="small" color={brand.white} />
              ) : (
                <Ionicons name="camera" size={14} color={brand.white} />
              )}
            </Pressable>
          </View>
          <Text style={styles.name}>{displayName}</Text>
          <View style={styles.roleBadge}>
            <Text style={styles.roleText}>{richRoleLabel}</Text>
          </View>
          {isAthlete && athleteProfile && (
            <View style={styles.sportRow}>
              <Ionicons name="american-football" size={14} color={theme.textSecondary} />
              <Text style={styles.sportText}>{athleteProfile.sport}</Text>
              {athleteProfile.classYear && (
                <>
                  <Text style={styles.sportDot}>·</Text>
                  <Text style={styles.sportText}>Class of {athleteProfile.classYear}</Text>
                </>
              )}
            </View>
          )}
        </View>

        {/* Athlete Stats Bar */}
        {isAthlete && (
          <View style={styles.statsBar}>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{profileViews}</Text>
              <Text style={styles.statLabel}>Profile Views</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{likesReceived}</Text>
              <Text style={styles.statLabel}>Likes</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{athleteMatches}</Text>
              <Text style={styles.statLabel}>Matches</Text>
            </View>
          </View>
        )}

        {/* Profile Completeness (athletes only) */}
        {isAthlete && completeness && completeness.score < 100 && (
          <View style={styles.completenessCard}>
            <View style={styles.completenessHeader}>
              <Text style={styles.completenessTitle}>Profile Strength</Text>
              <Text style={styles.completenessScore}>{completeness.score}%</Text>
            </View>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${completeness.score}%` }]} />
            </View>
            {completeness.missing.length > 0 && (
              <View style={styles.missingList}>
                <Text style={styles.missingLabel}>Add to boost your profile:</Text>
                {completeness.missing.map((item) => (
                  <View key={item} style={styles.missingItem}>
                    <Ionicons name="add-circle-outline" size={14} color={semantic.info} />
                    <Text style={styles.missingItemText}>{item}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        )}

        {/* About Section */}
        {(athleteProfile || agentProfile || parentProfile) && (
          <View style={styles.infoSection}>
            <Text style={styles.sectionTitle}>About</Text>
            {athleteProfile && (
              <>
                <View style={styles.infoRow}>
                  <Ionicons name="football" size={18} color={theme.textMuted} />
                  <Text style={styles.infoText}>
                    {athleteProfile.sport} · {athleteProfile.position}
                  </Text>
                </View>
                <View style={styles.infoRow}>
                  <Ionicons name="school" size={18} color={theme.textMuted} />
                  <Text style={styles.infoText}>{athleteProfile.level}</Text>
                </View>
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
                    <Text style={styles.infoText}>GPA: {athleteProfile.gpa.toFixed(1)}</Text>
                  </View>
                )}
                {athleteProfile.fortyYardDash && (
                  <View style={styles.infoRow}>
                    <Ionicons name="timer" size={18} color={theme.textMuted} />
                    <Text style={styles.infoText}>40-yard dash: {athleteProfile.fortyYardDash}</Text>
                  </View>
                )}
              </>
            )}
            {agentProfile && (
              <>
                <View style={styles.infoRow}>
                  <Ionicons name="briefcase" size={18} color={theme.textMuted} />
                  <Text style={styles.infoText}>{agentProfile.organization}</Text>
                </View>
                <View style={styles.infoRow}>
                  <Ionicons name="football" size={18} color={theme.textMuted} />
                  <Text style={styles.infoText}>{agentProfile.sport}</Text>
                </View>
              </>
            )}
            {parentProfile && childAthleteProfile && (
              <>
                <View style={styles.infoRow}>
                  <Ionicons name="people" size={18} color={theme.textMuted} />
                  <Text style={styles.infoText}>
                    {parentProfile.relationship} of {childAthleteProfile.name}
                  </Text>
                </View>
                <View style={styles.infoRow}>
                  <Ionicons name="football" size={18} color={theme.textMuted} />
                  <Text style={styles.infoText}>
                    {childAthleteProfile.sport} · {childAthleteProfile.position}
                  </Text>
                </View>
                <View style={styles.infoRow}>
                  <Ionicons name="school" size={18} color={theme.textMuted} />
                  <Text style={styles.infoText}>
                    {childAthleteProfile.level} · {parentProfile.childClassYear}
                  </Text>
                </View>
              </>
            )}
            {displayLocation && (
              <View style={styles.infoRow}>
                <Ionicons name="location" size={18} color={theme.textMuted} />
                <Text style={styles.infoText}>{displayLocation}</Text>
              </View>
            )}
            {(parentProfile?.bio || profileData?.bio) && (
              <Text style={styles.bio}>{parentProfile?.bio ?? profileData?.bio}</Text>
            )}
          </View>
        )}

        {/* Awards & Achievements (athletes only) */}
        {isAthlete && athleteProfile?.awards && athleteProfile.awards.length > 0 && (
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
            <Text style={styles.sectionTitle}>{isParent ? "Child's Photos" : 'Photos'}</Text>
            {!isParent && (
              <Pressable
                onPress={() => handleAddMedia('photos')}
                disabled={uploading !== null}
              >
                {uploading === 'photos' ? (
                  <ActivityIndicator size="small" color={theme.text} />
                ) : (
                  <Text style={styles.addText}>+ Add</Text>
                )}
              </Pressable>
            )}
          </View>
          <View style={styles.photoGrid}>
            {photos.length > 0 ? (
              photos.map((photo, i) => {
                const isUrl = typeof photo === 'string';
                return (
                  <Pressable
                    key={i}
                    style={styles.photoItem}
                    onLongPress={isUrl && !isParent ? () => handleDeleteMedia('photos', photo as string) : undefined}
                    delayLongPress={400}
                  >
                    <Image
                      source={isUrl ? { uri: photo as string } : photo}
                      style={styles.photoImage}
                      resizeMode="cover"
                    />
                  </Pressable>
                );
              })
            ) : (
              <View style={styles.emptyMedia}>
                <Ionicons name="images-outline" size={40} color={theme.textMuted} />
                <Text style={styles.emptyMediaText}>
                  {isParent ? "Child athlete hasn't added photos yet" : 'Add photos to your profile'}
                </Text>
                <Pressable
                  style={[styles.addMediaButton, uploading === 'photos' && styles.addMediaButtonDisabled]}
                  onPress={() => isParent ? comingSoon('Request Uploads') : handleAddMedia('photos')}
                  disabled={uploading !== null}
                >
                  {uploading === 'photos' ? (
                    <ActivityIndicator size="small" color={theme.accentText} />
                  ) : (
                    <Text style={styles.addMediaButtonText}>
                      {isParent ? 'Request Uploads' : 'Add Photos'}
                    </Text>
                  )}
                </Pressable>
              </View>
            )}
          </View>
        </View>

        {/* Videos */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{isParent ? "Child's Videos" : 'Videos'}</Text>
            {!isParent && (
              <Pressable
                onPress={() => handleAddMedia('videos')}
                disabled={uploading !== null}
              >
                {uploading === 'videos' ? (
                  <ActivityIndicator size="small" color={theme.text} />
                ) : (
                  <Text style={styles.addText}>+ Add</Text>
                )}
              </Pressable>
            )}
          </View>
          <View style={styles.videoSection}>
            {videos.length > 0 ? (
              videos.map((uri, i) => {
                const isUrl = typeof uri === 'string';
                return (
                  <Pressable
                    key={i}
                    style={styles.videoItem}
                    onPress={() => comingSoon('Video Player')}
                    onLongPress={isUrl && !isParent ? () => handleDeleteMedia('videos', uri as string) : undefined}
                    delayLongPress={400}
                  >
                    <View style={styles.videoPlaceholder}>
                      <Ionicons name="play-circle" size={48} color={brand.white} />
                      <Text style={styles.videoLabel}>Highlight Reel {i + 1}</Text>
                    </View>
                  </Pressable>
                );
              })
            ) : (
              <View style={styles.emptyMedia}>
                <Ionicons name="videocam-outline" size={40} color={theme.textMuted} />
                <Text style={styles.emptyMediaText}>
                  {isParent ? "Child athlete hasn't added highlight videos" : 'Add highlight videos'}
                </Text>
                <Pressable
                  style={[styles.addMediaButton, uploading === 'videos' && styles.addMediaButtonDisabled]}
                  onPress={() => isParent ? comingSoon('Request Uploads') : handleAddMedia('videos')}
                  disabled={uploading !== null}
                >
                  {uploading === 'videos' ? (
                    <ActivityIndicator size="small" color={theme.accentText} />
                  ) : (
                    <Text style={styles.addMediaButtonText}>
                      {isParent ? 'Request Uploads' : 'Add Videos'}
                    </Text>
                  )}
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: theme.headerBg,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  title: {
    fontSize: 24,
    fontFamily: 'Poppins_700Bold',
    color: theme.text,
  },
  editButton: {
    padding: 8,
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
    overflow: 'hidden',
    alignItems: 'center',
    paddingBottom: 24,
  },
  banner: {
    width: '100%',
    height: BANNER_HEIGHT,
  },
  avatarWrapper: {
    marginTop: -(BANNER_HEIGHT / 2 + 10),
    position: 'relative',
  },
  avatarPlaceholder: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: theme.surface,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderWidth: 4,
    borderColor: theme.surface,
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  avatarEditBadge: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: brand.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: theme.surface,
  },
  avatarEditBadgeDisabled: {
    opacity: 0.7,
  },
  name: {
    fontSize: 22,
    fontFamily: 'Poppins_700Bold',
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
    fontFamily: 'Poppins_500Medium',
    color: theme.badgeText,
  },
  sportRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
  },
  sportText: {
    fontSize: 13,
    fontFamily: 'Poppins_400Regular',
    color: theme.textSecondary,
  },
  sportDot: {
    fontSize: 13,
    color: theme.textMuted,
  },
  // Stats bar
  statsBar: {
    backgroundColor: theme.cardBg,
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 20,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 24,
    fontFamily: 'Poppins_700Bold',
    color: theme.text,
  },
  statLabel: {
    fontSize: 12,
    fontFamily: 'Poppins_400Regular',
    color: theme.textSecondary,
    marginTop: 2,
  },
  statDivider: {
    width: 1,
    height: 36,
    backgroundColor: theme.border,
  },
  // Completeness card
  completenessCard: {
    backgroundColor: theme.cardBg,
    borderRadius: 16,
    padding: 20,
  },
  completenessHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  completenessTitle: {
    fontSize: 16,
    fontFamily: 'Poppins_600SemiBold',
    color: theme.text,
  },
  completenessScore: {
    fontSize: 16,
    fontFamily: 'Poppins_700Bold',
    color: semantic.success,
  },
  progressTrack: {
    height: 8,
    backgroundColor: theme.border,
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: semantic.success,
    borderRadius: 4,
  },
  missingList: {
    marginTop: 14,
    gap: 8,
  },
  missingLabel: {
    fontSize: 13,
    fontFamily: 'Poppins_500Medium',
    color: theme.textSecondary,
    marginBottom: 4,
  },
  missingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  missingItemText: {
    fontSize: 13,
    fontFamily: 'Poppins_400Regular',
    color: theme.textSecondary,
  },
  // Info section
  infoSection: {
    backgroundColor: theme.cardBg,
    borderRadius: 16,
    padding: 20,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
  },
  infoText: {
    fontSize: 15,
    fontFamily: 'Poppins_400Regular',
    color: theme.text,
  },
  bio: {
    fontSize: 14,
    fontFamily: 'Poppins_400Regular',
    color: theme.textSecondary,
    marginTop: 12,
    lineHeight: 22,
  },
  // Awards
  awardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 8,
  },
  awardText: {
    fontSize: 14,
    fontFamily: 'Poppins_500Medium',
    color: theme.text,
  },
  section: {
    backgroundColor: theme.cardBg,
    borderRadius: 16,
    padding: 20,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontFamily: 'Poppins_600SemiBold',
    color: theme.text,
  },
  addText: {
    fontSize: 14,
    fontFamily: 'Poppins_600SemiBold',
    color: theme.text,
  },
  photoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  photoItem: {
    width: PHOTO_SIZE,
    height: PHOTO_SIZE,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: theme.surface,
  },
  photoImage: {
    width: '100%',
    height: '100%',
  },
  videoSection: {
    gap: 12,
  },
  videoItem: {
    height: VIDEO_HEIGHT,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: theme.surfaceSecondary,
  },
  videoPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  videoLabel: {
    fontSize: 13,
    fontFamily: 'Poppins_500Medium',
    color: 'rgba(255,255,255,0.8)',
  },
  emptyMedia: {
    alignItems: 'center',
    paddingVertical: 32,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: theme.borderLight,
    borderRadius: 12,
    width: '100%',
  },
  emptyMediaText: {
    fontSize: 14,
    fontFamily: 'Poppins_400Regular',
    color: theme.textSecondary,
    marginTop: 12,
    textAlign: 'center',
    paddingHorizontal: 20,
  },
  addMediaButton: {
    marginTop: 12,
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: theme.accent,
    borderRadius: 20,
    minHeight: 36,
    minWidth: 120,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addMediaButtonDisabled: {
    opacity: 0.6,
  },
  addMediaButtonText: {
    fontSize: 14,
    fontFamily: 'Poppins_600SemiBold',
    color: theme.accentText,
  },
});
