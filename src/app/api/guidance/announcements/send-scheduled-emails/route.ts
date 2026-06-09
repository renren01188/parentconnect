import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { sendGuidanceAnnouncementEmail } from "@/lib/mailer";

export async function POST(req: Request) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ success: false }, { status: 401 });
  }

  try {
    const { data: recentlyPublished } = await supabase
      .from("guidance_announcements")
      .select("*")
      .eq("status", "Published")
      .not("scheduled_at", "is", null)
      .eq("emails_sent", false)
      .order("scheduled_at", { ascending: false });

    if (!recentlyPublished || recentlyPublished.length === 0) {
      return NextResponse.json({ success: true, sent: 0 });
    }

    for (const ann of recentlyPublished) {
      // Send to parents
      if (ann.audience === "Parents" || ann.audience === "Both") {
        const { data: parents } = await supabase
          .from("parents")
          .select("id, email, parent_first_name, parent_last_name")
          .not("email", "is", null);

        for (const parent of parents ?? []) {
          const parentName = [parent.parent_first_name, parent.parent_last_name]
            .filter(Boolean).join(" ") || "Parent";
          sendGuidanceAnnouncementEmail({
            recipientEmail: parent.email,
            recipientName: parentName,
            guidanceName: ann.guidance_name,
            title: ann.title,
            message: ann.message,
            audience: ann.audience,
          }).catch(err => console.error("Scheduled guidance email to parent failed:", err));
        }
      }

      // Send to advisers
      if (ann.audience === "Class Advisers" || ann.audience === "Both") {
        const { data: advisers } = await supabase
          .from("advisers")
          .select("email, first_name, last_name")
          .not("email", "is", null);

        for (const adviser of advisers ?? []) {
          const adviserName = [adviser.first_name, adviser.last_name]
            .filter(Boolean).join(" ") || "Adviser";
          sendGuidanceAnnouncementEmail({
            recipientEmail: adviser.email,
            recipientName: adviserName,
            guidanceName: ann.guidance_name,
            title: ann.title,
            message: ann.message,
            audience: ann.audience,
          }).catch(err => console.error("Scheduled guidance email to adviser failed:", err));
        }
      }

      // Mark emails as sent
      await supabase
        .from("guidance_announcements")
        .update({ emails_sent: true })
        .eq("id", ann.id);
    }

    return NextResponse.json({ success: true, sent: recentlyPublished.length });
  } catch (error) {
    console.error("guidance send-scheduled-emails error:", error);
    return NextResponse.json({ success: false }, { status: 500 });
  }
}