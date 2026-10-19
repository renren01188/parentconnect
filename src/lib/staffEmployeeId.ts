import { supabase } from "@/lib/supabase";

export type StaffEmployeeRole = "Adviser" | "ICT" | "Guidance" | "Principal";

type StaffEmployeeIdOwner = {
  role: StaffEmployeeRole;
  id: number;
};

type RegistryRecord = {
  employee_id: string;
  account_role: StaffEmployeeRole;
  account_id: number;
};

export class StaffEmployeeIdConflictError extends Error {
  readonly status = 409;

  constructor(employeeId: string, role?: string) {
    super(`Employee ID "${employeeId}" is already assigned to${role ? ` a ${role}` : " another staff"} account.`);
    this.name = "StaffEmployeeIdConflictError";
  }
}

export function normalizeStaffEmployeeId(value: unknown) {
  return String(value ?? "").trim();
}

export function staffEmployeeIdKey(value: unknown) {
  return normalizeStaffEmployeeId(value).toLowerCase();
}

export async function assertStaffEmployeeIdAvailable(
  employeeId: unknown,
  currentOwner?: StaffEmployeeIdOwner,
) {
  const normalizedEmployeeId = normalizeStaffEmployeeId(employeeId);
  if (!normalizedEmployeeId) {
    throw new Error("Employee ID is required.");
  }

  const { data, error } = await supabase
    .from("staff_employee_ids")
    .select("employee_id, account_role, account_id")
    .eq("employee_id_key", staffEmployeeIdKey(normalizedEmployeeId))
    .maybeSingle<RegistryRecord>();

  if (error) throw error;

  if (
    data
    && (!currentOwner
      || data.account_role !== currentOwner.role
      || Number(data.account_id) !== Number(currentOwner.id))
  ) {
    throw new StaffEmployeeIdConflictError(normalizedEmployeeId, data.account_role);
  }

  return normalizedEmployeeId;
}

export function isStaffEmployeeIdConflict(error: unknown) {
  if (error instanceof StaffEmployeeIdConflictError) return true;
  if (!error || typeof error !== "object") return false;

  const databaseError = error as { code?: string; message?: string };
  const message = databaseError.message ?? "";
  return (databaseError.code === "23505" && /employee id|staff_employee_ids/i.test(message))
    // One older Adviser route adds context before rethrowing the PostgreSQL
    // error. Keep that race-condition response a clear 409 too.
    || /employee id .*already assigned/i.test(message);
}

export function staffEmployeeIdConflictMessage(error: unknown) {
  if (error instanceof StaffEmployeeIdConflictError) return error.message;

  const message = error && typeof error === "object" && "message" in error
    ? String((error as { message?: unknown }).message ?? "")
    : "";
  const clearMessage = message.match(/Employee ID .*already assigned to (?:a |another )?[A-Za-z ]+account\./i)?.[0];
  return clearMessage ?? (/employee id/i.test(message)
    ? message
    : "This Employee ID is already assigned to another staff account.");
}
