import { after, NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { getAdviserFromToken } from "@/lib/getAdviserFromToken";
import { manilaDateString } from "@/lib/manilaClock";
import { publishRealtimeInvalidation, recipientsForRoles } from "@/lib/realtimeInvalidation";

function fullName(row: { first_name?: string | null; middle_name?: string | null; last_name?: string | null; suffix?: string | null }) {
  return [row.first_name, row.middle_name, row.last_name, row.suffix].filter(Boolean).join(" ").trim();
}

function allowedSections(adviser: { section?: string | null; sections?: string[] | null }) {
  return adviser.sections?.length ? adviser.sections : adviser.section ? [adviser.section] : [];
}

export async function GET(request: NextRequest) {
  try {
    const adviser = await getAdviserFromToken();
    if (!adviser) return NextResponse.json({ success: false, message: "Not authenticated." }, { status: 401 });

    const section = request.nextUrl.searchParams.get("section")?.trim();
    const sections = allowedSections(adviser);
    if (section && !sections.includes(section)) {
      return NextResponse.json({ success: false, message: "You are not assigned to this section." }, { status: 403 });
    }

    let query = supabase
      .from("early_out_requests")
      .select("id, student_id, student_name, grade, section, attendance_date, reason, message, status, rejection_reason, created_at, reviewed_at")
      .eq("adviser_id", adviser.id)
      .order("created_at", { ascending: false })
      .limit(100);
    if (section) query = query.eq("section", section);

    const { data, error } = await query;
    if (error) throw error;
    return NextResponse.json({ success: true, requests: data ?? [] });
  } catch (error) {
    console.error("GET /api/adviser/early-out-requests error:", error);
    return NextResponse.json({ success: false, message: "Unable to load Early Out requests." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const adviser = await getAdviserFromToken();
    if (!adviser) return NextResponse.json({ success: false, message: "Not authenticated." }, { status: 401 });

    const body = await request.json().catch(() => null);
    const studentDbId = Number(body?.studentDbId);
    const reason = typeof body?.reason === "string" ? body.reason.trim() : "";
    const message = typeof body?.message === "string" ? body.message.trim() : "";
    if (!Number.isSafeInteger(studentDbId) || studentDbId <= 0 || !reason || !message) {
      return NextResponse.json({ success: false, message: "Student, reason, and message are required." }, { status: 400 });
    }
    if (reason.length > 500 || message.length > 2000) {
      return NextResponse.json({ success: false, message: "Reason or message is too long." }, { status: 400 });
    }

    const { data: student, error: studentError } = await supabase
      .from("students")
      .select("id, student_id, first_name, middle_name, last_name, suffix, grade, section, archive_status")
      .eq("id", studentDbId)
      .maybeSingle();
    if (studentError) throw studentError;
    if (!student || student.archive_status === "archived" || student.archive_status === "deleted") {
      return NextResponse.json({ success: false, message: "Student not found." }, { status: 404 });
    }

    const sections = allowedSections(adviser);
    if (!student.grade || student.grade !== adviser.grade || !student.section || !sections.includes(student.section)) {
      return NextResponse.json({ success: false, message: "You may request Early Out only for students in your assigned section." }, { status: 403 });
    }

    const { data: section, error: sectionError } = await supabase
      .from("sections")
      .select("class_session")
      .eq("grade", student.grade)
      .eq("name", student.section)
      .maybeSingle();
    if (sectionError) throw sectionError;
    const sessionType = section?.class_session === "Afternoon" ? "Afternoon" : "Morning";
    const attendanceDate = manilaDateString();

    const { data: created, error: insertError } = await supabase
      .from("early_out_requests")
      .insert({
        student_db_id: student.id,
        student_id: student.student_id,
        student_name: fullName(student) || student.student_id,
        adviser_id: adviser.id,
        adviser_name: `${adviser.first_name} ${adviser.last_name}`.trim() || "Class Adviser",
        grade: student.grade,
        section: student.section,
        session_type: sessionType,
        attendance_date: attendanceDate,
        reason,
        message,
      })
      // created_at is a database/server timestamp. Do not accept a browser
      // submission time for an attendance-related request.
      .select("id, attendance_date, status, created_at")
      .single();
    if (insertError) {
      if (insertError.code === "23505") {
        // A lost browser response must not create a second request. Return the
        // already-saved record so the adviser can continue from its real
        // Pending/decision state instead of seeing a false failure.
        const { data: existing, error: existingError } = await supabase
          .from("early_out_requests")
          .select("id, attendance_date, status, created_at")
          .eq("student_db_id", student.id)
          .eq("adviser_id", adviser.id)
          .eq("attendance_date", attendanceDate)
          .maybeSingle();
        if (existingError) throw existingError;
        if (existing) {
          return NextResponse.json({ success: true, request: existing, message: "This Early Out request was already submitted." });
        }
      }
      throw insertError;
    }

    after(async () => {
      const guidanceRecipients = await recipientsForRoles(["guidance"]);
      await publishRealtimeInvalidation(guidanceRecipients, "attendance");
    });

    return NextResponse.json({ success: true, request: created, message: "Early Out request submitted to Guidance." }, { status: 201 });
  } catch (error) {
    console.error("POST /api/adviser/early-out-requests error:", error);
    return NextResponse.json({ success: false, message: "Unable to submit the Early Out request." }, { status: 500 });
  }
}
