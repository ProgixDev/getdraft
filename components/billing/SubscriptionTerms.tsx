import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { theme } from "@/config/colors";
import { restorePurchases } from "@/services/billing";

const TERMS_URL = "https://api.getdraft.net/api/terms";
const PRIVACY_URL = "https://api.getdraft.net/api/privacy";

const STORE = Platform.OS === "ios" ? "Apple ID" : "Google Play account";
const MANAGE = Platform.OS === "ios" ? "App Store" : "Google Play";

/**
 * What App Store guideline 3.1.2 requires next to an auto-renewing
 * subscription: that it renews, how to cancel, links to the Terms and
 * Privacy Policy, and a way to restore purchases.
 */
export function SubscriptionTerms({
  onRestored,
}: {
  onRestored?: () => void;
}) {
  const [restoring, setRestoring] = useState(false);

  const handleRestore = async () => {
    if (restoring) return;
    setRestoring(true);
    try {
      const { restored, ownedElsewhere } = await restorePurchases();
      if (restored > 0) {
        onRestored?.();
        Alert.alert("Purchases restored", "Your plan is up to date.");
      } else if (ownedElsewhere > 0) {
        Alert.alert(
          "Nothing to restore",
          `The purchases on this ${STORE} belong to another GetDraft account.`,
        );
      } else {
        Alert.alert(
          "Nothing to restore",
          `No purchases were found for this ${STORE}.`,
        );
      }
    } finally {
      setRestoring(false);
    }
  };

  return (
    <View style={styles.wrap}>
      <Text style={styles.disclosure}>
        Subscriptions renew automatically each month at the price shown until
        cancelled. Payment is charged to your {STORE}. Cancel at least 24 hours
        before the end of the current period to avoid being charged again;
        manage or cancel any time in your {MANAGE} account settings.
      </Text>
      <View style={styles.links}>
        <Text style={styles.link} onPress={() => Linking.openURL(TERMS_URL)}>
          Terms of Use
        </Text>
        <Text style={styles.dot}>·</Text>
        <Text style={styles.link} onPress={() => Linking.openURL(PRIVACY_URL)}>
          Privacy Policy
        </Text>
      </View>
      <Pressable
        style={styles.restore}
        onPress={handleRestore}
        disabled={restoring}
      >
        {restoring ? (
          <ActivityIndicator color={theme.text} />
        ) : (
          <Text style={styles.restoreText}>Restore Purchases</Text>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginTop: 20,
    alignItems: "center",
    gap: 10,
  },
  disclosure: {
    fontSize: 11,
    lineHeight: 16,
    fontFamily: "Poppins_400Regular",
    color: theme.textMuted,
    textAlign: "center",
  },
  links: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  link: {
    fontSize: 12,
    fontFamily: "Poppins_500Medium",
    color: theme.textSecondary,
    textDecorationLine: "underline",
  },
  dot: {
    color: theme.textMuted,
  },
  restore: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    minHeight: 40,
    justifyContent: "center",
  },
  restoreText: {
    fontSize: 14,
    fontFamily: "Poppins_600SemiBold",
    color: theme.text,
  },
});
