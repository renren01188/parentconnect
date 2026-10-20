import { supabase } from "@/lib/supabase";

export type ArchiveTarget = { target_type: string; target_id: string; target_name?: string; reason?: string | null };
type ArchiveActor = { id?: string | number; name: string; role: string };

const ARCHIVABLE_TABLES: Record<string, string> = {
  student: "students", parent: "parents", adviser: "advisers", ict: "ict_admins",
  guidance: "guidance_counselors", principal: "principals",
};

/** Archives only the selected root record; evidence/history stays intact. */
export async function archiveTarget(item: ArchiveTarget, actor: ArchiveActor) {
  const table = ARCHIVABLE_TABLES[item.target_type];
  const id = Number(item.target_id);
  if (!table || !Number.isSafeInteger(id) || id <= 0) throw new Error("Invalid archive target.");
  const fields = item.target_type === "student" ? "id, archive_status" : "id, status, archive_status";
  const { data: currentData, error: currentError } = await supabase.from(table).select(fields).eq("id", id).maybeSingle();
  if (currentError) throw currentError;
  const current = currentData as { id: number; archive_status?: string | null; status?: string | null } | null;
  if (!current) throw new Error("Selected record no longer exists.");
  if (current.archive_status === "archived") return current;
  const { data, error } = await supabase.from(table).update({
    archived_at: new Date().toISOString(), archived_by: String(actor.id ?? "system"),
    archive_reason: item.reason?.trim() || "No reason provided", archive_status: "archived",
    archive_previous_status: (current as { status?: string | null }).status ?? null,
  // Legacy rows can have a NULL archive status. Treat that the same as active,
  // while retaining the conditional update so two workers cannot archive twice.
  }).eq("id", id).or("archive_status.eq.active,archive_status.is.null").select("id").maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Archive request was already processed or selected record changed.");
  return data;
}

/** Restores only the selected archived root record; history never changes. */
export async function restoreArchivedTarget(item: ArchiveTarget) {
  const table = ARCHIVABLE_TABLES[item.target_type];
  const id = Number(item.target_id);
  if (!table || !Number.isSafeInteger(id) || id <= 0) throw new Error("Invalid archive target.");
  const { error } = await supabase.from(table).update({
    archived_at: null, archived_by: null, archive_reason: null, archive_status: "active",
  }).eq("id", id).eq("archive_status", "archived");
  if (error) throw error;
}
