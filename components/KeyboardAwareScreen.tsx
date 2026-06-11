import React from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  StyleProp,
  ViewStyle,
} from "react-native";

interface Props {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  contentContainerStyle?: StyleProp<ViewStyle>;
  // Account for a sticky header above the scroll surface. Pass the header's
  // pixel height (including safe-area inset) — iOS uses this so the input
  // ends up directly above the keyboard instead of behind the header.
  keyboardVerticalOffset?: number;
  // When the screen has its own native scroll (FlatList, chat, etc.), skip
  // the inner ScrollView and just wrap in KeyboardAvoidingView.
  withoutScroll?: boolean;
  // Some screens (chat tail input) want taps OUTSIDE inputs to dismiss the
  // keyboard; others (forms) want taps on neighbouring buttons to still
  // fire while the keyboard is open — "handled" satisfies both.
  keyboardShouldPersistTaps?: "always" | "never" | "handled";
}

// Cross-platform keyboard handling. Android relies on
// android.softwareKeyboardLayoutMode = "resize" in app.json to resize the
// window when the keyboard opens; iOS needs the padding behavior on
// KeyboardAvoidingView. This component encapsulates both so screens don't
// each rediscover the right config.
export default function KeyboardAwareScreen({
  children,
  style,
  contentContainerStyle,
  keyboardVerticalOffset = 0,
  withoutScroll = false,
  keyboardShouldPersistTaps = "handled",
}: Props) {
  return (
    <KeyboardAvoidingView
      style={[styles.flex, style]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={keyboardVerticalOffset}
    >
      {withoutScroll ? (
        children
      ) : (
        <ScrollView
          style={styles.flex}
          contentContainerStyle={[styles.grow, contentContainerStyle]}
          keyboardShouldPersistTaps={keyboardShouldPersistTaps}
          showsVerticalScrollIndicator={false}
        >
          {children}
        </ScrollView>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  grow: { flexGrow: 1 },
});
