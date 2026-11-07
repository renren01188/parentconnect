import {
  DEFAULT_ATTENDANCE_WEEKDAYS,
  isScheduledAttendanceDate,
  normalizeAttendanceWeekdays,
  weekdayForSchoolDate,
} from "@/lib/schoolCalendar";

function monthDate(year: number, month: number, day: number) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function monthStartDate(year: number, month: number) {
  return monthDate(year, month, 1);
}

export function monthEndDate(year: number, month: number) {
  return monthDate(year, month, new Date(Date.UTC(year, month, 0)).getUTCDate());
}

function uniqueSortedDates(dates: Iterable<string>) {
  return [...new Set(dates)].sort();
}

/**
 * The school-year range is a live operational setting: it decides whether a
 * scanner can record a new event today. It must not erase a reporting date
 * that is already represented by a durable attendance log.
 *
 * For a month containing saved attendance, retain every enabled weekday in
 * that month as an export column. This keeps a historical SF2 calendar usable
 * when ICT later shortens or closes the active school-year date range. A saved
 * date is always retained, including a date whose weekday configuration was
 * later changed.
 */
export function attendanceReportDaysForMonth({
  year,
  month,
  schoolYearStart,
  schoolYearEnd,
  attendanceWeekdays,
  recordedDates = [],
}: {
  year: number;
  month: number;
  schoolYearStart?: string | null;
  schoolYearEnd?: string | null;
  attendanceWeekdays?: unknown;
  recordedDates?: Iterable<string>;
}) {
  const start = monthStartDate(year, month);
  const end = monthEndDate(year, month);
  const savedDates = uniqueSortedDates(
    [...recordedDates].filter((date) => typeof date === "string" && date >= start && date <= end),
  );
  const enabledWeekdays = new Set(normalizeAttendanceWeekdays(attendanceWeekdays ?? DEFAULT_ATTENDANCE_WEEKDAYS));
  const configuredDays: string[] = [];
  const historicalWeekdays: string[] = [];

  for (let day = 1; day <= Number(end.slice(-2)); day += 1) {
    const date = monthDate(year, month, day);
    if (enabledWeekdays.has(weekdayForSchoolDate(date))) {
      // Saved records make the month historical. Use its weekday pattern even
      // if the current school-year boundary was edited afterwards.
      if (savedDates.length > 0) historicalWeekdays.push(date);

      if (
        schoolYearStart
        && schoolYearEnd
        && isScheduledAttendanceDate(date, schoolYearStart, schoolYearEnd, attendanceWeekdays)
      ) {
        configuredDays.push(date);
      }
    }
  }

  return uniqueSortedDates([...configuredDays, ...historicalWeekdays, ...savedDates]);
}

/** A saved row wins over a later-added holiday so historical attendance stays visible. */
export function reportableAttendanceDays({
  reportDays,
  today,
  holidayDates = [],
  recordedDates = [],
}: {
  reportDays: Iterable<string>;
  today: string;
  holidayDates?: Iterable<string>;
  recordedDates?: Iterable<string>;
}) {
  const holidays = new Set(holidayDates);
  const saved = new Set(recordedDates);
  return uniqueSortedDates(
    [...reportDays].filter((date) => date <= today && (!holidays.has(date) || saved.has(date))),
  );
}
