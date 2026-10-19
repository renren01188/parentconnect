export const SCHOOL_WEEKDAY_OPTIONS = [
  { key: "Mon", label: "Monday" },
  { key: "Tue", label: "Tuesday" },
  { key: "Wed", label: "Wednesday" },
  { key: "Thu", label: "Thursday" },
  { key: "Fri", label: "Friday" },
  { key: "Sat", label: "Saturday" },
  { key: "Sun", label: "Sunday" },
] as const;

export type SchoolWeekday = (typeof SCHOOL_WEEKDAY_OPTIONS)[number]["key"];

export const DEFAULT_ATTENDANCE_WEEKDAYS: SchoolWeekday[] = ["Mon", "Tue", "Wed", "Thu", "Fri"];

const weekdayByUtcDay: SchoolWeekday[] = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const validWeekdays = new Set<SchoolWeekday>(SCHOOL_WEEKDAY_OPTIONS.map(({ key }) => key));
const isoDatePattern = /^(\d{4})-(\d{2})-(\d{2})$/;

function calendarDate(date: string) {
  const parts = isoDatePattern.exec(date);
  if (!parts) throw new RangeError("Date must use YYYY-MM-DD format.");

  const year = Number(parts[1]);
  const month = Number(parts[2]);
  const day = Number(parts[3]);
  const value = new Date(Date.UTC(year, month - 1, day));
  if (
    value.getUTCFullYear() !== year
    || value.getUTCMonth() !== month - 1
    || value.getUTCDate() !== day
  ) {
    throw new RangeError("Date is not a valid calendar date.");
  }
  return value;
}

/**
 * Returns the weekday for the actual date represented by a YYYY-MM-DD key.
 * UTC is deliberately used only as a timezone-neutral calendar arithmetic
 * container; it prevents a browser or server timezone from shifting the day.
 */
export function weekdayForSchoolDate(date: string): SchoolWeekday {
  return weekdayByUtcDay[calendarDate(date).getUTCDay()];
}

/** Keeps persisted and client-provided weekday lists valid and ordered. */
export function normalizeAttendanceWeekdays(value: unknown): SchoolWeekday[] {
  if (!Array.isArray(value)) return [...DEFAULT_ATTENDANCE_WEEKDAYS];
  const selected = new Set(
    value.filter((day): day is SchoolWeekday => typeof day === "string" && validWeekdays.has(day as SchoolWeekday))
  );
  return SCHOOL_WEEKDAY_OPTIONS
    .map(({ key }) => key)
    .filter((key) => selected.has(key));
}

export function hasOnlyValidAttendanceWeekdays(value: unknown) {
  return Array.isArray(value)
    && value.length > 0
    && value.every((day) => typeof day === "string" && validWeekdays.has(day as SchoolWeekday));
}

export function isSchoolDateInRange(date: string, startDate: string, endDate: string) {
  calendarDate(date);
  calendarDate(startDate);
  calendarDate(endDate);
  return startDate <= date && date <= endDate;
}

export function isScheduledAttendanceDate(
  date: string,
  startDate: string,
  endDate: string,
  attendanceWeekdays: unknown = DEFAULT_ATTENDANCE_WEEKDAYS,
) {
  return isSchoolDateInRange(date, startDate, endDate)
    && normalizeAttendanceWeekdays(attendanceWeekdays).includes(weekdayForSchoolDate(date));
}

/** Enumerates actual calendar dates, including across month and year boundaries. */
export function scheduledAttendanceDates(
  startDate: string,
  endDate: string,
  attendanceWeekdays: unknown = DEFAULT_ATTENDANCE_WEEKDAYS,
) {
  const start = calendarDate(startDate);
  const end = calendarDate(endDate);
  if (start > end) return [];

  const enabledWeekdays = new Set(normalizeAttendanceWeekdays(attendanceWeekdays));
  const dates: string[] = [];
  for (const current = new Date(start); current <= end; current.setUTCDate(current.getUTCDate() + 1)) {
    const date = current.toISOString().slice(0, 10);
    if (enabledWeekdays.has(weekdayForSchoolDate(date))) dates.push(date);
  }
  return dates;
}

export function formatSchoolDate(date: string) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(calendarDate(date));
}
