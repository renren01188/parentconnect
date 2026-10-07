export type ParentAccountAccessState = {
  status?: string | null;
  archive_status?: string | null;
};

function normalizeState(value: string | null | undefined) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");
}

/**
 * Parent registration is verified through the school-maintained parent/student
 * link, not a staff-approval state. These separate protection states still
 * prevent access.
 */
const PROTECTED_PARENT_STATES = new Set([
  "deletion suspended",
  "deletion pending",
  "pending deletion",
  "pending",
  "pending approval",
  "awaiting approval",
  "unapproved",
  "rejected",
  "denied",
  "waiting period",
  "suspended",
  "blocked",
  "deleted",
  "inactive",
  "deactivated",
  "disabled",
]);

export function parentAccountAccessIssue(parent: ParentAccountAccessState) {
  const archiveStatus = normalizeState(parent.archive_status);
  if (archiveStatus === "archived" || archiveStatus === "deleted") return archiveStatus;

  const status = normalizeState(parent.status);
  return PROTECTED_PARENT_STATES.has(status) ? status : null;
}

export function parentAccountCanAccess(parent: ParentAccountAccessState) {
  return parentAccountAccessIssue(parent) === null;
}
