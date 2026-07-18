import React, { useCallback, useState } from "react";
import { View, StyleSheet, Text, Pressable, Share } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useSelector } from "react-redux";
import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import {
  useFonts,
  Poppins_400Regular,
  Poppins_500Medium,
  Poppins_600SemiBold,
  Poppins_700Bold,
} from "@expo-google-fonts/poppins";
import { brand, semantic, theme } from "@/config/colors";
import { RootState } from "@/store";

export default function InviteFriendsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [copied, setCopied] = useState(false);

  // A real, per-user invite link on the live domain. The user id is the
  // attribution key: getdraft.net/invite/<id> lets the landing page (and a
  // future signup deep-link) record who referred a new signup. Falls back to
  // the bare site if we somehow render before auth is hydrated.
  const userId = useSelector((s: RootState) => s.auth.user?.id);
  const referralLink = userId
    ? `https://getdraft.net/invite/${userId}`
    : "https://getdraft.net";

  const [fontsLoaded] = useFonts({
    Poppins_400Regular,
    Poppins_500Medium,
    Poppins_600SemiBold,
    Poppins_700Bold,
  });

  const handleCopy = useCallback(async () => {
    await Clipboard.setStringAsync(referralLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [referralLink]);

  const handleShare = useCallback(async () => {
    try {
      await Share.share({
        message: `Join me on GetDraft — where talent meets opportunity! Sign up here: ${referralLink}`,
      });
    } catch {
      // User cancelled share
    }
  }, [referralLink]);

  if (!fontsLoaded) return null;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable style={styles.headerButton} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={22} color={theme.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Invite Friends</Text>
        <View style={styles.headerButton} />
      </View>

      <View style={styles.content}>
        {/* Hero */}
        <View style={styles.heroIcon}>
          <Ionicons name="people" size={48} color={brand.white} />
        </View>
        <Text style={styles.heading}>Invite Your Teammates</Text>
        <Text style={styles.subtitle}>
          Share GetDraft and help your teammates get discovered by top
          recruiters and coaches.
        </Text>

        {/* Referral link */}
        <View style={styles.linkCard}>
          <Text style={styles.linkText} numberOfLines={1}>
            {referralLink}
          </Text>
          <Pressable
            style={[styles.copyButton, copied && styles.copyButtonCopied]}
            onPress={handleCopy}
          >
            <Ionicons
              name={copied ? "checkmark" : "copy-outline"}
              size={16}
              color={copied ? semantic.success : theme.text}
            />
            <Text
              style={[
                styles.copyButtonText,
                copied && styles.copyButtonTextCopied,
              ]}
            >
              {copied ? "Copied!" : "Copy"}
            </Text>
          </Pressable>
        </View>

        {/* Share button */}
        <Pressable style={styles.shareButton} onPress={handleShare}>
          <Ionicons name="share-outline" size={20} color={theme.accentText} />
          <Text style={styles.shareButtonText}>Share with Friends</Text>
        </Pressable>

        {/* Referral benefit */}
        <View style={styles.benefitCard}>
          <Ionicons name="people-outline" size={24} color={theme.text} />
          <View style={styles.benefitCopy}>
            <Text style={styles.benefitTitle}>Grow the game</Text>
            <Text style={styles.benefitSubtitle}>
              The more of your team on GetDraft, the more coaches and agents
              scouting. Invite them to get discovered together.
            </Text>
          </View>
        </View>
      </View>
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
    paddingHorizontal: 12,
    paddingVertical: 14,
    backgroundColor: theme.headerBg,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  headerButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontSize: 18,
    fontFamily: "Poppins_600SemiBold",
    color: theme.text,
  },
  content: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
    paddingBottom: 40,
  },
  heroIcon: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: brand.primary,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 24,
  },
  heading: {
    fontSize: 26,
    fontFamily: "Poppins_700Bold",
    color: theme.text,
    textAlign: "center",
  },
  subtitle: {
    fontSize: 15,
    fontFamily: "Poppins_400Regular",
    color: theme.textSecondary,
    textAlign: "center",
    marginTop: 10,
    lineHeight: 22,
  },
  linkCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: theme.cardBg,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.cardBorder,
    paddingLeft: 16,
    paddingRight: 6,
    paddingVertical: 6,
    marginTop: 32,
    width: "100%",
    gap: 8,
  },
  linkText: {
    flex: 1,
    fontSize: 13,
    fontFamily: "Poppins_400Regular",
    color: theme.textSecondary,
  },
  copyButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: theme.surface,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
  },
  copyButtonCopied: {
    backgroundColor: "rgba(0,184,148,0.15)",
  },
  copyButtonText: {
    fontSize: 13,
    fontFamily: "Poppins_600SemiBold",
    color: theme.text,
  },
  copyButtonTextCopied: {
    color: semantic.success,
  },
  shareButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    width: "100%",
    height: 50,
    borderRadius: 25,
    backgroundColor: theme.accent,
    marginTop: 16,
  },
  shareButtonText: {
    fontSize: 16,
    fontFamily: "Poppins_600SemiBold",
    color: theme.accentText,
  },
  benefitCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    backgroundColor: theme.surface,
    borderRadius: 16,
    padding: 18,
    marginTop: 28,
    width: "100%",
  },
  benefitCopy: {
    flex: 1,
  },
  benefitTitle: {
    fontSize: 15,
    fontFamily: "Poppins_600SemiBold",
    color: theme.text,
  },
  benefitSubtitle: {
    fontSize: 13,
    fontFamily: "Poppins_400Regular",
    color: theme.textSecondary,
    marginTop: 2,
  },
});
