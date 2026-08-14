import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { jwtVerify } from "jose";
import { supabase } from "@/lib/supabase";
import { sendExcuseLetterToAdviserEmail } from "@/lib/mailer";

const SECRET = new TextEncoder().encode(
    process.env.NEXTAUTH_SECRET || "fallback_secret_change_this"
);

function errorMessage(error: unknown) {
    return error instanceof Error ? error.message : "Server error.";
}

// ── GET: fetch all excuse letters for the logged-in parent ────────────────────
export async function GET() {
    try {
        const cookieStore = await cookies();
        const token = cookieStore.get("parent_token")?.value;
        if (!token) return NextResponse.json({ success: false, message: "Not authenticated." }, { status: 401 });

        const verified = await jwtVerify(token, SECRET);
        const parentId = Number(verified.payload.id);
        const parentEmail = typeof verified.payload.email === "string" ? verified.payload.email : "";

        const { data: parentRows, error: parentError } = await supabase
            .from("parents")
            .select("id")
            .eq("email", parentEmail);

        if (parentError) throw parentError;
        const parentIds = (parentRows ?? []).map((parent) => parent.id as number);

        const { data, error } = await supabase
            .from("excuse_letters")
            .select(`
                id, student_id, date_from, date_to, message,
                status, decline_reason, submitted_at,
                file_name, file_type
            `)
            .in("parent_id", parentIds.length ? parentIds : [parentId])
            .order("submitted_at", { ascending: false });

        if (error) throw error;

        return NextResponse.json({ success: true, letters: data || [] });
    } catch (error) {
        console.error("GET /api/excuse-letters error:", error);
        return NextResponse.json({ success: false, message: errorMessage(error) }, { status: 500 });
    }
}

// ── POST: parent submits a new excuse letter ──────────────────────────────────
export async function POST(req: NextRequest) {
    try {
        const cookieStore = await cookies();
        const token = cookieStore.get("parent_token")?.value;
        if (!token) return NextResponse.json({ success: false, message: "Not authenticated." }, { status: 401 });

        const verified = await jwtVerify(token, SECRET);
        const parentId = Number(verified.payload.id);
        const parentEmail = typeof verified.payload.email === "string" ? verified.payload.email : "";

        if (!parentId || !parentEmail) {
            return NextResponse.json({ success: false, message: "Invalid session." }, { status: 401 });
        }

        const body = await req.json();
        const { student_id, date_from, date_to, message, attachments } = body;
        // attachments: [{ file_name, file_data (base64), file_type }]

        if (!student_id || !date_from || !date_to || !message?.trim()) {
            return NextResponse.json({ success: false, message: "All fields are required." }, { status: 400 });
        }

        if (new Date(date_to) < new Date(date_from)) {
            return NextResponse.json({ success: false, message: "End date cannot be before start date." }, { status: 400 });
        }

        // ── School year guard ────────────────────────────────────────────────────
        const { data: activeSY } = await supabase
            .from("school_year_config")
            .select("start_date, end_date")
            .eq("is_active", true)
            .limit(1)
            .single();

        if (activeSY) {
            if (date_from < activeSY.start_date || date_to > activeSY.end_date) {
                return NextResponse.json(
                    { success: false, message: `Excuse letter dates must fall within the active school year (${activeSY.start_date} to ${activeSY.end_date}).` },
                    { status: 400 }
                );
            }
        }
        // ── End guard ────────────────────────────────────────────────────────────

        const { data: linkedParentRows, error: linkError } = await supabase
            .from("parent_student_links")
            .select("parent_id, parents!inner(email)")
            .eq("parents.email", parentEmail)
            .eq("student_id", student_id)
            .limit(1);

        if (linkError) throw linkError;
        if (!linkedParentRows || linkedParentRows.length === 0) {
            return NextResponse.json({ success: false, message: "Student is not linked to your parent account." }, { status: 403 });
        }
        const linkedParentId = linkedParentRows[0].parent_id as number;

        // Get student info + adviser email
        const { data: studentRow, error: studentError } = await supabase
            .from("students")
            .select("first_name, last_name, section, grade")
            .eq("student_id", student_id)
            .single();

        if (studentError || !studentRow) {
            return NextResponse.json({ success: false, message: "Student not found." }, { status: 404 });
        }

        const studentName = `${studentRow.first_name} ${studentRow.last_name}`;

        // Find adviser by section
        const { data: adviserRow, error: adviserError } = await supabase
            .from("advisers")
            .select("first_name, last_name, email, sections, section")
            .or(`section.eq.${studentRow.section},sections.cs.{"${studentRow.section}"}`)
            .eq("grade", studentRow.grade)
            .limit(1)
            .single();

        if (adviserError || !adviserRow) {
            return NextResponse.json({ success: false, message: "Adviser not found for this student." }, { status: 404 });
        }

        // Get parent name
        const { data: parentRow, error: parentError } = await supabase
            .from("parents")
            .select("parent_first_name, parent_last_name")
            .eq("id", linkedParentId)
            .single();

        if (parentError || !parentRow) {
            return NextResponse.json({ success: false, message: "Parent not found." }, { status: 404 });
        }

        const parentName = `${parentRow.parent_first_name} ${parentRow.parent_last_name}`;
        const adviserName = `${adviserRow.first_name} ${adviserRow.last_name}`;

        // Insert excuse letter
        const firstAttachment = attachments?.[0];

        const { data: letter, error: insertError } = await supabase
            .from("excuse_letters")
            .insert({
                student_id,
                parent_id: linkedParentId,
                date_from,
                date_to,
                message: message.trim(),
                status: "Pending",
                file_name: firstAttachment?.file_name ?? null,
                file_data: firstAttachment?.file_data ?? null,
                file_type: firstAttachment?.file_type ?? null,
            })
            .select("id")
            .single();

        if (insertError || !letter) throw insertError;

        // Send email to adviser (non-blocking)
        sendExcuseLetterToAdviserEmail({
            adviserEmail: adviserRow.email,
            adviserName,
            parentName,
            studentName,
            dateFrom: date_from,
            dateTo: date_to,
            message: message.trim(),
        }).catch((e) => console.error("Adviser email failed:", e));

        return NextResponse.json({ success: true, message: "Excuse letter submitted successfully.", id: letter.id });
    } catch (error) {
        console.error("POST /api/excuse-letters error:", error);
        return NextResponse.json({ success: false, message: errorMessage(error) }, { status: 500 });
    }
}
