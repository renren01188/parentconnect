import { NextRequest, NextResponse } from "next/server";
import { getActiveIct } from "@/lib/apiAuthorization";
import { logAudit } from "@/lib/audit";
import { processDueAdviserTransfers } from "@/lib/processDueAdviserTransfers";
import { supabase } from "@/lib/supabase";
import { publishAccountRealtimeInvalidation } from "@/lib/realtimeInvalidation";

type AdviserRecord = {
  id: number;
  first_name: string;
  middle_name: string | null;
  last_name: string;
  suffix: string | null;
  email: string;
  grade: string | null;
  section: string | null;
  sections: string[] | null;
  status: string | null;
  archive_status: string | null;
};

type TransferConflict = {
  grade: string;
  section: string;
  outgoingAdviserId: number;
  outgoingAdviserName: string;
  outgoingAdviserEmail: string;
};

function adviserName(adviser: AdviserRecord) {
  return [adviser.first_name, adviser.middle_name, adviser.last_name, adviser.suffix].filter(Boolean).join(" ");
}

function assignedSections(adviser: AdviserRecord) {
  return (adviser.sections?.length ? adviser.sections : adviser.section ? [adviser.section] : [])
    .map((section) => section.trim())
    .filter(Boolean);
}

function isActive(adviser: AdviserRecord) {
  return adviser.status === "active" && adviser.archive_status !== "archived";
}

function isMissingTransferSchema(error: { message?: string; code?: string } | null) {
  return !!error && (error.code === "42P01" || /scheduled_adviser_transfers|schema cache|does not exist/i.test(error.message ?? ""));
}

async function getAdviser(id: number) {
  const { data, error } = await supabase
    .from("advisers")
    .select("id, first_name, middle_name, last_name, suffix, email, grade, section, sections, status, archive_status")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data as AdviserRecord | null;
}

async function findSectionOwner(grade: string, section: string, excludedId: number) {
  const { data, error } = await supabase
    .from("advisers")
    .select("id, first_name, middle_name, last_name, suffix, email, grade, section, sections, status, archive_status")
    .eq("grade", grade)
    .eq("status", "active")
    .neq("id", excludedId);
  if (error) throw error;
  return ((data ?? []) as AdviserRecord[]).find((adviser) =>
    isActive(adviser) && assignedSections(adviser).includes(section),
  ) ?? null;
}

function relocationFrom(incoming: AdviserRecord, targetGrade: string) {
  const sections = assignedSections(incoming);
  return sections.length > 0 && incoming.grade && incoming.grade !== targetGrade
    ? { grade: incoming.grade, sections }
    : null;
}

async function processImmediateFallback({ outgoings, incoming, grade, sections, releaseCurrentAssignment }: {
  outgoings: AdviserRecord[];
  incoming: AdviserRecord;
  grade: string;
  sections: string[];
  releaseCurrentAssignment: boolean;
}) {
  const uniqueOutgoings = new Map(outgoings.map((outgoing) => [outgoing.id, outgoing]));
  for (const outgoing of uniqueOutgoings.values()) {
    const nextSections = assignedSections(outgoing).filter((section) => !sections.includes(section));
    const { error } = await supabase.from("advisers").update({
      grade: nextSections.length ? outgoing.grade : null,
      section: nextSections[0] ?? null,
      sections: nextSections,
      updated_at: new Date().toISOString(),
    }).eq("id", outgoing.id);
    if (error) throw error;
  }

  const nextIncomingSections = releaseCurrentAssignment
    ? sections
    : [...new Set([...assignedSections(incoming), ...sections])];
  const { error: incomingError } = await supabase.from("advisers").update({
    grade,
    section: nextIncomingSections[0] ?? null,
    sections: nextIncomingSections,
    updated_at: new Date().toISOString(),
  }).eq("id", incoming.id);
  if (incomingError) {
    await Promise.all([...uniqueOutgoings.values()].map((outgoing) => supabase.from("advisers").update({
      grade: outgoing.grade,
      section: assignedSections(outgoing)[0] ?? null,
      sections: assignedSections(outgoing),
      updated_at: new Date().toISOString(),
    }).eq("id", outgoing.id)));
    throw incomingError;
  }
}

async function requireIct() {
  const ict = await getActiveIct();
  if (!ict) return { error: NextResponse.json({ success: false, message: "Unauthorized." }, { status: 401 }) };
  return { ict };
}

export async function GET() {
  const auth = await requireIct();
  if ("error" in auth) return auth.error;

  try {
    await processDueAdviserTransfers();
    const { data, error } = await supabase
      .from("scheduled_adviser_transfers")
      .select("id, outgoing_adviser_id, incoming_adviser_id, grade, section, effective_at, note, status, failure_reason, created_at")
      .in("status", ["Scheduled", "Failed"])
      .order("effective_at", { ascending: true });
    if (error) {
      if (isMissingTransferSchema(error)) return NextResponse.json({ success: true, transfers: [], configured: false });
      throw error;
    }

    const ids = [...new Set((data ?? []).flatMap((item) => [item.outgoing_adviser_id, item.incoming_adviser_id]))];
    const { data: advisers, error: advisersError } = ids.length
      ? await supabase.from("advisers").select("id, first_name, middle_name, last_name, suffix, email, grade, section, sections, status, archive_status").in("id", ids)
      : { data: [], error: null };
    if (advisersError) throw advisersError;
    const names = new Map(((advisers ?? []) as AdviserRecord[]).map((adviser) => [adviser.id, adviserName(adviser)]));
    return NextResponse.json({
      success: true,
      configured: true,
      transfers: (data ?? []).map((item) => ({
        ...item,
        outgoing_name: names.get(item.outgoing_adviser_id) ?? "Former adviser",
        incoming_name: names.get(item.incoming_adviser_id) ?? "Incoming adviser",
      })),
    });
  } catch (error) {
    return NextResponse.json({ success: false, message: error instanceof Error ? error.message : "Unable to load adviser transfers." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireIct();
  if ("error" in auth) return auth.error;

  try {
    const body = await request.json();
    const action = body.action as "check" | "schedule" | "immediate" | "cancel";

    if (action === "cancel") {
      const id = Number(body.transferId);
      if (!Number.isInteger(id)) return NextResponse.json({ success: false, message: "A valid transfer is required." }, { status: 400 });
      const { data, error } = await supabase.from("scheduled_adviser_transfers").update({
        status: "Cancelled",
        cancelled_at: new Date().toISOString(),
        cancelled_by_ict_id: auth.ict.id,
      }).eq("id", id).eq("status", "Scheduled").select("id, grade, section").maybeSingle();
      if (error) {
        if (isMissingTransferSchema(error)) return NextResponse.json({ success: false, code: "SCHEDULED_TRANSFERS_NOT_CONFIGURED", message: "Scheduled transfers are not configured yet." }, { status: 503 });
        throw error;
      }
      if (!data) return NextResponse.json({ success: false, message: "This transfer is no longer scheduled." }, { status: 409 });
      await logAudit({ action: "Adviser Transfer Cancelled", performedById: auth.ict.id, performedBy: `ICT ${auth.ict.id}`, performedByRole: "ICT", targetUser: `Grade ${data.grade} - ${data.section}`, targetRole: "Adviser", targetType: "adviser_transfer", targetId: id, module: "User Management", details: "Cancelled the scheduled adviser handover before its effective date." });
      await publishAccountRealtimeInvalidation();
      return NextResponse.json({ success: true });
    }

    const incomingId = Number(body.incomingAdviserId);
    const grade = typeof body.grade === "string" ? body.grade.trim() : "";
    const sections = Array.isArray(body.sections) ? body.sections.map((item: unknown) => String(item).trim()).filter(Boolean) : [];
    if (!Number.isInteger(incomingId) || !grade || !sections.length || sections.length > 2) {
      return NextResponse.json({ success: false, message: "Choose an incoming adviser, grade, and one or two sections." }, { status: 400 });
    }

    const incoming = await getAdviser(incomingId);
    if (!incoming || !isActive(incoming)) return NextResponse.json({ success: false, message: "The incoming adviser is no longer active." }, { status: 409 });
    const relocation = relocationFrom(incoming, grade);
    const releaseCurrentAssignment = body.releaseCurrentAssignment === true;

    const conflicts: TransferConflict[] = [];
    for (const section of sections) {
      if (!relocation && !assignedSections(incoming).includes(section) && assignedSections(incoming).length >= 2) {
        return NextResponse.json({ success: false, message: "The incoming adviser already has the maximum of two sections." }, { status: 409 });
      }
      const outgoing = await findSectionOwner(grade, section, incoming.id);
      if (outgoing) conflicts.push({ grade, section, outgoingAdviserId: outgoing.id, outgoingAdviserName: adviserName(outgoing), outgoingAdviserEmail: outgoing.email });
    }

    if (action === "check") return NextResponse.json({ success: true, conflicts, relocation });
    if (action !== "schedule" && action !== "immediate") return NextResponse.json({ success: false, message: "Unsupported transfer action." }, { status: 400 });
    if (relocation && !releaseCurrentAssignment) {
      return NextResponse.json({ success: false, code: "RELOCATION_ACKNOWLEDGEMENT_REQUIRED", message: `Confirm the release of ${relocation.grade} - ${relocation.sections.join(", ")} before moving this adviser.` }, { status: 409 });
    }
    if (conflicts.length !== sections.length) {
      return NextResponse.json({ success: false, message: "Every selected section must still have an active outgoing adviser before the handover can be scheduled." }, { status: 409 });
    }

    const outgoingIds = [...new Set(conflicts.map((conflict) => conflict.outgoingAdviserId))];
    const outgoings = (await Promise.all(outgoingIds.map((id) => getAdviser(id)))).filter((outgoing): outgoing is AdviserRecord => !!outgoing);
    if (outgoings.length !== outgoingIds.length || conflicts.some((conflict) => !outgoings.some((outgoing) => assignedSections(outgoing).includes(conflict.section)))) {
      return NextResponse.json({ success: false, message: "The section assignment changed. Refresh and try again." }, { status: 409 });
    }

    const note = typeof body.note === "string" ? body.note.trim().slice(0, 500) || null : null;
    const targetSections = conflicts.map((conflict) => conflict.section);
    const transferRows = (effectiveAt: string) => conflicts.map((conflict, index) => ({
      outgoing_adviser_id: conflict.outgoingAdviserId,
      incoming_adviser_id: incoming.id,
      grade,
      section: conflict.section,
      effective_at: effectiveAt,
      release_incoming_assignment: !!relocation && index === 0,
      note,
      requested_by_ict_id: auth.ict.id,
    }));
    const outgoingNames = [...new Set(conflicts.map((conflict) => conflict.outgoingAdviserName))].join(", ");
    const relocationDetail = relocation ? ` ${adviserName(incoming)} will release ${relocation.grade} - ${relocation.sections.join(", ")}.` : "";

    if (action === "immediate") {
      const { data: history, error: historyError } = await supabase.from("scheduled_adviser_transfers")
        .insert(transferRows(new Date().toISOString()))
        .select("id");
      if (!historyError) {
        const processed = await processDueAdviserTransfers();
        const results = [...processed.completed, ...processed.failed].filter((item) =>
          item.incoming_adviser_id === incoming.id && item.grade === grade && targetSections.includes(item.section),
        );
        const failed = results.find((item) => !item.completed);
        if (failed) return NextResponse.json({ success: false, message: failed.failure_reason || "The transfer could not be completed." }, { status: 409 });
        if (results.length === conflicts.length && results.every((item) => item.completed)) {
          await publishAccountRealtimeInvalidation([
            { role: "adviser", id: incoming.id },
            ...outgoingIds.map((id) => ({ role: "adviser" as const, id })),
          ]);
          return NextResponse.json({ success: true, immediate: true, transferIds: results.map((item) => item.transfer_id) });
        }
        if (!processed.unavailable) throw new Error("The immediate transfer was not confirmed by the database.");
      } else if (!isMissingTransferSchema(historyError)) {
        throw historyError;
      }

      await processImmediateFallback({ outgoings, incoming, grade, sections: targetSections, releaseCurrentAssignment: !!relocation });
      const historyIds = (history ?? []).map((item) => item.id);
      if (historyIds.length) {
        const { error: historyUpdateError } = await supabase.from("scheduled_adviser_transfers").update({
          status: "Completed",
          completed_at: new Date().toISOString(),
          failure_reason: null,
        }).in("id", historyIds);
        if (historyUpdateError) throw historyUpdateError;
      }
      await logAudit({ action: "Adviser Transfer Completed", performedById: auth.ict.id, performedBy: `ICT ${auth.ict.id}`, performedByRole: "ICT", targetUser: `Grade ${grade} - ${targetSections.join(", ")}`, targetRole: "Adviser", targetType: "adviser_transfer", targetId: incoming.id, module: "User Management", details: `Immediately transferred Grade ${grade} - ${targetSections.join(", ")} from ${outgoingNames} to ${adviserName(incoming)}.${relocationDetail}`, metadata: { outgoingAdviserIds: outgoingIds, incomingAdviserId: incoming.id, immediate: true, releasedAssignment: relocation } });
      await publishAccountRealtimeInvalidation([
        { role: "adviser", id: incoming.id },
        ...outgoingIds.map((id) => ({ role: "adviser" as const, id })),
      ]);
      return NextResponse.json({ success: true, immediate: true, transferIds: historyIds });
    }

    const effectiveDate = typeof body.effectiveDate === "string" ? body.effectiveDate : "";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(effectiveDate)) return NextResponse.json({ success: false, message: "Choose the transfer effective date." }, { status: 400 });
    const effectiveAt = new Date(`${effectiveDate}T00:00:00+08:00`);
    if (Number.isNaN(effectiveAt.getTime()) || effectiveAt.getTime() <= Date.now()) {
      return NextResponse.json({ success: false, message: "Choose a future effective date, or use Effect Transfer Immediately." }, { status: 400 });
    }

    const { data, error } = await supabase.from("scheduled_adviser_transfers")
      .insert(transferRows(effectiveAt.toISOString()))
      .select("id");
    if (error) {
      if (isMissingTransferSchema(error)) return NextResponse.json({ success: false, code: "SCHEDULED_TRANSFERS_NOT_CONFIGURED", message: "Scheduled transfers need the database migration to be deployed. You can still use Effect Transfer Immediately." }, { status: 503 });
      if (error.code === "23505") return NextResponse.json({ success: false, message: "A transfer is already scheduled for one of these sections." }, { status: 409 });
      throw error;
    }
    const transferIds = (data ?? []).map((item) => item.id);
    await logAudit({ action: "Adviser Transfer Scheduled", performedById: auth.ict.id, performedBy: `ICT ${auth.ict.id}`, performedByRole: "ICT", targetUser: `Grade ${grade} - ${targetSections.join(", ")}`, targetRole: "Adviser", targetType: "adviser_transfer", targetId: transferIds[0], module: "User Management", details: `Scheduled transfer of Grade ${grade} - ${targetSections.join(", ")} from ${outgoingNames} to ${adviserName(incoming)} for ${effectiveDate}.${relocationDetail}`, metadata: { outgoingAdviserIds: outgoingIds, incomingAdviserId: incoming.id, effectiveAt: effectiveAt.toISOString(), releasedAssignment: relocation } });
    await publishAccountRealtimeInvalidation([
      { role: "adviser", id: incoming.id },
      ...outgoingIds.map((id) => ({ role: "adviser" as const, id })),
    ]);
    return NextResponse.json({ success: true, immediate: false, transferIds });
  } catch (error) {
    return NextResponse.json({ success: false, message: error instanceof Error ? error.message : "Unable to process the adviser transfer." }, { status: 500 });
  }
}
