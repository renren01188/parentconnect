/** Shared non-secret validation for ICT User Management account edits. */

export function uppercaseFamilyName(value: string) {
  // Keep persisted family names deterministic regardless of the browser or
  // server process locale.
  return value.toUpperCase();
}

export type PasswordChangeValidation =
  | { ok: true; changeRequested: false }
  | { ok: true; changeRequested: true; newPassword: string }
  | { ok: false; message: string };

/**
 * Confirmation is required whenever a password change is requested. The
 * caller still separately verifies the current ICT password before saving.
 */
export function validateUserManagementPasswordChange(
  rawNewPassword: unknown,
  rawConfirmation: unknown,
): PasswordChangeValidation {
  const newPassword = typeof rawNewPassword === "string" ? rawNewPassword : "";
  const confirmation = typeof rawConfirmation === "string" ? rawConfirmation : "";
  const changeRequested = Boolean(newPassword || confirmation);
  if (!changeRequested) return { ok: true, changeRequested: false };
  if (!newPassword || !confirmation) {
    return { ok: false, message: "Enter and confirm the new password." };
  }
  if (newPassword !== confirmation) {
    return { ok: false, message: "New password and confirmation do not match." };
  }
  if (newPassword.length < 8) {
    return { ok: false, message: "New password must be at least 8 characters." };
  }
  return { ok: true, changeRequested: true, newPassword };
}
