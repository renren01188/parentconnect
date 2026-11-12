import { formatManilaDateTime } from "@/lib/manilaClock";

type EarlyOutDecision = "Approved" | "Rejected";

type EarlyOutDecisionNotificationInput = {
  studentName: string;
  attendanceDate: string;
  status: EarlyOutDecision;
  decidedAt: string | null | undefined;
};

/**
 * Parent and Adviser notices deliberately exclude a rejection rationale.
 * The rationale stays in the Adviser/Guidance request record, while both
 * recipients receive the same decision, original attendance date, and the
 * authoritative Manila decision time.
 */
export function earlyOutDecisionNotificationCopy({
  studentName,
  attendanceDate,
  status,
  decidedAt,
}: EarlyOutDecisionNotificationInput) {
  const person = String(studentName ?? "Student").trim() || "Student";
  const date = String(attendanceDate ?? "").trim() || "the saved attendance date";
  const decisionLabel = status === "Approved" ? "Approved" : "Rejected";
  const timestamp = formatManilaDateTime(decidedAt ?? new Date());
  const decisionDetail = `Student: ${person}. Original attendance date: ${date}. ${decisionLabel} at: ${timestamp} (Asia/Manila).`;

  return {
    title: `Early Out ${decisionLabel}`,
    message: status === "Approved"
      ? `${decisionDetail} Guidance has approved this Early Out request. The student may now be picked up from school.`
      : decisionDetail,
  };
}
