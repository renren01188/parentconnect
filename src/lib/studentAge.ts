/**
 * Student ages are deliberately stored as whole years.  Keep the parsing in
 * one place because the adviser registration flow and ICT profile editor use
 * the same database column and must reject the same invalid values.
 */
export type StudentAgeResult =
  | { value: number | null; error: null }
  | { value: null; error: string };

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
