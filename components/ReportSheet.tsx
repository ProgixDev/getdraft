import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { semantic, theme } from "@/config/colors";
import {
  REPORT_REASONS,
  reportsService,
  type ReportReason,
  type ReportTargetType,
} from "@/services/reports";

export type ReportTarget = {
  targetType: ReportTargetType;
  /** Omitted for a whole-user report. */
  targetId?: string;
  reportedUserId: string;
  /** Shown in the title so the reporter can see who/what they are reporting. */
  label?: string;
};

/**
 * Reason picker for reporting a user, post, comment or message.
 *
 * A sheet rather than an Alert: there are six reasons, and Android renders
 * more than three Alert buttons as a cramped stack that is easy to mis-tap --
 * the last thing you want between someone being harassed and them reporting
 * it.
 *
 * One component for every surface (profile, post, chat) on purpose. The same
 * reasoning as useDeleteAccount: three copies of a reporting flow drift, and
 * the one that drifts is the one that quietly stops sending the report.
 */
export function ReportSheet({
  visible,
  target,
  onClose,
}: {
  visible: boolean;
  target: ReportTarget | null;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [submitting, setSubmitting] = useState<ReportReason | null>(null);

  const submit = useCallback(
    async (reason: ReportReason) => {
      if (!target || submitting) return;
      setSubmitting(reason);
      try {
        await reportsService.create({
          targetType: target.targetType,
          targetId: target.targetId,
          reportedUserId: target.reportedUserId,
          reason,
        });
        onClose();
        // Deliberately confirms receipt without promising an outcome or a
        // timeline we cannot keep.
        Alert.alert(
          "Report sent",
          "Thanks for telling us. Our team will review this.",
        );
      } catch (err: any) {
        const msg =
          err?.response?.data?.message ??
          err?.message ??
          "Please try again in a moment.";
        Alert.alert("Couldn't send the report", String(msg));
      } finally {
        setSubmitting(null);
      }
    },
    [target, submitting, onClose],
  );

  const what =
    target?.targetType === "user"
      ? target?.label
        ? `Report ${target.label}`
        : "Report this user"
      : `Report this ${target?.targetType ?? "content"}`;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable style={styles.backdrop} onPress={onClose}>
        {/* Inner Pressable swallows the tap so touching the sheet itself
            does not dismiss it. */}
        <Pressable
          style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}
          onPress={() => {}}
        >
          <View style={styles.grabber} />
          <Text style={styles.title}>{what}</Text>
          <Text style={styles.subtitle}>
            Why are you reporting this? Your report is anonymous.
          </Text>

          <ScrollView bounces={false}>
            {REPORT_REASONS.map((r) => (
              <Pressable
                key={r.value}
                onPress={() => submit(r.value)}
                disabled={!!submitting}
                style={({ pressed }) => [
                  styles.row,
                  pressed && styles.rowPressed,
                  !!submitting && submitting !== r.value && styles.rowDimmed,
                ]}
              >
                <Text style={styles.rowText}>{r.label}</Text>
                {submitting === r.value ? (
                  <ActivityIndicator size="small" color={theme.text} />
                ) : (
                  <Ionicons
                    name="chevron-forward"
                    size={18}
                    color={theme.textMuted}
                  />
                )}
              </Pressable>
            ))}
          </ScrollView>

          <Pressable
            onPress={onClose}
            disabled={!!submitting}
            style={({ pressed }) => [styles.cancel, pressed && styles.rowPressed]}
          >
            <Text style={styles.cancelText}>Cancel</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: theme.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingTop: 10,
    maxHeight: "80%",
  },
  grabber: {
    alignSelf: "center",
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: theme.border,
    marginBottom: 14,
  },
  title: {
    fontSize: 18,
    fontFamily: "Poppins_700Bold",
    color: theme.text,
  },
  subtitle: {
    fontSize: 13,
    fontFamily: "Poppins_400Regular",
    color: theme.textSecondary,
    marginTop: 4,
    marginBottom: 14,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 15,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.border,
    gap: 12,
  },
  rowPressed: { opacity: 0.6 },
  rowDimmed: { opacity: 0.4 },
  rowText: {
    flex: 1,
    fontSize: 15,
    fontFamily: "Poppins_500Medium",
    color: theme.text,
  },
  cancel: {
    marginTop: 12,
    paddingVertical: 14,
    alignItems: "center",
    borderRadius: 12,
    backgroundColor: theme.surfaceSecondary,
  },
  cancelText: {
    fontSize: 15,
    fontFamily: "Poppins_600SemiBold",
    color: semantic.error,
  },
});
