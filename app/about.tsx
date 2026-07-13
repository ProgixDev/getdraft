import React from "react";
import {
  View,
  StyleSheet,
  Text,
  Pressable,
  ScrollView,
  Linking,
  Alert,
  Image,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import {
  useFonts,
  Poppins_400Regular,
  Poppins_500Medium,
  Poppins_600SemiBold,
  Poppins_700Bold,
} from "@expo-google-fonts/poppins";
import { brand, neutral, semantic, theme } from "@/config/colors";
import { images } from "@/config/assets";

// Official channels only — add more here once they exist.
const SOCIAL_LINKS = [
  {
    icon: "logo-instagram" as const,
    label: "Instagram",
    url: "https://www.instagram.com/officialgetdraft?igsh=dThvbWdkNG9vaGFl",
  },
];

const PRIVACY_POLICY_URL =
  "https://getdraft-api-production.up.railway.app/api/privacy";

const LEGAL_LINKS = [
  { icon: "document-text-outline" as const, label: "Terms of Service" },
  { icon: "shield-checkmark-outline" as const, label: "Privacy Policy" },
  { icon: "code-slash-outline" as const, label: "Licenses" },
];

export default function AboutScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [fontsLoaded] = useFonts({
    Poppins_400Regular,
    Poppins_500Medium,
    Poppins_600SemiBold,
    Poppins_700Bold,
  });

  if (!fontsLoaded) return null;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable style={styles.headerButton} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={22} color={theme.text} />
        </Pressable>
        <Text style={styles.headerTitle}>About</Text>
        <View style={styles.headerButton} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: insets.bottom + 40 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Brand */}
        <View style={styles.brandSection}>
          <View style={styles.logoCircle}>
            <Image
              source={images.logoWhite}
              style={styles.logoImage}
              resizeMode="contain"
            />
          </View>
          <Text style={styles.brandName}>GetDraft</Text>
          <Text style={styles.version}>Version 1.0.0</Text>
          <Text style={styles.tagline}>Where Talent Meets Opportunity</Text>
        </View>

        {/* Description */}
        <View style={styles.descriptionCard}>
          <Text style={styles.descriptionText}>
            GetDraft connects athletes with coaches, agents, and recruiters. We
            believe every talented athlete deserves to be seen, regardless of
            where they play.
          </Text>
        </View>

        {/* Legal */}
        <View style={styles.legalSection}>
          {LEGAL_LINKS.map((item, idx) => (
            <Pressable
              key={item.label}
              style={({ pressed }) => [
                styles.legalRow,
                idx === LEGAL_LINKS.length - 1 && styles.legalRowLast,
                pressed && styles.legalRowPressed,
              ]}
              onPress={() =>
                item.label === "Privacy Policy"
                  ? Linking.openURL(PRIVACY_POLICY_URL)
                  : Alert.alert(item.label, `${item.label} page is coming soon.`)
              }
            >
              <Ionicons
                name={item.icon}
                size={20}
                color={theme.textSecondary}
              />
              <Text style={styles.legalLabel}>{item.label}</Text>
              <Ionicons
                name="chevron-forward"
                size={18}
                color={theme.textMuted}
              />
            </Pressable>
          ))}
        </View>

        {/* Social */}
        <Text style={styles.socialHeading}>Follow Us</Text>
        <View style={styles.socialRow}>
          {SOCIAL_LINKS.map((item) => (
            <Pressable
              key={item.label}
              style={({ pressed }) => [
                styles.socialButton,
                pressed && styles.socialButtonPressed,
              ]}
              onPress={() => Linking.openURL(item.url)}
            >
              <Ionicons name={item.icon} size={24} color={theme.text} />
            </Pressable>
          ))}
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>
            Made with <Text style={{ color: semantic.error }}>♥</Text> for
            athletes everywhere
          </Text>
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
  scroll: {
    flex: 1,
  },
  scrollContent: {
    alignItems: "center",
    padding: 24,
  },
  // Brand
  brandSection: {
    alignItems: "center",
    marginTop: 20,
  },
  logoCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: brand.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  logoImage: {
    width: 64,
    height: 64,
  },
  brandName: {
    fontSize: 30,
    fontFamily: "Poppins_700Bold",
    color: theme.text,
    marginTop: 16,
  },
  version: {
    fontSize: 13,
    fontFamily: "Poppins_400Regular",
    color: theme.textMuted,
    marginTop: 4,
  },
  tagline: {
    fontSize: 16,
    fontFamily: "Poppins_600SemiBold",
    color: theme.textSecondary,
    marginTop: 8,
  },
  // Description
  descriptionCard: {
    backgroundColor: theme.cardBg,
    borderRadius: 16,
    padding: 20,
    marginTop: 28,
    width: "100%",
  },
  descriptionText: {
    fontSize: 14,
    fontFamily: "Poppins_400Regular",
    color: theme.textSecondary,
    lineHeight: 22,
    textAlign: "center",
  },
  // Legal
  legalSection: {
    backgroundColor: theme.cardBg,
    borderRadius: 16,
    width: "100%",
    marginTop: 16,
    overflow: "hidden",
  },
  legalRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 15,
    paddingHorizontal: 18,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
    gap: 12,
  },
  legalRowLast: {
    borderBottomWidth: 0,
  },
  legalRowPressed: {
    backgroundColor: theme.pressed,
  },
  legalLabel: {
    flex: 1,
    fontSize: 15,
    fontFamily: "Poppins_500Medium",
    color: theme.text,
  },
  // Social
  socialHeading: {
    fontSize: 16,
    fontFamily: "Poppins_600SemiBold",
    color: theme.text,
    marginTop: 28,
    marginBottom: 12,
  },
  socialRow: {
    flexDirection: "row",
    gap: 16,
  },
  socialButton: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: theme.surface,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: theme.border,
  },
  socialButtonPressed: {
    backgroundColor: theme.pressed,
  },
  // Footer
  footer: {
    marginTop: 40,
  },
  footerText: {
    fontSize: 13,
    fontFamily: "Poppins_400Regular",
    color: theme.textMuted,
    textAlign: "center",
  },
});
