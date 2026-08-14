import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { deliverPrincipalAnnouncement } from "@/lib/deliverPrincipalAnnouncement";

// Invoke this endpoint from a protected scheduler (for example, Supabase
// pg_cron/pg_net) every minute with Authorization: Bearer CRON_SECRET.
export async function POST(req: Request) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ success: false }, { status: 401 });
  }

  try {
    const { data: dueAnnouncements, error: dueError } = await supabase
      .from("principal_announcements")
      .select("*, principals(first_name, last_name)")
      .eq("status", "Scheduled")
      .not("scheduled_at", "is", null)
      .lte("scheduled_at", new Date().toISOString())
      .order("scheduled_at", { ascending: true });
    if (dueError) throw dueError;

    let sent = 0;
    for (const scheduled of dueAnnouncements ?? []) {
      // The status check makes concurrent scheduler calls safe: only one can
      // promote a specific announcement from Scheduled to Published.
      const { data: published, error: publishError } = await supabase
        .from("principal_announcements")
        .update({ status: "Published" })
        .eq("id", scheduled.id)
        .eq("status", "Scheduled")
        .select()
        .maybeSingle();
      if (publishError) throw publishError;
      if (!published) continue;

      await deliverPrincipalAnnouncement(published, {
        id: published.sender_id,
        first_name: scheduled.principals?.first_name,
        last_name: scheduled.principals?.last_name,
      });
      const { error: deliveredError } = await supabase
        .from("principal_announcements")
        .update({ emails_sent: true })
        .eq("id", published.id);
      if (deliveredError) throw deliveredError;
      sent += 1;
    }

    return NextResponse.json({ success: true, sent });
  } catch (error) {
    console.error("principal scheduled-announcement delivery error:", error);
    return NextResponse.json({ success: false }, { status: 500 });
  }
}
