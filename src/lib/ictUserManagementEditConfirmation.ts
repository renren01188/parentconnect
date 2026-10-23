export type AccountEditChange = {
  field: string;
  from: string;
  to: string;
};

function joinFieldLabels(fields: string[]) {
  if (fields.length <= 1) return fields[0] ?? "Account";
  if (fields.length === 2) return `${fields[0]} and ${fields[1]}`;
  return `${fields.slice(0, -1).join(", ")}, and ${fields.at(-1)}`;
}

/**
 * Builds the adviser-edit confirmation copy from the same change list that is
 * sent to the audit trail. Password authorization is intentionally separate:
 * a Password row alone never proves that the ICT password was verified.
 */
export function buildIctAccountEditConfirmation(
  changes: readonly AccountEditChange[],
  passwordAuthorized: boolean,
) {
  const fields = changes.map((change) => change.field);
  const hasPasswordChange = fields.includes("Password");
  const fieldLabels = joinFieldLabels(fields);
  const changeWord = changes.length === 1 ? "change" : "changes";
  const subject = `${fieldLabels} ${changeWord}`;
  const demonstrative = changes.length === 1 ? "this" : "these";
  const passwordChangeAuthorized = hasPasswordChange && passwordAuthorized;

  return {
    hasPasswordChange,
    passwordChangeAuthorized,
    summary: `${subject} ready to save`,
    prompt: `Save the ${subject}`,
    notice: passwordChangeAuthorized
      ? `The password change was authorized with the current ICT password. ICT saves ${demonstrative} ${subject} directly. The account is updated immediately and recorded in the audit trail.`
      : `ICT saves ${demonstrative} ${subject} directly. The account is updated immediately and recorded in the audit trail.`,
  };
}
