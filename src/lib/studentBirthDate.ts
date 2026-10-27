/**
 * Birth dates are calendar dates, not instants in time. Keep their validation
 * timezone-neutral by comparing their ISO calendar-day keys to the
 * application-local date supplied by the caller.
 */
export type StudentBirthDateResult =
  | { value: string | null; error: null }
  | { value: null; error: string };

const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

export function normalizeStudentBirthDate(value: unknown, localToday: string): StudentBirthDateResult {
  if (value === null || value === undefined || value === "") {
    return { value: null, error: null };
  }

  const text = typeof value === "string" ? value.trim() : "";
  const match = ISO_DATE_PATTERN.exec(text);
  if (!match) {
    return { value: null, error: "Birth date must be a valid calendar date." };
  }

  const [year, month, day] = match.slice(1).map(Number);
  const calendarDate = new Date(Date.UTC(year, month - 1, day));
  if (
    calendarDate.getUTCFullYear() !== year
    || calendarDate.getUTCMonth() !== month - 1
    || calendarDate.getUTCDate() !== day
  ) {
    return { value: null, error: "Birth date must be a valid calendar date." };
  }

  if (text > localToday) {
    return { value: null, error: "Birth date cannot be in the future." };
  }

  return { value: text, error: null };
}
