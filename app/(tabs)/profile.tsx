import React from 'react';
import {
  View,
  StyleSheet,
  Text,
  ScrollView,
  Pressable,
  Image,
  Dimensions,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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
import { mockAthletes, mockAgentProfile, MediaSource, mockAthleteMatches } from '@/constants/discoverData';
import { mockParentProfiles } from '@/constants/parentData';

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
  const user = useSelector((state: RootState) => state.auth.user);

  const [fontsLoaded] = useFonts({
    Poppins_400Regular,
    Poppins_500Medium,
    Poppins_600SemiBold,
    Poppins_700Bold,
  });

  const isAthlete = user?.role === 'athlete';
  const isRecruiter = user?.role === 'recruiter';
  const isParent = user?.role === 'parent';

  const athleteProfile = isAthlete
    ? mockAthletes.find((a) => a.email === user?.email)
    : null;
  const agentProfile =
    isRecruiter && user?.email === mockAgentProfile.email ? mockAgentProfile : null;
  const parentProfile = isParent
    ? mockParentProfiles.find((parent) => parent.email === user?.email)
    : null;
  const childAthleteProfile = parentProfile
    ? mockAthletes.find((athlete) => athlete.email === parentProfile.childAthleteEmail)
    : null;

  const profileData = athleteProfile ?? agentProfile ?? childAthleteProfile;
  const photos: MediaSource[] = profileData?.photos ?? [];
  const videos: MediaSource[] = profileData?.videos ?? [];

  // Athlete-specific stats
  const athleteMatches = isAthlete && user?.email
    ? (mockAthleteMatches[user.email] ?? []).length
    : 0;
  const profileViews = athleteProfile?.profileViews ?? 0;
  const likesReceived = athleteProfile?.likesReceived ?? 0;

  // Completeness
  const completeness = isAthlete && athleteProfile
    ? getCompleteness(athleteProfile)
    : null;

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
        <Pressable style={styles.editButton} onPress={() => comingSoon('Edit Profile')}>
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
              {photos.length > 0 ? (
                <Image
                  source={typeof photos[0] === 'string' ? { uri: photos[0] } : photos[0]}
                  style={styles.avatarImage}
                  resizeMode="cover"
                />
              ) : (
                <Ionicons
                  name={
                    user?.role === 'recruiter'
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
            {isAthlete && (
              <Pressable
                style={styles.avatarEditBadge}
                onPress={() => comingSoon('Change Photo')}
              >
                <Ionicons name="camera" size={14} color={brand.white} />
              </Pressable>
            )}
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
            <View style={styles.infoRow}>
              <Ionicons name="location" size={18} color={theme.textMuted} />
              <Text style={styles.infoText}>{parentProfile?.location ?? profileData?.location}</Text>
            </View>
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
            <Pressable onPress={() => comingSoon('Add Photos')}>
              <Text style={styles.addText}>+ Add</Text>
            </Pressable>
          </View>
          <View style={styles.photoGrid}>
            {photos.length > 0 ? (
              photos.map((photo, i) => (
                <View key={i} style={styles.photoItem}>
                  <Image
                    source={typeof photo === 'string' ? { uri: photo } : photo}
                    style={styles.photoImage}
                    resizeMode="cover"
                  />
                </View>
              ))
            ) : (
              <View style={styles.emptyMedia}>
                <Ionicons name="images-outline" size={40} color={theme.textMuted} />
                <Text style={styles.emptyMediaText}>
                  {isParent ? "Child athlete hasn't added photos yet" : 'Add photos to your profile'}
                </Text>
                <Pressable style={styles.addMediaButton} onPress={() => comingSoon('Add Photos')}>
                  <Text style={styles.addMediaButtonText}>
                    {isParent ? 'Request Uploads' : 'Add Photos'}
                  </Text>
                </Pressable>
              </View>
            )}
          </View>
        </View>

        {/* Videos */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{isParent ? "Child's Videos" : 'Videos'}</Text>
            <Pressable onPress={() => comingSoon('Add Videos')}>
              <Text style={styles.addText}>+ Add</Text>
            </Pressable>
          </View>
          <View style={styles.videoSection}>
            {videos.length > 0 ? (
              videos.map((uri, i) => (
                <Pressable key={i} style={styles.videoItem} onPress={() => comingSoon('Video Player')}>
                  <View style={styles.videoPlaceholder}>
                    <Ionicons name="play-circle" size={48} color={brand.white} />
                    <Text style={styles.videoLabel}>Highlight Reel {i + 1}</Text>
                  </View>
                </Pressable>
              ))
            ) : (
              <View style={styles.emptyMedia}>
                <Ionicons name="videocam-outline" size={40} color={theme.textMuted} />
                <Text style={styles.emptyMediaText}>
                  {isParent ? "Child athlete hasn't added highlight videos" : 'Add highlight videos'}
                </Text>
                <Pressable style={styles.addMediaButton} onPress={() => comingSoon('Add Videos')}>
                  <Text style={styles.addMediaButtonText}>
                    {isParent ? 'Request Uploads' : 'Add Videos'}
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
  },
  addMediaButtonText: {
    fontSize: 14,
    fontFamily: 'Poppins_600SemiBold',
    color: theme.accentText,
  },
});
