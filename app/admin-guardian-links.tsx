import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  ActivityIndicator,
  Alert,
  Image,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { VideoView, useVideoPlayer } from 'expo-video';
import {
  useFonts,
  Poppins_400Regular,
  Poppins_500Medium,
  Poppins_600SemiBold,
  Poppins_700Bold,
} from '@expo-google-fonts/poppins';
import { brand, semantic, theme } from '@/config/colors';
import {
  guardianLinksService,
  GuardianLink,
  GuardianLinkStatus,
} from '@/services/guardianLinks';

type LinkWithVideo = GuardianLink & { video_url?: string };

const STATUS_TABS: { id: GuardianLinkStatus | 'all'; label: string }[] = [
  { id: 'pending_admin', label: 'In review' },
  { id: 'approved', label: 'Approved' },
  { id: 'declined', label: 'Declined' },
  { id: 'all', label: 'All' },
];

function relationshipLabel(r: string): string {
  return ({
    parent: 'Parent',
    legal_guardian: 'Legal guardian',
    step_parent: 'Step-parent',
    sibling: 'Sibling',
    aunt_uncle: 'Aunt / Uncle',
    grandparent: 'Grandparent',
    other: 'Other',
  } as Record<string, string>)[r] ?? r;
}

/**
 * Alert.prompt is iOS-only. On Android, fall back to a plain confirm
 * dialog without the optional-notes input.
 */
function promptDecision(
  title: string,
  confirmLabel: string,
  destructive: boolean,
  onConfirm: (notes?: string) => void,
) {
  if (Platform.OS === 'ios' && typeof Alert.prompt === 'function') {
    Alert.prompt(
      title,
      'Optional notes (visible to admin only).',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: confirmLabel,
          style: destructive ? 'destructive' : 'default',
          onPress: (notes?: string) => onConfirm(notes || undefined),
        },
      ],
      'plain-text',
      '',
    );
    return;
  }
  Alert.alert(title, undefined, [
    { text: 'Cancel', style: 'cancel' },
    {
      text: confirmLabel,
      style: destructive ? 'destructive' : 'default',
      onPress: () => onConfirm(undefined),
    },
  ]);
}

export default function AdminGuardianLinksScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [fontsLoaded] = useFonts({
    Poppins_400Regular,
    Poppins_500Medium,
    Poppins_600SemiBold,
    Poppins_700Bold,
  });

  const [tab, setTab] = useState<GuardianLinkStatus | 'all'>('pending_admin');
  const [links, setLinks] = useState<LinkWithVideo[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const refresh = useCallback(async (status: GuardianLinkStatus | 'all') => {
    setLoading(true);
    try {
      const list = await guardianLinksService.adminList(status === 'all' ? undefined : status);
      setLinks(list);
    } catch (err: any) {
      const msg = err?.response?.data?.message ?? err?.message ?? 'Could not load review queue.';
      Alert.alert('Could not load', String(msg));
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { refresh(tab); }, [refresh, tab]));

  const decide = useCallback(async (link: LinkWithVideo, decision: 'approved' | 'declined') => {
    if (busyId) return;
    promptDecision(
      decision === 'approved' ? 'Approve link?' : 'Decline link?',
      decision === 'approved' ? 'Approve' : 'Decline',
      decision === 'declined',
      async (notes?: string) => {
        setBusyId(link.id);
        try {
          if (decision === 'approved') {
            await guardianLinksService.adminApprove(link.id, notes);
          } else {
            await guardianLinksService.adminDecline(link.id, notes);
          }
          await refresh(tab);
        } catch (err: any) {
          const msg = err?.response?.data?.message ?? err?.message ?? 'Action failed.';
          Alert.alert('Could not save', String(msg));
        } finally {
          setBusyId(null);
        }
      },
    );
  }, [busyId, refresh, tab]);

  if (!fontsLoaded) return null;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable style={styles.headerButton} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={22} color={theme.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Guardian reviews</Text>
        <View style={styles.headerButton} />
      </View>

      <View style={styles.tabs}>
        {STATUS_TABS.map((t) => (
          <Pressable
            key={t.id}
            style={[styles.tab, tab === t.id && styles.tabActive]}
            onPress={() => setTab(t.id)}
          >
            <Text style={[styles.tabText, tab === t.id && styles.tabTextActive]}>{t.label}</Text>
          </Pressable>
        ))}
      </View>

      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={theme.text} />
        </View>
      ) : links.length === 0 ? (
        <View style={styles.emptyWrap}>
          <Ionicons name="checkmark-done" size={28} color={theme.textSecondary} />
          <Text style={styles.emptyText}>Nothing to review.</Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 24 }]}
          showsVerticalScrollIndicator={false}
        >
          {links.map((link) => (
            <ReviewCard
              key={link.id}
              link={link}
              onApprove={() => decide(link, 'approved')}
              onDecline={() => decide(link, 'declined')}
              busy={busyId === link.id}
            />
          ))}
        </ScrollView>
      )}
    </View>
  );
}

function ReviewCard(props: {
  link: LinkWithVideo;
  onApprove: () => void;
  onDecline: () => void;
  busy: boolean;
}) {
  const player = useVideoPlayer(props.link.video_url ?? null, (p) => {
    p.loop = false;
  });
  const q = (props.link as any).questionnaire ?? {};
  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <View style={styles.avatarPair}>
          <Avatar uri={props.link.guardian?.avatar_url} />
          <Ionicons name="link" size={16} color={theme.textSecondary} />
          <Avatar uri={props.link.athlete?.avatar_url} />
        </View>
        <View style={{ flex: 1, marginLeft: 8 }}>
          <Text style={styles.cardTitle}>
            {props.link.guardian?.name ?? 'Guardian'} → {props.link.athlete?.name ?? 'Athlete'}
          </Text>
          <Text style={styles.cardMeta}>
            {relationshipLabel(props.link.relationship)}
            {q.athleteFullName ? ` · claims: "${q.athleteFullName}"` : ''}
          </Text>
        </View>
      </View>

      {props.link.video_url ? (
        <View style={styles.videoBox}>
          <VideoView
            player={player}
            style={styles.video}
            allowsFullscreen
            allowsPictureInPicture
            nativeControls
          />
        </View>
      ) : (
        <View style={styles.noVideo}>
          <Text style={styles.noVideoText}>No video uploaded yet.</Text>
        </View>
      )}

      <View style={styles.qBox}>
        <QRow label="Lives with athlete" value={q.livesWithAthlete} />
        <QRow label="Athlete name (claimed)" value={q.athleteFullName} />
        <QRow label="Consent acknowledged" value={q.consentAcknowledged ? 'Yes' : 'No'} />
      </View>

      {/* Approve/Decline buttons are only valid while the link is still
          pending review — once decided, the backend now rejects further
          updates (409 ConflictException). The new (tabs)/reviews screen
          already gates on isPending; mirror the same rule here so a
          decided card no longer renders dead buttons. */}
      {props.link.status === 'pending_admin' && (
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Pressable
            style={[styles.declineBtn, props.busy && { opacity: 0.6 }]}
            onPress={props.onDecline}
            disabled={props.busy}
          >
            <Text style={styles.declineBtnText}>Decline</Text>
          </Pressable>
          <Pressable
            style={[styles.approveBtn, props.busy && { opacity: 0.6 }]}
            onPress={props.onApprove}
            disabled={props.busy}
          >
            {props.busy ? (
              <ActivityIndicator color={brand.white} />
            ) : (
              <Text style={styles.approveBtnText}>Approve</Text>
            )}
          </Pressable>
        </View>
      )}
    </View>
  );
}

function Avatar({ uri }: { uri?: string | null }) {
  return (
    <View style={styles.avatar}>
      {uri ? (
        <Image source={{ uri }} style={styles.avatarImg} />
      ) : (
        <Ionicons name="person" size={18} color={theme.textSecondary} />
      )}
    </View>
  );
}

function QRow({ label, value }: { label: string; value?: string | null }) {
  return (
    <View style={styles.qRow}>
      <Text style={styles.qLabel}>{label}</Text>
      <Text style={styles.qValue}>{value || '—'}</Text>
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
  headerButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 18, fontFamily: 'Poppins_600SemiBold', color: theme.text },
  tabs: {
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  tab: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: theme.cardBg,
    borderWidth: 1,
    borderColor: theme.cardBorder,
  },
  tabActive: { backgroundColor: theme.accent, borderColor: theme.accent },
  tabText: { fontSize: 12, fontFamily: 'Poppins_600SemiBold', color: theme.text },
  tabTextActive: { color: theme.accentText },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 6 },
  emptyText: { fontSize: 14, fontFamily: 'Poppins_500Medium', color: theme.textSecondary },
  scrollContent: { padding: 14, gap: 14 },
  card: {
    backgroundColor: theme.cardBg,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: theme.cardBorder,
    gap: 10,
  },
  row: { flexDirection: 'row', alignItems: 'center' },
  avatarPair: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  avatar: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: theme.surface,
    alignItems: 'center', justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImg: { width: 36, height: 36 },
  cardTitle: { fontSize: 14, fontFamily: 'Poppins_700Bold', color: theme.text },
  cardMeta: { fontSize: 11, fontFamily: 'Poppins_400Regular', color: theme.textSecondary, marginTop: 2 },
  videoBox: {
    aspectRatio: 9 / 16,
    maxHeight: 340,
    backgroundColor: '#000',
    borderRadius: 12,
    overflow: 'hidden',
    alignSelf: 'stretch',
  },
  video: { width: '100%', height: '100%' },
  noVideo: {
    backgroundColor: theme.surface,
    padding: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  noVideoText: { color: theme.textSecondary, fontFamily: 'Poppins_500Medium', fontSize: 12 },
  qBox: { backgroundColor: theme.surface, borderRadius: 10, padding: 10, gap: 4 },
  qRow: { flexDirection: 'row', justifyContent: 'space-between' },
  qLabel: { fontSize: 11, fontFamily: 'Poppins_500Medium', color: theme.textSecondary },
  qValue: { fontSize: 11, fontFamily: 'Poppins_600SemiBold', color: theme.text, maxWidth: '60%', textAlign: 'right' },
  declineBtn: {
    flex: 1, height: 44, borderRadius: 22,
    borderWidth: 1, borderColor: '#E54B4B',
    backgroundColor: 'rgba(229,75,75,0.1)',
    alignItems: 'center', justifyContent: 'center',
  },
  declineBtnText: { color: '#E54B4B', fontFamily: 'Poppins_600SemiBold', fontSize: 13 },
  approveBtn: {
    flex: 1.4, height: 44, borderRadius: 22,
    backgroundColor: semantic.success,
    alignItems: 'center', justifyContent: 'center',
  },
  approveBtnText: { color: brand.white, fontFamily: 'Poppins_700Bold', fontSize: 13 },
});
