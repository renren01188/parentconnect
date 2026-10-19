import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { jwtVerify } from "jose";
import { supabase } from "@/lib/supabase";
import { logAudit } from "@/lib/audit";
import { syncStaffProfile } from "@/lib/syncStaffProfile";
import { publishAccountRealtimeInvalidation } from "@/lib/realtimeInvalidation";
import {
    assertStaffEmployeeIdAvailable,
    isStaffEmployeeIdConflict,
    staffEmployeeIdConflictMessage,
} from "@/lib/staffEmployeeId";

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
function isMissingTableError(error: { code?: string; message?: string } | null) {
    return Boolean(error && (error.code === "PGRST205" || error.message?.toLowerCase().includes("could not find the table") || error.message?.toLowerCase().includes("schema cache")));
}

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

        if (error && isMissingTableError(error)) return NextResponse.json({ success: true, approvals: [] });
        if (error) throw error;

        const adviserApprovals = (data ?? []).map((row: any) => ({
            id: String(row.id),
            role: "adviser",
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

        const { data: guidanceRows, error: guidanceError } = await supabase
            .from("guidance_change_requests")
            .select("*")
            .order("created_at", { ascending: false });
        if (guidanceError && isMissingTableError(guidanceError)) return NextResponse.json({ success: true, approvals: adviserApprovals });
        if (guidanceError) throw guidanceError;
        const guidanceApprovals = (guidanceRows ?? []).map((row: any) => ({
            id: String(row.id), role: "guidance", adviserName: row.guidance_name,
            adviserEmail: row.guidance_email, adviserInitials: row.guidance_initials,
            classGrade: "Guidance Counselor", requestedAt: new Date(row.created_at).toLocaleString(), requestedAtMs: new Date(row.created_at).getTime(),
            status: row.status, changes: Array.isArray(row.changes) ? row.changes : [], note: row.note ?? undefined,
            reviewedAt: row.reviewed_at ? new Date(row.reviewed_at).toLocaleString() : undefined, reviewNote: row.review_note ?? undefined,
        }));
        return NextResponse.json({ success: true, approvals: [...adviserApprovals, ...guidanceApprovals] });
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
        const { id, action, reviewNote, role = "adviser" } = body;

        if (!id || !["approve", "reject"].includes(action)) {
            return NextResponse.json(
                { success: false, message: "id and action (approve|reject) are required." },
                { status: 400 }
            );
        }

        const newStatus = action === "approve" ? "Approved" : "Rejected";

        if (role === "guidance") {
            const { data: requestData, error: fetchError } = await supabase
                .from("guidance_change_requests")
                .select("id, guidance_id, guidance_name, guidance_email, changes, status")
                .eq("id", Number(id)).single();
            if (fetchError) throw fetchError;
            if (requestData.status !== "Pending") return NextResponse.json({ success: false, message: "This request has already been reviewed." }, { status: 409 });
            if (action === "approve") {
                const changes = Array.isArray(requestData.changes) ? requestData.changes : JSON.parse(requestData.changes);
                const fields: Record<string, string> = { "First Name": "first_name", "Middle Name": "middle_name", "Last Name": "last_name", "Suffix": "suffix", "Email Address": "email", "Phone Number": "phone", "Employee ID": "employee_id" };
                const update: Record<string, string | null> = {};
                for (const change of changes) if (fields[change.field]) update[fields[change.field]] = change.to || null;
                const { data: current, error: currentError } = await supabase.from("guidance_counselors")
                    .select("id, employee_id, first_name, middle_name, last_name, suffix, email").eq("id", requestData.guidance_id).single();
                if (currentError) throw currentError;
                if (update.employee_id !== undefined) {
                    await assertStaffEmployeeIdAvailable(update.employee_id, {
                        role: "Guidance",
                        id: Number(requestData.guidance_id),
                    });
                }
                const { error: profileError } = await supabase.from("guidance_counselors").update(update).eq("id", requestData.guidance_id);
                if (profileError) throw profileError;
                const previousName = [current.first_name, current.middle_name, current.last_name, current.suffix].filter(Boolean).join(" ") || "Guidance Counselor";
                const name = [update.first_name ?? current.first_name, update.middle_name ?? current.middle_name, update.last_name ?? current.last_name, update.suffix ?? current.suffix].filter(Boolean).join(" ") || "Guidance Counselor";
                await syncStaffProfile({ role: "guidance", id: Number(requestData.guidance_id), previousName, name, email: String(update.email ?? current.email ?? "") });
            }
            const { error: updateError } = await supabase.from("guidance_change_requests").update({ status: newStatus, reviewed_at: new Date().toISOString(), reviewed_by_ict_id: session.ictId, review_note: reviewNote ?? ` ${newStatus} by ICT Admin.`.trim() }).eq("id", Number(id)).eq("status", "Pending");
            if (updateError) throw updateError;
            await logAudit({
                action: action === "approve" ? "Approve" : "Reject",
                performedBy: "ICT Admin",
                performedByRole: "ICT Admin",
                targetUser: requestData.guidance_name,
                targetRole: "Guidance Counselor",
                targetEmail: requestData.guidance_email,
                module: "Profile approvals",
                details: `${action === "approve" ? "Approved" : "Rejected"} Guidance Counselor profile update request.`,
                changes: Array.isArray(requestData.changes) ? requestData.changes : [],
            });
            await publishAccountRealtimeInvalidation([{ role: "guidance", id: Number(requestData.guidance_id) }]);
            return NextResponse.json({ success: true });
        }

        // 1. Fetch the request to get adviser_id and changes BEFORE updating
        const { data: requestData, error: fetchError } = await supabase
            .from("adviser_change_requests")
            .select("id, adviser_id, adviser_name, adviser_email, changes, status")
            .eq("id", Number(id))
            .single();

        if (fetchError) throw fetchError;
        if (requestData.status !== "Pending") {
            return NextResponse.json({ success: false, message: "This request has already been reviewed." }, { status: 409 });
        }

        // Apply the official assignment before marking the request approved.
        // Adviser-scoped APIs resolve their grade/section from this record on
        // every request, so this takes effect without requiring a new login.
        if (action === "approve" && requestData) {
            const { adviser_id, changes } = requestData;

            const parsedChanges: {
                field: string; from: string; to: string;
                newGrade?: string; newSections?: string[];
            }[] = Array.isArray(changes) ? changes : JSON.parse(changes);

            const profileUpdate: Record<string, any> = {};
            let assignmentChange: { from: string; to: string; oldGrade?: string; oldSections?: string[]; newGrade?: string; newSections?: string[] } | null = null;

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
                        assignmentChange = {
                            from: change.from,
                            to: change.to,
                            oldGrade: change.from.split("–")[0]?.trim(),
                            oldSections: change.from.split("–")[1]?.split("&").map((s: string) => s.trim()).filter(Boolean),
                            newGrade: change.newGrade,
                            newSections: change.newSections,
                        };
                        break;
                }
            }

            if (Object.keys(profileUpdate).length > 0) {
                // Do not silently assign a class that is already owned by another
                // active adviser. ICT can reject the request or resolve the other
                // assignment first.
                if (assignmentChange?.newGrade && assignmentChange.newSections?.length) {
                    const { data: definedSections, error: sectionError } = await supabase
                        .from("sections")
                        .select("name")
                        .eq("grade", assignmentChange.newGrade)
                        .in("name", assignmentChange.newSections);
                    if (sectionError) throw sectionError;
                    if ((definedSections ?? []).length !== assignmentChange.newSections.length) {
                        return NextResponse.json({ success: false, message: "One or more requested sections do not exist for the selected grade level." }, { status: 400 });
                    }
                    const { data: conflicts, error: conflictError } = await supabase
                        .from("advisers")
                        .select("id, first_name, last_name, section, sections")
                        .eq("grade", assignmentChange.newGrade)
                        .eq("status", "active")
                        .neq("id", adviser_id);
                    if (conflictError) throw conflictError;
                    const duplicate = (conflicts ?? []).find((row: any) => {
                        const owned = Array.isArray(row.sections) && row.sections.length ? row.sections : row.section ? [row.section] : [];
                        return owned.some((section: string) => assignmentChange!.newSections!.includes(section));
                    });
                    if (duplicate) {
                        return NextResponse.json({ success: false, message: "The requested section is currently assigned to another active adviser." }, { status: 409 });
                    }
                }
                const { data: currentAdviser, error: currentAdviserError } = await supabase
                    .from("advisers")
                    .select("grade, section, sections, first_name, middle_name, last_name, suffix, email")
                    .eq("id", adviser_id)
                    .single();
                if (currentAdviserError) throw currentAdviserError;
                if (profileUpdate.email) {
                    const { data: emailInUse, error: emailCheckError } = await supabase
                        .from("advisers").select("id").eq("email", profileUpdate.email).neq("id", adviser_id).limit(1);
                    if (emailCheckError) throw emailCheckError;
                    if (emailInUse?.length) return NextResponse.json({ success: false, message: "The requested email address is already in use." }, { status: 409 });
                }
                const { error: profileError } = await supabase
                    .from("advisers")
                    .update(profileUpdate)
                    .eq("id", adviser_id);

                if (profileError) throw profileError;

                const previousName = [
                    currentAdviser.first_name,
                    currentAdviser.middle_name,
                    currentAdviser.last_name,
                    currentAdviser.suffix,
                ].filter(Boolean).join(" ") || "Adviser";
                const updatedName = [
                    profileUpdate.first_name ?? currentAdviser.first_name,
                    profileUpdate.middle_name ?? currentAdviser.middle_name,
                    profileUpdate.last_name ?? currentAdviser.last_name,
                    profileUpdate.suffix ?? currentAdviser.suffix,
                ].filter(Boolean).join(" ") || "Adviser";
                await syncStaffProfile({
                    role: "adviser",
                    id: Number(adviser_id),
                    previousName,
                    name: updatedName,
                    email: String(profileUpdate.email ?? currentAdviser.email ?? ""),
                });

                if (assignmentChange) {
                    const { error: historyError } = await supabase
                        .from("adviser_assignment_history")
                        .insert({
                            adviser_id,
                            request_id: Number(id),
                            previous_grade: currentAdviser.grade ?? assignmentChange.oldGrade ?? null,
                            previous_sections: Array.isArray(currentAdviser.sections) && currentAdviser.sections.length
                                ? currentAdviser.sections
                                : currentAdviser.section ? [currentAdviser.section] : assignmentChange.oldSections ?? [],
                            new_grade: assignmentChange.newGrade ?? profileUpdate.grade ?? null,
                            new_sections: assignmentChange.newSections ?? profileUpdate.sections ?? [],
                            approved_by_ict_id: session.ictId,
                        });
                    if (historyError) throw historyError;
                }
            }
        }

        // Mark the request last and only if it is still pending, preventing a
        // second ICT reviewer from approving/rejecting it concurrently.
        const { data: updatedRows, error: updateError } = await supabase
            .from("adviser_change_requests")
            .update({
                status: newStatus,
                reviewed_at: new Date().toISOString(),
                reviewed_by_ict_id: session.ictId,
                review_note: reviewNote ?? (action === "approve" ? "Approved by ICT Admin." : "Rejected by ICT Admin."),
            })
            .eq("id", Number(id))
            .eq("status", "Pending")
            .select("id");
        if (updateError) throw updateError;
        if (!updatedRows?.length) return NextResponse.json({ success: false, message: "This request has already been reviewed." }, { status: 409 });

        await logAudit({
            action: action === "approve" ? "Approve" : "Reject",
            performedBy: "ICT Admin",
            performedByRole: "ICT Admin",
            targetUser: requestData.adviser_name,
            targetRole: "Adviser",
            targetEmail: requestData.adviser_email,
            module: "Profile approvals",
            details: `${action === "approve" ? "Approved" : "Rejected"} Adviser profile update request.`,
            changes: Array.isArray(requestData.changes) ? requestData.changes : [],
        });

        await publishAccountRealtimeInvalidation([{ role: "adviser", id: Number(requestData.adviser_id) }]);

        return NextResponse.json({ success: true });
    } catch (error: unknown) {
        console.error("PATCH /api/ict/approvals error:", error);
        if (isStaffEmployeeIdConflict(error)) {
            return NextResponse.json(
                { success: false, message: staffEmployeeIdConflictMessage(error) },
                { status: 409 },
            );
        }
        return NextResponse.json(
            { success: false, message: error instanceof Error ? error.message : "Server error." },
            { status: 500 }
        );
    }
}
