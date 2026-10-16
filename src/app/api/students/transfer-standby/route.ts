// app/api/students/transfer-standby/route.ts
// Process 1 — Old Adviser places selected students on standby for level transfer.
//
// POST /api/students/transfer-standby
// Body: { studentIds: number[], targetGrade: string, targetSection: string, password: string }
//
// What it does:
//   1. Verifies the adviser's password (same pattern as DELETE /api/students)
//   2. Confirms every student belongs to this adviser's grade/section
//   3. Sets transfer_status = 'standby', target_grade, target_section on each student
//   4. Returns the list of students now on standby

import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { getAdviserFromToken } from "@/lib/getAdviserFromToken";
import bcrypt from "bcryptjs";
import { adviserRecipientsForClass, publishRealtimeInvalidation, studentRealtimeRecipientsForStudents } from "@/lib/realtimeInvalidation";
import { sendAdviserTransferReadyEmail } from "@/lib/mailer";

type Body = {
  studentIds:    number[];
  targetGrade:   string;
  targetSection: string;
  password:      string;
};

type ReceivingAdviser = {
  id: number;
  first_name: string | null;
  middle_name: string | null;
  last_name: string | null;
  suffix: string | null;
  email: string | null;
};

type TransferEmailNotification = {
  status: "sent" | "failed" | "skipped";
  message: string;
};

function adviserFullName(adviser: ReceivingAdviser) {
  return [adviser.first_name, adviser.middle_name, adviser.last_name, adviser.suffix]
    .filter(Boolean)
    .join(" ") || "Class Adviser";
}

async function notifyReceivingAdvisersByEmail({
  recipientIds,
  sourceGrade,
  sourceSections,
  targetGrade,
  targetSection,
}: {
  recipientIds: number[];
  sourceGrade: string;
  sourceSections: string[];
  targetGrade: string;
  targetSection: string;
}): Promise<TransferEmailNotification> {
  const uniqueIds = [...new Set(recipientIds.filter((id) => Number.isInteger(id) && id > 0))];
  if (uniqueIds.length === 0) {
    return { status: "skipped", message: "No receiving Adviser was available for an email notification." };
  }

  const { data, error } = await supabase
    .from("advisers")
    .select("id, first_name, middle_name, last_name, suffix, email")
    .in("id", uniqueIds);
  if (error) {
    console.error("Could not load receiving Adviser email addresses:", error.message);
    return { status: "failed", message: "The transfer was saved, but the receiving Adviser email could not be prepared." };
  }

  const recipients = new Map<string, ReceivingAdviser>();
  for (const adviser of (data ?? []) as ReceivingAdviser[]) {
    const email = String(adviser.email ?? "").trim().toLowerCase();
    if (email) recipients.set(email, adviser);
  }
  if (recipients.size === 0) {
    return { status: "skipped", message: "The transfer was saved, but the receiving Adviser has no registered email address." };
  }

  // This function is reached only after the conditional standby update has
  // changed every requested student. A retry of the same submission cannot
  // reach it because those students are no longer transfer_status = null.
  // One normalized email address receives one notice for the whole batch.
  const outcomes = await Promise.allSettled(
    [...recipients.entries()].map(([email, adviser]) => sendAdviserTransferReadyEmail({
      adviserEmail: email,
      adviserName: adviserFullName(adviser),
      sourceGrade,
      sourceSection: sourceSections.join(", "),
      targetGrade,
      targetSection,
    })),
  );
  const sent = outcomes.filter((outcome) => outcome.status === "fulfilled").length;
  const failed = outcomes.length - sent;
  if (failed > 0) {
    console.error("One or more receiving Adviser transfer emails failed to send.");
    return {
      status: "failed",
      message: sent > 0
        ? "The transfer was saved, but one receiving Adviser email could not be delivered."
        : "The transfer was saved, but the receiving Adviser email could not be delivered.",
    };
  }

  return {
    status: "sent",
    message: "The receiving Adviser was notified by email.",
  };
}

export async function POST(req: NextRequest) {
  try {
    const adviser = await getAdviserFromToken();
    if (!adviser) {
      return NextResponse.json(
        { success: false, message: "Unauthorized." },
        { status: 401 }
      );
    }

    const body = (await req.json()) as Body;
    const { studentIds, targetGrade, targetSection, password } = body;
    const requestedStudentIds = Array.isArray(studentIds)
      ? [...new Set(studentIds.filter((id): id is number => Number.isInteger(id) && id > 0))]
      : [];

    // ── Validate input ────────────────────────────────────────────────────────

    if (requestedStudentIds.length === 0) {
      return NextResponse.json(
        { success: false, message: "No students selected for transfer." },
        { status: 400 }
      );
    }

    if (!targetGrade?.trim()) {
      return NextResponse.json(
        { success: false, message: "Target grade level is required." },
        { status: 400 }
      );
    }

    if (!targetSection?.trim()) {
      return NextResponse.json(
        { success: false, message: "Target section is required." },
        { status: 400 }
      );
    }

    const normalizedTargetGrade = targetGrade.trim();
    const normalizedTargetSection = targetSection.trim();
    const { data: targetClass, error: targetClassError } = await supabase
      .from("sections")
      .select("id")
      .eq("grade", normalizedTargetGrade)
      .eq("name", normalizedTargetSection)
      .maybeSingle();
    if (targetClassError) throw targetClassError;
    if (!targetClass) {
      return NextResponse.json(
        { success: false, message: "Choose an existing destination grade level and section." },
        { status: 400 },
      );
    }

    // Pending transfers must have a real receiving Adviser. Otherwise a
    // student could leave the source roster with no authorized person able to
    // accept the transfer from Receive Transfer.
    const targetAdviserRecipients = await adviserRecipientsForClass(normalizedTargetGrade, normalizedTargetSection);
    if (targetAdviserRecipients.length === 0) {
      return NextResponse.json(
        { success: false, message: "The destination section does not have an active Adviser to receive this transfer." },
        { status: 409 },
      );
    }

    if (!password?.trim()) {
      return NextResponse.json(
        { success: false, message: "Password is required to authorize this transfer." },
        { status: 400 }
      );
    }

    // ── Verify adviser password (same as DELETE handler) ─────────────────────

    const { data: adviserRow, error: adviserFetchErr } = await supabase
      .from("advisers")
      .select("password_hash")
      .eq("id", adviser.id)
      .single();

    if (adviserFetchErr || !adviserRow) {
      return NextResponse.json(
        { success: false, message: "Could not verify adviser credentials." },
        { status: 500 }
      );
    }

    const passwordMatch = await bcrypt.compare(password.trim(), adviserRow.password_hash);
    if (!passwordMatch) {
      return NextResponse.json(
        { success: false, message: "Incorrect password. Please try again." },
        { status: 401 }
      );
    }

    // ── Confirm all students belong to this adviser ───────────────────────────

    const adviserSections: string[] = adviser.sections?.length
      ? adviser.sections
      : adviser.section
      ? [adviser.section]
      : [];

    // Fetch the students that match the given IDs AND belong to this adviser
    let studentsQuery = supabase
      .from("students")
      .select("id, student_id, first_name, last_name, grade, section, transfer_status")
      .in("id", requestedStudentIds)
      .eq("grade", adviser.grade)
      .eq("archive_status", "active")
      .is("transfer_status", null);

    if (adviserSections.length > 0) {
      const orFilter = adviserSections.map((s) => `section.eq.${s}`).join(",");
      studentsQuery = studentsQuery.or(orFilter);
    }

    const { data: ownedStudents, error: fetchErr } = await studentsQuery;
    if (fetchErr) throw fetchErr;

    if (!ownedStudents || ownedStudents.length === 0) {
      return NextResponse.json(
        { success: false, message: "None of the selected students belong to your section." },
        { status: 403 }
      );
    }

    // Do not silently place only part of a submitted batch on standby. A
    // student that is already pending, archived, or belongs to another
    // adviser must be resolved before this transfer can be submitted again.
    if (ownedStudents.length !== requestedStudentIds.length) {
      return NextResponse.json(
        { success: false, message: "One or more selected students are no longer active in your section or already have a pending transfer. Refresh the list and try again." },
        { status: 409 },
      );
    }

    // ── Reject if any student is already in the target grade + section ─────────
    const alreadyThere = ownedStudents.filter(
      (s) => s.grade === normalizedTargetGrade && s.section === normalizedTargetSection
    );
    if (alreadyThere.length > 0) {
      const names = alreadyThere.map((s) => `${s.first_name} ${s.last_name}`).join(", ");
      const isPlural = alreadyThere.length > 1;
      return NextResponse.json(
        {
          success: false,
          message: isPlural
            ? `${names} are already in ${normalizedTargetGrade} · ${normalizedTargetSection}. Please choose a different section.`
            : `${names} is already in ${normalizedTargetGrade} · ${normalizedTargetSection}. Please choose a different section.`,
        },
        { status: 400 }
      );
    }

    // Warn if some IDs were not found / not owned (but still proceed with valid ones)
    const ownedIds = ownedStudents.map((s) => s.id);

    // ── Update students to standby ────────────────────────────────────────────
    // Requires these columns on the students table:
    //   transfer_status  TEXT    default null  — 'standby' | null
    //   target_grade     TEXT    default null
    //   target_section   TEXT    default null
    //
    // Run this migration in Supabase SQL editor if not yet added:
    //   ALTER TABLE students ADD COLUMN IF NOT EXISTS transfer_status TEXT DEFAULT NULL;
    //   ALTER TABLE students ADD COLUMN IF NOT EXISTS target_grade     TEXT DEFAULT NULL;
    //   ALTER TABLE students ADD COLUMN IF NOT EXISTS target_section   TEXT DEFAULT NULL;

    const { data: queuedStudents, error: updateErr } = await supabase
      .from("students")
      .update({
        transfer_status: "standby",
        target_grade:    normalizedTargetGrade,
        target_section:  normalizedTargetSection,
      })
      .in("id", ownedIds)
      .eq("archive_status", "active")
      .is("transfer_status", null)
      .select("id");

    if (updateErr) throw updateErr;
    if ((queuedStudents?.length ?? 0) !== ownedIds.length) {
      return NextResponse.json(
        { success: false, message: "A selected student changed while the transfer was being submitted. Refresh the list and try again." },
        { status: 409 },
      );
    }

    // The originating class, every linked Parent, Principal, ICT, and the
    // target class must see the queue change immediately. Resolve both sides
    // before emitting one deduped, data-free student event.
    const studentRecipients = await studentRealtimeRecipientsForStudents(
      ownedIds.map((id) => ({ studentDbId: id })),
    );
    await publishRealtimeInvalidation([...studentRecipients, ...targetAdviserRecipients], "students");

    const emailNotification = await notifyReceivingAdvisersByEmail({
      recipientIds: targetAdviserRecipients.map((recipient) => recipient.id),
      sourceGrade: adviser.grade ?? "Your previous grade",
      sourceSections: [...new Set(ownedStudents.map((student) => student.section).filter(Boolean))],
      targetGrade: normalizedTargetGrade,
      targetSection: normalizedTargetSection,
    });

    return NextResponse.json({
      success:  true,
      message:  `${ownedIds.length} student${ownedIds.length !== 1 ? "s" : ""} placed on standby for transfer to ${normalizedTargetGrade} · ${normalizedTargetSection}.`,
      standby:  ownedStudents.map((s) => ({
        id:         s.id,
        student_id: s.student_id,
        full_name:  `${s.first_name} ${s.last_name}`,
        grade:      s.grade,
        section:    s.section,
      })),
      emailNotification,
    });

  } catch (error: any) {
    console.error("POST /api/students/transfer-standby error:", error);
    return NextResponse.json(
      { success: false, message: error.message || "Server error." },
      { status: 500 }
    );
  }
}
