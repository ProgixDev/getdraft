import React, { useEffect, useState } from "react";
import {
  View,
  StyleSheet,
  Text,
  Pressable,
  Alert,
  Image,
  ScrollView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useSelector } from "react-redux";
import { useRouter } from "expo-router";
import {
  useFonts,
  Poppins_400Regular,
  Poppins_500Medium,
  Poppins_600SemiBold,
} from "@expo-google-fonts/poppins";
import { brand, semantic, theme } from "@/config/colors";
import { logoutAsync } from "@/store/slices/authSlice";
import { useAppDispatch } from "@/store/hooks";
import { RootState } from "@/store";
import { usersService } from "@/services/users";
import { profilesService } from "@/services/profiles";

export default function MoreScreen() {
  const insets = useSafeAreaInsets();
  const dispatch = useAppDispatch();
  const router = useRouter();
  const user = useSelector((state: RootState) => state.auth.user);
  const [fontsLoaded] = useFonts({
    Poppins_400Regular,
    Poppins_500Medium,
    Poppins_600SemiBold,
  });

  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [athleteRoleLine, setAthleteRoleLine] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    usersService
      .getMe()
      .then((me) => {
        if (cancelled) return;
        setAvatarUrl(me?.avatar_url ?? null);
      })
      .catch(() => {});

    if (user.role === "athlete") {
      profilesService
        .getAthleteProfile()
        .then((p) => {
          if (cancelled || !p) return;
          if (p.position && p.level) {
            setAthleteRoleLine(`${p.position} · ${p.level}`);
          }
          if (!avatarUrl && Array.isArray(p.photos) && p.photos[0]) {
            setAvatarUrl(p.photos[0]);
          }
        })
        .catch(() => {});
    }
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, user?.role]);

  const handleLogout = () => {
    Alert.alert("Log out", "Are you sure you want to log out?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Log out",
        style: "destructive",
        onPress: () => dispatch(logoutAsync()),
      },
    ]);
  };

  if (!fontsLoaded) return null;

  const roleLabel =
    user?.role === "recruiter"
      ? "Agent / Recruiter"
      : user?.role === "coach"
        ? "Coach"
        : user?.role === "athlete"
          ? (athleteRoleLine ?? "Athlete")
          : user?.role === "parent"
            ? "Parent"
            : user?.role === "admin"
              ? "Admin"
              : "User";

  const isAdmin = user?.role === "admin";
  const isParent = user?.role === "parent";
  const isAthlete = user?.role === "athlete";

  const menuItems = isAdmin
    ? [
        // No "My Profile" for admin: there is no admin profile editor, and
        // /(tabs)/profile redirects admins straight back to the dashboard.
        // The user card above already shows their name/email/role badge.
        {
          icon: "settings-outline",
          label: "Settings",
          onPress: () => router.push("/settings"),
        },
        {
          icon: "help-circle-outline",
          label: "Help Center",
          onPress: () => router.push("/help-center"),
        },
        {
          icon: "information-circle-outline",
          label: "About GetDraft",
          onPress: () => router.push("/about"),
        },
      ]
    : [
        {
          icon: "person-outline",
          label: "My Profile",
          onPress: () => router.push("/(tabs)/profile"),
        },
        // Prospect rankings — every non-admin role cares: athletes see their
        // standing, recruiters scout the top of a division, parents follow
        // their athlete's rank.
        {
          icon: "trophy-outline" as const,
          label: "Rankings",
          onPress: () => router.push("/rankings"),
        },
        // "Who Drafted You" is athlete-side only; recruiters use Draft
        // Board, parents have the inbox.
        ...(isAthlete
          ? [
              {
                icon: "star-outline" as const,
                label: "Who Drafted You",
                onPress: () => router.push("/drafts-received"),
              },
            ]
          : []),
        {
          icon: "settings-outline",
          label: "Settings",
          onPress: () => router.push("/settings"),
        },
        // Parents get a quick route to the guardian-link flow so they can
        // replay the tutorial video and record their declaration without
        // digging through Settings.
        ...(isParent
          ? [
              {
                icon: "videocam-outline" as const,
                label: "Verify Guardian Link",
                onPress: () => router.push("/guardian-link"),
              },
            ]
          : []),
        // Billing lives on the athlete + recruiter side. Parents are
        // covered by their athlete's plan and never see a subscription
        // they could buy here.
        ...(isParent
          ? []
          : [
              {
                icon: "diamond-outline" as const,
                label: "My Subscription",
                onPress: () => router.push("/subscription"),
              },
            ]),
        {
          icon: "help-circle-outline",
          label: "Help Center",
          onPress: () => router.push("/help-center"),
        },
        {
          icon: "people-outline",
          label: "Invite Friends",
          onPress: () => router.push("/invite-friends"),
        },
        {
          icon: "information-circle-outline",
          label: "About GetDraft",
          onPress: () => router.push("/about"),
        },
      ];

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={styles.title}>More</Text>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
        showsVerticalScrollIndicator={false}
      >
        {user && (
          <Pressable
            style={({ pressed }) => [
              styles.userCard,
              !isAdmin && pressed && styles.menuItemPressed,
            ]}
            // Admin has no dedicated profile screen — their identity is shown
            // right here and logout is below, so the card is a static info
            // panel for them instead of a link that would only bounce back to
            // the dashboard.
            onPress={isAdmin ? undefined : () => router.push("/(tabs)/profile")}
          >
            <View style={styles.userAvatar}>
              {avatarUrl ? (
                <Image
                  source={{ uri: avatarUrl }}
                  style={styles.userAvatarImage}
                  resizeMode="cover"
                />
              ) : (
                <Ionicons name="person" size={28} color={brand.white} />
              )}
            </View>
            <View style={styles.userInfo}>
              <Text style={styles.userName}>{user.name ?? "User"}</Text>
              <Text style={styles.userEmail}>{user.email}</Text>
              <View style={styles.userRoleBadge}>
                <Text style={styles.userRoleText}>{roleLabel}</Text>
              </View>
            </View>
            {!isAdmin && (
              <Ionicons
                name="chevron-forward"
                size={20}
                color={theme.textMuted}
              />
            )}
          </Pressable>
        )}

        <View style={styles.menuCard}>
          {menuItems.map((item, idx) => (
            <Pressable
              key={item.label}
              style={({ pressed }) => [
                styles.menuItem,
                idx === menuItems.length - 1 && styles.menuItemLast,
                pressed && styles.menuItemPressed,
              ]}
              onPress={item.onPress}
            >
              <Ionicons name={item.icon as any} size={22} color={theme.text} />
              <Text style={styles.menuLabel}>{item.label}</Text>
              <Ionicons
                name="chevron-forward"
                size={18}
                color={theme.textMuted}
              />
            </Pressable>
          ))}
        </View>

        <View style={styles.logoutCard}>
          <Pressable
            style={({ pressed }) => [
              styles.menuItem,
              styles.menuItemLast,
              pressed && styles.menuItemPressed,
            ]}
            onPress={handleLogout}
          >
            <Ionicons name="log-out-outline" size={22} color={semantic.error} />
            <Text style={styles.logoutLabel}>Log out</Text>
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
    paddingHorizontal: 24,
    paddingVertical: 16,
    backgroundColor: theme.headerBg,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  title: {
    fontSize: 24,
    fontFamily: "Poppins_600SemiBold",
    color: theme.text,
  },
  scroll: {
    flex: 1,
  },
  userCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    backgroundColor: theme.cardBg,
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 16,
    padding: 16,
  },
  userAvatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: brand.primary,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  userAvatarImage: {
    width: "100%",
    height: "100%",
  },
  userInfo: {
    flex: 1,
    gap: 2,
  },
  userName: {
    fontSize: 17,
    fontFamily: "Poppins_600SemiBold",
    color: theme.text,
  },
  userEmail: {
    fontSize: 13,
    fontFamily: "Poppins_400Regular",
    color: theme.textSecondary,
  },
  userRoleBadge: {
    marginTop: 4,
    alignSelf: "flex-start",
    backgroundColor: theme.badgeBg,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  userRoleText: {
    fontSize: 11,
    fontFamily: "Poppins_500Medium",
    color: theme.badgeText,
  },
  menuCard: {
    backgroundColor: theme.cardBg,
    marginTop: 16,
    marginHorizontal: 16,
    borderRadius: 16,
    overflow: "hidden",
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 15,
    paddingHorizontal: 18,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
    gap: 14,
  },
  menuItemLast: {
    borderBottomWidth: 0,
  },
  menuItemPressed: {
    backgroundColor: theme.pressed,
  },
  menuLabel: {
    flex: 1,
    fontSize: 15,
    fontFamily: "Poppins_500Medium",
    color: theme.text,
  },
  logoutCard: {
    backgroundColor: theme.cardBg,
    marginTop: 16,
    marginHorizontal: 16,
    borderRadius: 16,
    overflow: "hidden",
  },
  logoutLabel: {
    flex: 1,
    fontSize: 15,
    fontFamily: "Poppins_500Medium",
    color: semantic.error,
  },
});
