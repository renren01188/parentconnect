import { parentAccountCanAccess } from "@/lib/parentAccountAccess";

/**
 * The Parent rows imported from an SF1 file are retained so a guardian can
 * claim them during the normal signup process.  They are not, however,
 * completed Parent accounts merely because they have an ID, contact details,
 * or a legacy password hash.
 */
export type ParentAccountCompletionCandidate = {
  id?: unknown;
  parent_first_name?: unknown;
  parent_last_name?: unknown;
  password_set?: unknown;
  status?: string | null;
  archive_status?: string | null;
};

function normalizeNamePart(value: unknown) {
  return String(value ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

export function isImportedParentPlaceholder(parent: ParentAccountCompletionCandidate) {
  return normalizeNamePart(parent.parent_first_name) === "parent"
    && normalizeNamePart(parent.parent_last_name) === "account owner";
}

function hasRealParentName(parent: ParentAccountCompletionCandidate) {
  return Boolean(normalizeNamePart(parent.parent_first_name))
    && Boolean(normalizeNamePart(parent.parent_last_name));
}

/**
 * A student is linked only after an active account with a real guardian name
 * has completed the normal password setup.  This deliberately excludes SF1
 * placeholders, including old rows whose imported password_set value is 1.
 */
export function hasCompletedActiveParentSignup(parent: ParentAccountCompletionCandidate) {
  const id = Number(parent.id);
  const passwordSet = parent.password_set === true || parent.password_set === 1;
  const isActive = String(parent.status ?? "").trim().toLowerCase() === "active";

  return Number.isSafeInteger(id)
    && id > 0
    && passwordSet
    && isActive
    && parentAccountCanAccess(parent)
    && hasRealParentName(parent)
    && !isImportedParentPlaceholder(parent);
}
