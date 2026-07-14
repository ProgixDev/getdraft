import React, { useCallback, useState } from 'react';
import {
  View,
  StyleSheet,
  Text,
  ScrollView,
  Pressable,
  Image,
  ActivityIndicator,
  Alert,
  Dimensions,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSelector } from 'react-redux';
import {
  useFonts,
  Poppins_400Regular,
  Poppins_500Medium,
  Poppins_600SemiBold,
  Poppins_700Bold,
} from '@expo-google-fonts/poppins';
import { brand, semantic, theme } from '@/config/colors';
import { profilesService } from '@/services/profiles';
import { statsService } from '@/services/stats';
import { usersService } from '@/services/users';
import { outreachService } from '@/services/outreach';
import type { RootState } from '@/store';
import {
  rankingsService,
  starsForRank,
  DIVISION_LABEL,
  type RankingRow,
} from '@/services/rankings';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const PHOTO_SIZE = (SCREEN_WIDTH - 48) / 3 - 8;
const VIDEO_HEIGHT = 180;
const BANNER_HEIGHT = 140;

type Role = 'athlete' | 'recruiter' | 'coach' | 'parent' | 'admin';

interface AthleteSubProfile {
  sport?: string;
  position?: string;
  level?: string;
  team?: string;
  agency?: string;
  bio?: string;
  class_year?: string;
  gpa?: number;
  height?: string;
  weight?: string;
  forty_yard_dash?: string;
  awards?: string[];
  photos?: string[];
  videos?: string[];
}

interface RecruiterSubProfile {
  organization?: string;
  sport?: string;
  team?: string;
  role_type?: 'agent' | 'coach';
  verified?: boolean;
  tags?: string[];
  bio?: string;
  photos?: string[];
  videos?: string[];
}

interface ParentSubProfile {
  relationship?: string;
  child_class_year?: string;
  bio?: string;
}

interface PublicProfile {
  id: string;
  name?: string;
  role?: Role;
  avatar_url?: string | null;
  location?: string | null;
  country?: string | null;
  profile?: AthleteSubProfile | RecruiterSubProfile | ParentSubProfile | null;
  // Server-resolved approved guardian of an athlete. Drives whether a
  // recruiter/coach can see the "Send outreach" entry point on this screen
  // — the outreach DTO requires the parent's user id, not the athlete's.
  parent_user_id?: string | null;
  // True when the viewer and this user have a mutual match — powers the
  // "Matched" badge. Server-computed per viewer.
  is_matched?: boolean;
  match_id?: string | null;
}

interface ProfileStats {
  profileViews?: number;
  likesReceived?: number;
  totalMatches?: number;
}

function roleLabel(role: Role | undefined, sub: any): string {
  if (role === 'athlete' && sub?.position && sub?.level) {
    return `${sub.position} · ${sub.level}`;
  }
  if (role === 'recruiter') return 'Agent / Recruiter';
  if (role === 'coach') return 'Coach';
  if (role === 'athlete') return 'Athlete';
  if (role === 'parent') return 'Parent';
  return 'User';
}

export default function PublicProfileScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { userId } = useLocalSearchParams<{ userId?: string }>();

  const [fontsLoaded] = useFonts({
    Poppins_400Regular,
    Poppins_500Medium,
    Poppins_600SemiBold,
    Poppins_700Bold,
  });

  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [stats, setStats] = useState<ProfileStats | null>(null);
  const [rank, setRank] = useState<RankingRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [blocking, setBlocking] = useState(false);
  const [outreachOpen, setOutreachOpen] = useState(false);
  const [outreachMessage, setOutreachMessage] = useState('');
  const [outreachSending, setOutreachSending] = useState(false);

  const viewerRole = useSelector((state: RootState) => state.auth.user?.role);

  useFocusEffect(
    useCallback(() => {
      if (!userId) return;
      let cancelled = false;
      const id = String(userId);
      setLoading(true);
      setError(null);

      profilesService.getPublicProfile(id)
        .then((data) => {
          if (!cancelled) setProfile(data ?? null);
        })
        .catch((err: any) => {
          if (cancelled) return;
          if (err?.response?.status === 404) {
            setError('This profile is no longer available.');
          } else {
            setError('Could not load profile. Try again in a moment.');
          }
        })
        .finally(() => { if (!cancelled) setLoading(false); });

      statsService.getProfileStats(id)
        .then((data) => { if (!cancelled) setStats(data ?? null); })
        .catch(() => { if (!cancelled) setStats(null); });

      // Ranking row — service is null-safe, so non-athlete or unranked
      // viewers just resolve to null and the credibility chip stays hidden.
      rankingsService.getRankForUser(id)
        .then((row) => { if (!cancelled) setRank(row); });

      // Best-effort view tracking — don't surface errors.
      usersService.trackProfileView(id).catch(() => {});

      return () => { cancelled = true; };
    }, [userId]),
  );

  const handleBlock = useCallback(() => {
    if (!userId || blocking) return;
    Alert.alert(
      'Block this user?',
      'They won’t be able to see your profile, draft you, or message you. You can unblock them later in Settings.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Block',
          style: 'destructive',
          onPress: async () => {
            setBlocking(true);
            try {
              await usersService.blockUser(String(userId));
              router.back();
            } catch (err: any) {
              const msg = err?.response?.data?.message ?? err?.message ?? 'Try again in a moment.';
              Alert.alert('Could not block', String(msg));
            } finally {
              setBlocking(false);
            }
          },
        },
      ],
    );
  }, [userId, blocking, router]);

  const handleMore = useCallback(() => {
    Alert.alert(
      'More',
      undefined,
      [
        { text: 'Block user', style: 'destructive', onPress: handleBlock },
        { text: 'Cancel', style: 'cancel' },
      ],
    );
  }, [handleBlock]);

  const handleSendOutreach = useCallback(async () => {
    const parentId = profile?.parent_user_id;
    const athleteId = profile?.id;
    const trimmed = outreachMessage.trim();
    if (!parentId || !athleteId || trimmed.length === 0 || outreachSending) return;
    setOutreachSending(true);
    try {
      await outreachService.createOutreach(parentId, athleteId, trimmed);
      setOutreachOpen(false);
      setOutreachMessage('');
      Alert.alert('Outreach sent', "The parent will see your message in their Outreach inbox.");
    } catch (err: any) {
      const status = err?.response?.status;
      if (status === 409) {
        Alert.alert(
          'Already sent',
          'You already have an outreach thread open with this parent. Open Outreach to continue the conversation.',
        );
      } else {
        const msg = err?.response?.data?.message ?? err?.message ?? 'Try again in a moment.';
        Alert.alert('Could not send', String(msg));
      }
    } finally {
      setOutreachSending(false);
    }
  }, [profile?.parent_user_id, profile?.id, outreachMessage, outreachSending]);

  if (!fontsLoaded) return null;

  const sub = (profile?.profile ?? {}) as any;
  const role = profile?.role;
  const isAthlete = role === 'athlete';
  const isRecruiter = role === 'recruiter' || role === 'coach';
  const viewerIsRecruiter = viewerRole === 'recruiter' || viewerRole === 'coach';
  const canSendOutreach = viewerIsRecruiter && isAthlete && !!profile?.parent_user_id;
  const photos: string[] = Array.isArray(sub.photos) ? sub.photos : [];
  const videos: string[] = Array.isArray(sub.videos) ? sub.videos : [];
  const displayLocation = profile?.location ?? null;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable style={styles.headerButton} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={22} color={theme.text} />
        </Pressable>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {profile?.name ?? 'Profile'}
        </Text>
        <Pressable style={styles.headerButton} onPress={handleMore} disabled={!profile || blocking}>
          {blocking ? (
            <ActivityIndicator size="small" color={theme.text} />
          ) : (
            <Ionicons name="ellipsis-vertical" size={20} color={theme.text} />
          )}
        </Pressable>
      </View>

      {loading && !profile ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={theme.text} />
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Ionicons name="alert-circle-outline" size={40} color={theme.textMuted} />
          <Text style={styles.errorText}>{error}</Text>
          <Pressable style={styles.retryButton} onPress={() => router.back()}>
            <Text style={styles.retryButtonText}>Go back</Text>
          </Pressable>
        </View>
      ) : profile ? (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 24 }]}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.avatarSection}>
            <LinearGradient
              colors={['#1a1a2e', '#16213e', '#0f3460']}
              style={styles.banner}
            />
            <View style={styles.avatarWrapper}>
              <View style={styles.avatarPlaceholder}>
                {profile.avatar_url ? (
                  <Image
                    source={{ uri: profile.avatar_url }}
                    style={styles.avatarImage}
                    resizeMode="cover"
                  />
                ) : photos.length > 0 ? (
                  <Image
                    source={{ uri: photos[0] }}
                    style={styles.avatarImage}
                    resizeMode="cover"
                  />
                ) : (
                  <Ionicons
                    name={isRecruiter ? 'briefcase' : role === 'parent' ? 'people' : 'person'}
                    size={64}
                    color={theme.textMuted}
                  />
                )}
              </View>
              {isRecruiter && sub.verified && (
                <View style={styles.verifiedBadge}>
                  <Ionicons name="checkmark" size={12} color={brand.white} />
                </View>
              )}
            </View>
            <Text style={styles.name}>{profile.name ?? 'User'}</Text>
            <View style={styles.roleBadge}>
              <Text style={styles.roleText}>{roleLabel(role, sub)}</Text>
            </View>
            {profile.is_matched && (
              <View style={styles.matchedBadge}>
                <Ionicons name="checkmark-circle" size={14} color={brand.white} />
                <Text style={styles.matchedText}>Matched</Text>
              </View>
            )}
            {isAthlete && sub.sport && (
              <View style={styles.sportRow}>
                <Ionicons name="american-football" size={14} color={theme.textSecondary} />
                <Text style={styles.sportText}>{sub.sport}</Text>
                {sub.class_year && (
                  <>
                    <Text style={styles.sportDot}>·</Text>
                    <Text style={styles.sportText}>Class of {sub.class_year}</Text>
                  </>
                )}
              </View>
            )}
            {isAthlete && rank && (rank.division === 'CA' || rank.division === 'US') && (
              <Pressable
                style={({ pressed }) => [styles.rankChip, pressed && styles.rankChipPressed]}
                onPress={() => router.push('/rankings')}
                accessibilityRole="button"
                accessibilityLabel={`Ranked number ${rank.division_rank} in ${DIVISION_LABEL[rank.division]} ${rank.sport}. Open rankings.`}
              >
                <Text style={styles.rankChipHash}>#{rank.division_rank}</Text>
                <Text style={styles.rankChipMeta} numberOfLines={1}>
                  in {DIVISION_LABEL[rank.division]} · {rank.sport}
                </Text>
                <Text style={styles.rankChipDot}>·</Text>
                <View style={styles.rankChipStars}>
                  {(() => {
                    const filled = starsForRank(rank.division_rank, rank.cohort_size);
                    return [1, 2, 3, 4, 5].map((i) => (
                      <Ionicons
                        key={i}
                        name={i <= filled ? 'star' : 'star-outline'}
                        size={11}
                        color={i <= filled ? semantic.warning : theme.textMuted}
                      />
                    ));
                  })()}
                </View>
                <Text style={styles.rankChipDot}>·</Text>
                <Text style={styles.rankChipScore}>score {Math.round(rank.score)}</Text>
              </Pressable>
            )}
            {canSendOutreach && (
              <Pressable
                style={({ pressed }) => [styles.outreachButton, pressed && styles.outreachButtonPressed]}
                onPress={() => setOutreachOpen(true)}
                accessibilityRole="button"
                accessibilityLabel={`Send outreach about ${profile?.name ?? 'this athlete'} to their parent`}
              >
                <Ionicons name="mail" size={16} color={theme.accentText} />
                <Text style={styles.outreachButtonText}>Send outreach to parent</Text>
              </Pressable>
            )}
          </View>

          {isAthlete && (
            <View style={styles.statsBar}>
              <Stat label="Profile Views" value={stats?.profileViews ?? 0} />
              <View style={styles.statDivider} />
              <Stat label="Drafts" value={stats?.likesReceived ?? 0} />
              <View style={styles.statDivider} />
              <Stat label="Matches" value={stats?.totalMatches ?? 0} />
            </View>
          )}

          {(isAthlete || isRecruiter || role === 'parent') && (
            <View style={styles.infoSection}>
              <Text style={styles.sectionTitle}>About</Text>
              {isAthlete && (
                <>
                  {sub.sport && (
                    <InfoRow icon="football" text={`${sub.sport}${sub.position ? ` · ${sub.position}` : ''}`} />
                  )}
                  {sub.level && <InfoRow icon="school" text={sub.level} />}
                  {sub.team && <InfoRow icon="shirt" text={sub.team} />}
                  {sub.agency && <InfoRow icon="briefcase" text={sub.agency} />}
                  {(sub.height || sub.weight) && (
                    <InfoRow
                      icon="body"
                      text={[sub.height, sub.weight].filter(Boolean).join(' · ')}
                    />
                  )}
                  {sub.gpa != null && (
                    <InfoRow icon="star" text={`GPA: ${Number(sub.gpa).toFixed(1)}`} />
                  )}
                  {sub.forty_yard_dash && (
                    <InfoRow icon="timer" text={`40-yard dash: ${sub.forty_yard_dash}`} />
                  )}
                </>
              )}
              {isRecruiter && (
                <>
                  {sub.organization && <InfoRow icon="briefcase" text={sub.organization} />}
                  {sub.role_type === 'coach' && sub.team && (
                    <InfoRow icon="shirt" text={sub.team} />
                  )}
                  {sub.sport && <InfoRow icon="football" text={sub.sport} />}
                  {sub.role_type && (
                    <InfoRow
                      icon={sub.role_type === 'agent' ? 'business' : 'clipboard'}
                      text={sub.role_type === 'agent' ? 'Agent' : 'Coach'}
                    />
                  )}
                  {Array.isArray(sub.tags) && sub.tags.length > 0 && (
                    <View style={styles.tagsRow}>
                      {sub.tags.map((tag: string) => (
                        <View key={tag} style={styles.tag}>
                          <Text style={styles.tagText}>{tag}</Text>
                        </View>
                      ))}
                    </View>
                  )}
                </>
              )}
              {role === 'parent' && sub.relationship && (
                <InfoRow icon="people" text={`${sub.relationship}${sub.child_class_year ? ` · Child class of ${sub.child_class_year}` : ''}`} />
              )}
              {displayLocation && <InfoRow icon="location" text={displayLocation} />}
              {sub.bio && <Text style={styles.bio}>{sub.bio}</Text>}
            </View>
          )}

          {isAthlete && Array.isArray(sub.awards) && sub.awards.length > 0 && (
            <View style={styles.infoSection}>
              <Text style={styles.sectionTitle}>Awards & Achievements</Text>
              {sub.awards.map((award: string) => (
                <View key={award} style={styles.awardRow}>
                  <Ionicons name="trophy" size={16} color="#F5A623" />
                  <Text style={styles.awardText}>{award}</Text>
                </View>
              ))}
            </View>
          )}

          {photos.length > 0 && (
            <View style={styles.infoSection}>
              <Text style={styles.sectionTitle}>Photos</Text>
              <View style={styles.photoGrid}>
                {photos.map((url, i) => (
                  <View key={i} style={styles.photoItem}>
                    <Image source={{ uri: url }} style={styles.photoImage} resizeMode="cover" />
                  </View>
                ))}
              </View>
            </View>
          )}

          {videos.length > 0 && (
            <View style={styles.infoSection}>
              <Text style={styles.sectionTitle}>Videos</Text>
              <View style={styles.videoSection}>
                {videos.map((url, i) => (
                  <Pressable
                    key={i}
                    style={styles.videoItem}
                    onPress={() =>
                      router.push({
                        pathname: '/video',
                        params: { url, title: `Highlight Reel ${i + 1}` },
                      })
                    }
                  >
                    <View style={styles.videoPlaceholder}>
                      <Ionicons name="play-circle" size={48} color={brand.white} />
                      <Text style={styles.videoLabel}>Highlight Reel {i + 1}</Text>
                    </View>
                  </Pressable>
                ))}
              </View>
            </View>
          )}
        </ScrollView>
      ) : null}

      <Modal
        visible={outreachOpen}
        animationType="slide"
        transparent
        onRequestClose={() => {
          if (outreachSending) return;
          setOutreachOpen(false);
        }}
      >
        <KeyboardAvoidingView
          style={styles.outreachBackdrop}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => {
              if (!outreachSending) setOutreachOpen(false);
            }}
            accessibilityLabel="Close outreach"
          />
          <View style={styles.outreachSheet}>
            <View style={styles.outreachHandle} />
            <Text style={styles.outreachTitle}>
              Send outreach
            </Text>
            <Text style={styles.outreachSubtitle}>
              Your message goes to {profile?.name ?? "this athlete"}'s parent — they decide whether to respond.
            </Text>
            <TextInput
              style={styles.outreachInput}
              value={outreachMessage}
              onChangeText={setOutreachMessage}
              placeholder="Hi, I'd like to invite your athlete to our program…"
              placeholderTextColor={theme.textMuted}
              multiline
              maxLength={800}
              editable={!outreachSending}
              autoFocus
            />
            <Text style={styles.outreachCount}>{outreachMessage.length}/800</Text>
            <View style={styles.outreachActions}>
              <Pressable
                style={({ pressed }) => [styles.outreachCancel, pressed && styles.outreachPressed]}
                onPress={() => setOutreachOpen(false)}
                disabled={outreachSending}
              >
                <Text style={styles.outreachCancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [
                  styles.outreachSend,
                  (outreachSending || outreachMessage.trim().length === 0) && styles.outreachSendDisabled,
                  pressed && styles.outreachPressed,
                ]}
                onPress={handleSendOutreach}
                disabled={outreachSending || outreachMessage.trim().length === 0}
              >
                {outreachSending ? (
                  <ActivityIndicator size="small" color={theme.accentText} />
                ) : (
                  <Text style={styles.outreachSendText}>Send</Text>
                )}
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.statItem}>
      <Text style={styles.statValue}>{value.toLocaleString()}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function InfoRow({ icon, text }: { icon: keyof typeof Ionicons.glyphMap; text: string }) {
  return (
    <View style={styles.infoRow}>
      <Ionicons name={icon} size={18} color={theme.textMuted} />
      <Text style={styles.infoText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 14,
    backgroundColor: theme.headerBg,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  headerButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    fontSize: 17,
    fontFamily: 'Poppins_600SemiBold',
    color: theme.text,
    textAlign: 'center',
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    gap: 12,
  },
  errorText: {
    fontSize: 14,
    fontFamily: 'Poppins_400Regular',
    color: theme.textSecondary,
    textAlign: 'center',
  },
  retryButton: {
    marginTop: 12,
    paddingHorizontal: 22,
    paddingVertical: 12,
    backgroundColor: theme.accent,
    borderRadius: 22,
  },
  retryButtonText: {
    fontSize: 14,
    fontFamily: 'Poppins_600SemiBold',
    color: theme.accentText,
  },
  scroll: { flex: 1 },
  scrollContent: { padding: 20, gap: 16 },
  avatarSection: {
    backgroundColor: theme.cardBg,
    borderRadius: 16,
    overflow: 'hidden',
    alignItems: 'center',
    paddingBottom: 24,
  },
  banner: { width: '100%', height: BANNER_HEIGHT },
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
  avatarImage: { width: '100%', height: '100%' },
  verifiedBadge: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: semantic.success,
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
  matchedBadge: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 6,
    backgroundColor: brand.primary,
    borderRadius: 20,
  },
  matchedText: {
    fontSize: 13,
    fontFamily: 'Poppins_500Medium',
    color: brand.white,
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
  rankChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 10,
    marginHorizontal: 16,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 18,
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: semantic.warning,
  },
  rankChipPressed: { opacity: 0.7 },
  rankChipHash: {
    fontSize: 13,
    fontFamily: 'Poppins_700Bold',
    color: semantic.warning,
  },
  rankChipMeta: {
    flexShrink: 1,
    fontSize: 12,
    fontFamily: 'Poppins_500Medium',
    color: theme.text,
  },
  rankChipDot: {
    fontSize: 12,
    color: theme.textMuted,
  },
  rankChipStars: {
    flexDirection: 'row',
    gap: 1,
  },
  rankChipScore: {
    fontSize: 11,
    fontFamily: 'Poppins_600SemiBold',
    color: theme.textSecondary,
    letterSpacing: 0.3,
  },
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
  infoSection: {
    backgroundColor: theme.cardBg,
    borderRadius: 16,
    padding: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontFamily: 'Poppins_600SemiBold',
    color: theme.text,
    marginBottom: 12,
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
  tagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 6,
  },
  tag: {
    backgroundColor: theme.surface,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  tagText: {
    fontSize: 12,
    fontFamily: 'Poppins_500Medium',
    color: theme.textSecondary,
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
  photoImage: { width: '100%', height: '100%' },
  videoSection: { gap: 12 },
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
  outreachButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
    marginHorizontal: 16,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 22,
    backgroundColor: theme.accent,
  },
  outreachButtonPressed: { opacity: 0.85 },
  outreachButtonText: {
    fontSize: 14,
    fontFamily: 'Poppins_600SemiBold',
    color: theme.accentText,
  },
  outreachBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
  },
  outreachSheet: {
    backgroundColor: theme.cardBg,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 28,
    gap: 12,
  },
  outreachHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: theme.border,
    alignSelf: 'center',
    marginBottom: 4,
  },
  outreachTitle: {
    fontSize: 18,
    fontFamily: 'Poppins_700Bold',
    color: theme.text,
  },
  outreachSubtitle: {
    fontSize: 13,
    fontFamily: 'Poppins_400Regular',
    color: theme.textSecondary,
    lineHeight: 19,
  },
  outreachInput: {
    minHeight: 120,
    maxHeight: 220,
    backgroundColor: theme.surface,
    borderRadius: 14,
    padding: 14,
    fontSize: 14,
    fontFamily: 'Poppins_400Regular',
    color: theme.text,
    textAlignVertical: 'top',
  },
  outreachCount: {
    fontSize: 11,
    fontFamily: 'Poppins_400Regular',
    color: theme.textMuted,
    textAlign: 'right',
  },
  outreachActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 4,
  },
  outreachCancel: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 22,
    backgroundColor: theme.surface,
    alignItems: 'center',
  },
  outreachCancelText: {
    fontSize: 14,
    fontFamily: 'Poppins_600SemiBold',
    color: theme.text,
  },
  outreachSend: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 22,
    backgroundColor: theme.accent,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 46,
  },
  outreachSendDisabled: { opacity: 0.5 },
  outreachSendText: {
    fontSize: 14,
    fontFamily: 'Poppins_600SemiBold',
    color: theme.accentText,
  },
  outreachPressed: { opacity: 0.8 },
});
