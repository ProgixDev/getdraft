import React, { useCallback, useState } from "react";
import {
  View,
  StyleSheet,
  Text,
  Pressable,
  ScrollView,
  Switch,
  Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { useDispatch, useSelector } from "react-redux";
import { Ionicons } from "@expo/vector-icons";
import {
  useFonts,
  Poppins_400Regular,
  Poppins_500Medium,
  Poppins_600SemiBold,
  Poppins_700Bold,
} from "@expo-google-fonts/poppins";
import { brand, neutral, semantic, theme } from "@/config/colors";
import { RootState } from "@/store";
import { usersService } from "@/services/users";
import { chatService } from "@/services/chat";
import { clearTokens } from "@/services/api";
import { clearAuth } from "@/store/authStorage";
import { logout } from "@/store/slices/authSlice";

const PREF_DEFAULTS = {
  matchAlerts: true,
  messageNotifications: true,
  recruiterActivity: false,
  profileVisible: true,
  showDistance: true,
};

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const dispatch = useDispatch();
  const user = useSelector((state: RootState) => state.auth.user);
  const [deleting, setDeleting] = useState(false);

  const [matchAlerts, setMatchAlerts] = useState(PREF_DEFAULTS.matchAlerts);
  const [messageNotifications, setMessageNotifications] = useState(
    PREF_DEFAULTS.messageNotifications,
  );
  const [recruiterActivity, setRecruiterActivity] = useState(
    PREF_DEFAULTS.recruiterActivity,
  );
  const [profileVisible, setProfileVisible] = useState(
    PREF_DEFAULTS.profileVisible,
  );
  const [showDistance, setShowDistance] = useState(PREF_DEFAULTS.showDistance);

  const [fontsLoaded] = useFonts({
    Poppins_400Regular,
    Poppins_500Medium,
    Poppins_600SemiBold,
    Poppins_700Bold,
  });

  // Hydrate from /users/me on focus.
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      usersService
        .getMe()
        .then((me: any) => {
          if (cancelled) return;
          const p = me?.preferences ?? {};
          if (typeof p.matchAlerts === "boolean") setMatchAlerts(p.matchAlerts);
          if (typeof p.messageNotifications === "boolean")
            setMessageNotifications(p.messageNotifications);
          if (typeof p.recruiterActivity === "boolean")
            setRecruiterActivity(p.recruiterActivity);
          if (typeof p.profileVisible === "boolean")
            setProfileVisible(p.profileVisible);
          if (typeof p.showDistance === "boolean")
            setShowDistance(p.showDistance);
        })
        .catch(() => {});
      return () => {
        cancelled = true;
      };
    }, []),
  );

  // Persist a delta to /users/me.preferences. On save failure the switch is
  // reverted and the user is told, so the UI never lies about saved state.
  const persist = useCallback(
    (delta: Record<string, boolean>, revert: () => void) => {
      const next = {
        matchAlerts,
        messageNotifications,
        recruiterActivity,
        profileVisible,
        showDistance,
        ...delta,
      };
      usersService.updateMe({ preferences: next }).catch(() => {
        revert();
        Alert.alert(
          "Couldn't save",
          "Your change wasn't saved. Please try again.",
        );
      });
    },
    [
      matchAlerts,
      messageNotifications,
      recruiterActivity,
      profileVisible,
      showDistance,
    ],
  );

  const onMatchAlerts = (v: boolean) => {
    setMatchAlerts(v);
    persist({ matchAlerts: v }, () => setMatchAlerts(!v));
  };
  const onMessageNotifications = (v: boolean) => {
    setMessageNotifications(v);
    persist({ messageNotifications: v }, () => setMessageNotifications(!v));
  };
  const onRecruiterActivity = (v: boolean) => {
    setRecruiterActivity(v);
    persist({ recruiterActivity: v }, () => setRecruiterActivity(!v));
  };
  const onProfileVisible = (v: boolean) => {
    setProfileVisible(v);
    persist({ profileVisible: v }, () => setProfileVisible(!v));
  };
  const onShowDistance = (v: boolean) => {
    setShowDistance(v);
    persist({ showDistance: v }, () => setShowDistance(!v));
  };

  if (!fontsLoaded) return null;

  const handleDeleteAccount = () => {
    if (deleting) return;
    Alert.alert(
      "Delete Account",
      "Are you sure? This action cannot be undone. All your data, matches, and messages will be permanently deleted.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () =>
            Alert.alert(
              "Permanently delete your account?",
              "This will erase your profile, posts, matches, and messages. This cannot be undone.",
              [
                { text: "Cancel", style: "cancel" },
                {
                  text: "Delete",
                  style: "destructive",
                  onPress: async () => {
                    setDeleting(true);
                    try {
                      await usersService.deleteAccount();
                      // Tear down the local session WITHOUT hitting
                      // /auth/logout — the backend user no longer
                      // exists, that call would 401 and our api.ts
                      // session-expired hook would already have
                      // taken over. The _layout effect picks up
                      // !isAuthenticated and routes to auth.
                      await clearTokens().catch(() => {});
                      await clearAuth().catch(() => {});
                      try {
                        chatService.disconnectSocket();
                      } catch {
                        // ignore socket teardown errors
                      }
                      dispatch(logout());
                    } catch {
                      setDeleting(false);
                      Alert.alert(
                        "Couldn't delete your account",
                        "Please try again.",
                      );
                    }
                  },
                },
              ],
            ),
        },
      ],
    );
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable style={styles.headerButton} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={22} color={theme.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Settings</Text>
        <View style={styles.headerButton} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: insets.bottom + 24 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Notifications */}
        <View style={styles.section}>
          <View style={styles.sectionTitleRow}>
            <Ionicons
              name="notifications-outline"
              size={20}
              color={theme.text}
            />
            <Text style={styles.sectionTitle}>Notifications</Text>
          </View>

          <View style={styles.switchRow}>
            <View style={styles.switchCopy}>
              <Text style={styles.switchTitle}>Match Alerts</Text>
              <Text style={styles.switchSubtitle}>
                Get notified when you match with a recruiter
              </Text>
            </View>
            <Switch
              value={matchAlerts}
              onValueChange={onMatchAlerts}
              trackColor={{ false: theme.borderLight, true: brand.primary }}
              thumbColor={brand.white}
            />
          </View>

          <View style={styles.switchRow}>
            <View style={styles.switchCopy}>
              <Text style={styles.switchTitle}>Message Notifications</Text>
              <Text style={styles.switchSubtitle}>
                Get notified when you receive a message
              </Text>
            </View>
            <Switch
              value={messageNotifications}
              onValueChange={onMessageNotifications}
              trackColor={{ false: theme.borderLight, true: brand.primary }}
              thumbColor={brand.white}
            />
          </View>

          <View style={[styles.switchRow, styles.switchRowLast]}>
            <View style={styles.switchCopy}>
              <Text style={styles.switchTitle}>Recruiter Activity</Text>
              <Text style={styles.switchSubtitle}>
                Get notified when a recruiter views your profile
              </Text>
            </View>
            <Switch
              value={recruiterActivity}
              onValueChange={onRecruiterActivity}
              trackColor={{ false: theme.borderLight, true: brand.primary }}
              thumbColor={brand.white}
            />
          </View>
        </View>

        {/* Privacy */}
        <View style={styles.section}>
          <View style={styles.sectionTitleRow}>
            <Ionicons name="lock-closed-outline" size={20} color={theme.text} />
            <Text style={styles.sectionTitle}>Privacy</Text>
          </View>

          <View style={styles.switchRow}>
            <View style={styles.switchCopy}>
              <Text style={styles.switchTitle}>
                Profile Visible to Recruiters
              </Text>
              <Text style={styles.switchSubtitle}>
                When off, your profile is hidden from search
              </Text>
            </View>
            <Switch
              value={profileVisible}
              onValueChange={onProfileVisible}
              trackColor={{ false: theme.borderLight, true: brand.primary }}
              thumbColor={brand.white}
            />
          </View>

          <View style={[styles.switchRow, styles.switchRowLast]}>
            <View style={styles.switchCopy}>
              <Text style={styles.switchTitle}>Show Distance</Text>
              <Text style={styles.switchSubtitle}>
                Display your distance on your profile
              </Text>
            </View>
            <Switch
              value={showDistance}
              onValueChange={onShowDistance}
              trackColor={{ false: theme.borderLight, true: brand.primary }}
              thumbColor={brand.white}
            />
          </View>
        </View>

        {/* Admin tools — only shown to users with role=admin. */}
        {user?.role === "admin" && (
          <View style={styles.section}>
            <View style={styles.sectionTitleRow}>
              <Ionicons
                name="shield-checkmark-outline"
                size={20}
                color={theme.text}
              />
              <Text style={styles.sectionTitle}>Admin tools</Text>
            </View>
            <Pressable
              style={({ pressed }) => [
                styles.menuRow,
                styles.menuRowLast,
                pressed && styles.menuRowPressed,
              ]}
              onPress={() => router.push("/admin-guardian-links")}
            >
              <Ionicons
                name="people-circle-outline"
                size={20}
                color={theme.textSecondary}
              />
              <View style={styles.menuRowCopy}>
                <Text style={styles.menuRowTitle}>Guardian link reviews</Text>
                <Text style={styles.menuRowValue}>
                  Approve or decline pending guardian submissions
                </Text>
              </View>
              <Ionicons
                name="chevron-forward"
                size={18}
                color={theme.textMuted}
              />
            </Pressable>
          </View>
        )}

        {/* Guardian link — parents see "Verify my link" so they can
            replay the tutorial video and record their declaration. */}
        {user?.role === "parent" && (
          <View style={styles.section}>
            <View style={styles.sectionTitleRow}>
              <Ionicons
                name="shield-checkmark-outline"
                size={20}
                color={theme.text}
              />
              <Text style={styles.sectionTitle}>Guardian link</Text>
            </View>
            <Pressable
              style={({ pressed }) => [
                styles.menuRow,
                styles.menuRowLast,
                pressed && styles.menuRowPressed,
              ]}
              onPress={() => router.push("/guardian-link")}
            >
              <Ionicons
                name="videocam-outline"
                size={20}
                color={theme.textSecondary}
              />
              <View style={styles.menuRowCopy}>
                <Text style={styles.menuRowTitle}>Verify my link</Text>
                <Text style={styles.menuRowValue}>
                  Watch the tutorial and record your declaration video
                </Text>
              </View>
              <Ionicons
                name="chevron-forward"
                size={18}
                color={theme.textMuted}
              />
            </Pressable>
          </View>
        )}

        {/* Guardians — only shown to athletes. */}
        {user?.role === "athlete" && (
          <View style={styles.section}>
            <View style={styles.sectionTitleRow}>
              <Ionicons name="people-outline" size={20} color={theme.text} />
              <Text style={styles.sectionTitle}>Guardians</Text>
            </View>
            <Pressable
              style={({ pressed }) => [
                styles.menuRow,
                styles.menuRowLast,
                pressed && styles.menuRowPressed,
              ]}
              onPress={() => router.push("/link-guardian")}
            >
              <Ionicons
                name="qr-code-outline"
                size={20}
                color={theme.textSecondary}
              />
              <View style={styles.menuRowCopy}>
                <Text style={styles.menuRowTitle}>Link a guardian</Text>
                <Text style={styles.menuRowValue}>
                  Generate a QR code for a parent or guardian
                </Text>
              </View>
              <Ionicons
                name="chevron-forward"
                size={18}
                color={theme.textMuted}
              />
            </Pressable>
          </View>
        )}

        {/* Account */}
        <View style={styles.section}>
          <View style={styles.sectionTitleRow}>
            <Ionicons name="person-outline" size={20} color={theme.text} />
            <Text style={styles.sectionTitle}>Account</Text>
          </View>

          <Pressable
            style={({ pressed }) => [
              styles.menuRow,
              styles.menuRowLast,
              pressed && styles.menuRowPressed,
              deleting && { opacity: 0.6 },
            ]}
            onPress={handleDeleteAccount}
            disabled={deleting}
          >
            <Ionicons name="trash-outline" size={20} color={semantic.error} />
            <View style={styles.menuRowCopy}>
              <Text style={[styles.menuRowTitle, { color: semantic.error }]}>
                {deleting ? "Deleting…" : "Delete Account"}
              </Text>
            </View>
            <Ionicons
              name="chevron-forward"
              size={18}
              color={theme.textMuted}
            />
          </Pressable>
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
    padding: 16,
    gap: 16,
  },
  section: {
    backgroundColor: theme.cardBg,
    borderRadius: 16,
    padding: 20,
  },
  sectionTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontFamily: "Poppins_600SemiBold",
    color: theme.text,
  },
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
    gap: 12,
  },
  switchRowLast: {
    borderBottomWidth: 0,
  },
  switchCopy: {
    flex: 1,
  },
  switchTitle: {
    fontSize: 15,
    fontFamily: "Poppins_500Medium",
    color: theme.text,
  },
  switchSubtitle: {
    fontSize: 12,
    fontFamily: "Poppins_400Regular",
    color: theme.textMuted,
    marginTop: 2,
  },
  menuRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
    gap: 12,
  },
  menuRowLast: {
    borderBottomWidth: 0,
  },
  menuRowPressed: {
    opacity: 0.7,
  },
  menuRowCopy: {
    flex: 1,
  },
  menuRowTitle: {
    fontSize: 15,
    fontFamily: "Poppins_500Medium",
    color: theme.text,
  },
  menuRowValue: {
    fontSize: 13,
    fontFamily: "Poppins_400Regular",
    color: theme.textMuted,
    marginTop: 2,
  },
});
