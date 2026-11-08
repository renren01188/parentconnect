/** Calendar-day scheduling rules shared by announcement forms and API routes. */
export const SCHOOL_TIME_ZONE = "Asia/Manila";

function dateParts(value: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: SCHOOL_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((entry) => entry.type === type)?.value;
  return { year: part("year"), month: part("month"), day: part("day") };
}

/** Returns the school-local calendar day as an ISO date (YYYY-MM-DD). */
export function schoolCalendarDay(now = new Date()) {
  const { year, month, day } = dateParts(now);
  return year && month && day ? `${year}-${month}-${day}` : "";
}

/** Earliest valid schedule date: the calendar day after today in Manila. */
export function nextSchoolCalendarDay(now = new Date()) {
  const today = schoolCalendarDay(now);
  if (!today) return "";
  const [year, month, day] = today.split("-").map(Number);
  const next = new Date(Date.UTC(year, month - 1, day + 1));
  return next.toISOString().slice(0, 10);
}

function scheduledCalendarDay(value: unknown) {
  if (typeof value !== "string") return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:T.*)?$/.exec(value.trim());
  if (!match) return null;
  const [year, month, day] = match.slice(1).map(Number);
  const candidate = new Date(Date.UTC(year, month - 1, day));
  if (
    candidate.getUTCFullYear() !== year
    || candidate.getUTCMonth() !== month - 1
    || candidate.getUTCDate() !== day
  ) return null;
  return `${match[1]}-${match[2]}-${match[3]}`;
}

/** True only for a valid calendar day strictly after today's Manila date. */
export function isFutureSchoolCalendarDay(value: unknown, now = new Date()) {
  const scheduledDay = scheduledCalendarDay(value);
  const today = schoolCalendarDay(now);
  return Boolean(scheduledDay && today && scheduledDay > today);
}

/** True only when both dates are future Manila calendar days in chronological order. */
export function isFutureSchoolCalendarDateRange(start: unknown, end: unknown, now = new Date()) {
  const startDay = scheduledCalendarDay(start);
  const endDay = scheduledCalendarDay(end);
  return Boolean(
    startDay
    && endDay
    && startDay <= endDay
    && isFutureSchoolCalendarDay(startDay, now)
    && isFutureSchoolCalendarDay(endDay, now),
  );
}

export type OptionalAnnouncementSchedule =
  | { ok: true; scheduledAt: string | null }
  | { ok: false; message: string };

function scheduledClockTime(value: unknown) {
  if (typeof value !== "string") return null;
  const match = /^(\d{2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return null;
  return `${match[1]}:${match[2]}`;
}

/**
 * Announcement scheduling is optional. A selected date is a school-calendar
 * date, not a browser-local timestamp, so store it as midnight in Manila.
 */
export function normalizeOptionalAnnouncementSchedule(
  value: unknown,
  now = new Date(),
): OptionalAnnouncementSchedule {
  if (value === null || value === undefined || (typeof value === "string" && !value.trim())) {
    return { ok: true, scheduledAt: null };
  }

  const day = scheduledCalendarDay(value);
  if (!day) return { ok: false, message: "Schedule date is invalid." };
  if (!isFutureSchoolCalendarDay(day, now)) {
    return { ok: false, message: "Schedule date must be a future calendar day in Asia/Manila." };
  }

  return { ok: true, scheduledAt: `${day}T00:00:00+08:00` };
}

/**
 * Optional Manila date-and-time scheduling. Used where a sender can choose a
 * precise delivery time while preserving the existing date-only schedule API.
 */
export function normalizeOptionalAnnouncementScheduleDateTime(
  dateValue: unknown,
  timeValue: unknown,
  now = new Date(),
): OptionalAnnouncementSchedule {
  const dateBlank = dateValue === null || dateValue === undefined || (typeof dateValue === "string" && !dateValue.trim());
  const timeBlank = timeValue === null || timeValue === undefined || (typeof timeValue === "string" && !timeValue.trim());
  if (dateBlank && timeBlank) return { ok: true, scheduledAt: null };
  if (dateBlank || timeBlank) return { ok: false, message: "Choose both a schedule date and time, or leave both blank to send now." };

  const day = scheduledCalendarDay(dateValue);
  const time = scheduledClockTime(timeValue);
  if (!day || !time) return { ok: false, message: "Schedule date or time is invalid." };
  if (!isFutureSchoolCalendarDay(day, now)) {
    return { ok: false, message: "Schedule date must be a future calendar day in Asia/Manila." };
  }

  const scheduledAt = `${day}T${time}:00+08:00`;
  const scheduledInstant = new Date(scheduledAt);
  if (Number.isNaN(scheduledInstant.getTime()) || scheduledInstant.getTime() <= now.getTime()) {
    return { ok: false, message: "Schedule time must be in the future in Asia/Manila." };
  }
  return { ok: true, scheduledAt };
}

/** Formats an ISO timestamp as a clearly-labelled Manila schedule time. */
export function formatManilaAnnouncementSchedule(value: string | null | undefined) {
  if (!value) return "";
  const scheduledAt = new Date(value);
  if (Number.isNaN(scheduledAt.getTime())) return "";
  return `${new Intl.DateTimeFormat("en-US", {
    timeZone: SCHOOL_TIME_ZONE,
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(scheduledAt)} (Asia/Manila)`;
}

/** Returns true once a scheduled Manila calendar date has begun. */
export function isDueAnnouncementSchedule(value: unknown, now = new Date()) {
  if (typeof value !== "string" || !value.trim()) return false;
  const scheduled = new Date(value);
  if (Number.isNaN(scheduled.getTime())) return false;
  return scheduled.getTime() <= now.getTime();
}
