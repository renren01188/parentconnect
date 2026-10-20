export const PARENT_ACCOUNT_OWNER_ROLES = ["Father", "Mother", "Guardian"] as const;

export type ParentAccountOwnerRole = (typeof PARENT_ACCOUNT_OWNER_ROLES)[number];

export function isParentAccountOwnerRole(value: unknown): value is ParentAccountOwnerRole {
  return PARENT_ACCOUNT_OWNER_ROLES.includes(value as ParentAccountOwnerRole);
}
