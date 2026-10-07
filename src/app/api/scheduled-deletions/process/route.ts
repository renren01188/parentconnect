import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { archiveTarget } from "@/lib/permanentDeletion";
import { logAudit } from "@/lib/audit";

export async function POST(req: NextRequest) {
  const expected = process.env.DELETION_CRON_SECRET;
  if (!expected || req.headers.get("authorization") !== `Bearer ${expected}`) return NextResponse.json({ success: false, message: "Unauthorized." }, { status: 401 });
  const { data, error } = await supabase.from("scheduled_deletions").select("*").eq("status", "Scheduled").lte("delete_after", new Date().toISOString());
  if (error) return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  const archived: number[] = [];
  for (const item of data ?? []) {
    await archiveTarget(item, { name: "Retention Worker", role: "System" });
    const { error: updateError } = await supabase.from("scheduled_deletions").update({ status: "Archived", archived_at: new Date().toISOString(), archived_by: "system", archive_reason: item.reason }).eq("id", item.id).eq("status", "Scheduled");
    if (updateError) throw updateError;
    await logAudit({ action: "Record Archived", performedBy: "Retention Worker", performedByRole: "System", targetUser: item.target_name, targetRole: item.target_type, targetEmail: item.target_email ?? "N/A", targetType: item.target_type, targetId: item.target_id, relatedUserId: item.target_id, previousStatus: "Scheduled", newStatus: "Archived", module: "Archive", details: `Archived this ${item.target_type} after its 30-day waiting period.`, metadata: { scheduledDeletionId: item.id } });
    archived.push(item.id);
  }
  return NextResponse.json({ success: true, archived });
}
