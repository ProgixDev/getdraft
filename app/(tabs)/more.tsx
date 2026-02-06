import React from 'react';
import { View, StyleSheet, Text, Pressable, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useDispatch } from 'react-redux';
import {
  useFonts,
  Poppins_400Regular,
  Poppins_500Medium,
  Poppins_600SemiBold,
} from '@expo-google-fonts/poppins';
import { brand, neutral, semantic } from '@/config/colors';
import { logout } from '@/store/slices/authSlice';

export default function MoreScreen() {
  const insets = useSafeAreaInsets();
  const dispatch = useDispatch();
  const [fontsLoaded] = useFonts({
    Poppins_400Regular,
    Poppins_500Medium,
    Poppins_600SemiBold,
  });

  const handleLogout = () => {
    Alert.alert(
      'Log out',
      'Are you sure you want to log out?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Log out', style: 'destructive', onPress: () => dispatch(logout()) },
      ]
    );
  };

  if (!fontsLoaded) return null;

  const menuItems = [
    { icon: 'grid-outline', label: 'Dashboard', onPress: () => {} },
    { icon: 'help-circle-outline', label: 'Help & FAQ', onPress: () => {} },
    { icon: 'information-circle-outline', label: 'About', onPress: () => {} },
  ];

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={styles.title}>More</Text>
      </View>
      <View style={styles.content}>
        {menuItems.map((item) => (
          <Pressable
            key={item.label}
            style={({ pressed }) => [styles.menuItem, pressed && styles.menuItemPressed]}
            onPress={item.onPress}
          >
            <Ionicons name={item.icon as any} size={24} color={brand.primary} />
            <Text style={styles.menuLabel}>{item.label}</Text>
            <Ionicons name="chevron-forward" size={20} color={neutral.gray400} />
          </Pressable>
        ))}
      </View>
      <View style={[styles.content, styles.logoutSection]}>
        <Pressable
          style={({ pressed }) => [styles.menuItem, styles.logoutItem, pressed && styles.menuItemPressed]}
          onPress={handleLogout}
        >
          <Ionicons name="log-out-outline" size={24} color={semantic.error} />
          <Text style={styles.logoutLabel}>Log out</Text>
          <Ionicons name="chevron-forward" size={20} color={neutral.gray400} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: neutral.gray50,
  },
  header: {
    paddingHorizontal: 24,
    paddingVertical: 16,
    backgroundColor: brand.white,
    borderBottomWidth: 1,
    borderBottomColor: neutral.gray200,
  },
  title: {
    fontSize: 24,
    fontFamily: 'Poppins_600SemiBold',
    color: brand.primary,
  },
  content: {
    padding: 24,
    backgroundColor: brand.white,
    marginTop: 16,
    marginHorizontal: 16,
    borderRadius: 16,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: neutral.gray200,
    gap: 16,
  },
  menuItemPressed: {
    opacity: 0.7,
  },
  menuLabel: {
    flex: 1,
    fontSize: 16,
    fontFamily: 'Poppins_500Medium',
    color: brand.primary,
  },
  logoutSection: {
    marginTop: 16,
  },
  logoutItem: {
    borderBottomWidth: 0,
  },
  logoutLabel: {
    flex: 1,
    fontSize: 16,
    fontFamily: 'Poppins_500Medium',
    color: semantic.error,
  },
});
