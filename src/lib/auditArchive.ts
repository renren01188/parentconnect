import { supabase } from "@/lib/supabase";

export const AUDIT_ARCHIVE_FILTERS = ["active", "archived"] as const;
export type AuditArchiveFilter = (typeof AUDIT_ARCHIVE_FILTERS)[number];

export function parseAuditArchiveFilter(value: string | null): AuditArchiveFilter {
  return value === "archived" ? "archived" : "active";
}

/**
 * Idempotent fallback for the daily pg_cron job. This keeps the archive state
 * current even if a scheduled run was delayed, without modifying audit logs.
 */
export async function archiveExpiredAuditLogs() {
  const { error } = await supabase.rpc("archive_expired_audit_logs");
  if (error) throw new Error("Audit-log archiving is temporarily unavailable.");
}
