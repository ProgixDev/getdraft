import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Image as ExpoImage } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import {
  useFonts,
  Poppins_400Regular,
  Poppins_500Medium,
  Poppins_600SemiBold,
  Poppins_700Bold,
} from "@expo-google-fonts/poppins";

import { brand, theme } from "@/config/colors";
import { usersService } from "@/services/users";
import { conversationsService } from "@/services/conversations";

type SearchResult = {
  id: string;
  name: string;
  avatarUrl: string | null;
  role: string | null;
};

const SEARCH_DEBOUNCE_MS = 300;

export default function NewMessageScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [fontsLoaded] = useFonts({
    Poppins_400Regular,
    Poppins_500Medium,
    Poppins_600SemiBold,
    Poppins_700Bold,
  });

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [emptyAfterSearch, setEmptyAfterSearch] = useState(false);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seq = useRef(0);

  useEffect(() => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    const q = query.trim();
    if (q.length === 0) {
      setResults([]);
      setSearching(false);
      setEmptyAfterSearch(false);
      setErrorMsg(null);
      return;
    }
    debounceTimer.current = setTimeout(() => {
      runSearch(q);
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  const runSearch = useCallback(async (q: string) => {
    const mySeq = ++seq.current;
    setSearching(true);
    setErrorMsg(null);
    setEmptyAfterSearch(false);
    try {
      const rows = await usersService.searchUsers(q, 20);
      if (mySeq !== seq.current) return;
      setResults(rows);
      setEmptyAfterSearch(rows.length === 0);
    } catch (err: any) {
      if (mySeq !== seq.current) return;
      const msg =
        err?.response?.data?.message ?? err?.message ?? "Search failed";
      setErrorMsg(Array.isArray(msg) ? msg.join(", ") : String(msg));
      setResults([]);
    } finally {
      if (mySeq === seq.current) setSearching(false);
    }
  }, []);

  const handleSelect = useCallback(
    async (user: SearchResult) => {
      if (openingId) return;
      setOpeningId(user.id);
      setErrorMsg(null);
      try {
        const { id } = await conversationsService.getOrCreate(user.id);
        router.replace({
          pathname: "/dm/[conversationId]",
          params: {
            conversationId: id,
            otherName: user.name,
            otherAvatarUrl: user.avatarUrl ?? "",
            otherRole: user.role ?? "",
          },
        });
      } catch (err: any) {
        const msg =
          err?.response?.data?.message ??
          err?.message ??
          "Could not open conversation.";
        setErrorMsg(Array.isArray(msg) ? msg.join(", ") : String(msg));
      } finally {
        setOpeningId(null);
      }
    },
    [openingId, router],
  );

  if (!fontsLoaded) return null;

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={[styles.header, { paddingTop: insets.top + 6 }]}>
        <Pressable style={styles.headerBtn} onPress={() => router.back()}>
          <Ionicons name="close" size={22} color={theme.text} />
        </Pressable>
        <Text style={styles.title}>New message</Text>
        <View style={styles.headerBtn} />
      </View>

      <View style={styles.searchBar}>
        <Ionicons
          name="search"
          size={16}
          color={theme.textMuted}
          style={styles.searchIcon}
        />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search by name…"
          placeholderTextColor={theme.inputPlaceholder}
          style={styles.searchInput}
          autoCorrect={false}
          autoCapitalize="words"
          autoFocus
        />
        {searching && (
          <ActivityIndicator
            size="small"
            color={theme.textMuted}
            style={styles.searchSpinner}
          />
        )}
      </View>

      {errorMsg && (
        <View style={styles.errorBox}>
          <Ionicons name="alert-circle" size={16} color="#FF7675" />
          <Text style={styles.errorText}>{errorMsg}</Text>
        </View>
      )}

      <ScrollView
        style={styles.list}
        contentContainerStyle={[
          styles.listContent,
          { paddingBottom: insets.bottom + 24 },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {query.trim().length === 0 ? (
          <View style={styles.centerHint}>
            <Ionicons
              name="people-outline"
              size={32}
              color={theme.textMuted}
            />
            <Text style={styles.hintTitle}>Find someone to message</Text>
            <Text style={styles.hintSubtitle}>
              Type a name to search across all GetDraft members.
            </Text>
          </View>
        ) : results.length === 0 && !searching && emptyAfterSearch ? (
          <View style={styles.centerHint}>
            <Ionicons
              name="search-outline"
              size={32}
              color={theme.textMuted}
            />
            <Text style={styles.hintTitle}>No matches</Text>
            <Text style={styles.hintSubtitle}>
              Try a different spelling or a partial name.
            </Text>
          </View>
        ) : (
          results.map((u) => (
            <Pressable
              key={u.id}
              style={({ pressed }) => [
                styles.row,
                pressed && styles.rowPressed,
                openingId === u.id && styles.rowOpening,
              ]}
              onPress={() => handleSelect(u)}
              disabled={!!openingId}
            >
              {u.avatarUrl ? (
                <ExpoImage
                  source={{ uri: u.avatarUrl }}
                  style={styles.avatar}
                  contentFit="cover"
                />
              ) : (
                <View style={[styles.avatar, styles.avatarFallback]}>
                  <Ionicons name="person" size={18} color={theme.textMuted} />
                </View>
              )}
              <View style={styles.rowText}>
                <Text style={styles.rowName} numberOfLines={1}>
                  {u.name || "Unnamed"}
                </Text>
                {u.role ? (
                  <Text style={styles.rowRole} numberOfLines={1}>
                    {u.role}
                  </Text>
                ) : null}
              </View>
              {openingId === u.id ? (
                <ActivityIndicator size="small" color={theme.text} />
              ) : (
                <Ionicons
                  name="chevron-forward"
                  size={16}
                  color={theme.textMuted}
                />
              )}
            </Pressable>
          ))
        )}
      </ScrollView>
    </KeyboardAvoidingView>
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
    paddingHorizontal: 14,
    paddingBottom: 10,
    backgroundColor: theme.headerBg,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  headerBtn: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontSize: 18,
    fontFamily: "Poppins_700Bold",
    color: theme.text,
  },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    margin: 14,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: theme.inputBorder,
    backgroundColor: theme.inputBg,
    borderRadius: 12,
  },
  searchIcon: {
    marginRight: 6,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 11,
    fontFamily: "Poppins_400Regular",
    color: theme.inputText,
    fontSize: 14,
  },
  searchSpinner: {
    marginLeft: 6,
  },
  errorBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginHorizontal: 14,
    marginBottom: 6,
    backgroundColor: "rgba(231,76,60,0.12)",
    borderColor: "rgba(231,76,60,0.6)",
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  errorText: {
    flex: 1,
    fontSize: 12,
    fontFamily: "Poppins_500Medium",
    color: "#FF7675",
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: 14,
    gap: 8,
  },
  centerHint: {
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 60,
    paddingHorizontal: 24,
    gap: 6,
  },
  hintTitle: {
    marginTop: 6,
    fontSize: 15,
    fontFamily: "Poppins_600SemiBold",
    color: theme.text,
  },
  hintSubtitle: {
    fontSize: 12,
    fontFamily: "Poppins_400Regular",
    color: theme.textSecondary,
    textAlign: "center",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.border,
    backgroundColor: theme.surface,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  rowPressed: {
    opacity: 0.85,
  },
  rowOpening: {
    opacity: 0.7,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: theme.surfaceSecondary,
  },
  avatarFallback: {
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: theme.border,
  },
  rowText: {
    flex: 1,
  },
  rowName: {
    fontSize: 14,
    fontFamily: "Poppins_600SemiBold",
    color: theme.text,
  },
  rowRole: {
    marginTop: 2,
    fontSize: 11,
    fontFamily: "Poppins_500Medium",
    color: theme.textMuted,
    textTransform: "capitalize",
  },
});
