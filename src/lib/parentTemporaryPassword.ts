import crypto from "crypto";

export const PARENT_TEMPORARY_PASSWORD_TTL_SECONDS = 10 * 60;
export const TEMPORARY_PASSWORD_EXPIRED_MESSAGE = "Your temporary password has expired. Please start Parent signup again.";

type TemporaryPassword = {
  password: string;
  expiresAt: Date;
};

/**
 * The timestamp is part of the high-entropy temporary password and therefore
 * covered by the bcrypt hash stored for the pending Parent account. This
 * gives the server a durable expiry check without using a browser-only timer.
 */
export function createTemporaryPassword(now = Date.now()): TemporaryPassword {
  const expiresAtSeconds = Math.floor((now / 1_000) + PARENT_TEMPORARY_PASSWORD_TTL_SECONDS);
  return {
    password: `PC-${expiresAtSeconds.toString(36)}-${crypto.randomBytes(12).toString("hex")}`,
    expiresAt: new Date(expiresAtSeconds * 1_000),
  };
}

/** Invalid or legacy temporary-password formats are never treated as valid. */
export function temporaryPasswordExpiryEpochSeconds(password: unknown) {
  if (typeof password !== "string") return null;
  const match = /^PC-([0-9a-z]+)-([a-f0-9]{24})$/i.exec(password.trim());
  if (!match) return null;

  const expiresAtSeconds = Number.parseInt(match[1], 36);
  return Number.isSafeInteger(expiresAtSeconds) && expiresAtSeconds > 0
    ? expiresAtSeconds
    : null;
}

export function isTemporaryPasswordExpired(password: unknown, now = Date.now()) {
  const expiresAtSeconds = temporaryPasswordExpiryEpochSeconds(password);
  return !expiresAtSeconds || expiresAtSeconds * 1_000 <= now;
}
