/**
 * Calendar columns for the monthly SF2 export. This deliberately does not use
 * attendance records or elapsed school days: an export must always show the
 * complete Monday-to-Friday calendar for the month the user selected.
 */
export type AttendanceExportDate = {
  date: string;
  day: number;
  weekdayLabel: "M" | "T" | "W" | "TH" | "F";
};

const weekdayLabels: Partial<Record<number, AttendanceExportDate["weekdayLabel"]>> = {
  1: "M",
  2: "T",
  3: "W",
  4: "TH",
  5: "F",
};

/**
 * Lists every calendar weekday in a selected year/month using UTC calendar
 * arithmetic. UTC keeps a browser's local timezone from moving a date into a
 * neighboring day or producing the wrong weekday for historical exports.
 */
export function weekdayExportDatesForMonth(year: number, month: number): AttendanceExportDate[] {
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    throw new RangeError("A valid numeric year and month (1-12) are required for an attendance export.");
  }

  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const dates: AttendanceExportDate[] = [];

  for (let day = 1; day <= daysInMonth; day += 1) {
    const dayOfWeek = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
    const weekdayLabel = weekdayLabels[dayOfWeek];
    if (!weekdayLabel) continue;

    dates.push({
      date: `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
      day,
      weekdayLabel,
    });
  }

  return dates;
}
