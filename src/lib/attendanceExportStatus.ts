/**
 * The export views must describe the saved Time In status exactly. A blank
 * attendance row is not evidence of presence: it remains `null`/No Record.
 */
export type AttendanceExportStatus = "Present" | "Late" | "Absent" | "Excused";

export function toAttendanceExportStatus(value: unknown): AttendanceExportStatus | null {
  switch (String(value ?? "").trim()) {
    case "Present":
    case "On Time":
      return "Present";
    case "Late":
      return "Late";
    case "Absent":
      return "Absent";
    case "Excused":
      return "Excused";
    default:
      return null;
  }
}

export function isAttendedExportStatus(status: AttendanceExportStatus | null | undefined) {
  return status === "Present" || status === "Late";
}

/**
 * Marks fit in the narrow daily cells of the SF2 layout. Excused remains
 * identifiable in Attendance Detail, but the official SF2 daily mark is X:
 * it is an absence, not an attended or neutral day. A holiday has priority
 * because its date is deliberately excluded from the month's totals.
 */
export function getSf2StatusCode(
  status: AttendanceExportStatus | null | undefined,
  isHoliday = false,
) {
  if (isHoliday) return "H";
  switch (status) {
    case "Present":
    case "Late": return "✓";
    case "Absent":
    case "Excused": return "X";
    default: return null;
  }
}

export function getAttendanceDetailStatus(status: AttendanceExportStatus | null | undefined) {
  return status ?? "No Record";
}
