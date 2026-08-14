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

export function sameFamilyName(left: FamilyName, right: FamilyName): boolean {
  const leftGiven = [left.firstName, left.middleName].map(normalizeNamePart).filter(Boolean).join(" ");
  const rightGiven = [right.firstName, right.middleName].map(normalizeNamePart).filter(Boolean).join(" ");
  return !!leftGiven && !!rightGiven
    && leftGiven === rightGiven
    && normalizeNamePart(left.lastName) === normalizeNamePart(right.lastName);
}
