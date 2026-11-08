import {
  toAttendanceExportStatus,
  type AttendanceExportStatus,
} from "@/lib/attendanceExportStatus";

export type FinalAttendanceExportInput = {
  timeInStatus?: unknown;
  timeOutStatus?: unknown;
  timeOutVia?: unknown;
  timeOutRemark?: unknown;
  isExcused?: boolean;
};

export type FinalAttendanceExportResult = {
  status: AttendanceExportStatus | null;
  hasCompletedAttendance: boolean;
  isAutomaticMissingTimeOutAbsence: boolean;
};

function hasValidArrival(status: AttendanceExportStatus | null) {
  return status === "Present" || status === "Late";
}

/**
 * Resolves a durable monthly-export outcome without inventing a departure.
 * The automatic worker is the only source that turns a missing Time Out into
 * a final Absent result. Until then an arrival is not counted as completed
 * attendance in an SF2 total.
 */
export function resolveFinalAttendanceExport(
  input: FinalAttendanceExportInput,
): FinalAttendanceExportResult {
  const timeInStatus = toAttendanceExportStatus(input.timeInStatus);
  const timeOutStatus = toAttendanceExportStatus(input.timeOutStatus);
  const isAutomaticMissingTimeOutAbsence = hasValidArrival(timeInStatus)
    && timeOutStatus === "Absent"
    && String(input.timeOutVia ?? "").trim() === "Auto"
    && String(input.timeOutRemark ?? "").trim() === "Auto-marked absent";

  if (input.isExcused || timeInStatus === "Excused") {
    return {
      status: "Excused",
      hasCompletedAttendance: false,
      isAutomaticMissingTimeOutAbsence: false,
    };
  }

  if (isAutomaticMissingTimeOutAbsence) {
    return {
      status: "Absent",
      hasCompletedAttendance: false,
      isAutomaticMissingTimeOutAbsence: true,
    };
  }

  if (timeInStatus === "Absent") {
    return {
      status: "Absent",
      hasCompletedAttendance: false,
      isAutomaticMissingTimeOutAbsence: false,
    };
  }

  return {
    status: timeInStatus,
    hasCompletedAttendance: hasValidArrival(timeInStatus) && timeOutStatus !== null,
    isAutomaticMissingTimeOutAbsence: false,
  };
}

export function getFinalAttendanceExportDetail(
  input: FinalAttendanceExportInput,
): string {
  const result = resolveFinalAttendanceExport(input);
  if (result.isAutomaticMissingTimeOutAbsence) return "Absent — no Time Out recorded";
  if (result.status && !result.hasCompletedAttendance && (result.status === "Present" || result.status === "Late")) {
    return `${result.status} — awaiting Time Out`;
  }
  return result.status ?? "No Record";
}
