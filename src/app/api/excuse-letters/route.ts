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

const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;
const ALLOWED_ATTACHMENT_TYPES = new Set([
    "image/jpeg",
    "image/png",
    "image/webp",
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

type AttachmentPayload = {
    file_name?: unknown;
    file_type?: unknown;
    file_data?: unknown;
};

function validateSingleAttachment(value: unknown) {
    if (!Array.isArray(value) || value.length !== 1) {
        throw new Error("Exactly one attachment is required for each excuse letter.");
    }
    const attachment = value[0] as AttachmentPayload;
    const fileName = typeof attachment?.file_name === "string" ? attachment.file_name.trim() : "";
    const fileType = typeof attachment?.file_type === "string" ? attachment.file_type.trim().toLowerCase() : "";
    const fileData = typeof attachment?.file_data === "string" ? attachment.file_data : "";

    if (!fileName || fileName.length > 180 || !ALLOWED_ATTACHMENT_TYPES.has(fileType)) {
        throw new Error("The attachment must be a JPG, PNG, WEBP, PDF, DOC, or DOCX file.");
    }
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(fileData) || fileData.length % 4 !== 0) {
        throw new Error("The attachment is not valid base64 data.");
    }
    const byteLength = Buffer.byteLength(fileData, "base64");
    if (byteLength === 0 || byteLength > MAX_ATTACHMENT_BYTES) {
        throw new Error("The attachment must be 5 MB or smaller.");
    }
    return { file_name: fileName, file_type: fileType, file_data: fileData };
}

// ── GET: fetch all excuse letters for the logged-in parent ────────────────────
export async function GET() {
    try {
        const cookieStore = await cookies();
        const token = cookieStore.get("parent_token")?.value;
        if (!token) return NextResponse.json({ success: false, message: "Not authenticated." }, { status: 401 });

        const verified = await jwtVerify(token, SECRET);
        const parentId = Number(verified.payload.id);
        if (!parentId || verified.payload.role !== "parent") return NextResponse.json({ success: false, message: "Invalid session." }, { status: 401 });

        const { data, error } = await supabase
            .from("excuse_letters")
            .select(`
                id, student_id, date_from, date_to, message,
                status, decline_reason, submitted_at,
                file_name, file_type
            `)
            .eq("parent_id", parentId)
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

        if (!parentId || verified.payload.role !== "parent") {
            return NextResponse.json({ success: false, message: "Invalid session." }, { status: 401 });
        }

        const body = await req.json();
        const { student_id, date_from, date_to, message, attachments } = body;
        // attachments: [{ file_name, file_data (base64), file_type }]

        if (!student_id || !date_from || !date_to || !message?.trim()) {
            return NextResponse.json({ success: false, message: "All fields are required." }, { status: 400 });
        }

        let attachment: { file_name: string; file_type: string; file_data: string };
        try {
            attachment = validateSingleAttachment(attachments);
        } catch (attachmentError) {
            return NextResponse.json({ success: false, message: errorMessage(attachmentError) }, { status: 400 });
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
            .select("parent_id")
            .eq("parent_id", parentId)
            .eq("student_id", student_id)
            .limit(1);

        if (linkError) throw linkError;
        if (!linkedParentRows || linkedParentRows.length === 0) {
            return NextResponse.json({ success: false, message: "Student is not linked to your parent account." }, { status: 403 });
        }
        const linkedParentId = parentId;

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

        const { data: letter, error: insertError } = await supabase
            .from("excuse_letters")
            .insert({
                student_id,
                parent_id: linkedParentId,
                date_from,
                date_to,
                message: message.trim(),
                status: "Pending",
                file_name: attachment.file_name,
                file_data: attachment.file_data,
                file_type: attachment.file_type,
                attachment_uploaded_at: new Date().toISOString(),
            })
            .select("id")
            .single();

        if (insertError || !letter) {
            if (insertError?.code === "23505") {
                return NextResponse.json({ success: false, message: "You already have a pending excuse letter for these dates." }, { status: 409 });
            }
            throw insertError;
        }

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
