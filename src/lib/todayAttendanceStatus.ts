export type RecordedTodayAttendanceStatus = "Present" | "Late" | "Excused" | "Absent";
export type TodayAttendanceStatus = RecordedTodayAttendanceStatus | "No Classes" | "—";

/**
 * Resolves the roster's current-day label from durable attendance data.
 * Present, Late, and Excused records are useful as soon as they exist. An
 * absence remains hidden until the student's scheduled session has ended.
 */
export function resolveTodayAttendanceStatus(input: {
  isScheduledClassDay: boolean;
  hasScheduledSession: boolean;
  hasApprovedExcuse: boolean;
  recordedStatus?: RecordedTodayAttendanceStatus;
  sessionEnded: boolean;
}): TodayAttendanceStatus {
  if (!input.isScheduledClassDay || !input.hasScheduledSession) return "No Classes";
  if (input.hasApprovedExcuse) return "Excused";
  if (input.recordedStatus === "Absent") return input.sessionEnded ? "Absent" : "—";
  return input.recordedStatus ?? "—";
}
