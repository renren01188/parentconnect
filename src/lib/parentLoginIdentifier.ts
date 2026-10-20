/**
 * Normalizes the Philippine mobile number used as a Parent login identifier.
 * The stored value is always 09XXXXXXXXX, regardless of whether a Parent
 * types 09..., 9..., +639..., or 639....
 */
export function normalizeParentLoginContactNumber(value: unknown): string | null {
  const digits = String(value ?? "").replace(/\D/g, "");

  if (/^09\d{9}$/.test(digits)) return digits;
  if (/^9\d{9}$/.test(digits)) return `0${digits}`;
  if (/^639\d{9}$/.test(digits)) return `0${digits.slice(2)}`;

  return null;
}

export function normalizeParentLoginEmail(value: unknown): string | null {
  const email = String(value ?? "").trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}
