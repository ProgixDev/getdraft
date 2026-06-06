import React, { useMemo, useState } from "react";
import {
  View,
  StyleSheet,
  Text,
  Pressable,
  ScrollView,
  TextInput,
  Linking,
  Alert,
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

const FAQ_ITEMS = [
  {
    icon: "heart-outline" as const,
    question: "How do matches work?",
    answer:
      "When you and a recruiter both express interest in each other, it's a match! You'll see a celebration screen, and the recruiter will appear in your Matches tab where you can start a conversation.",
  },
  {
    icon: "person-outline" as const,
    question: "How do I improve my profile?",
    answer:
      "Add photos and highlight videos, fill out your bio, and complete all athletic info including height, weight, GPA, and 40-yard dash time. A complete profile is much more likely to attract recruiter attention. Check your Profile Strength score on the Profile tab.",
  },
  {
    icon: "card-outline" as const,
    question: "Is GetDraft free?",
    answer:
      "Athletes get a free Basic plan with 10 swipes per day and core features. Upgrade to Starter, Pro, or Premium for more swipes, advanced filters, and premium features like seeing who liked you.",
  },
  {
    icon: "chatbubble-outline" as const,
    question: "How do I contact a recruiter?",
    answer:
      'Once you match with a recruiter, a chat thread opens automatically. Go to the Matches tab, tap on a match, and start messaging. You can also use the "Ask for a call" button in the chat header.',
  },
  {
    icon: "refresh-outline" as const,
    question: "Can I undo a swipe?",
    answer:
      "Currently, swipes cannot be undone. Take your time reviewing each recruiter's profile before making a decision. This feature may be added in a future update.",
  },
  {
    icon: "trash-outline" as const,
    question: "How do I delete my account?",
    answer:
      "Go to More > Settings > Account > Delete Account. This will permanently remove your profile, matches, and messages. This action cannot be undone.",
  },
  {
    icon: "eye-outline" as const,
    question: "Who can see my profile?",
    answer:
      "By default, your profile is visible to all verified recruiters, coaches, and agents on the platform. You can hide your profile from search in Settings > Privacy > Profile Visible to Recruiters.",
  },
];

export default function HelpCenterScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);

  const [fontsLoaded] = useFonts({
    Poppins_400Regular,
    Poppins_500Medium,
    Poppins_600SemiBold,
    Poppins_700Bold,
  });

  const filteredFaq = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (q.length === 0) return FAQ_ITEMS;
    return FAQ_ITEMS.filter(
      (item) =>
        item.question.toLowerCase().includes(q) ||
        item.answer.toLowerCase().includes(q),
    );
  }, [searchQuery]);

  if (!fontsLoaded) return null;

  const toggleExpand = (index: number) => {
    setExpandedIndex((prev) => (prev === index ? null : index));
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable style={styles.headerButton} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={22} color={theme.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Help Center</Text>
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
        {/* Search */}
        <View style={styles.searchBar}>
          <Ionicons name="search" size={20} color={theme.textMuted} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search help articles..."
            placeholderTextColor={theme.inputPlaceholder}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery.length > 0 && (
            <Pressable onPress={() => setSearchQuery("")}>
              <Ionicons name="close-circle" size={18} color={theme.textMuted} />
            </Pressable>
          )}
        </View>

        {/* FAQ Section */}
        <Text style={styles.sectionHeading}>Frequently Asked Questions</Text>

        {filteredFaq.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="search-outline" size={40} color={theme.textMuted} />
            <Text style={styles.emptyText}>No results found</Text>
            <Text style={styles.emptySubtext}>Try a different search term</Text>
          </View>
        ) : (
          <View style={styles.faqList}>
            {filteredFaq.map((item, idx) => {
              const isExpanded = expandedIndex === idx;
              return (
                <Pressable
                  key={item.question}
                  style={[styles.faqCard, isExpanded && styles.faqCardExpanded]}
                  onPress={() => toggleExpand(idx)}
                >
                  <View style={styles.faqHeader}>
                    <Ionicons name={item.icon} size={20} color={theme.text} />
                    <Text style={styles.faqQuestion}>{item.question}</Text>
                    <Ionicons
                      name={isExpanded ? "chevron-up" : "chevron-down"}
                      size={18}
                      color={theme.textMuted}
                    />
                  </View>
                  {isExpanded && (
                    <Text style={styles.faqAnswer}>{item.answer}</Text>
                  )}
                </Pressable>
              );
            })}
          </View>
        )}

        {/* Contact Section */}
        <View style={styles.contactSection}>
          <Text style={styles.contactTitle}>Still need help?</Text>

          <Pressable
            style={({ pressed }) => [
              styles.contactRow,
              pressed && styles.contactRowPressed,
            ]}
            onPress={() => Linking.openURL("mailto:support@getdraft.com")}
          >
            <View style={styles.contactIcon}>
              <Ionicons name="mail-outline" size={20} color={theme.text} />
            </View>
            <View style={styles.contactCopy}>
              <Text style={styles.contactLabel}>Email Support</Text>
              <Text style={styles.contactValue}>support@getdraft.com</Text>
            </View>
            <Ionicons name="open-outline" size={16} color={theme.textMuted} />
          </Pressable>

          <Pressable
            style={({ pressed }) => [
              styles.contactRow,
              styles.contactRowLast,
              pressed && styles.contactRowPressed,
            ]}
            onPress={() =>
              Alert.alert("Replay Tutorial", "Tutorial replay is coming soon!")
            }
          >
            <View style={styles.contactIcon}>
              <Ionicons
                name="play-circle-outline"
                size={20}
                color={theme.text}
              />
            </View>
            <View style={styles.contactCopy}>
              <Text style={styles.contactLabel}>Replay Tutorial</Text>
              <Text style={styles.contactValue}>Learn how GetDraft works</Text>
            </View>
            <Ionicons
              name="chevron-forward"
              size={16}
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
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: theme.surface,
    borderRadius: 14,
    paddingHorizontal: 14,
    height: 48,
    gap: 10,
    borderWidth: 1,
    borderColor: theme.border,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    fontFamily: "Poppins_400Regular",
    color: theme.inputText,
  },
  sectionHeading: {
    fontSize: 18,
    fontFamily: "Poppins_600SemiBold",
    color: theme.text,
  },
  emptyState: {
    alignItems: "center",
    paddingVertical: 40,
  },
  emptyText: {
    fontSize: 16,
    fontFamily: "Poppins_600SemiBold",
    color: theme.text,
    marginTop: 12,
  },
  emptySubtext: {
    fontSize: 14,
    fontFamily: "Poppins_400Regular",
    color: theme.textMuted,
    marginTop: 4,
  },
  faqList: {
    gap: 10,
  },
  faqCard: {
    backgroundColor: theme.cardBg,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.cardBorder,
    padding: 16,
  },
  faqCardExpanded: {
    borderColor: theme.accent,
  },
  faqHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  faqQuestion: {
    flex: 1,
    fontSize: 15,
    fontFamily: "Poppins_500Medium",
    color: theme.text,
  },
  faqAnswer: {
    fontSize: 14,
    fontFamily: "Poppins_400Regular",
    color: theme.textSecondary,
    lineHeight: 22,
    marginTop: 12,
    paddingLeft: 32,
  },
  contactSection: {
    backgroundColor: theme.cardBg,
    borderRadius: 16,
    padding: 20,
  },
  contactTitle: {
    fontSize: 16,
    fontFamily: "Poppins_600SemiBold",
    color: theme.text,
    marginBottom: 14,
  },
  contactRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
    gap: 12,
  },
  contactRowLast: {
    borderBottomWidth: 0,
  },
  contactRowPressed: {
    opacity: 0.7,
  },
  contactIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: theme.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  contactCopy: {
    flex: 1,
  },
  contactLabel: {
    fontSize: 15,
    fontFamily: "Poppins_500Medium",
    color: theme.text,
  },
  contactValue: {
    fontSize: 13,
    fontFamily: "Poppins_400Regular",
    color: theme.textMuted,
    marginTop: 1,
  },
});
