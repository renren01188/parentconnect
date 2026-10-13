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
