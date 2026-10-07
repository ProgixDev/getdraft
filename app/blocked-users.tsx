import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Image as ExpoImage } from "expo-image";
import {
  useFonts,
  Poppins_400Regular,
  Poppins_500Medium,
  Poppins_600SemiBold,
} from "@expo-google-fonts/poppins";
import { theme } from "@/config/colors";
import { usersService } from "@/services/users";
import { apiErrorMessage } from "@/services/api";
import { roleDisplayLabel } from "@/lib/roles";

type BlockedRow = {
  userId: string;
  name: string;
  avatarUrl: string | null;
  role: string | null;
};

/**
 * Settings → Privacy → Blocked accounts. Blocking said "you can unblock them
 * later in Settings", but no screen listed them, so a block was permanent.
 */
export default function BlockedUsersScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [rows, setRows] = useState<BlockedRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [fontsLoaded] = useFonts({
    Poppins_400Regular,
    Poppins_500Medium,
    Poppins_600SemiBold,
  });

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const list = await usersService.listMyBlocks();
      setRows(
        list.map((b) => ({
          userId: String(b.blocked?.id ?? b.blocked_id),
          name: b.blocked?.name?.trim() || "Deleted account",
          avatarUrl: b.blocked?.avatar_url ?? null,
          role: b.blocked?.role ?? null,
        })),
      );
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const unblock = (row: BlockedRow) => {
    Alert.alert(
      `Unblock ${row.name}?`,
      "They will be able to see your profile, Draft you and message you again.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Unblock",
          onPress: async () => {
            setBusyId(row.userId);
            try {
              await usersService.unblockUser(row.userId);
              setRows((prev) => prev.filter((r) => r.userId !== row.userId));
            } catch (err) {
              Alert.alert(
                "Could not unblock",
                apiErrorMessage(err, "Please try again in a moment."),
              );
            } finally {
              setBusyId(null);
            }
          },
        },
      ],
    );
  };

  if (!fontsLoaded) return null;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable
          style={styles.headerButton}
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          <Ionicons name="chevron-back" size={22} color={theme.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Blocked accounts</Text>
        <View style={styles.headerButton} />
      </View>

      {loading && rows.length === 0 ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={theme.text} />
        </View>
      ) : loadError ? (
        <View style={styles.center}>
          <Ionicons name="cloud-offline-outline" size={40} color={theme.textMuted} />
          <Text style={styles.emptyText}>Couldn't load your blocked accounts.</Text>
          <Pressable style={styles.retryButton} onPress={load}>
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        </View>
      ) : rows.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="ban-outline" size={40} color={theme.textMuted} />
          <Text style={styles.emptyText}>You haven't blocked anyone.</Text>
        </View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(r) => r.userId}
          contentContainerStyle={{
            padding: 16,
            paddingBottom: insets.bottom + 24,
          }}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          renderItem={({ item }) => (
            <View style={styles.row}>
              {item.avatarUrl ? (
                <ExpoImage source={{ uri: item.avatarUrl }} style={styles.avatar} />
              ) : (
                <View style={[styles.avatar, styles.avatarFallback]}>
                  <Ionicons name="person" size={20} color={theme.textMuted} />
                </View>
              )}
              <View style={styles.rowCopy}>
                <Text style={styles.rowName} numberOfLines={1}>
                  {item.name}
                </Text>
                {item.role ? (
                  <Text style={styles.rowRole}>{roleDisplayLabel(item.role)}</Text>
                ) : null}
              </View>
              <Pressable
                style={({ pressed }) => [
                  styles.unblockButton,
                  pressed && { opacity: 0.8 },
                ]}
                onPress={() => unblock(item)}
                disabled={busyId !== null}
                accessibilityRole="button"
                accessibilityLabel={`Unblock ${item.name}`}
              >
                {busyId === item.userId ? (
                  <ActivityIndicator size="small" color={theme.text} />
                ) : (
                  <Text style={styles.unblockText}>Unblock</Text>
                )}
              </Pressable>
            </View>
          )}
        />
      )}
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
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    padding: 24,
  },
  emptyText: {
    fontSize: 14,
    fontFamily: "Poppins_400Regular",
    color: theme.textSecondary,
    textAlign: "center",
  },
  retryButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.border,
  },
  retryText: {
    fontSize: 14,
    fontFamily: "Poppins_500Medium",
    color: theme.text,
  },
  separator: {
    height: 1,
    backgroundColor: theme.border,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  avatarFallback: {
    backgroundColor: theme.cardBg,
    alignItems: "center",
    justifyContent: "center",
  },
  rowCopy: {
    flex: 1,
  },
  rowName: {
    fontSize: 15,
    fontFamily: "Poppins_500Medium",
    color: theme.text,
  },
  rowRole: {
    fontSize: 12,
    fontFamily: "Poppins_400Regular",
    color: theme.textMuted,
  },
  unblockButton: {
    minWidth: 84,
    minHeight: 36,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: theme.border,
    alignItems: "center",
    justifyContent: "center",
  },
  unblockText: {
    fontSize: 13,
    fontFamily: "Poppins_600SemiBold",
    color: theme.text,
  },
});
