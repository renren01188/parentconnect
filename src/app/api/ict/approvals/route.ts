import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { jwtVerify } from "jose";
import { supabase } from "@/lib/supabase";

const SECRET = new TextEncoder().encode(
    process.env.NEXTAUTH_SECRET || "fallback_secret_change_this"
);

async function requireIct() {
    const cookieStore = await cookies();
    const token = cookieStore.get("ict_token")?.value;
    if (!token) return null;
    try {
        const { payload } = await jwtVerify(token, SECRET);
        if (payload.role !== "ict") return null;
        return { ictId: Number(payload.id) };
    } catch {
        return null;
    }
}

// GET — fetch all adviser change requests
export async function GET() {
    try {
        const session = await requireIct();
        if (!session) {
            return NextResponse.json({ success: false, message: "Unauthorized." }, { status: 401 });
        }

        const { data, error } = await supabase
            .from("adviser_change_requests")
            .select("*")
            .order("created_at", { ascending: false });

        if (error) throw error;

        const approvals = (data ?? []).map((row: any) => ({
            id: String(row.id),
            adviserName: row.adviser_name,
            adviserEmail: row.adviser_email,
            adviserInitials: row.adviser_initials,
            classGrade: row.class_grade,
            requestedAt: new Date(row.created_at).toLocaleDateString("en-US", {
                month: "short", day: "numeric", year: "numeric"
            }) + " · " + new Date(row.created_at).toLocaleTimeString("en-US", {
                hour: "numeric", minute: "2-digit"
            }),
            requestedAtMs: new Date(row.created_at).getTime(),
            status: row.status,
            changes: Array.isArray(row.changes) ? row.changes : [],
            note: row.note ?? undefined,
            reviewedAt: row.reviewed_at
                ? new Date(row.reviewed_at).toLocaleDateString("en-US", {
                    month: "short", day: "numeric", year: "numeric"
                }) + " · " + new Date(row.reviewed_at).toLocaleTimeString("en-US", {
                    hour: "numeric", minute: "2-digit"
                })
                : undefined,
            reviewNote: row.review_note ?? undefined,
        }));

        return NextResponse.json({ success: true, approvals });
    } catch (error: unknown) {
        console.error("GET /api/ict/approvals error:", error);
        return NextResponse.json(
            { success: false, message: error instanceof Error ? error.message : "Server error." },
            { status: 500 }
        );
    }
}

// POST — create a new adviser change request
export async function POST(req: NextRequest) {
    try {
        const session = await requireIct();
        if (!session) {
            return NextResponse.json({ success: false, message: "Unauthorized." }, { status: 401 });
        }

        const body = await req.json();
        const { adviserId, adviserName, adviserEmail, adviserInitials, classGrade, changes, note } = body;

        if (!adviserId || !adviserName || !adviserEmail || !changes?.length) {
            return NextResponse.json(
                { success: false, message: "Missing required fields." },
                { status: 400 }
            );
        }

        const { data, error } = await supabase
            .from("adviser_change_requests")
            .insert({
                adviser_id: adviserId,
                adviser_name: adviserName,
                adviser_email: adviserEmail,
                adviser_initials: adviserInitials,
                class_grade: classGrade,
                changes: changes,
                note: note ?? null,
                status: "Pending",
            })
            .select("id")
            .single();

        if (error) throw error;

        return NextResponse.json({ success: true, id: String(data.id) });
    } catch (error: unknown) {
        console.error("POST /api/ict/approvals error:", error);
        return NextResponse.json(
            { success: false, message: error instanceof Error ? error.message : "Server error." },
            { status: 500 }
        );
    }
}

// PATCH — approve or reject a request
export async function PATCH(req: NextRequest) {
    try {
        const session = await requireIct();
        if (!session) {
            return NextResponse.json({ success: false, message: "Unauthorized." }, { status: 401 });
        }

        const body = await req.json();
        const { id, action, reviewNote } = body;

        if (!id || !["approve", "reject"].includes(action)) {
            return NextResponse.json(
                { success: false, message: "id and action (approve|reject) are required." },
                { status: 400 }
            );
        }

        const newStatus = action === "approve" ? "Approved" : "Rejected";

        // 1. Fetch the request to get adviser_id and changes BEFORE updating
        const { data: requestData, error: fetchError } = await supabase
            .from("adviser_change_requests")
            .select("adviser_id, changes")
            .eq("id", Number(id))
            .single();

        if (fetchError) throw fetchError;

        // 2. Mark the approval record as Approved or Rejected
        const { error: updateError } = await supabase
            .from("adviser_change_requests")
            .update({
                status: newStatus,
                reviewed_at: new Date().toISOString(),
                review_note: reviewNote ?? (action === "approve"
                    ? "Approved by ICT Admin."
                    : "Rejected by ICT Admin."),
            })
            .eq("id", Number(id));

        if (updateError) throw updateError;

        // 3. If approved, apply the changes to the adviser's profile
        // Replace the existing approve block with this:
        if (action === "approve" && requestData) {
            const { adviser_id, changes } = requestData;

            const parsedChanges: {
                field: string; from: string; to: string;
                newGrade?: string; newSections?: string[];
            }[] = Array.isArray(changes) ? changes : JSON.parse(changes);

            const profileUpdate: Record<string, any> = {};

            for (const change of parsedChanges) {
                switch (change.field) {
                    case "First Name": profileUpdate["first_name"] = change.to; break;
                    case "Middle Name": profileUpdate["middle_name"] = change.to; break;
                    case "Last Name": profileUpdate["last_name"] = change.to; break;
                    case "Suffix": profileUpdate["suffix"] = change.to; break;
                    case "Email Address": profileUpdate["email"] = change.to; break;
                    case "Phone Number": profileUpdate["phone"] = change.to; break;
                    case "Advisory Class":
                        if (change.newGrade) profileUpdate["grade"] = change.newGrade;
                        if (Array.isArray(change.newSections) && change.newSections.length > 0) {
                            profileUpdate["sections"] = change.newSections;
                            profileUpdate["section"] = change.newSections[0];
                        } else {
                            // Legacy string fallback
                            const parts = change.to.split("–").map((s: string) => s.trim());
                            if (parts[0]) profileUpdate["grade"] = parts[0];
                            if (parts[1]) {
                                const secs = parts[1].split("&").map((s: string) => s.trim()).filter(Boolean);
                                profileUpdate["sections"] = secs;
                                profileUpdate["section"] = secs[0] ?? parts[1];
                            }
                        }
                        break;
                }
            }

            if (Object.keys(profileUpdate).length > 0) {
                const { error: profileError } = await supabase
                    .from("advisers")
                    .update(profileUpdate)
                    .eq("id", adviser_id);

                if (profileError) throw profileError;
            }
        }

        return NextResponse.json({ success: true });
    } catch (error: unknown) {
        console.error("PATCH /api/ict/approvals error:", error);
        return NextResponse.json(
            { success: false, message: error instanceof Error ? error.message : "Server error." },
            { status: 500 }
        );
    }
}