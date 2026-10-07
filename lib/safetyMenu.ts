import { Alert } from "react-native";
import type { ReportTarget } from "@/components/ReportSheet";
import { usersService } from "@/services/users";
import { apiErrorMessage } from "@/services/api";

/**
 * The "..." menu in a conversation header: Report or Block the other person.
 * Both conversation screens use it, so blocking from a chat behaves exactly
 * like blocking from the profile (app/user/[userId].tsx).
 */
export function openSafetyMenu({
  userId,
  name,
  onReport,
  onBlocked,
}: {
  userId: string;
  name?: string;
  onReport: (target: ReportTarget) => void;
  /** Called once the block is saved; the conversation is closed by then. */
  onBlocked: () => void;
}) {
  Alert.alert("More", undefined, [
    {
      text: "Report",
      onPress: () =>
        onReport({
          targetType: "user",
          reportedUserId: userId,
          label: name || undefined,
        }),
    },
    {
      text: "Block",
      style: "destructive",
      onPress: () => confirmBlock(userId, name, onBlocked),
    },
    { text: "Cancel", style: "cancel" },
  ]);
}

function confirmBlock(userId: string, name: string | undefined, onBlocked: () => void) {
  Alert.alert(
    name ? `Block ${name}?` : "Block this user?",
    "They won’t be able to see your profile, draft you, or message you. You can unblock them later in Settings, under Blocked accounts.",
    [
      { text: "Cancel", style: "cancel" },
      {
        text: "Block",
        style: "destructive",
        onPress: async () => {
          try {
            await usersService.blockUser(userId);
            onBlocked();
          } catch (err) {
            Alert.alert("Could not block", apiErrorMessage(err, "Try again in a moment."));
          }
        },
      },
    ],
  );
}
