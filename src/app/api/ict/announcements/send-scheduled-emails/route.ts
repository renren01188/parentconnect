import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { sendIctAnnouncementEmail } from "@/lib/mailer";

export async function POST(req: Request) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ success: false }, { status: 401 });
  }

  try {
    const { data: recentlyPublished } = await supabase
      .from("ict_announcements")
      .select("*")
      .eq("status", "Published")
      .not("scheduled_at", "is", null)
      .eq("emails_sent", false)
      .order("scheduled_at", { ascending: false });

    if (!recentlyPublished || recentlyPublished.length === 0) {
      return NextResponse.json({ success: true, sent: 0 });
    }

    for (const ann of recentlyPublished) {
      const audience: string[] = Array.isArray(ann.audience) ? ann.audience : [];
      const senderName = ann.sender_name || "ICT Office";

      if (audience.includes("Parents")) {
        const { data: parents } = await supabase
          .from("parents")
          .select("id, email, parent_first_name, parent_last_name")
          .not("email", "is", null);

        for (const parent of parents ?? []) {
          const name = [parent.parent_first_name, parent.parent_last_name]
            .filter(Boolean).join(" ") || "Parent";
          sendIctAnnouncementEmail({
            recipientEmail: parent.email,
            recipientName: name,
            senderName,
            title: ann.title,
            message: ann.message,
            audience,
          }).catch(err => console.error("Scheduled ICT email to parent failed:", err));
        }
      }

      if (audience.includes("Class Advisers")) {
        const { data: advisers } = await supabase
          .from("advisers")
          .select("email, first_name, last_name")
          .not("email", "is", null);

        for (const adviser of advisers ?? []) {
          const name = [adviser.first_name, adviser.last_name]
            .filter(Boolean).join(" ") || "Adviser";
          sendIctAnnouncementEmail({
            recipientEmail: adviser.email,
            recipientName: name,
            senderName,
            title: ann.title,
            message: ann.message,
            audience,
          }).catch(err => console.error("Scheduled ICT email to adviser failed:", err));
        }
      }

      if (audience.includes("Guidance")) {
        const { data: guidanceRows } = await supabase
          .from("guidance_counselors")
          .select("email, first_name, last_name")
          .not("email", "is", null);

        for (const g of guidanceRows ?? []) {
          const name = [g.first_name, g.last_name]
            .filter(Boolean).join(" ") || "Guidance";
          sendIctAnnouncementEmail({
            recipientEmail: g.email,
            recipientName: name,
            senderName,
            title: ann.title,
            message: ann.message,
            audience,
          }).catch(err => console.error("Scheduled ICT email to guidance failed:", err));
        }
      }

      if (audience.includes("Principal")) {
        const { data: principalRows } = await supabase
          .from("principals")
          .select("email, first_name, last_name")
          .not("email", "is", null);

        for (const p of principalRows ?? []) {
          const name = [p.first_name, p.last_name]
            .filter(Boolean).join(" ") || "Principal";
          sendIctAnnouncementEmail({
            recipientEmail: p.email,
            recipientName: name,
            senderName,
            title: ann.title,
            message: ann.message,
            audience,
          }).catch(err => console.error("Scheduled ICT email to principal failed:", err));
        }
      }

      await supabase
        .from("ict_announcements")
        .update({ emails_sent: true })
        .eq("id", ann.id);
    }

    return NextResponse.json({ success: true, sent: recentlyPublished.length });
  } catch (error) {
    console.error("ICT send-scheduled-emails error:", error);
    return NextResponse.json({ success: false }, { status: 500 });
  }
}