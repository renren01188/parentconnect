import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { getPrincipalFromToken } from "@/lib/getPrincipalFromToken"; // use your existing auth helper
import { sendPrincipalAnnouncementEmail } from "@/lib/mailer";

export async function GET() {
  try {
    const principal = await getPrincipalFromToken();
    if (!principal) {
      return NextResponse.json({ success: false, message: "Not authenticated." }, { status: 401 });
    }

    // 1. Principal's own announcements
    const { data: mine, error: mineErr } = await supabase
      .from("principal_announcements")
      .select("*")
      .eq("sender_id", principal.id)
      .order("created_at", { ascending: false });

    if (mineErr) throw mineErr;

    // 2. Adviser announcements visible to principal
    // 2. Adviser announcements visible to principal
    const { data: adviserAnns } = await supabase
      .from("adviser_announcements")
      .select("id, title, message, adviser_name, grade, sections, created_at")
      .order("created_at", { ascending: false });

    // 3. ICT announcements visible to principal
    const { data: ictAnns } = await supabase
      .from("ict_announcements")
      .select("id, title, message, sender_name, created_at")
      .contains("audience", ["Principal"])
      .eq("status", "Published")
      .order("created_at", { ascending: false });

    // 3. Guidance announcements visible to principal
    const { data: guidanceAnns } = await supabase
      .from("guidance_announcements")
      .select("id, title, message, guidance_name, audience, created_at")
      .eq("status", "Published")
      .order("created_at", { ascending: false });

    const myAnns = (mine ?? []).map((a: any) => ({
      ...a,
      id: String(a.id),
      source: "principal" as const,
    }));

    const adviserShaped = (adviserAnns ?? []).map((a: any) => ({
      id: `adviser-${a.id}`,
      title: a.title ?? "Class Announcement",
      message: a.message,
      audience: `${a.grade} — ${Array.isArray(a.sections) ? a.sections.join(", ") : a.sections}`,
      created_at: a.created_at,
      senderName: a.adviser_name,
      source: "adviser" as const,
    }));

    const guidanceShaped = (guidanceAnns ?? []).map((a: any) => ({
      id: `guidance-${a.id}`,
      title: a.title ?? "Guidance Announcement",
      message: a.message,
      audience: "From: Guidance",
      created_at: a.created_at,
      senderName: a.guidance_name,
      source: "guidance" as const,
    }));

    const ictShaped = (ictAnns ?? []).map((a: any) => ({
      id: `ict-${a.id}`,
      title: a.title,
      message: a.message,
      audience: "From: ICT Office",
      created_at: a.created_at,
      senderName: a.sender_name ?? "ICT Office",
      source: "ict" as const,
    }));

    const all = [...myAnns, ...adviserShaped, ...guidanceShaped, ...ictShaped]
      .sort((a, b) => new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime());

    return NextResponse.json({ success: true, announcements: all });
  } catch (error) {
    console.error("GET /api/principal/announcements error:", error);
    return NextResponse.json({ success: false, message: "Failed to fetch." }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const principal = await getPrincipalFromToken();
    if (!principal) {
      return NextResponse.json({ success: false, message: "Not authenticated." }, { status: 401 });
    }

    const { title, message, audience, scheduled_at } = await req.json();

    if (!title?.trim() || !message?.trim()) {
      return NextResponse.json({ success: false, message: "Title and message are required." }, { status: 400 });
    }

    const status = scheduled_at ? "Scheduled" : "Published";

    const { data: ann, error } = await supabase
      .from("principal_announcements")
      .insert({
        sender_id: String(principal.id),
        title: title.trim(),
        message: message.trim(),
        audience,
        status,
        scheduled_at: scheduled_at ?? null,
      })
      .select()
      .single();

    if (error) throw error;

    // Fan out immediately only for Published announcements
    if (status === "Published") {
      await fanOutPrincipalAnnouncement(ann, principal);
    }

    return NextResponse.json({
      success: true,
      announcement: { ...ann, id: String(ann.id) },
    });
  } catch (error) {
    console.error("POST /api/principal/announcements error:", error);
    return NextResponse.json({ success: false, message: "Failed to create." }, { status: 500 });
  }
}

async function fanOutPrincipalAnnouncement(ann: any, principal: any) {
  const senderName = [principal.first_name, principal.last_name]
    .filter(Boolean).join(" ").trim() || "Principal";

  // ── Notify parents (audience = Everyone or Parents) ────────────────────────
  if (ann.audience === "Everyone" || ann.audience === "Parents") {

    // Fetch principal's own record to get their email
    const { data: principalRecord } = await supabase
      .from("principals")          // change this to whatever your principals table is named
      .select("email")
      .eq("id", principal.id)
      .maybeSingle();

    // Find if principal is also registered as a parent — if so, exclude them
    let excludeParentId: number | null = null;
    if (principalRecord?.email) {
      const { data: principalAsParent } = await supabase
        .from("parents")
        .select("id")
        .eq("email", principalRecord.email)
        .maybeSingle();
      excludeParentId = principalAsParent?.id ?? null;
    }

    const { data: links } = await supabase
      .from("parent_student_links")
      .select("parent_id, student_id");

    if (links?.length) {
      const seen = new Set<number>();
      const rows = (links as { parent_id: number; student_id: string }[])
        .filter(l => l.parent_id !== excludeParentId && !seen.has(l.parent_id) && seen.add(l.parent_id))
        .map(l => ({
          source: "principal",
          announcement_id: ann.id,
          parent_id: l.parent_id,
          student_id: String(l.student_id),
          title: ann.title,
          message: ann.message,
          sender_name: senderName,
          tab: "Principal",
          unread: true,
        }));

      const { error } = await supabase
        .from("parent_announcement_notifications")
        .upsert(rows, { onConflict: "source,announcement_id,parent_id" });

      if (error) console.error("Fan-out to parents error:", error.message);

      // Send email to each parent
      const { data: parentRows } = await supabase
        .from("parents")
        .select("id, email, parent_first_name, parent_last_name")
        .not("email", "is", null);

      for (const parent of parentRows ?? []) {
        if (parent.id === excludeParentId) continue;
        const parentName = [parent.parent_first_name, parent.parent_last_name].filter(Boolean).join(" ") || "Parent";
        sendPrincipalAnnouncementEmail({
          recipientEmail: parent.email,
          recipientName: parentName,
          principalName: senderName,
          title: ann.title,
          message: ann.message,
          audience: ann.audience,
        }).catch(err => console.error("Email to parent failed:", err));
      }
    }
  }

  // ── Notify guidance counselors (audience = Everyone or Advisers) ───────────
  if (ann.audience === "Everyone" || ann.audience === "Advisers") {
    const { data: guidanceStaff } = await supabase
      .from("guidance_announcements")
      .select("guidance_id")
      .order("created_at", { ascending: false });

    const uniqueGuidanceIds = [
      ...new Set((guidanceStaff ?? []).map((g: any) => g.guidance_id))
    ];

    if (uniqueGuidanceIds.length) {
      await supabase.from("adviser_notifications").insert(
        uniqueGuidanceIds.map((id: any) => ({
          adviser_id: id,
          announcement_id: ann.id,
          notif_key: `principal-announcement-${ann.id}-${id}`,
          title: `[Principal] ${ann.title}`,
          message: ann.message,
          type: "announcement",
          date: "today",
        }))
      );
    }
  }

  // ── Send emails to advisers and guidance (audience = Everyone or Advisers) ──
  if (ann.audience === "Everyone" || ann.audience === "Advisers") {
    const { data: adviserRows } = await supabase
      .from("advisers")
      .select("email, first_name, last_name")
      .not("email", "is", null);

    for (const adviser of adviserRows ?? []) {
      const adviserName = [adviser.first_name, adviser.last_name].filter(Boolean).join(" ") || "Adviser";
      sendPrincipalAnnouncementEmail({
        recipientEmail: adviser.email,
        recipientName: adviserName,
        principalName: senderName,
        title: ann.title,
        message: ann.message,
        audience: ann.audience,
      }).catch(err => console.error("Email to adviser failed:", err));
    }

    const { data: guidanceRows } = await supabase
      .from("guidance_counselors")
      .select("email, first_name, last_name")
      .not("email", "is", null);

    for (const guidance of guidanceRows ?? []) {
      const guidanceName = [guidance.first_name, guidance.last_name].filter(Boolean).join(" ") || "Guidance Counselor";
      sendPrincipalAnnouncementEmail({
        recipientEmail: guidance.email,
        recipientName: guidanceName,
        principalName: senderName,
        title: ann.title,
        message: ann.message,
        audience: ann.audience,
      }).catch(err => console.error("Email to guidance failed:", err));
    }
  }
}