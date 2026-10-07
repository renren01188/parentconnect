import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { getAdviserFromToken } from "@/lib/getAdviserFromToken";

type ExcuseLetterRow = {
    id: number;
    student_id: string;
    parent_id: number;
    date_from: string;
    date_to: string;
    message: string;
    status: string;
    decline_reason: string | null;
    submitted_at: string;
    file_name: string | null;
    file_type: string | null;
    file_data: string | null;
};

type EnrichedExcuseLetter = ExcuseLetterRow & {
    studentName: string;
    parentName: string;
    relationship: string;
    attachment: { file_name: string; file_type: string; file_data: string } | null;
};

function errorMessage(error: unknown) {
    return error instanceof Error ? error.message : "Server error.";
}

export async function GET(req: NextRequest) {
    try {
        const adviser = await getAdviserFromToken();
        if (!adviser) return NextResponse.json({ success: false, message: "Not authenticated." }, { status: 401 });

        const { searchParams } = new URL(req.url);
        const requestedSection = searchParams.get("section") || "";
        const requestedGrade = searchParams.get("grade") || "";
        const adviserSections = adviser.sections?.length
            ? adviser.sections
            : adviser.section
                ? [adviser.section]
                : [];
        const grade = adviser.grade || requestedGrade;
        const sections = requestedSection
            ? adviserSections.includes(requestedSection) ? [requestedSection] : []
            : adviserSections;

        if (!grade || sections.length === 0) {
            return NextResponse.json({ success: true, letters: [] });
        }

        if (requestedGrade && adviser.grade && requestedGrade !== adviser.grade) {
            return NextResponse.json({ success: false, message: "Section is not assigned to this adviser." }, { status: 403 });
        }

        const { data: studentIds, error: studentIdsError } = await supabase
            .from("students")
            .select("student_id")
            .in("section", sections)
            .eq("grade", grade);

        if (studentIdsError) throw studentIdsError;

        const ids = (studentIds || []).map((s) => s.student_id);
        if (ids.length === 0) return NextResponse.json({ success: true, letters: [] });

        const { data, error } = await supabase
            .from("excuse_letters")
            .select(`
                id, student_id, parent_id, date_from, date_to,
                message, status, decline_reason, submitted_at,
                file_name, file_type, file_data
            `)
            .in("student_id", ids)
            .order("submitted_at", { ascending: false });

        if (error) throw error;

        const settled = await Promise.allSettled(
            (data || []).map(async (letter) => {
                const { data: studentRows } = await supabase
                    .from("students")
                    .select("first_name, last_name")
                    .eq("student_id", letter.student_id)
                    .limit(1);

                const student = studentRows?.[0] ?? null;

                const { data: parentRows } = await supabase
                    .from("parents")
                    .select("parent_first_name, parent_last_name, relationship")
                    .eq("id", letter.parent_id)
                    .limit(1);

                const parent = parentRows?.[0] ?? null;

                return {
                    ...letter,
                    studentName: student
                        ? `${student.first_name} ${student.last_name}`
                        : letter.student_id,
                    parentName: parent
                        ? `${parent.parent_first_name} ${parent.parent_last_name}`
                        : "Unknown",
                    relationship: parent?.relationship || "Guardian",
                    attachment: letter.file_name
                        ? {
                            file_name: letter.file_name,
                            file_type: letter.file_type ?? "",
                            file_data: letter.file_data ?? "",
                        }
                        : null,
                };
            })
        );

        settled
            .filter((r): r is PromiseRejectedResult => r.status === "rejected")
            .forEach((r) => console.error("Letter enrichment failed:", r.reason));

        const normalized = settled
            .filter((r): r is PromiseFulfilledResult<EnrichedExcuseLetter> => r.status === "fulfilled")
            .map((r) => r.value);

        return NextResponse.json({ success: true, letters: normalized });

    } catch (error) {
        console.error("GET /api/excuse-letters/adviser error:", error);
        return NextResponse.json({ success: false, message: errorMessage(error) }, { status: 500 });
    }
}
