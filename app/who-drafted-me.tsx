import React, { useCallback, useState } from 'react';
import {
  View,
  StyleSheet,
  Text,
  Pressable,
  ScrollView,
  Image,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  useFonts,
  Poppins_400Regular,
  Poppins_500Medium,
  Poppins_600SemiBold,
  Poppins_700Bold,
} from '@expo-google-fonts/poppins';
import { brand, semantic, theme } from '@/config/colors';
import { discoverService } from '@/services/discover';

interface Drafter {
  id: string;
  name?: string;
  avatar_url?: string | null;
  role?: string;
  location?: string | null;
}

interface DraftRow {
  swiped_id: string;
  created_at: string;
  swiper: Drafter | null;
}

function timeAgo(iso: string): string {
  const t = new Date(iso).getTime();
  if (isNaN(t)) return '';
  const diff = Math.max(0, Date.now() - t);
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks}w ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function roleLabel(role?: string): string {
  if (role === 'recruiter') return 'Agent';
  if (role === 'coach') return 'Coach';
  if (role === 'athlete') return 'Athlete';
  if (role === 'parent') return 'Parent';
  return '';
}

export default function WhoDraftedMeScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [fontsLoaded] = useFonts({
    Poppins_400Regular,
    Poppins_500Medium,
    Poppins_600SemiBold,
    Poppins_700Bold,
  });

  const [rows, setRows] = useState<DraftRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [locked, setLocked] = useState(false); // 403 → paywall

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      setLoading(true);
      discoverService.whoDraftedMe()
        .then((data) => {
          if (cancelled) return;
          setRows(Array.isArray(data) ? (data as DraftRow[]) : []);
          setLocked(false);
        })
        .catch((err: any) => {
          if (cancelled) return;
          if (err?.response?.status === 403) {
            setLocked(true);
            setRows(null);
          } else {
            // Network or 500 — show empty state rather than error to keep UX calm
            setRows([]);
            setLocked(false);
          }
        })
        .finally(() => { if (!cancelled) setLoading(false); });
      return () => { cancelled = true; };
    }, []),
  );

  if (!fontsLoaded) return null;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable style={styles.headerButton} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={22} color={theme.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Who Drafted You</Text>
        <View style={styles.headerButton} />
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={theme.text} />
        </View>
      ) : locked ? (
        <View style={styles.paywall}>
          <View style={styles.paywallIcon}>
            <Ionicons name="lock-closed" size={32} color={brand.white} />
          </View>
          <Text style={styles.paywallTitle}>See who drafted you</Text>
          <Text style={styles.paywallBody}>
            Upgrade to Pro or Premium to see every coach, recruiter, and parent
            who’s shown interest in your profile.
          </Text>
          <View style={styles.benefitsList}>
            <Benefit text="See every right-swipe instantly" />
            <Benefit text="Know who’s scouting you in real time" />
            <Benefit text="Skip the wait — match faster" />
          </View>
          <Pressable
            style={styles.upgradeButton}
            onPress={() => router.push('/subscription')}
          >
            <Text style={styles.upgradeButtonText}>Upgrade plan</Text>
            <Ionicons name="arrow-forward" size={16} color={theme.accentText} />
          </Pressable>
        </View>
      ) : !rows || rows.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="trophy-outline" size={48} color={theme.textMuted} />
          <Text style={styles.emptyTitle}>No drafts yet</Text>
          <Text style={styles.emptyBody}>
            Once someone drafts you, they’ll appear here. Keep your profile
            fresh — photos and a strong bio help.
          </Text>
          <Pressable style={styles.emptyAction} onPress={() => router.replace('/(tabs)/profile')}>
            <Text style={styles.emptyActionText}>Edit my profile</Text>
          </Pressable>
        </View>
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 24 }]}
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.sectionLabel}>
            {rows.length} {rows.length === 1 ? 'person has' : 'people have'} drafted you
          </Text>
          {rows.map((row) => {
            const drafter = row.swiper;
            if (!drafter) return null;
            return (
              <View key={`${drafter.id}-${row.created_at}`} style={styles.row}>
                <View style={styles.avatar}>
                  {drafter.avatar_url ? (
                    <Image
                      source={{ uri: drafter.avatar_url }}
                      style={styles.avatarImage}
                      resizeMode="cover"
                    />
                  ) : (
                    <Ionicons name="person" size={22} color={theme.textMuted} />
                  )}
                </View>
                <View style={styles.rowBody}>
                  <Text style={styles.name} numberOfLines={1}>
                    {drafter.name ?? 'Anonymous'}
                  </Text>
                  <Text style={styles.meta} numberOfLines={1}>
                    {[roleLabel(drafter.role), drafter.location].filter(Boolean).join(' · ')}
                  </Text>
                </View>
                <Text style={styles.time}>{timeAgo(row.created_at)}</Text>
              </View>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}

function Benefit({ text }: { text: string }) {
  return (
    <View style={styles.benefitRow}>
      <Ionicons name="checkmark-circle" size={18} color={semantic.success} />
      <Text style={styles.benefitText}>{text}</Text>
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
    fontSize: 18,
    fontFamily: 'Poppins_600SemiBold',
    color: theme.text,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  scroll: { flex: 1 },
  scrollContent: { padding: 16, gap: 10 },
  sectionLabel: {
    fontSize: 13,
    fontFamily: 'Poppins_500Medium',
    color: theme.textSecondary,
    marginBottom: 4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.cardBg,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
    gap: 12,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: theme.surface,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImage: { width: '100%', height: '100%' },
  rowBody: { flex: 1, gap: 2 },
  name: {
    fontSize: 15,
    fontFamily: 'Poppins_600SemiBold',
    color: theme.text,
  },
  meta: {
    fontSize: 12,
    fontFamily: 'Poppins_400Regular',
    color: theme.textSecondary,
  },
  time: {
    fontSize: 12,
    fontFamily: 'Poppins_500Medium',
    color: theme.textMuted,
  },
  emptyTitle: {
    fontSize: 18,
    fontFamily: 'Poppins_700Bold',
    color: theme.text,
    marginTop: 14,
  },
  emptyBody: {
    fontSize: 14,
    fontFamily: 'Poppins_400Regular',
    color: theme.textSecondary,
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 20,
  },
  emptyAction: {
    marginTop: 22,
    paddingHorizontal: 22,
    paddingVertical: 12,
    backgroundColor: theme.accent,
    borderRadius: 22,
  },
  emptyActionText: {
    fontSize: 14,
    fontFamily: 'Poppins_600SemiBold',
    color: theme.accentText,
  },
  paywall: {
    flex: 1,
    padding: 24,
    paddingTop: 32,
  },
  paywallIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: brand.primary,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
  },
  paywallTitle: {
    fontSize: 24,
    fontFamily: 'Poppins_700Bold',
    color: theme.text,
    textAlign: 'center',
    marginTop: 16,
  },
  paywallBody: {
    fontSize: 14,
    fontFamily: 'Poppins_400Regular',
    color: theme.textSecondary,
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 20,
  },
  benefitsList: {
    backgroundColor: theme.cardBg,
    borderRadius: 14,
    padding: 16,
    marginTop: 24,
    gap: 12,
  },
  benefitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  benefitText: {
    fontSize: 14,
    fontFamily: 'Poppins_500Medium',
    color: theme.text,
  },
  upgradeButton: {
    marginTop: 24,
    height: 50,
    borderRadius: 25,
    backgroundColor: theme.accent,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  upgradeButtonText: {
    fontSize: 16,
    fontFamily: 'Poppins_600SemiBold',
    color: theme.accentText,
  },
});
