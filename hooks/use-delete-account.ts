import { useCallback, useState } from "react";
import { Alert } from "react-native";
import { useDispatch } from "react-redux";
import { usersService } from "@/services/users";
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

  const confirmDelete = useCallback(() => {
    if (deleting) return;

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
  }, [deleting, dispatch]);

  return { confirmDelete, deleting };
}
