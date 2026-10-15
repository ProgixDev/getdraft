import { useCallback, useState } from "react";
import { Alert } from "react-native";
import { useDispatch } from "react-redux";
import { usersService } from "@/services/users";
import { subscriptionsService } from "@/services/subscriptions";
import { openManageSubscriptions } from "@/services/billing";
import { chatService } from "@/services/chat";
import { clearTokens } from "@/services/api";
import { clearAuth } from "@/store/authStorage";
import { logout } from "@/store/slices/authSlice";

/**
 * Permanent account deletion, shared by Settings and the profile screen.
 *
 * Extracted rather than copied: the two entry points must not be able to
 * drift into deleting different things, or into one of them forgetting the
 * local teardown and leaving the app holding tokens for a user that no
 * longer exists.
 *
 * Two confirmations on purpose. This is irreversible on the server — the
 * backend removes the auth row, every table cascades off it, and
 * purgeUserMedia clears the five storage buckets, because storage does NOT
 * cascade and a deleted user's photos would otherwise stay downloadable.
 */
export function useDeleteAccount() {
  const dispatch = useDispatch();
  const [deleting, setDeleting] = useState(false);

  const askToDelete = useCallback(() => {
    Alert.alert(
      "Delete Account",
      "Are you sure? This action cannot be undone. All your data, matches, and messages will be permanently deleted.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () =>
            Alert.alert(
              "Permanently delete your account?",
              "This will erase your profile, photos, posts, matches, and messages. This cannot be undone.",
              [
                { text: "Cancel", style: "cancel" },
                {
                  text: "Delete",
                  style: "destructive",
                  onPress: async () => {
                    setDeleting(true);
                    try {
                      await usersService.deleteAccount();

                      // Tear the local session down WITHOUT calling
                      // /auth/logout: the backend user is already gone, so
                      // that request would 401 and trip the session-expired
                      // handler in api.ts. The _layout effect sees
                      // !isAuthenticated and routes back to auth.
                      await clearTokens().catch(() => {});
                      await clearAuth().catch(() => {});
                      try {
                        chatService.disconnectSocket();
                      } catch {
                        // ignore socket teardown errors
                      }
                      dispatch(logout());
                    } catch {
                      setDeleting(false);
                      Alert.alert(
                        "Couldn't delete your account",
                        "Please try again.",
                      );
                    }
                  },
                },
              ],
            ),
        },
      ],
    );
  }, [dispatch]);

  // Deleting the account cannot cancel a subscription billed by Apple or
  // Google: only the store can. Without this warning the store keeps
  // charging a user who believes they left, which Apple's account-deletion
  // rules ask apps to prevent.
  const confirmDelete = useCallback(async () => {
    if (deleting) return;
    const store = await activeStoreSubscription();
    if (!store) {
      askToDelete();
      return;
    }
    const where = store === "apple" ? "the App Store" : "Google Play";
    const Where = store === "apple" ? "The App Store" : "Google Play";
    Alert.alert(
      `Your subscription is billed by ${where}`,
      `Deleting your account does not cancel it. ${Where} keeps charging you until you cancel it there.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Manage subscription",
          onPress: () => {
            openManageSubscriptions().catch(() => {});
          },
        },
        { text: "Delete anyway", style: "destructive", onPress: askToDelete },
      ],
    );
  }, [deleting, askToDelete]);

  return { confirmDelete, deleting };
}

/** "apple" / "google" when a store-billed plan is in force, else null. */
async function activeStoreSubscription(): Promise<"apple" | "google" | null> {
  try {
    const sub = await subscriptionsService.getMySubscription();
    const store = sub?.store;
    if (
      (store === "apple" || store === "google") &&
      sub?.status === "active" &&
      sub?.plan_id &&
      sub.plan_id !== "basic"
    ) {
      return store;
    }
  } catch {
    // Unknown: deletion is not blocked on a failed lookup.
  }
  return null;
}
