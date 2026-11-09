import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { getAdviserFromToken } from "@/lib/getAdviserFromToken";
import { publishRealtimeInvalidation, recipientsForRoles } from "@/lib/realtimeInvalidation";
import { logAnnouncementAudit } from "@/lib/announcementAudit";
import { normalizeOptionalAnnouncementSchedule } from "@/lib/announcementSchedule";
import { deliverAdviserAnnouncement } from "@/lib/deliverAdviserAnnouncement";

function adviserFullName(adviser: {
  first_name?: string | null;
  last_name?: string | null;
}) {
  return [adviser.first_name, adviser.last_name].filter(Boolean).join(" ").trim() || "Class Adviser";
}

export async function GET() {
  try {
    const adviser = await getAdviserFromToken();
    if (!adviser) return NextResponse.json({ success: false, message: "Not authenticated." }, { status: 401 });

    const { data, error } = await supabase
      .from("adviser_announcements")
      .select("id, title, message, grade, sections, status, scheduled_at, created_at")
      .eq("adviser_id", adviser.id)
      .in("status", ["Published", "Scheduled"])
      .order("created_at", { ascending: false });
    if (error) throw error;
    return NextResponse.json({ success: true, announcements: data ?? [] });
  } catch (error) {
    console.error("GET /api/adviser/announcements error:", error);
    return NextResponse.json({ success: false, message: "Failed to load announcements." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const adviser = await getAdviserFromToken();
    if (!adviser) {
      return NextResponse.json({ success: false, message: "Not authenticated." }, { status: 401 });
    }

    const body = await req.json();
    const message = typeof body.message === "string" ? body.message.trim() : "";
    const title = typeof body.title === "string" && body.title.trim()
      ? body.title.trim()
      : "Announcement from Class Adviser";
    const schedule = normalizeOptionalAnnouncementSchedule(body.schedule_date);
    if (!schedule.ok) return NextResponse.json({ success: false, message: schedule.message }, { status: 400 });

    if (!message) {
      return NextResponse.json({ success: false, message: "Announcement message is required." }, { status: 400 });
    }
    if (message.length > 1000) {
      return NextResponse.json({ success: false, message: "Announcement message must be 1,000 characters or fewer." }, { status: 400 });
    }

    const adviserSections = adviser.sections?.length
      ? adviser.sections
      : adviser.section
        ? [adviser.section]
        : [];
    if (!adviser.grade || adviserSections.length === 0) {
      return NextResponse.json({ success: false, message: "Your advisory grade and section are not configured." }, { status: 400 });
    }

    const status = schedule.scheduledAt ? "Scheduled" : "Published";
    const { data: announcement, error: announcementError } = await supabase
      .from("adviser_announcements")
      .insert({
        adviser_id: adviser.id,
        adviser_name: adviserFullName(adviser),
        grade: adviser.grade,
        sections: adviserSections,
        title,
        message,
        status,
        scheduled_at: schedule.scheduledAt,
      })
      .select("id, adviser_id, adviser_name, grade, sections, title, message, status, scheduled_at, created_at")
      .single();
    if (announcementError) throw announcementError;

    let deliveredCount = 0;
    if (status === "Published") {
      const delivery = await deliverAdviserAnnouncement(announcement);
      deliveredCount = delivery.deliveredCount;
      const principalRecipients = await recipientsForRoles(["principal"]);
      await publishRealtimeInvalidation([
        ...delivery.parentIds.map((id) => ({ role: "parent" as const, id })),
        ...principalRecipients,
        { role: "adviser", id: Number(adviser.id) },
      ], "announcements");
    } else {
      await publishRealtimeInvalidation([{ role: "adviser", id: Number(adviser.id) }], "announcements");
    }

    await logAnnouncementAudit({
      action: status === "Published" ? "Published" : "Scheduled",
      actor: { id: adviser.id, name: adviserFullName(adviser), role: "Adviser", email: adviser.email },
      announcement: {
        id: announcement.id,
        title: announcement.title,
        audience: `Grade ${adviser.grade} - ${adviserSections.join(", ")}`,
        status,
      },
      headers: req.headers,
    });

    return NextResponse.json({ success: true, announcement, deliveredCount });
  } catch (error) {
    console.error("POST /api/adviser/announcements error:", error);
    return NextResponse.json({ success: false, message: "Failed to save announcement." }, { status: 500 });
  }
}
