import api from "./api";

export type ReportTargetType = "user" | "post" | "comment" | "message";

export type ReportReason =
  | "spam"
  | "harassment"
  | "inappropriate_content"
  | "fake_profile"
  | "underage"
  | "other";

export type CreateReportInput = {
  targetType: ReportTargetType;
  /** Omitted for a whole-user report. */
  targetId?: string;
  /** The person the report is about. */
  reportedUserId: string;
  reason: ReportReason;
  details?: string;
};

/** Label shown in the picker, in the order they appear. */
export const REPORT_REASONS: { value: ReportReason; label: string }[] = [
  { value: "harassment", label: "Harassment or bullying" },
  { value: "inappropriate_content", label: "Inappropriate content" },
  { value: "fake_profile", label: "Fake profile or impersonation" },
  { value: "spam", label: "Spam or scam" },
  { value: "underage", label: "Under-age user" },
  { value: "other", label: "Something else" },
];

export const reportsService = {
  async create(input: CreateReportInput): Promise<void> {
    await api.post("/reports", input);
  },
};
