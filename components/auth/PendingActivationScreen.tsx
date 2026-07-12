import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import QRCode from "react-native-qrcode-svg";
import {
  useFonts,
  Poppins_400Regular,
  Poppins_500Medium,
  Poppins_600SemiBold,
  Poppins_700Bold,
} from "@expo-google-fonts/poppins";

import { brand, semantic, theme } from "@/config/colors";
import { guardianLinksService } from "@/services/guardianLinks";
import { usersService } from "@/services/users";

/**
 * Hard activation gate for under-18 athletes. Until a guardian validates
 * them (existing QR flow) AND an admin approves that link, the athlete sees
 * ONLY this screen — they cannot reach any feature of the app. Reuses the
 * same guardian-link QR backend as app/link-guardian.tsx.
 */

const STEPS: { icon: keyof typeof Ionicons.glyphMap; title: string; body: string }[] = [
  {
    icon: "qr-code-outline",
    title: "Show this QR to your father / guardian",
    body: "They open GetDraft on their own phone and scan the code below.",
  },
  {
    icon: "videocam-outline",
    title: "They complete the guardian link",
    body: "A short questionnaire + a quick declaration video confirms they're your guardian.",
  },
  {
    icon: "shield-checkmark-outline",
    title: "Our team validates your guardian",
    body: "An admin reviews and approves the request — usually quickly.",
  },
  {
    icon: "trophy-outline",
    title: "You're in — Game On!",
    body: "Once your guardian is approved, your account activates automatically.",
  },
];

const POLL_MS = 6000;

export function PendingActivationScreen({
  onActivated,
  onLogout,
}: {
  onActivated: () => void;
  onLogout: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [fontsLoaded] = useFonts({
    Poppins_400Regular,
    Poppins_500Medium,
    Poppins_600SemiBold,
    Poppins_700Bold,
  });

  const [token, setToken] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [issuing, setIssuing] = useState(false);
  const [checking, setChecking] = useState(false);
  const activatedRef = useRef(false);

  const issueToken = useCallback(async () => {
    setIssuing(true);
    try {
      const r = await guardianLinksService.issueQr();
      setToken(r.token);
      setExpiresAt(r.expiresAt);
    } catch (err: any) {
      const msg =
        err?.response?.data?.message ?? err?.message ?? "Could not generate QR.";
      Alert.alert("Could not generate QR", String(msg));
    } finally {
      setIssuing(false);
    }
  }, []);

  // Returns true when the account is now active (so callers can stop polling).
  const checkActivation = useCallback(async (): Promise<boolean> => {
    try {
      const me = await usersService.getMe();
      const status = me?.activation_status ?? "active";
      if (status === "active" && !activatedRef.current) {
        activatedRef.current = true;
        onActivated();
        return true;
      }
    } catch {
      // Network hiccup — keep polling.
    }
    return false;
  }, [onActivated]);

  const handleManualCheck = useCallback(async () => {
    setChecking(true);
    const active = await checkActivation();
    setChecking(false);
    if (!active) {
      Alert.alert(
        "Not approved yet",
        "Your guardian hasn't been approved yet. Hang tight — we'll let you in automatically once they are.",
      );
    }
  }, [checkActivation]);

  const handleShare = useCallback(async () => {
    if (!token) return;
    try {
      await Share.share({
        message: `Approve my GetDraft account — open GetDraft and scan this guardian code: ${token}`,
      });
    } catch {
      // Cancelled share isn't an error.
    }
  }, [token]);

  // Mint the first QR on mount.
  useEffect(() => {
    issueToken();
  }, [issueToken]);

  // Auto-refresh the QR ~30s before it expires (matches link-guardian.tsx).
  useEffect(() => {
    if (!expiresAt) return;
    const msLeft = new Date(expiresAt).getTime() - Date.now();
    if (msLeft <= 0) {
      issueToken();
      return;
    }
    const t = setTimeout(issueToken, Math.max(msLeft - 30_000, 5_000));
    return () => clearTimeout(t);
  }, [expiresAt, issueToken]);

  // Poll for activation so the kid is let in the moment the admin approves.
  useEffect(() => {
    const id = setInterval(checkActivation, POLL_MS);
    return () => clearInterval(id);
  }, [checkActivation]);

  if (!fontsLoaded) return null;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: insets.bottom + 28 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.lockBadge}>
          <Ionicons name="lock-closed" size={22} color={brand.white} />
        </View>
        <Text style={styles.title}>Almost on the field</Text>
        <Text style={styles.subtitle}>
          You’re under 18, so a parent or guardian has to approve your account
          before you can start. You can’t use any GetDraft features until your
          account is activated.
        </Text>

        <View style={styles.stepsCard}>
          {STEPS.map((s, i) => (
            <View key={s.title} style={styles.stepRow}>
              <View style={styles.stepIndex}>
                <Text style={styles.stepIndexText}>{i + 1}</Text>
              </View>
              <View style={styles.stepBody}>
                <Text style={styles.stepTitle}>{s.title}</Text>
                <Text style={styles.stepText}>{s.body}</Text>
              </View>
            </View>
          ))}
        </View>

        <View style={styles.qrCard}>
          <Text style={styles.qrTitle}>Your guardian code</Text>
          <Text style={styles.qrSubtitle}>
            Have your guardian scan this in the GetDraft app. It refreshes every
            10 minutes for security.
          </Text>
          <View style={styles.qrFrame}>
            {token ? (
              <QRCode
                value={token}
                size={210}
                color={brand.primary}
                backgroundColor="#FFFFFF"
              />
            ) : issuing ? (
              <ActivityIndicator size="large" color={brand.primary} />
            ) : (
              <Text style={styles.errorInline}>Tap refresh to generate a code.</Text>
            )}
          </View>
          <View style={styles.qrActions}>
            <Pressable
              style={styles.actionButton}
              onPress={issueToken}
              disabled={issuing}
            >
              <Ionicons name="refresh" size={16} color={theme.text} />
              <Text style={styles.actionButtonText}>Refresh</Text>
            </Pressable>
            <Pressable
              style={[styles.actionButton, styles.actionButtonPrimary]}
              onPress={handleShare}
              disabled={!token}
            >
              <Ionicons name="share-outline" size={16} color={theme.accentText} />
              <Text style={[styles.actionButtonText, styles.actionButtonTextPrimary]}>
                Share
              </Text>
            </Pressable>
          </View>
        </View>

        <Pressable
          style={styles.checkButton}
          onPress={handleManualCheck}
          disabled={checking}
        >
          {checking ? (
            <ActivityIndicator size="small" color={theme.accentText} />
          ) : (
            <Ionicons name="checkmark-done" size={18} color={theme.accentText} />
          )}
          <Text style={styles.checkButtonText}>
            {checking ? "Checking…" : "I've been approved — check now"}
          </Text>
        </Pressable>

        <View style={styles.statusHint}>
          <Ionicons name="time-outline" size={14} color={semantic.warning} />
          <Text style={styles.statusHintText}>
            We check automatically — you’ll be let in the second your guardian is
            approved.
          </Text>
        </View>

        <Pressable style={styles.logoutButton} onPress={onLogout}>
          <Text style={styles.logoutText}>Log out</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

export default PendingActivationScreen;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.bg },
  content: { padding: 20, gap: 14, alignItems: "stretch" },
  lockBadge: {
    alignSelf: "center",
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: brand.primary,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 8,
  },
  title: {
    fontSize: 24,
    fontFamily: "Poppins_700Bold",
    color: theme.text,
    textAlign: "center",
  },
  subtitle: {
    fontSize: 13,
    lineHeight: 20,
    fontFamily: "Poppins_400Regular",
    color: theme.textSecondary,
    textAlign: "center",
    paddingHorizontal: 4,
  },
  stepsCard: {
    backgroundColor: theme.cardBg,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: theme.cardBorder,
    padding: 16,
    gap: 14,
    marginTop: 4,
  },
  stepRow: { flexDirection: "row", gap: 12, alignItems: "flex-start" },
  stepIndex: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.border,
    alignItems: "center",
    justifyContent: "center",
  },
  stepIndexText: {
    fontSize: 12,
    fontFamily: "Poppins_700Bold",
    color: brand.primary,
  },
  stepBody: { flex: 1 },
  stepTitle: {
    fontSize: 14,
    fontFamily: "Poppins_600SemiBold",
    color: theme.text,
  },
  stepText: {
    marginTop: 2,
    fontSize: 12,
    lineHeight: 17,
    fontFamily: "Poppins_400Regular",
    color: theme.textSecondary,
  },
  qrCard: {
    backgroundColor: theme.cardBg,
    borderRadius: 18,
    padding: 20,
    alignItems: "center",
    borderWidth: 1,
    borderColor: theme.cardBorder,
  },
  qrTitle: {
    fontSize: 16,
    fontFamily: "Poppins_700Bold",
    color: theme.text,
    marginBottom: 4,
  },
  qrSubtitle: {
    fontSize: 12,
    fontFamily: "Poppins_400Regular",
    color: theme.textSecondary,
    textAlign: "center",
    paddingHorizontal: 6,
    marginBottom: 16,
  },
  qrFrame: {
    backgroundColor: "#FFFFFF",
    padding: 18,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    minWidth: 246,
    minHeight: 246,
  },
  qrActions: { flexDirection: "row", gap: 10, marginTop: 14 },
  actionButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: theme.border,
  },
  actionButtonPrimary: { backgroundColor: theme.accent, borderColor: theme.accent },
  actionButtonText: {
    fontSize: 13,
    fontFamily: "Poppins_600SemiBold",
    color: theme.text,
  },
  actionButtonTextPrimary: { color: theme.accentText },
  errorInline: { color: theme.textSecondary, fontFamily: "Poppins_500Medium" },
  checkButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: theme.accent,
    borderRadius: 26,
    height: 52,
    marginTop: 4,
  },
  checkButtonText: {
    fontSize: 15,
    fontFamily: "Poppins_700Bold",
    color: theme.accentText,
  },
  statusHint: {
    flexDirection: "row",
    gap: 8,
    alignItems: "flex-start",
    backgroundColor: theme.surface,
    borderRadius: 12,
    padding: 12,
  },
  statusHintText: {
    flex: 1,
    fontSize: 11,
    lineHeight: 16,
    fontFamily: "Poppins_400Regular",
    color: theme.textSecondary,
  },
  logoutButton: { alignItems: "center", paddingVertical: 8 },
  logoutText: {
    fontSize: 13,
    fontFamily: "Poppins_600SemiBold",
    color: semantic.error,
  },
});
