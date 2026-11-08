import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { getAdviserFromToken } from "@/lib/getAdviserFromToken";
import { logAnnouncementAudit } from "@/lib/announcementAudit";
import { publishRealtimeInvalidation, recipientsForRoles } from "@/lib/realtimeInvalidation";

function adviserFullName(adviser: { first_name?: string | null; last_name?: string | null }) {
  return [adviser.first_name, adviser.last_name].filter(Boolean).join(" ").trim() || "Class Adviser";
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const adviser = await getAdviserFromToken();
    if (!adviser) return NextResponse.json({ success: false, message: "Not authenticated." }, { status: 401 });

    const { id: rawId } = await params;
    const id = Number(rawId);
    if (!Number.isSafeInteger(id) || id <= 0) {
      return NextResponse.json({ success: false, message: "Announcement not found." }, { status: 404 });
    }

    const { data: announcement, error: announcementError } = await supabase
      .from("adviser_announcements")
      .select("id, adviser_id, title, grade, sections, status, scheduled_at")
      .eq("id", id)
      .eq("adviser_id", adviser.id)
      .maybeSingle();
    if (announcementError) throw announcementError;
    if (!announcement) return NextResponse.json({ success: false, message: "Announcement not found." }, { status: 404 });

    const audience = `Grade ${announcement.grade ?? ""} - ${Array.isArray(announcement.sections) ? announcement.sections.join(", ") : ""}`;

    // A scheduled announcement is cancelled atomically instead of being
    // removed while the delivery worker might be claiming it. The worker only
    // claims Scheduled rows, so Cancelled announcements can never publish.
    if (announcement.status === "Scheduled") {
      const { data: cancelled, error: cancellationError } = await supabase
        .from("adviser_announcements")
        .update({ status: "Cancelled", updated_at: new Date().toISOString() })
        .eq("id", id)
        .eq("adviser_id", adviser.id)
        .eq("status", "Scheduled")
        .select("id")
        .maybeSingle();
      if (cancellationError) throw cancellationError;
      if (cancelled) {
        await logAnnouncementAudit({
          action: "Deleted",
          actor: { id: adviser.id, name: adviserFullName(adviser), role: "Adviser", email: adviser.email },
          announcement: { id, title: String(announcement.title ?? "Announcement"), audience, status: "Cancelled" },
          previousStatus: "Scheduled",
          headers: req.headers,
        });
        const principalRecipients = await recipientsForRoles(["principal"]);
        await publishRealtimeInvalidation([
          ...principalRecipients,
          { role: "adviser", id: Number(adviser.id) },
        ], "announcements");
        return NextResponse.json({ success: true, cancelled: true });
      }
      // The delivery worker claimed it first. Treat it as published below so
      // its durable Parent rows are removed before this request completes.
    }

    const { data: parentNotifications, error: parentNotificationsError } = await supabase
      .from("parent_announcement_notifications")
      .select("parent_id")
      .eq("source", "adviser")
      .eq("announcement_id", id);
    if (parentNotificationsError) throw parentNotificationsError;

    const { error: notificationError } = await supabase
      .from("parent_announcement_notifications")
      .delete()
      .eq("source", "adviser")
      .eq("announcement_id", id);
    if (notificationError) throw notificationError;

    const { error: deleteError } = await supabase
      .from("adviser_announcements")
      .delete()
      .eq("id", id)
      .eq("adviser_id", adviser.id);
    if (deleteError) throw deleteError;

    const principalRecipients = await recipientsForRoles(["principal"]);
    await publishRealtimeInvalidation([
      ...new Set((parentNotifications ?? []).map((row) => Number(row.parent_id))
        .filter((parentId) => Number.isSafeInteger(parentId) && parentId > 0)
        .map((id) => ({ role: "parent" as const, id }))),
      ...principalRecipients,
      { role: "adviser", id: Number(adviser.id) },
    ], "announcements");

    await logAnnouncementAudit({
      action: "Deleted",
      actor: { id: adviser.id, name: adviserFullName(adviser), role: "Adviser", email: adviser.email },
      announcement: { id, title: String(announcement.title ?? "Announcement"), audience, status: "Deleted" },
      previousStatus: String(announcement.status ?? "Published"),
      headers: req.headers,
    });
    return NextResponse.json({ success: true, cancelled: false });
  } catch (error) {
    console.error("DELETE /api/adviser/announcements/[id] error:", error);
    return NextResponse.json({ success: false, message: "Failed to delete announcement." }, { status: 500 });
  }
}
