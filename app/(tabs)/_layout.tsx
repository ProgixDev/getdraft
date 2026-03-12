import { Tabs } from 'expo-router';
import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSelector } from 'react-redux';

import { HapticTab } from '@/components/haptic-tab';
import { brand, neutral, semantic, theme } from '@/config/colors';
import { RootState } from '@/store';
import { mockAthleteMatches } from '@/constants/discoverData';
import { mockParentRecruiterOutreach } from '@/constants/parentData';

function BadgeIcon({
  name,
  focused,
  color,
  count,
}: {
  name: string;
  focused: boolean;
  color: string;
  count: number;
}) {
  return (
    <View style={badgeStyles.wrapper}>
      <Ionicons name={name as any} size={24} color={color} />
      {count > 0 && (
        <View style={badgeStyles.badge}>
          <Text style={badgeStyles.badgeText}>{count > 9 ? '9+' : count}</Text>
        </View>
      )}
    </View>
  );
}

const badgeStyles = StyleSheet.create({
  wrapper: {
    position: 'relative',
  },
  badge: {
    position: 'absolute',
    top: -4,
    right: -6,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: semantic.error,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
    borderWidth: 1.5,
    borderColor: theme.tabBarBg,
  },
  badgeText: {
    fontSize: 9,
    color: brand.white,
    fontWeight: '700',
  },
});

export default function TabLayout() {
  const user = useSelector((state: RootState) => state.auth.user);
  const isParent = user?.role === 'parent';
  const isAthlete = user?.role === 'athlete';

  const unreadCount = useMemo(() => {
    if (isAthlete && user?.email) {
      const matches = mockAthleteMatches[user.email] ?? [];
      return matches.reduce((sum, m) => sum + m.unreadCount, 0);
    }
    if (isParent && user?.email) {
      const messages = mockParentRecruiterOutreach[user.email] ?? [];
      return messages.reduce((sum, m) => sum + m.unreadCount, 0);
    }
    return 0;
  }, [isAthlete, isParent, user?.email]);

  return (
    <Tabs
      initialRouteName={isParent ? 'matches' : 'index'}
      screenOptions={{
        tabBarActiveTintColor: theme.accent,
        tabBarInactiveTintColor: theme.textMuted,
        headerShown: false,
        tabBarButton: HapticTab,
        tabBarStyle: {
          backgroundColor: theme.tabBarBg,
          borderTopColor: theme.tabBarBorder,
          borderTopWidth: 1,
        },
        tabBarLabelStyle: {
          fontSize: 11,
        },
      }}>
      <Tabs.Screen
        name="index"
        options={{
          href: isParent ? null : undefined,
          title: 'Discover',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={focused ? 'compass' : 'compass-outline'}
              size={24}
              color={color}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="matches"
        options={{
          title: isParent ? 'Inbox' : 'Draft Board',
          tabBarIcon: ({ color, focused }) => (
            <BadgeIcon
              name={focused ? 'trophy' : 'trophy-outline'}
              focused={focused}
              color={color}
              count={unreadCount}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={focused ? 'person' : 'person-outline'}
              size={24}
              color={color}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="globe"
        options={{
          title: 'Globe',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={focused ? 'globe' : 'globe-outline'}
              size={24}
              color={color}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="more"
        options={{
          title: 'More',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={focused ? 'menu' : 'menu-outline'}
              size={24}
              color={color}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="explore"
        options={{
          href: null,
        }}
      />
    </Tabs>
  );
}
