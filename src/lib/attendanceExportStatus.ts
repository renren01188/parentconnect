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

export type Sf2TardyHalf = "upper" | "lower";
export type Sf2SpecialAttendanceMark = "missing-time-out";

export type Sf2DailyMark = {
  /** Text stored in the narrow official SF2 daily cell. */
  code: "H" | "X" | null;
  /** A visual half-cell shade used only for Tardy records. */
  tardyHalf: Sf2TardyHalf | null;
};

/**
 * Official SF2 daily marks. Present is deliberately blank; absence (and an
 * approved excuse, which remains visible in Attendance Detail) is X. Late
 * arrival uses the upper half of the cell. A final automatic absence caused
 * by a missing Time Out uses the lower half; it is still counted as Absent.
 */
export function getSf2DailyMark(
  status: AttendanceExportStatus | null | undefined,
  isHoliday = false,
  specialMark?: Sf2SpecialAttendanceMark,
): Sf2DailyMark {
  if (isHoliday) return { code: "H", tardyHalf: null };
  if (specialMark === "missing-time-out") return { code: null, tardyHalf: "lower" };

  switch (status) {
    case "Late":
      return { code: null, tardyHalf: "upper" };
    case "Absent":
    case "Excused":
      return { code: "X", tardyHalf: null };
    case "Present":
    default:
      return { code: null, tardyHalf: null };
  }
}

export function getSf2StatusCode(
  status: AttendanceExportStatus | null | undefined,
  isHoliday = false,
) {
  return getSf2DailyMark(status, isHoliday).code;
}

export function getAttendanceDetailStatus(status: AttendanceExportStatus | null | undefined) {
  return status ?? "No Record";
}
