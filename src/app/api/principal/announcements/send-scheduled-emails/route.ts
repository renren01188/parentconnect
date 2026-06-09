import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { sendPrincipalAnnouncementEmail } from "@/lib/mailer";

// This route is called every minute by a pg_cron job via a Supabase HTTP extension
// or simply polled. It finds recently auto-published announcements and sends emails.
export async function POST(req: Request) {
  // Simple secret check to prevent unauthorized calls
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ success: false }, { status: 401 });
  }

  try {
    // Find announcements published in the last 2 minutes that were scheduled
    // (scheduled_at is not null = was a scheduled announcement, not immediate)
    const { data: recentlyPublished } = await supabase
      .from("principal_announcements")
      .select("*, principals(first_name, last_name)")
      .eq("status", "Published")
      .not("scheduled_at", "is", null)
      .eq("emails_sent", false)
      .order("scheduled_at", { ascending: false });

    if (!recentlyPublished || recentlyPublished.length === 0) {
      return NextResponse.json({ success: true, sent: 0 });
    }

    for (const ann of recentlyPublished) {
      const senderName = [ann.principals?.first_name, ann.principals?.last_name]
        .filter(Boolean).join(" ") || "Principal";

      // Send to parents
      if (ann.audience === "Everyone" || ann.audience === "Parents") {
        const { data: parents } = await supabase
          .from("parents")
          .select("id, email, parent_first_name, parent_last_name")
          .not("email", "is", null);

        for (const parent of parents ?? []) {
          const parentName = [parent.parent_first_name, parent.parent_last_name]
            .filter(Boolean).join(" ") || "Parent";
          sendPrincipalAnnouncementEmail({
            recipientEmail: parent.email,
            recipientName: parentName,
            principalName: senderName,
            title: ann.title,
            message: ann.message,
            audience: ann.audience,
          }).catch(err => console.error("Scheduled email to parent failed:", err));
        }
      }

      // Send to advisers and guidance
      if (ann.audience === "Everyone" || ann.audience === "Advisers") {
        const { data: advisers } = await supabase
          .from("advisers")
          .select("email, first_name, last_name")
          .not("email", "is", null);

        for (const adviser of advisers ?? []) {
          const adviserName = [adviser.first_name, adviser.last_name]
            .filter(Boolean).join(" ") || "Adviser";
          sendPrincipalAnnouncementEmail({
            recipientEmail: adviser.email,
            recipientName: adviserName,
            principalName: senderName,
            title: ann.title,
            message: ann.message,
            audience: ann.audience,
          }).catch(err => console.error("Scheduled email to adviser failed:", err));
        }

        const { data: guidanceRows } = await supabase
          .from("guidance_counselors")
          .select("email, first_name, last_name")
          .not("email", "is", null);

        for (const guidance of guidanceRows ?? []) {
          const guidanceName = [guidance.first_name, guidance.last_name]
            .filter(Boolean).join(" ") || "Guidance Counselor";
          sendPrincipalAnnouncementEmail({
            recipientEmail: guidance.email,
            recipientName: guidanceName,
            principalName: senderName,
            title: ann.title,
            message: ann.message,
            audience: ann.audience,
          }).catch(err => console.error("Scheduled email to guidance failed:", err));
        }
      }

      // Mark emails as sent so we don't resend
      await supabase
        .from("principal_announcements")
        .update({ emails_sent: true })
        .eq("id", ann.id);
    }

    return NextResponse.json({ success: true, sent: recentlyPublished.length });
  } catch (error) {
    console.error("send-scheduled-emails error:", error);
    return NextResponse.json({ success: false }, { status: 500 });
  }
}