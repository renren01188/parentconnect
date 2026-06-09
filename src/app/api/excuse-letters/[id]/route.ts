import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { sendExcuseLetterStatusEmail } from "@/lib/mailer";
import { getAdviserFromToken } from "@/lib/getAdviserFromToken";

function errorMessage(error: unknown) {
    return error instanceof Error ? error.message : "Server error.";
}

function parseDateOnly(value: string) {
    const [year, month, day] = value.split("-").map(Number);
    return new Date(year, month - 1, day);
}

function formatDateOnly(date: Date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

// ── PATCH: adviser approves or declines an excuse letter ──────────────────────
export async function PATCH(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const adviser = await getAdviserFromToken();
        if (!adviser) return NextResponse.json({ success: false, message: "Not authenticated." }, { status: 401 });

        const { id } = await params;
        const letterId = Number(id);

        const body = await req.json();
        const { status, decline_reason } = body;

        if (!["Approved", "Declined"].includes(status)) {
            return NextResponse.json({ success: false, message: "Invalid status." }, { status: 400 });
        }

        if (status === "Declined" && !decline_reason?.trim()) {
            return NextResponse.json({ success: false, message: "Decline reason is required." }, { status: 400 });
        }

        const { data: letter, error: fetchError } = await supabase
            .from("excuse_letters")
            .select("id, student_id, parent_id, date_from, date_to, message, status")
            .eq("id", letterId)
            .single();

        if (fetchError || !letter) {
            return NextResponse.json({ success: false, message: "Excuse letter not found." }, { status: 404 });
        }

        const adviserSections = adviser.sections?.length
            ? adviser.sections
            : adviser.section
                ? [adviser.section]
                : [];

        const { data: letterStudent, error: letterStudentError } = await supabase
            .from("students")
            .select("grade, section")
            .eq("student_id", letter.student_id)
            .single();

        if (letterStudentError || !letterStudent) {
            return NextResponse.json({ success: false, message: "Student not found." }, { status: 404 });
        }

        if (adviser.grade !== letterStudent.grade || !adviserSections.includes(letterStudent.section)) {
            return NextResponse.json({ success: false, message: "Excuse letter is not assigned to this adviser." }, { status: 403 });
        }

        const { error: updateError } = await supabase
            .from("excuse_letters")
            .update({
                status,
                decline_reason: status === "Declined" ? decline_reason.trim() : null,
            })
            .eq("id", letterId);

        if (updateError) throw updateError;

        if (status === "Approved") {
            const { data: studentRow, error: studentError } = await supabase
                .from("students")
                .select("id, class_session")
                .eq("student_id", letter.student_id)
                .single();

            if (studentError || !studentRow) {
                return NextResponse.json({ success: false, message: "Student not found." }, { status: 404 });
            }

            const sessionType = studentRow.class_session || "Morning";
            const start = parseDateOnly(letter.date_from);
            const end = parseDateOnly(letter.date_to);
            const dates: string[] = [];

            for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
                const dow = d.getDay();
                if (dow === 0 || dow === 6) continue;
                dates.push(formatDateOnly(d));
            }

            for (const date of dates) {
                const { data: existing } = await supabase
                    .from("attendance_logs")
                    .select("id")
                    .eq("student_id", letter.student_id)
                    .eq("attendance_date", date)
                    .limit(1);

                if (existing && existing.length > 0) {
                    await supabase
                        .from("attendance_logs")
                        .update({
                            student_db_id: studentRow.id,
                            session_type: sessionType,
                            status: "Excused",
                            remark: "Excuse letter approved",
                        })
                        .eq("student_id", letter.student_id)
                        .eq("attendance_date", date);
                } else {
                    await supabase
                        .from("attendance_logs")
                        .insert({
                            student_db_id: studentRow.id,
                            student_id: letter.student_id,
                            attendance_date: date,
                            status: "Excused",
                            type: "Time In",
                            session_type: sessionType,
                            via: "Auto",
                            remark: "Excuse letter approved",
                            time_logged: "00:00:00",
                        });
                }
            }
        }

        const { data: student } = await supabase
            .from("students")
            .select("first_name, last_name")
            .eq("student_id", letter.student_id)
            .single();

        const { data: parent } = await supabase
            .from("parents")
            .select("parent_first_name, parent_last_name, email")
            .eq("id", letter.parent_id)
            .single();

        if (parent?.email && student) {
            sendExcuseLetterStatusEmail({
                parentEmail: parent.email,
                parentName: `${parent.parent_first_name} ${parent.parent_last_name}`,
                studentName: `${student.first_name} ${student.last_name}`,
                dateFrom: letter.date_from,
                dateTo: letter.date_to,
                status,
                declineReason: decline_reason?.trim(),
            }).catch((e) => console.error("Parent status email failed:", e));
        }

        return NextResponse.json({ success: true, message: `Excuse letter ${status.toLowerCase()} successfully.` });

    } catch (error) {
        console.error("PATCH /api/excuse-letters/[id] error:", error);
        return NextResponse.json({ success: false, message: errorMessage(error) }, { status: 500 });
    }
}
