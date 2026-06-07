import { Tabs } from "expo-router";
import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSelector } from "react-redux";

import { HapticTab } from "@/components/haptic-tab";
import { brand, semantic, theme } from "@/config/colors";
import { RootState } from "@/store";
import { chatService } from "@/services/chat";
import { outreachService } from "@/services/outreach";
import { conversationsService } from "@/services/conversations";

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
          <Text style={badgeStyles.badgeText}>{count > 9 ? "9+" : count}</Text>
        </View>
      )}
    </View>
  );
}

const feedTabStyles = StyleSheet.create({
  centerButton: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: brand.primary,
    alignItems: "center",
    justifyContent: "center",
    marginTop: -18,
    borderWidth: 2,
    borderColor: theme.tabBarBg,
    shadowColor: "#000",
    shadowOpacity: 0.35,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 8,
    elevation: 6,
  },
  centerButtonActive: {
    backgroundColor: theme.accent,
  },
});

const badgeStyles = StyleSheet.create({
  wrapper: {
    position: "relative",
  },
  badge: {
    position: "absolute",
    top: -4,
    right: -6,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: semantic.error,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 3,
    borderWidth: 1.5,
    borderColor: theme.tabBarBg,
  },
  badgeText: {
    fontSize: 9,
    color: brand.white,
    fontWeight: "700",
  },
});

export default function TabLayout() {
  const user = useSelector((state: RootState) => state.auth.user);
  const isParent = user?.role === "parent";

  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    const threadFetcher = isParent
      ? outreachService.getOutreachList()
      : chatService.getThreads();
    Promise.all([
      threadFetcher.catch(() => [] as any[]),
      conversationsService.getInbox().catch(() => [] as any[]),
    ])
      .then(([threads, inbox]) => {
        if (cancelled) return;
        const threadUnread = (threads ?? []).reduce(
          (acc: number, r: any) => acc + (r?.unreadCount || 0),
          0,
        );
        const dmUnread = (inbox ?? []).reduce(
          (acc: number, c: any) => acc + (c?.unreadCount || 0),
          0,
        );
        setUnreadCount(threadUnread + dmUnread);
      })
      .catch(() => {
        if (!cancelled) setUnreadCount(0);
      });
    return () => {
      cancelled = true;
    };
  }, [isParent, user]);

  return (
    <Tabs
      initialRouteName={isParent ? "matches" : "index"}
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
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          href: isParent ? null : undefined,
          title: "Discover",
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={focused ? "compass" : "compass-outline"}
              size={24}
              color={color}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="matches"
        options={{
          title: isParent ? "Inbox" : "Draft Board",
          tabBarIcon: ({ color, focused }) => (
            <BadgeIcon
              name={focused ? "trophy" : "trophy-outline"}
              focused={focused}
              color={color}
              count={unreadCount}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="feed"
        options={{
          title: "",
          tabBarLabel: () => null,
          tabBarIcon: ({ focused }) => (
            <View
              style={[
                feedTabStyles.centerButton,
                focused && feedTabStyles.centerButtonActive,
              ]}
            >
              <Ionicons
                name={focused ? "play" : "play-outline"}
                size={26}
                color={focused ? theme.accentText : brand.white}
              />
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          // Removed from the tab bar — opened from the "More" menu instead.
          // Route stays registered so router.push("/(tabs)/profile") still works.
          href: null,
          title: "Profile",
        }}
      />
      <Tabs.Screen
        name="globe"
        options={{
          title: "Globe",
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={focused ? "globe" : "globe-outline"}
              size={24}
              color={color}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="more"
        options={{
          title: "More",
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={focused ? "menu" : "menu-outline"}
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
