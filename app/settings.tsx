import React, { useState } from 'react';
import {
  View,
  StyleSheet,
  Text,
  Pressable,
  ScrollView,
  Switch,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useSelector } from 'react-redux';
import { Ionicons } from '@expo/vector-icons';
import {
  useFonts,
  Poppins_400Regular,
  Poppins_500Medium,
  Poppins_600SemiBold,
  Poppins_700Bold,
} from '@expo-google-fonts/poppins';
import { brand, neutral, semantic, theme } from '@/config/colors';
import { RootState } from '@/store';

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const user = useSelector((state: RootState) => state.auth.user);

  const [matchAlerts, setMatchAlerts] = useState(true);
  const [messageNotifications, setMessageNotifications] = useState(true);
  const [recruiterActivity, setRecruiterActivity] = useState(false);
  const [profileVisible, setProfileVisible] = useState(true);
  const [showDistance, setShowDistance] = useState(true);

  const [fontsLoaded] = useFonts({
    Poppins_400Regular,
    Poppins_500Medium,
    Poppins_600SemiBold,
    Poppins_700Bold,
  });

  if (!fontsLoaded) return null;

  const handleDeleteAccount = () => {
    Alert.alert(
      'Delete Account',
      'Are you sure? This action cannot be undone. All your data, matches, and messages will be permanently deleted.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => Alert.alert('Account Deletion', 'Account deletion is coming soon. Contact support@getdraft.com for assistance.'),
        },
      ]
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
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 24 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Notifications */}
        <View style={styles.section}>
          <View style={styles.sectionTitleRow}>
            <Ionicons name="notifications-outline" size={20} color={theme.text} />
            <Text style={styles.sectionTitle}>Notifications</Text>
          </View>

          <View style={styles.switchRow}>
            <View style={styles.switchCopy}>
              <Text style={styles.switchTitle}>Match Alerts</Text>
              <Text style={styles.switchSubtitle}>Get notified when you match with a recruiter</Text>
            </View>
            <Switch
              value={matchAlerts}
              onValueChange={setMatchAlerts}
              trackColor={{ false: theme.borderLight, true: brand.primary }}
              thumbColor={brand.white}
            />
          </View>

          <View style={styles.switchRow}>
            <View style={styles.switchCopy}>
              <Text style={styles.switchTitle}>Message Notifications</Text>
              <Text style={styles.switchSubtitle}>Get notified when you receive a message</Text>
            </View>
            <Switch
              value={messageNotifications}
              onValueChange={setMessageNotifications}
              trackColor={{ false: theme.borderLight, true: brand.primary }}
              thumbColor={brand.white}
            />
          </View>

          <View style={[styles.switchRow, styles.switchRowLast]}>
            <View style={styles.switchCopy}>
              <Text style={styles.switchTitle}>Recruiter Activity</Text>
              <Text style={styles.switchSubtitle}>Get notified when a recruiter views your profile</Text>
            </View>
            <Switch
              value={recruiterActivity}
              onValueChange={setRecruiterActivity}
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
              <Text style={styles.switchTitle}>Profile Visible to Recruiters</Text>
              <Text style={styles.switchSubtitle}>When off, your profile is hidden from search</Text>
            </View>
            <Switch
              value={profileVisible}
              onValueChange={setProfileVisible}
              trackColor={{ false: theme.borderLight, true: brand.primary }}
              thumbColor={brand.white}
            />
          </View>

          <View style={[styles.switchRow, styles.switchRowLast]}>
            <View style={styles.switchCopy}>
              <Text style={styles.switchTitle}>Show Distance</Text>
              <Text style={styles.switchSubtitle}>Display your distance on your profile</Text>
            </View>
            <Switch
              value={showDistance}
              onValueChange={setShowDistance}
              trackColor={{ false: theme.borderLight, true: brand.primary }}
              thumbColor={brand.white}
            />
          </View>
        </View>

        {/* Account */}
        <View style={styles.section}>
          <View style={styles.sectionTitleRow}>
            <Ionicons name="person-outline" size={20} color={theme.text} />
            <Text style={styles.sectionTitle}>Account</Text>
          </View>

          <Pressable
            style={({ pressed }) => [styles.menuRow, pressed && styles.menuRowPressed]}
            onPress={() => Alert.alert('Change Email', 'Email change is coming soon.')}
          >
            <Ionicons name="mail-outline" size={20} color={theme.textSecondary} />
            <View style={styles.menuRowCopy}>
              <Text style={styles.menuRowTitle}>Change Email</Text>
              <Text style={styles.menuRowValue}>{user?.email}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={theme.textMuted} />
          </Pressable>

          <Pressable
            style={({ pressed }) => [styles.menuRow, pressed && styles.menuRowPressed]}
            onPress={() => Alert.alert('Change Password', 'Password change is coming soon.')}
          >
            <Ionicons name="key-outline" size={20} color={theme.textSecondary} />
            <View style={styles.menuRowCopy}>
              <Text style={styles.menuRowTitle}>Change Password</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={theme.textMuted} />
          </Pressable>

          <Pressable
            style={({ pressed }) => [styles.menuRow, styles.menuRowLast, pressed && styles.menuRowPressed]}
            onPress={handleDeleteAccount}
          >
            <Ionicons name="trash-outline" size={20} color={semantic.error} />
            <View style={styles.menuRowCopy}>
              <Text style={[styles.menuRowTitle, { color: semantic.error }]}>Delete Account</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={theme.textMuted} />
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
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontFamily: 'Poppins_600SemiBold',
    color: theme.text,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
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
    fontFamily: 'Poppins_500Medium',
    color: theme.text,
  },
  switchSubtitle: {
    fontSize: 12,
    fontFamily: 'Poppins_400Regular',
    color: theme.textMuted,
    marginTop: 2,
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
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
    fontFamily: 'Poppins_500Medium',
    color: theme.text,
  },
  menuRowValue: {
    fontSize: 13,
    fontFamily: 'Poppins_400Regular',
    color: theme.textMuted,
    marginTop: 2,
  },
});
