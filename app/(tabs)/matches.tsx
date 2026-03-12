import React, { useMemo } from 'react';
import { View, StyleSheet, Text, ScrollView, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useSelector } from 'react-redux';
import { useRouter } from 'expo-router';
import {
  useFonts,
  Poppins_500Medium,
  Poppins_400Regular,
  Poppins_600SemiBold,
  Poppins_700Bold,
} from '@expo-google-fonts/poppins';
import { brand, neutral, semantic, theme } from '@/config/colors';
import { RootState } from '@/store';
import { mockParentRecruiterOutreach } from '@/constants/parentData';
import { mockAthleteMatches, AthleteMatch } from '@/constants/discoverData';

export default function MatchesScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const user = useSelector((state: RootState) => state.auth.user);
  const [fontsLoaded] = useFonts({
    Poppins_500Medium,
    Poppins_400Regular,
    Poppins_600SemiBold,
    Poppins_700Bold,
  });

  const isParent = user?.role === 'parent';
  const isAthlete = user?.role === 'athlete';

  const parentMessages = useMemo(
    () => (isParent && user?.email ? mockParentRecruiterOutreach[user.email] ?? [] : []),
    [isParent, user?.email]
  );

  const athleteMatches = useMemo(
    () => (isAthlete && user?.email ? mockAthleteMatches[user.email] ?? [] : []),
    [isAthlete, user?.email]
  );

  const totalUnread = useMemo(
    () => athleteMatches.reduce((sum, m) => sum + m.unreadCount, 0),
    [athleteMatches]
  );

  if (!fontsLoaded) return null;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={styles.title}>{isParent ? 'Recruiter Outreach' : 'Draft Board'}</Text>
        {isAthlete && totalUnread > 0 && (
          <View style={styles.headerBadge}>
            <Text style={styles.headerBadgeText}>{totalUnread} new</Text>
          </View>
        )}
      </View>

      {isParent ? (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 24 }]}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.parentHero}>
            <Ionicons name="mail-open-outline" size={22} color={brand.white} />
            <View style={styles.heroTextWrap}>
              <Text style={styles.parentHeroTitle}>Messages for Your Child Athlete</Text>
              <Text style={styles.parentHeroSubtitle}>
                Verified recruiters reaching out to discuss opportunities.
              </Text>
            </View>
          </View>

          {parentMessages.length === 0 ? (
            <View style={styles.content}>
              <Ionicons name="mail-outline" size={64} color={theme.textMuted} />
              <Text style={styles.emptyTitle}>No recruiter messages yet</Text>
              <Text style={styles.emptySubtitle}>
                New outreach from agents and coaches will appear here.
              </Text>
            </View>
          ) : (
            <View style={styles.list}>
              {parentMessages.map((message) => (
                <Pressable
                  key={message.id}
                  style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
                  onPress={() =>
                    router.push({
                      pathname: '/chat/[threadId]',
                      params: { threadId: message.id },
                    })
                  }
                >
                  <View style={styles.cardTopRow}>
                    <View style={styles.senderWrap}>
                      <Text style={styles.senderName}>
                        {message.recruiterName} • {message.recruiterRole}
                      </Text>
                      {message.verified && (
                        <Ionicons name="checkmark-circle" size={16} color={semantic.success} />
                      )}
                    </View>
                    <Text style={styles.sentAt}>{message.sentAt}</Text>
                  </View>

                  <Text style={styles.organization}>{message.organization}</Text>
                  <Text style={styles.childLine}>Regarding: {message.childName}</Text>
                  <Text style={styles.messagePreview} numberOfLines={3}>
                    {message.message}
                  </Text>

                  <View style={styles.cardBottomRow}>
                    <View
                      style={[
                        styles.statusPill,
                        message.status === 'New'
                          ? styles.statusPillNew
                          : message.status === 'In Review'
                            ? styles.statusPillReview
                            : styles.statusPillResponded,
                      ]}
                    >
                      <Text style={styles.statusText}>{message.status}</Text>
                    </View>
                    {message.unreadCount > 0 ? (
                      <View style={styles.unreadBadge}>
                        <Text style={styles.unreadText}>{message.unreadCount}</Text>
                      </View>
                    ) : null}
                  </View>
                </Pressable>
              ))}
            </View>
          )}
        </ScrollView>
      ) : isAthlete ? (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 24 }]}
          showsVerticalScrollIndicator={false}
        >
          {athleteMatches.length === 0 ? (
            <View style={styles.content}>
              <Ionicons name="clipboard-outline" size={64} color={theme.textMuted} />
              <Text style={styles.emptyTitle}>No drafts yet</Text>
              <Text style={styles.emptySubtitle}>
                Start discovering to build your draft board
              </Text>
              <Pressable
                style={styles.discoverButton}
                onPress={() => router.replace('/(tabs)')}
              >
                <Ionicons name="compass-outline" size={18} color={theme.accentText} />
                <Text style={styles.discoverButtonText}>Go to Discover</Text>
              </Pressable>
            </View>
          ) : (
            <>
              <View style={styles.athleteHero}>
                <Ionicons name="trophy" size={22} color={brand.white} />
                <View style={styles.heroTextWrap}>
                  <Text style={styles.parentHeroTitle}>Your Draft Board</Text>
                  <Text style={styles.parentHeroSubtitle}>
                    {athleteMatches.length} recruiter{athleteMatches.length !== 1 ? 's' : ''} drafted by you
                  </Text>
                </View>
              </View>
              <View style={styles.list}>
                {athleteMatches.map((match: AthleteMatch) => (
                  <Pressable
                    key={match.id}
                    style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
                    onPress={() =>
                      router.push({
                        pathname: '/chat/[threadId]',
                        params: { threadId: match.id },
                      })
                    }
                  >
                    <View style={styles.cardTopRow}>
                      <View style={styles.senderWrap}>
                        <Text style={styles.senderName}>
                          {match.recruiterName}
                        </Text>
                        {match.verified && (
                          <Ionicons name="checkmark-circle" size={16} color={semantic.success} />
                        )}
                      </View>
                      <Text style={styles.sentAt}>{match.matchedAt}</Text>
                    </View>

                    <Text style={styles.matchRoleRow}>
                      {match.recruiterRole === 'agent' ? 'Agent' : 'Coach'} · {match.organization}
                    </Text>

                    <View style={styles.matchLocationRow}>
                      <Ionicons name="location-outline" size={13} color={theme.textMuted} />
                      <Text style={styles.matchLocationText}>{match.location}</Text>
                    </View>

                    {match.lastMessage && (
                      <Text style={styles.messagePreview} numberOfLines={2}>
                        {match.lastMessage}
                      </Text>
                    )}

                    <View style={styles.cardBottomRow}>
                      <Pressable
                        style={styles.messageButton}
                        onPress={() =>
                          router.push({
                            pathname: '/chat/[threadId]',
                            params: { threadId: match.id },
                          })
                        }
                      >
                        <Ionicons name="chatbubble-outline" size={14} color={brand.white} />
                        <Text style={styles.messageButtonText}>Message</Text>
                      </Pressable>
                      {match.unreadCount > 0 ? (
                        <View style={styles.unreadBadge}>
                          <Text style={styles.unreadText}>{match.unreadCount}</Text>
                        </View>
                      ) : null}
                    </View>
                  </Pressable>
                ))}
              </View>
            </>
          )}
        </ScrollView>
      ) : (
        <View style={styles.content}>
          <Ionicons name="clipboard-outline" size={64} color={theme.textMuted} />
          <Text style={styles.emptyTitle}>No drafts yet</Text>
          <Text style={styles.emptySubtitle}>
            Start discovering to build your draft board
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.bg,
  },
  header: {
    paddingHorizontal: 24,
    paddingVertical: 16,
    backgroundColor: theme.headerBg,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  title: {
    fontSize: 24,
    fontFamily: 'Poppins_600SemiBold',
    color: theme.text,
  },
  headerBadge: {
    backgroundColor: semantic.error,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  headerBadgeText: {
    fontSize: 12,
    fontFamily: 'Poppins_600SemiBold',
    color: brand.white,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    gap: 14,
  },
  athleteHero: {
    borderRadius: 16,
    backgroundColor: brand.primary,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  parentHero: {
    borderRadius: 16,
    backgroundColor: brand.primary,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  heroTextWrap: {
    flex: 1,
  },
  parentHeroTitle: {
    fontSize: 15,
    fontFamily: 'Poppins_600SemiBold',
    color: brand.white,
  },
  parentHeroSubtitle: {
    marginTop: 2,
    fontSize: 12,
    lineHeight: 18,
    fontFamily: 'Poppins_400Regular',
    color: 'rgba(255,255,255,0.9)',
  },
  list: {
    gap: 10,
  },
  card: {
    borderRadius: 14,
    backgroundColor: theme.cardBg,
    borderWidth: 1,
    borderColor: theme.cardBorder,
    padding: 14,
    gap: 8,
  },
  cardPressed: {
    opacity: 0.9,
  },
  cardTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  senderWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 1,
  },
  senderName: {
    fontSize: 15,
    fontFamily: 'Poppins_600SemiBold',
    color: theme.text,
  },
  sentAt: {
    fontSize: 12,
    fontFamily: 'Poppins_500Medium',
    color: theme.textMuted,
  },
  organization: {
    fontSize: 13,
    fontFamily: 'Poppins_500Medium',
    color: theme.textSecondary,
  },
  matchRoleRow: {
    fontSize: 13,
    fontFamily: 'Poppins_500Medium',
    color: theme.textSecondary,
  },
  matchLocationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  matchLocationText: {
    fontSize: 12,
    fontFamily: 'Poppins_400Regular',
    color: theme.textSecondary,
  },
  childLine: {
    fontSize: 12,
    fontFamily: 'Poppins_500Medium',
    color: theme.textSecondary,
  },
  messagePreview: {
    fontSize: 13,
    lineHeight: 20,
    fontFamily: 'Poppins_400Regular',
    color: theme.textSecondary,
  },
  cardBottomRow: {
    marginTop: 4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  messageButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: brand.primary,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 16,
  },
  messageButtonText: {
    fontSize: 13,
    fontFamily: 'Poppins_600SemiBold',
    color: brand.white,
  },
  statusPill: {
    paddingHorizontal: 10,
    height: 26,
    borderRadius: 13,
    justifyContent: 'center',
  },
  statusPillNew: {
    backgroundColor: 'rgba(231, 76, 60, 0.2)',
  },
  statusPillReview: {
    backgroundColor: 'rgba(253, 203, 110, 0.2)',
  },
  statusPillResponded: {
    backgroundColor: 'rgba(0, 184, 148, 0.2)',
  },
  statusText: {
    fontSize: 11,
    fontFamily: 'Poppins_600SemiBold',
    color: theme.text,
  },
  unreadBadge: {
    minWidth: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: semantic.error,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 6,
  },
  unreadText: {
    fontSize: 11,
    fontFamily: 'Poppins_600SemiBold',
    color: brand.white,
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
  },
  emptyTitle: {
    fontSize: 20,
    fontFamily: 'Poppins_600SemiBold',
    color: theme.text,
    marginTop: 16,
  },
  emptySubtitle: {
    fontSize: 14,
    fontFamily: 'Poppins_400Regular',
    color: theme.textSecondary,
    marginTop: 8,
    textAlign: 'center',
  },
  discoverButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 20,
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: theme.accent,
    borderRadius: 24,
  },
  discoverButtonText: {
    fontSize: 15,
    fontFamily: 'Poppins_600SemiBold',
    color: theme.accentText,
  },
});
