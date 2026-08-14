import { supabase } from "@/lib/supabase";
import { sendPrincipalAnnouncementEmail } from "@/lib/mailer";

type PrincipalSender = { id: string | number; first_name?: string | null; last_name?: string | null };
type PrincipalAnnouncement = { id: number; title: string; message: string; audience: string };

/** Deliver a newly published principal announcement exactly as a normal post would. */
export async function deliverPrincipalAnnouncement(announcement: PrincipalAnnouncement, principal: PrincipalSender) {
  const principalName = [principal.first_name, principal.last_name].filter(Boolean).join(" ") || "Principal";

  if (announcement.audience === "Everyone" || announcement.audience === "Parents") {
    const { data: principalRecord, error: principalError } = await supabase
      .from("principals").select("email").eq("id", principal.id).maybeSingle();
    if (principalError) throw principalError;

    let excludedParentId: number | null = null;
    if (principalRecord?.email) {
      const { data: principalAsParent, error } = await supabase
        .from("parents").select("id").eq("email", principalRecord.email).maybeSingle();
      if (error) throw error;
      excludedParentId = principalAsParent?.id ?? null;
    }

    const { data: links, error: linksError } = await supabase
      .from("parent_student_links").select("parent_id, student_id");
    if (linksError) throw linksError;

    const recipientRows: Array<{ source: string; announcement_id: number; parent_id: number; student_id: string; title: string; message: string; sender_name: string; tab: string; unread: boolean }> = [];
    const seenParentIds = new Set<number>();
    for (const link of links ?? []) {
      if (link.parent_id === excludedParentId || seenParentIds.has(link.parent_id)) continue;
      seenParentIds.add(link.parent_id);
      recipientRows.push({ source: "principal", announcement_id: announcement.id, parent_id: link.parent_id, student_id: String(link.student_id), title: announcement.title, message: announcement.message, sender_name: principalName, tab: "Principal", unread: true });
    }
    if (recipientRows.length > 0) {
      const { error } = await supabase.from("parent_announcement_notifications")
        .upsert(recipientRows, { onConflict: "source,announcement_id,parent_id" });
      if (error) throw error;
    }

    const { data: parents, error: parentsError } = await supabase
      .from("parents").select("id, email, parent_first_name, parent_last_name").not("email", "is", null);
    if (parentsError) throw parentsError;
    await Promise.allSettled((parents ?? []).filter((parent) => parent.id !== excludedParentId).map((parent) =>
      sendPrincipalAnnouncementEmail({ recipientEmail: parent.email, recipientName: [parent.parent_first_name, parent.parent_last_name].filter(Boolean).join(" ") || "Parent", principalName, title: announcement.title, message: announcement.message, audience: announcement.audience })
    ));
  }

  if (announcement.audience === "Everyone" || announcement.audience === "Advisers") {
    const [{ data: advisers, error: advisersError }, { data: guidance, error: guidanceError }] = await Promise.all([
      supabase.from("advisers").select("email, first_name, last_name").not("email", "is", null),
      supabase.from("guidance_counselors").select("email, first_name, last_name").not("email", "is", null),
    ]);
    if (advisersError) throw advisersError;
    if (guidanceError) throw guidanceError;
    await Promise.allSettled([
      ...(advisers ?? []).map((person) => sendPrincipalAnnouncementEmail({ recipientEmail: person.email, recipientName: [person.first_name, person.last_name].filter(Boolean).join(" ") || "Adviser", principalName, title: announcement.title, message: announcement.message, audience: announcement.audience })),
      ...(guidance ?? []).map((person) => sendPrincipalAnnouncementEmail({ recipientEmail: person.email, recipientName: [person.first_name, person.last_name].filter(Boolean).join(" ") || "Guidance Counselor", principalName, title: announcement.title, message: announcement.message, audience: announcement.audience })),
    ]);
  }
}
