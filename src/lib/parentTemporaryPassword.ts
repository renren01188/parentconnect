import crypto from "crypto";

export const PARENT_TEMPORARY_PASSWORD_TTL_SECONDS = 10 * 60;
export const PARENT_TEMPORARY_PASSWORD_RESEND_DELAY_SECONDS = 2 * 60;
export const TEMPORARY_PASSWORD_EXPIRED_MESSAGE = "Your temporary password has expired. Please start Parent signup again.";

type TemporaryPassword = {
  password: string;
  expiresAt: Date;
};

const LEGACY_TEMPORARY_PASSWORD_PATTERN = /^PC-([0-9a-z]+)-([a-f0-9]{24})$/i;

function secureShuffle<T>(items: T[]) {
  const shuffled = [...items];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = crypto.randomInt(index + 1);
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }
  return shuffled;
}

/** Creates exactly three digits and three uppercase letters in random order. */
export function createTemporaryPassword(now = Date.now()): TemporaryPassword {
  const expiresAt = new Date(now + PARENT_TEMPORARY_PASSWORD_TTL_SECONDS * 1_000);
  const parts = [
    ...Array.from({ length: 3 }, () => String(crypto.randomInt(10))),
    ...Array.from({ length: 3 }, () => String.fromCharCode(65 + crypto.randomInt(26))),
  ];

  return {
    password: secureShuffle(parts).join(""),
    expiresAt,
  };
}

/**
 * Creates a server-secret proof for a temporary password held in a short-lived
 * signup cookie. This lets us wait to persist the account until the recipient
 * proves they received the password, without exposing a password hash to the
 * browser.
 */
export function createTemporaryPasswordProof(password: string) {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) throw new Error("NEXTAUTH_SECRET must be configured.");
  return crypto.createHmac("sha256", secret).update(password).digest("hex");
}

export function matchesTemporaryPasswordProof(password: string, proof: unknown) {
  if (typeof proof !== "string" || !/^[a-f0-9]{64}$/i.test(proof)) return false;
  const expected = Buffer.from(createTemporaryPasswordProof(password), "hex");
  const received = Buffer.from(proof, "hex");
  return received.length === expected.length && crypto.timingSafeEqual(received, expected);
}

/** Validates the printable format without logging or otherwise exposing it. */
export function isTemporaryPasswordFormat(password: unknown) {
  if (typeof password !== "string") return false;
  if (!/^[A-Z0-9]{6}$/.test(password)) return false;
  const characters = [...password];
  return characters.filter((character) => /\d/.test(character)).length === 3
    && characters.filter((character) => /[A-Z]/.test(character)).length === 3;
}

/** Reads the persisted expiry timestamp for newly issued temporary passwords. */
export function temporaryPasswordExpiryEpochSeconds(expiresAt: unknown) {
  const milliseconds = expiresAt instanceof Date
    ? expiresAt.getTime()
    : typeof expiresAt === "string"
    ? Date.parse(expiresAt)
    : Number.NaN;
  const seconds = Math.floor(milliseconds / 1_000);
  return Number.isSafeInteger(seconds) && seconds > 0 ? seconds : null;
}

/**
 * Passwords issued before the expiry column is migrated retain their original
 * short-lived behaviour. New passwords never encode their expiry in the text.
 */
export function legacyTemporaryPasswordExpiryEpochSeconds(password: unknown) {
  if (typeof password !== "string") return null;
  const match = LEGACY_TEMPORARY_PASSWORD_PATTERN.exec(password.trim());
  if (!match) return null;

  const expiresAtSeconds = Number.parseInt(match[1], 36);
  return Number.isSafeInteger(expiresAtSeconds) && expiresAtSeconds > 0
    ? expiresAtSeconds
    : null;
}

export function isTemporaryPasswordExpired(expiresAt: unknown, now = Date.now()) {
  const expiresAtSeconds = temporaryPasswordExpiryEpochSeconds(expiresAt);
  return !expiresAtSeconds || expiresAtSeconds * 1_000 <= now;
}
