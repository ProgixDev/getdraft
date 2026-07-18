import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  Alert,
  ScrollView,
  Image,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import QRCode from 'react-native-qrcode-svg';
import {
  useFonts,
  Poppins_400Regular,
  Poppins_500Medium,
  Poppins_600SemiBold,
  Poppins_700Bold,
} from '@expo-google-fonts/poppins';
import { brand, semantic, theme } from '@/config/colors';
import { guardianLinksService, GuardianLink } from '@/services/guardianLinks';

function formatDate(value?: string | null): string | null {
  if (!value) return null;
  const d = new Date(value);
  if (isNaN(d.getTime())) return null;
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

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

function statusBadge(status: string): { label: string; color: string } {
  switch (status) {
    case 'approved': return { label: 'Linked', color: semantic.success };
    case 'pending_admin': return { label: 'In review', color: '#E5A23B' };
    case 'pending_video': return { label: 'Awaiting video', color: '#74B9FF' };
    case 'declined': return { label: 'Declined', color: '#E54B4B' };
    case 'expired': return { label: 'Expired', color: theme.textSecondary };
    default: return { label: status, color: theme.textSecondary };
  }
}

export default function LinkGuardianScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [fontsLoaded] = useFonts({
    Poppins_400Regular,
    Poppins_500Medium,
    Poppins_600SemiBold,
    Poppins_700Bold,
  });

  const [token, setToken] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [issuing, setIssuing] = useState(false);
  const [links, setLinks] = useState<GuardianLink[]>([]);
  const [loading, setLoading] = useState(true);

  const issueToken = useCallback(async () => {
    setIssuing(true);
    try {
      const r = await guardianLinksService.issueQr();
      setToken(r.token);
      setExpiresAt(r.expiresAt);
    } catch (err: any) {
      const msg = err?.response?.data?.message ?? err?.message ?? 'Could not generate QR.';
      Alert.alert('Could not generate QR', String(msg));
    } finally {
      setIssuing(false);
    }
  }, []);

  const refreshLinks = useCallback(async () => {
    try {
      const list = await guardianLinksService.listForAthlete();
      setLinks(list);
    } catch {
      // Non-fatal — just keep current list.
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      setLoading(true);
      Promise.all([refreshLinks(), issueToken()])
        .finally(() => { if (!cancelled) setLoading(false); });
      return () => { cancelled = true; };
    }, [refreshLinks, issueToken]),
  );

  // Auto-refresh the QR ~30s before it expires so the on-screen one
  // always works without the athlete having to tap "Refresh".
  useEffect(() => {
    if (!expiresAt) return;
    const msLeft = new Date(expiresAt).getTime() - Date.now();
    if (msLeft <= 0) {
      issueToken();
      return;
    }
    const timer = setTimeout(issueToken, Math.max(msLeft - 30_000, 5_000));
    return () => clearTimeout(timer);
  }, [expiresAt, issueToken]);

  const handleRevoke = useCallback((link: GuardianLink) => {
    Alert.alert(
      'Revoke link?',
      `Remove ${link.guardian?.name ?? 'this guardian'} from your account?`,
      [
        { text: 'Keep', style: 'cancel' },
        {
          text: 'Revoke',
          style: 'destructive',
          onPress: async () => {
            try {
              await guardianLinksService.revoke(link.id);
              await refreshLinks();
            } catch (err: any) {
              const msg = err?.response?.data?.message ?? err?.message ?? 'Could not revoke.';
              Alert.alert('Could not revoke', String(msg));
            }
          },
        },
      ],
    );
  }, [refreshLinks]);

  if (!fontsLoaded) return null;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable style={styles.headerButton} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={22} color={theme.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Link a guardian</Text>
        <View style={styles.headerButton} />
      </View>

      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={theme.text} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 32 }]}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.qrCard}>
            <Text style={styles.qrTitle}>Show this to your guardian</Text>
            <Text style={styles.qrSubtitle}>
              Have them scan this code from the GetDraft app on their phone.
              The code refreshes every 10 minutes for security.
            </Text>
            <View style={styles.qrFrame}>
              {token ? (
                <QRCode
                  value={token}
                  size={220}
                  color={brand.primary}
                  backgroundColor="#FFFFFF"
                />
              ) : issuing ? (
                <ActivityIndicator size="large" color={brand.primary} />
              ) : (
                <Text style={styles.errorInline}>Tap Refresh to generate a code.</Text>
              )}
            </View>
            <View style={styles.qrActions}>
              <Pressable style={styles.actionButton} onPress={issueToken} disabled={issuing}>
                <Ionicons name="refresh" size={16} color={theme.text} />
                <Text style={styles.actionButtonText}>Refresh</Text>
              </Pressable>
            </View>
          </View>

          <Text style={styles.sectionHeading}>Linked guardians</Text>
          {links.length === 0 ? (
            <View style={styles.emptyCard}>
              <Ionicons name="people-outline" size={28} color={theme.textSecondary} />
              <Text style={styles.emptyText}>No guardians linked yet.</Text>
              <Text style={styles.emptySubtext}>
                When someone scans your code and is approved, they'll show up here.
              </Text>
            </View>
          ) : (
            links.map((link) => {
              const badge = statusBadge(link.status);
              return (
                <View key={link.id} style={styles.linkCard}>
                  <View style={styles.linkAvatar}>
                    {link.guardian?.avatar_url ? (
                      <Image
                        source={{ uri: link.guardian.avatar_url }}
                        style={styles.linkAvatarImg}
                      />
                    ) : (
                      <Ionicons name="person" size={20} color={theme.textSecondary} />
                    )}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.linkName}>{link.guardian?.name ?? 'Guardian'}</Text>
                    <Text style={styles.linkMeta}>
                      {relationshipLabel(link.relationship)}
                      {formatDate(link.created_at) ? ` · ${formatDate(link.created_at)}` : ''}
                    </Text>
                    <View style={[styles.statusPill, { borderColor: badge.color }]}>
                      <View style={[styles.statusDot, { backgroundColor: badge.color }]} />
                      <Text style={[styles.statusPillText, { color: badge.color }]}>{badge.label}</Text>
                    </View>
                  </View>
                  <Pressable
                    style={styles.iconAction}
                    onPress={() => handleRevoke(link)}
                  >
                    <Ionicons name="trash-outline" size={18} color="#E54B4B" />
                  </Pressable>
                </View>
              );
            })
          )}

          <View style={styles.helpBox}>
            <Ionicons name="information-circle-outline" size={16} color={theme.textSecondary} />
            <Text style={styles.helpText}>
              Only people you trust should scan this code. Approved guardians can
              act on your behalf in the app (messaging coaches, signing offers,
              etc.) until you revoke them here.
            </Text>
          </View>
        </ScrollView>
      )}
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
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scrollContent: { padding: 16, gap: 14 },
  qrCard: {
    backgroundColor: theme.cardBg,
    borderRadius: 18,
    padding: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: theme.cardBorder,
  },
  qrTitle: { fontSize: 16, fontFamily: 'Poppins_700Bold', color: theme.text, marginBottom: 4 },
  qrSubtitle: {
    fontSize: 12,
    fontFamily: 'Poppins_400Regular',
    color: theme.textSecondary,
    textAlign: 'center',
    paddingHorizontal: 6,
    marginBottom: 16,
  },
  qrFrame: {
    backgroundColor: '#FFFFFF',
    padding: 18,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 256,
    minHeight: 256,
  },
  qrActions: { flexDirection: 'row', gap: 10, marginTop: 14 },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: theme.border,
  },
  actionButtonText: { fontSize: 13, fontFamily: 'Poppins_600SemiBold', color: theme.text },
  errorInline: { color: theme.textSecondary, fontFamily: 'Poppins_500Medium' },
  sectionHeading: {
    fontSize: 16,
    fontFamily: 'Poppins_600SemiBold',
    color: theme.text,
    marginTop: 8,
  },
  emptyCard: {
    backgroundColor: theme.cardBg,
    borderRadius: 14,
    padding: 22,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: theme.cardBorder,
    gap: 6,
  },
  emptyText: { fontSize: 14, fontFamily: 'Poppins_600SemiBold', color: theme.text, marginTop: 6 },
  emptySubtext: { fontSize: 12, fontFamily: 'Poppins_400Regular', color: theme.textSecondary, textAlign: 'center' },
  linkCard: {
    backgroundColor: theme.cardBg,
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: theme.cardBorder,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  linkAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: theme.surface,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  linkAvatarImg: { width: 44, height: 44 },
  linkName: { fontSize: 14, fontFamily: 'Poppins_700Bold', color: theme.text },
  linkMeta: { fontSize: 11, fontFamily: 'Poppins_400Regular', color: theme.textSecondary, marginTop: 1 },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    borderWidth: 1,
    alignSelf: 'flex-start',
  },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusPillText: { fontSize: 10, fontFamily: 'Poppins_600SemiBold' },
  iconAction: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  helpBox: {
    flexDirection: 'row',
    gap: 8,
    backgroundColor: theme.surface,
    borderRadius: 12,
    padding: 12,
    marginTop: 4,
  },
  helpText: { flex: 1, fontSize: 11, fontFamily: 'Poppins_400Regular', color: theme.textSecondary, lineHeight: 16 },
});
