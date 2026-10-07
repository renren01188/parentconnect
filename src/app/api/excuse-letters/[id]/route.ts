import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { sendExcuseLetterStatusEmail } from "@/lib/mailer";
import { getAdviserFromToken } from "@/lib/getAdviserFromToken";

function errorMessage(error: unknown) {
    return error instanceof Error ? error.message : "Server error.";
}

type DecisionRow = {
    id: number;
    status: "Approved" | "Declined";
    student_id: string;
    parent_id: number;
    date_from: string;
    date_to: string;
};

// PATCH: an adviser approves or declines a pending excuse letter exactly once.
export async function PATCH(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const adviser = await getAdviserFromToken();
        if (!adviser) {
            return NextResponse.json({ success: false, message: "Not authenticated." }, { status: 401 });
        }

        const { id } = await params;
        const letterId = Number(id);
        if (!Number.isSafeInteger(letterId) || letterId <= 0) {
            return NextResponse.json({ success: false, message: "Invalid excuse letter." }, { status: 400 });
        }

        const body = await req.json();
        const status = body.status;
        const declineReason = typeof body.decline_reason === "string" ? body.decline_reason.trim() : "";

        if (status !== "Approved" && status !== "Declined") {
            return NextResponse.json({ success: false, message: "Invalid status." }, { status: 400 });
        }
        if (status === "Declined" && !declineReason) {
            return NextResponse.json({ success: false, message: "Decline reason is required." }, { status: 400 });
        }

        const { data, error: decisionError } = await supabase.rpc("decide_excuse_letter", {
            p_letter_id: letterId,
            p_adviser_id: adviser.id,
            p_status: status,
            p_decline_reason: status === "Declined" ? declineReason : null,
        });

        if (decisionError) {
            const message = decisionError.message || "Unable to review the excuse letter.";
            const statusCode = /already been reviewed/i.test(message)
                ? 409
                : /not assigned|not found/i.test(message)
                    ? 403
                    : 500;
            return NextResponse.json({ success: false, message }, { status: statusCode });
        }

        const decision = (data?.[0] ?? null) as DecisionRow | null;
        if (!decision) {
            return NextResponse.json({ success: false, message: "Unable to review the excuse letter." }, { status: 500 });
        }

        const [{ data: student }, { data: parent }] = await Promise.all([
            supabase
                .from("students")
                .select("first_name, last_name")
                .eq("student_id", decision.student_id)
                .single(),
            supabase
                .from("parents")
                .select("parent_first_name, parent_last_name, email")
                .eq("id", decision.parent_id)
                .single(),
        ]);

        // Mail delivery does not decide the workflow result. The saved status
        // and attendance update above stay correct even if SMTP is unavailable.
        if (parent?.email && student) {
            sendExcuseLetterStatusEmail({
                parentEmail: parent.email,
                parentName: parent.parent_first_name + " " + parent.parent_last_name,
                studentName: student.first_name + " " + student.last_name,
                dateFrom: decision.date_from,
                dateTo: decision.date_to,
                status: decision.status,
                declineReason,
            }).catch((mailError) => console.error("Parent status email failed:", mailError));
        }

        return NextResponse.json({
            success: true,
            message: "Excuse letter " + decision.status.toLowerCase() + " successfully.",
            status: decision.status,
        });
    } catch (error) {
        console.error("PATCH /api/excuse-letters/[id] error:", error);
        return NextResponse.json({ success: false, message: errorMessage(error) }, { status: 500 });
    }
}
