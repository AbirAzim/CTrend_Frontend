export const CONTENT_REPORT_REASONS = [
  { id: "spam", label: "Spam or misleading" },
  { id: "harassment", label: "Harassment or hate" },
  { id: "violence", label: "Violence or dangerous content" },
  { id: "nudity", label: "Nudity or sexual content" },
  { id: "copyright", label: "Copyright or impersonation" },
  { id: "other", label: "Other" },
] as const;

export type ContentReportReasonId = (typeof CONTENT_REPORT_REASONS)[number]["id"];
export type ContentReportTargetType = "post" | "comment" | "user";

export type ContentReportInput = {
  targetType: ContentReportTargetType;
  targetId: string;
  reasonId: ContentReportReasonId;
  details?: string;
  reporterLabel: string;
  contextUrl?: string;
};

/** Normalize API enum (`HARASSMENT`) or UI id (`harassment`) to a display label. */
export function contentReportReasonLabel(reasonId: string): string {
  const normalized = reasonId.toLowerCase() as ContentReportReasonId;
  return CONTENT_REPORT_REASONS.find((r) => r.id === normalized)?.label ?? reasonId;
}

/** Nest GraphQL enums use member names (`POST`, `HARASSMENT`), not lowercase values. */
export function toGraphqlReportInput(input: ContentReportInput) {
  return {
    targetType: input.targetType.toUpperCase(),
    targetId: input.targetId,
    reasonId: input.reasonId.toUpperCase(),
    details: input.details?.trim() || undefined,
    contextUrl: input.contextUrl?.trim() || undefined,
  };
}

/** Structured text admins see in the Ke Jitbe Moderator thread. */
export function buildContentReportMessage(input: ContentReportInput): string {
  const reason = contentReportReasonLabel(input.reasonId);
  return [
    "🚩 CONTENT REPORT",
    `Type: ${input.targetType}`,
    `ID: ${input.targetId}`,
    `Reason: ${reason}`,
    input.contextUrl ? `Link: ${input.contextUrl}` : null,
    input.details?.trim() ? `Details: ${input.details.trim()}` : null,
    `Reporter: ${input.reporterLabel}`,
  ]
    .filter(Boolean)
    .join("\n");
}
