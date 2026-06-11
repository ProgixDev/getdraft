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
import { initialTabForRole, Role } from "@/lib/roleRoutes";

function BadgeIcon({
  name,
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

/**
 * Per-role tab visibility map. `href: null` removes the tab from the bar
 * but keeps the route registered so direct `router.push(...)` still works
 * (each role-gated screen does its own redirect-to-home on focus via
 * useRoleHomeRedirect in @/lib/roleRoutes).
 *
 * The big design decisions encoded here:
 *  - Globe is the map view of the discover feed (tap a point → swipe).
 *    Open to athletes, coaches and recruiters — everyone who actually
 *    drafts. Parents and admins don't get it.
 *  - Feed center button is athletes-only — recruiters posting reels was
 *    out of role; parents and admins never post.
 *  - Parents and admins each have a dedicated set: parent = guardian
 *    dashboard + messages + more; admin = dashboard + reviews + users + more.
 */
function tabVisibleForRole(tab: string, role: Role | undefined): boolean {
  if (!role) return tab !== "dashboard" && tab !== "reviews" && tab !== "users" && tab !== "home";

  switch (role) {
    case "athlete":
      // Reference experience — original 5 tabs.
      return ["index", "matches", "feed", "globe", "more"].includes(tab);
    case "coach":
    case "recruiter":
      // Drop Feed (center "+") — recruiters posting reels was out of
      // role. Globe is in: it's the map of swipe targets, so coaches
      // and recruiters get it too (showing athletes instead of recruiters).
      return ["index", "matches", "globe", "more"].includes(tab);
    case "parent":
      // Guardian dashboard + inbox + more. No Discover/Feed/Globe.
      return ["home", "matches", "more"].includes(tab);
    case "admin":
      // Internal console — never sees the player surface.
      return ["dashboard", "reviews", "users", "more"].includes(tab);
  }
}

export default function TabLayout() {
  const user = useSelector((state: RootState) => state.auth.user);
  const role = user?.role as Role | undefined;
  const isParent = role === "parent";
  const isAdmin = role === "admin";

  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (!user) return;
    if (isAdmin) {
      // Admin doesn't have a chat inbox surface; keep the badge at 0.
      setUnreadCount(0);
      return;
    }
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
  }, [isParent, isAdmin, user]);

  const matchesLabel = isParent ? "Messages" : "Draft Board";

  return (
    <Tabs
      backBehavior="initialRoute"
      initialRouteName={initialTabForRole(role)}
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
        tabBarLabelStyle: { fontSize: 11 },
      }}
    >
      {/* Admin — Dashboard */}
      <Tabs.Screen
        name="dashboard"
        options={{
          href: tabVisibleForRole("dashboard", role) ? undefined : null,
          title: "Dashboard",
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={focused ? "stats-chart" : "stats-chart-outline"}
              size={24}
              color={color}
            />
          ),
        }}
      />
      {/* Admin — Reviews queue */}
      <Tabs.Screen
        name="reviews"
        options={{
          href: tabVisibleForRole("reviews", role) ? undefined : null,
          title: "Reviews",
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={focused ? "shield-checkmark" : "shield-checkmark-outline"}
              size={24}
              color={color}
            />
          ),
        }}
      />
      {/* Admin — Users directory */}
      <Tabs.Screen
        name="users"
        options={{
          href: tabVisibleForRole("users", role) ? undefined : null,
          title: "Users",
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={focused ? "people" : "people-outline"}
              size={24}
              color={color}
            />
          ),
        }}
      />
      {/* Parent — Guardian Home */}
      <Tabs.Screen
        name="home"
        options={{
          href: tabVisibleForRole("home", role) ? undefined : null,
          title: "Home",
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={focused ? "shield-half" : "shield-half-outline"}
              size={24}
              color={color}
            />
          ),
        }}
      />
      {/* Athlete + Recruiter — Discover (swipe) */}
      <Tabs.Screen
        name="index"
        options={{
          href: tabVisibleForRole("index", role) ? undefined : null,
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
      {/* Athlete/Recruiter Draft Board · Parent Messages */}
      <Tabs.Screen
        name="matches"
        options={{
          href: tabVisibleForRole("matches", role) ? undefined : null,
          title: matchesLabel,
          tabBarIcon: ({ color, focused }) => (
            <BadgeIcon
              name={
                isParent
                  ? focused
                    ? "chatbubbles"
                    : "chatbubbles-outline"
                  : focused
                    ? "trophy"
                    : "trophy-outline"
              }
              focused={focused}
              color={color}
              count={unreadCount}
            />
          ),
        }}
      />
      {/* Athlete only — Feed (center "+") */}
      <Tabs.Screen
        name="feed"
        options={{
          href: tabVisibleForRole("feed", role) ? undefined : null,
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
      {/* Profile — always hidden from the bar (opens from More) */}
      <Tabs.Screen
        name="profile"
        options={{ href: null, title: "Profile" }}
      />
      {/* Athlete + Recruiter — Globe (map view of swipe targets) */}
      <Tabs.Screen
        name="globe"
        options={{
          href: tabVisibleForRole("globe", role) ? undefined : null,
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
      {/* Everyone — More */}
      <Tabs.Screen
        name="more"
        options={{
          href: tabVisibleForRole("more", role) ? undefined : null,
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
      <Tabs.Screen name="explore" options={{ href: null }} />
    </Tabs>
  );
}
