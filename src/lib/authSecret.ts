/**
 * JWT signing must never silently fall back to a source-controlled value.
 * A missing or weak secret is a deployment error, not a reason to issue
 * forgeable sessions.
 */
export function getJwtSecret(): Uint8Array {
  const value = process.env.NEXTAUTH_SECRET;
  if (!value || value.length < 24) {
    throw new Error("NEXTAUTH_SECRET must be configured with at least 24 characters.");
  }

  return new TextEncoder().encode(value);
}
