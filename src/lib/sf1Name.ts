import { cleanNamePart } from "./familyName";

export type Sf1Name = {
  firstName: string | null;
  middleName: string | null;
  lastName: string | null;
  suffix: string | null;
};

const SUFFIX_PATTERN = /^(?:JR\.?|SR\.?|II|III|IV|V|VI|VII|VIII|IX|X)$/i;

/**
 * SF1 sheets can leave delimiters in a middle-name cell (for example,
 * `FERANIL,`). Keep meaningful hyphens and apostrophes intact.
 */
export function normalizeMiddleName(value: unknown): string | null {
  const cleaned = cleanNamePart(value)
    ?.replace(/[,，]+/g, " ")
    .replace(/[\u200B-\u200D\uFEFF]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned || null;
}

function normalizeSuffix(value: unknown): string | null {
  const cleaned = cleanNamePart(value)
    ?.replace(/^[,，\s]+|[,，\s]+$/g, "")
    .trim();
  return cleaned || null;
}

function isSuffix(value: string | null): boolean {
  return !!value && SUFFIX_PATTERN.test(value);
}

/** Parses the SF1 `Last Name, First Name, Middle Name[, Suffix]` cell. */
export function parseSf1Name(value: unknown): Sf1Name {
  const parts = String(value ?? "")
    .replace(/\uFF0C/g, ",")
    .split(",")
    .map(cleanNamePart)
    .filter((part): part is string => !!part);

  let suffix: string | null = null;
  const possibleSuffix = normalizeSuffix(parts.at(-1));
  if (isSuffix(possibleSuffix)) suffix = normalizeSuffix(parts.pop());

  return {
    lastName: cleanNamePart(parts[0]),
    firstName: cleanNamePart(parts[1]),
    middleName: normalizeMiddleName(parts.slice(2).join(" ")),
    suffix,
  };
}

/** Applies the same guarantees to preview data submitted back by the browser. */
export function normalizeSf1Name(value: Partial<Sf1Name>): Sf1Name {
  return {
    firstName: cleanNamePart(value.firstName),
    middleName: normalizeMiddleName(value.middleName),
    lastName: cleanNamePart(value.lastName),
    suffix: normalizeSuffix(value.suffix),
  };
}
