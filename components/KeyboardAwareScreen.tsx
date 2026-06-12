import React from "react";
import { StyleSheet, StyleProp, ViewStyle } from "react-native";
import {
  KeyboardAvoidingView,
  KeyboardAwareScrollView,
} from "react-native-keyboard-controller";

interface Props {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  contentContainerStyle?: StyleProp<ViewStyle>;
  // Account for a sticky header above the scroll surface. Pass the header's
  // pixel height (including safe-area inset) — the library uses it so the
  // focused field lands above the keyboard instead of behind the header.
  keyboardVerticalOffset?: number;
  // When the screen has its own native scroll (FlatList, chat, etc.), skip
  // the inner ScrollView and just wrap in KeyboardAvoidingView.
  withoutScroll?: boolean;
  keyboardShouldPersistTaps?: "always" | "never" | "handled";
  // Extra gap between the focused input and the top of the keyboard.
  bottomOffset?: number;
}

export default function KeyboardAwareScreen({
  children,
  style,
  contentContainerStyle,
  keyboardVerticalOffset = 0,
  withoutScroll = false,
  keyboardShouldPersistTaps = "handled",
  bottomOffset = 20,
}: Props) {
  if (withoutScroll) {
    return (
      <KeyboardAvoidingView
        style={[styles.flex, style]}
        behavior="padding"
        keyboardVerticalOffset={keyboardVerticalOffset}
      >
        {children}
      </KeyboardAvoidingView>
    );
  }

  return (
    <KeyboardAwareScrollView
      style={[styles.flex, style]}
      contentContainerStyle={[styles.grow, contentContainerStyle]}
      keyboardShouldPersistTaps={keyboardShouldPersistTaps}
      showsVerticalScrollIndicator={false}
      bottomOffset={bottomOffset}
    >
      {children}
    </KeyboardAwareScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  grow: { flexGrow: 1 },
});
