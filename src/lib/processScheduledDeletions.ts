import { supabase } from "@/lib/supabase";
import { archiveTarget } from "@/lib/permanentDeletion";
import { logAudit } from "@/lib/audit";
import { publishAccountRealtimeInvalidation, publishStudentRealtimeInvalidation, type RealtimeRecipientRole } from "@/lib/realtimeInvalidation";

function realtimeRoleForDeletionTarget(targetType: string): RealtimeRecipientRole | null {
  return targetType === "parent" || targetType === "adviser" || targetType === "guidance" || targetType === "principal" || targetType === "ict"
    ? targetType
    : null;
}

/**
 * Archives every deletion request whose 30-day recovery period has elapsed.
 * This is used by the protected scheduled endpoint and by ICT list reads as a
 * safe fallback when the external scheduler has not run yet.
 */
export async function processDueScheduledDeletions() {
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("scheduled_deletions")
    .select("*")
    .eq("status", "Scheduled")
    .lte("delete_after", now);
  if (error) throw error;

  const archived: number[] = [];
  const failed: number[] = [];

  for (const item of data ?? []) {
    try {
      await archiveTarget(item, { name: "Retention Worker", role: "System" });
      const { error: updateError } = await supabase
        .from("scheduled_deletions")
        .update({
          status: "Archived",
          archived_at: new Date().toISOString(),
          archived_by: "system",
          archive_reason: item.reason,
        })
        .eq("id", item.id)
        .eq("status", "Scheduled");
      if (updateError) throw updateError;

      await logAudit({
        action: "Record Archived",
        performedBy: "Retention Worker",
        performedByRole: "System",
        targetUser: item.target_name,
        targetRole: item.target_type,
        targetEmail: item.target_email ?? "N/A",
        targetType: item.target_type,
        targetId: item.target_id,
        relatedUserId: item.target_id,
        previousStatus: "Scheduled",
        newStatus: "Archived",
        module: "Archive",
        details: `Archived this ${item.target_type} after its 30-day waiting period.`,
        metadata: { scheduledDeletionId: item.id },
      });
      if (item.target_type === "student") {
        await publishStudentRealtimeInvalidation({ studentDbId: Number(item.target_id) });
      } else {
        const role = realtimeRoleForDeletionTarget(item.target_type);
        await publishAccountRealtimeInvalidation(role ? [{ role, id: Number(item.target_id) }] : []);
      }
      archived.push(item.id);
    } catch (archiveError) {
      // Leave a failed item scheduled so a later processor run can retry it.
      console.error(`Failed to archive scheduled deletion ${item.id}:`, archiveError);
      failed.push(item.id);
    }
  }

  return { archived, failed };
}
