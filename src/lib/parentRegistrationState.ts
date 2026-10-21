/**
 * A pre-sign-up family normally has no persisted account ID. Older manual
 * registrations may have a placeholder row, though; it stays pre-sign-up
 * until the parent has completed password setup.
 */
export function isPreSignupParentRecord(
  accountIds?: readonly unknown[],
  passwordSet?: unknown,
) {
  const hasPersistedAccountId = (accountIds ?? []).some((id) =>
    typeof id === "number" && Number.isSafeInteger(id) && id > 0,
  );
  if (!hasPersistedAccountId) return true;
  // Preserve the old behavior for callers that do not know password state.
  if (passwordSet === undefined) return false;
  return passwordSet !== true && passwordSet !== 1;
}

/**
 * A linked account is ready for the Parent dashboard only after the guardian
 * has finished every setup step. Directly imported accounts can already have
 * a password hash while they still need to choose an account owner and finish
 * account setup, so password_set on its own is not a reliable "signed up"
 * signal for the ICT Parents & Students directory.
 */
export function hasCompletedParentSignup(
  accountIds?: readonly unknown[],
  passwordSet?: unknown,
  requiresAccountSetup?: unknown,
) {
  if (isPreSignupParentRecord(accountIds, passwordSet)) return false;

  return requiresAccountSetup !== true
    && requiresAccountSetup !== 1
    && requiresAccountSetup !== "true"
    && requiresAccountSetup !== "1";
}
