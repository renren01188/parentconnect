/**
 * Student ages are deliberately stored as whole years.  Keep the parsing in
 * one place because the adviser registration flow and ICT profile editor use
 * the same database column and must reject the same invalid values.
 */
export type StudentAgeResult =
  | { value: number | null; error: null }
  | { value: null; error: string };

const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Returns completed whole years for two ISO calendar dates.  Keeping this
 * date-only avoids a timezone shift changing a learner's age near midnight.
 */
export function calculateStudentAge(birthDate: string | null | undefined, localToday: string): number | null {
  if (typeof birthDate !== "string") return null;

  const birthMatch = ISO_DATE_PATTERN.exec(birthDate);
  const todayMatch = ISO_DATE_PATTERN.exec(localToday);
  if (!birthMatch || !todayMatch || birthDate > localToday) return null;

  const [, birthYearText, birthMonthText, birthDayText] = birthMatch;
  const [, todayYearText, todayMonthText, todayDayText] = todayMatch;
  const birthYear = Number(birthYearText);
  const birthMonth = Number(birthMonthText);
  const birthDay = Number(birthDayText);
  const todayYear = Number(todayYearText);
  const todayMonth = Number(todayMonthText);
  const todayDay = Number(todayDayText);

  let age = todayYear - birthYear;
  if (todayMonth < birthMonth || (todayMonth === birthMonth && todayDay < birthDay)) age--;
  return age >= 0 ? age : null;
}

export function getStudentAge(birthDate?: string | null, today = new Date()): string {
  if (!birthDate) return "—";
  const birth = new Date(`${birthDate.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(birth.getTime())) return "—";
  let age = today.getFullYear() - birth.getFullYear();
  const monthDifference = today.getMonth() - birth.getMonth();
  if (monthDifference < 0 || (monthDifference === 0 && today.getDate() < birth.getDate())) age--;
  return age >= 0 ? String(age) : "—";
}

export function normalizeStudentAge(value: unknown): StudentAgeResult {
  if (value === null || value === undefined || value === "") {
    return { value: null, error: null };
  }

  const text = typeof value === "string" || typeof value === "number"
    ? String(value).trim()
    : "";

  if (!/^\d{1,3}$/.test(text)) {
    return { value: null, error: "Age must be a whole number from 1 to 120." };
  }

  const age = Number(text);
  if (!Number.isSafeInteger(age) || age < 1 || age > 120) {
    return { value: null, error: "Age must be a whole number from 1 to 120." };
  }

  return { value: age, error: null };
}
