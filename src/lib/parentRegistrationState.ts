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
