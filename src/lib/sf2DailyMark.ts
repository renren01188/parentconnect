import type ExcelJS from "exceljs";
import {
  getSf2DailyMark,
  type AttendanceExportStatus,
  type Sf2SpecialAttendanceMark,
} from "@/lib/attendanceExportStatus";

const SF2_HALF_SHADE = "FF808080";
const SF2_UNSHADED = "FFFFFFFF";

/**
 * Writes the official SF2 mark without altering the supplied template's
 * borders, alignment, or number formatting. Excel renders the gradient as a
 * crisp half-cell shade: top for a late arrival and bottom for the final
 * automatic absence created when a learner has no Time Out.
 */
export function writeSf2DailyMark(
  worksheet: ExcelJS.Worksheet,
  reference: string,
  status: AttendanceExportStatus | null | undefined,
  isHoliday = false,
  specialMark?: Sf2SpecialAttendanceMark,
) {
  const cell = worksheet.getCell(reference);
  const mark = getSf2DailyMark(status, isHoliday, specialMark);
  cell.value = mark.code;

  if (!mark.tardyHalf) return;

  const upperIsShaded = mark.tardyHalf === "upper";
  cell.fill = {
    type: "gradient",
    gradient: "angle",
    degree: 90,
    stops: upperIsShaded
      ? [
        { position: 0, color: { argb: SF2_HALF_SHADE } },
        { position: 0.5, color: { argb: SF2_HALF_SHADE } },
        { position: 0.5001, color: { argb: SF2_UNSHADED } },
        { position: 1, color: { argb: SF2_UNSHADED } },
      ]
      : [
        { position: 0, color: { argb: SF2_UNSHADED } },
        { position: 0.5, color: { argb: SF2_UNSHADED } },
        { position: 0.5001, color: { argb: SF2_HALF_SHADE } },
        { position: 1, color: { argb: SF2_HALF_SHADE } },
      ],
  };
}
