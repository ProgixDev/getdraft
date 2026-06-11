import React, { useEffect } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import { useSelector } from "react-redux";
import { theme } from "@/config/colors";
import { RootState } from "@/store";

/**
 * Parent guardian home — Phase 2 builds the full dashboard here. For now
 * this is a placeholder that redirects anyone who lands on `/(tabs)/home`
 * back to their proper tab so the Phase 1 admin layout can compile.
 */
export default function GuardianHomePlaceholder() {
  const role = useSelector((s: RootState) => s.auth.user?.role);
  const router = useRouter();

  useEffect(() => {
    if (role === "admin") router.replace("/(tabs)/dashboard");
    else if (role !== "parent") router.replace("/(tabs)");
  }, [role, router]);

  return (
    <View style={styles.center}>
      <ActivityIndicator size="large" color={theme.text} />
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    backgroundColor: theme.bg,
    alignItems: "center",
    justifyContent: "center",
  },
});
