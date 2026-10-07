export type FamilyName = {
  firstName?: string | null;
  middleName?: string | null;
  lastName?: string | null;
};

/** Removes spreadsheet quoting and whitespace artifacts without changing names. */
export function cleanNamePart(value: unknown): string | null {
  const cleaned = String(value ?? "")
    .trim()
    .replace(/^[\s"'“”‘’]+|[\s"'“”‘’]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned || null;
}

export function normalizeNamePart(value: unknown): string {
  return (cleanNamePart(value) ?? "").toLocaleLowerCase();
}

/** Suffixes are part of a full name; tolerate only harmless punctuation. */
export function normalizeSuffix(value: unknown): string {
  return normalizeNamePart(value).replace(/\./g, "").replace(/\s+/g, " ").trim();
}

export function sameFamilySuffix(left: unknown, right: unknown): boolean {
  return normalizeSuffix(left) === normalizeSuffix(right);
}

function normalizeMiddleNameForMatch(value: unknown): string {
  return normalizeNamePart(value).replace(/[,，]+/g, " ").replace(/\s+/g, " ").trim();
}

export function sameFamilyName(left: FamilyName, right: FamilyName): boolean {
  const leftGiven = [normalizeNamePart(left.firstName), normalizeMiddleNameForMatch(left.middleName)].filter(Boolean).join(" ");
  const rightGiven = [normalizeNamePart(right.firstName), normalizeMiddleNameForMatch(right.middleName)].filter(Boolean).join(" ");
  return !!leftGiven && !!rightGiven
    && leftGiven === rightGiven
    && normalizeNamePart(left.lastName) === normalizeNamePart(right.lastName);
}

/**
 * The public Parent enrollment form intentionally treats middle names as
 * optional. Match only complete first and last names here--never a partial
 * name--after the standard whitespace/case normalization.
 *
 * Callers must still constrain this comparison by the SF1 role and, for the
 * enrollment request itself, the exact student LRN.
 */
export function sameParentEnrollmentName(left: FamilyName, right: FamilyName): boolean {
  const leftFirstName = normalizeNamePart(left.firstName);
  const rightFirstName = normalizeNamePart(right.firstName);
  const leftLastName = normalizeNamePart(left.lastName);
  const rightLastName = normalizeNamePart(right.lastName);

  return !!leftFirstName
    && !!rightFirstName
    && !!leftLastName
    && !!rightLastName
    && leftFirstName === rightFirstName
    && leftLastName === rightLastName;
}
