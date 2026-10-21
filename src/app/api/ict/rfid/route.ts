import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { cookies } from "next/headers";
import { jwtVerify } from "jose";
import { logAudit } from "@/lib/audit";
import { normalizeRfidCard } from "@/lib/rfid";
import { publishStudentRealtimeInvalidation } from "@/lib/realtimeInvalidation";

const SECRET = new TextEncoder().encode(
  process.env.NEXTAUTH_SECRET || "fallback_secret_change_this"
);

export const dynamic = "force-dynamic";
const noStoreHeaders = { "Cache-Control": "no-store, max-age=0" };

async function getIctFromToken() {
  const cookieStore = await cookies();
  const token = cookieStore.get("ict_token")?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, SECRET);
    return payload;
  } catch {
    return null;
  }
}

// PATCH /api/ict/rfid — assign or revoke
export async function PATCH(req: NextRequest) {
  try {
    const ict = await getIctFromToken();
    if (!ict) return NextResponse.json({ success: false, message: "Unauthorized." }, { status: 401 });

    const { studentDbId, rfidCard, action } = await req.json();
    // action: "assign" | "revoke"

    const targetStudentId = Number(studentDbId);
    if (!Number.isSafeInteger(targetStudentId) || targetStudentId <= 0 || !action) {
      return NextResponse.json({ success: false, message: "A valid student and RFID action are required." }, { status: 400 });
    }
    if (action !== "assign" && action !== "revoke") {
      return NextResponse.json({ success: false, message: "Invalid RFID action." }, { status: 400 });
    }

    const { data: targetStudent, error: targetStudentError } = await supabase
      .from("students")
      .select("id, student_id")
      .eq("id", targetStudentId)
      .eq("archive_status", "active")
      .maybeSingle();
    if (targetStudentError) throw targetStudentError;
    if (!targetStudent) {
      return NextResponse.json({ success: false, message: "Student not found. Refresh the list and try again." }, { status: 404 });
    }

    if (action === "assign") {
      if (typeof rfidCard !== "string" || !normalizeRfidCard(rfidCard)) {
        return NextResponse.json({ success: false, message: "RFID card value is required." }, { status: 400 });
      }

      const normalized = normalizeRfidCard(rfidCard);

      // Check uniqueness
      const { data: existing, error: existingError } = await supabase
        .from("students")
        .select("id, first_name, last_name, grade, section")
        .ilike("rfid_card", normalized)
        .neq("id", targetStudentId)
        .limit(1);
      if (existingError) throw existingError;

      if (existing && existing.length > 0) {
        const o = existing[0];
        return NextResponse.json({
          success: false,
          message: `This RFID is already assigned to ${o.first_name} ${o.last_name} (${o.grade} · ${o.section}).`
        }, { status: 409 });
      }

      const { data: updatedStudent, error } = await supabase
        .from("students")
        .update({ rfid_card: normalized })
        .eq("id", targetStudentId)
        .eq("archive_status", "active")
        .select("id, student_id, rfid_card")
        .maybeSingle();
      if (error) {
        // The normalized partial unique index is authoritative for two ICT
        // sessions that validate the same card at the same time.
        if (error.code === "23505") {
          return NextResponse.json(
            { success: false, message: "This RFID was assigned to another student. Enter or scan a different card." },
            { status: 409 },
          );
        }
        throw error;
      }
      if (!updatedStudent) {
        return NextResponse.json({ success: false, message: "Student is no longer active. Refresh the list and try again." }, { status: 409 });
      }
      if (updatedStudent.rfid_card !== normalized) {
        throw new Error("RFID assignment could not be verified.");
      }
      await logAudit({ action: "RFID Assigned", performedById: String(ict.id ?? ""), performedBy: [ict.first_name, ict.last_name].filter(Boolean).join(" ") || "ICT Admin", performedByRole: "ICT Admin", targetUser: updatedStudent.student_id, targetRole: "Student", targetType: "RFID Card", targetId: updatedStudent.id, relatedStudentId: updatedStudent.student_id, newStatus: "Assigned", module: "RFID", details: `Assigned RFID to student ${updatedStudent.student_id}.` });
      await publishStudentRealtimeInvalidation({ studentDbId: updatedStudent.id });

      return NextResponse.json({ success: true, student: updatedStudent }, { headers: noStoreHeaders });

    } else if (action === "revoke") {
      const { data: updatedStudent, error } = await supabase
        .from("students")
        .update({ rfid_card: null })
        .eq("id", targetStudentId)
        .eq("archive_status", "active")
        .select("id, student_id, rfid_card")
        .maybeSingle();
      if (error) throw error;
      if (!updatedStudent) {
        return NextResponse.json({ success: false, message: "Student is no longer active. Refresh the list and try again." }, { status: 409 });
      }
      if (updatedStudent.rfid_card !== null) {
        throw new Error("RFID removal could not be verified.");
      }
      await logAudit({ action: "RFID Revoked", performedById: String(ict.id ?? ""), performedBy: [ict.first_name, ict.last_name].filter(Boolean).join(" ") || "ICT Admin", performedByRole: "ICT Admin", targetUser: updatedStudent.student_id, targetRole: "Student", targetType: "RFID Card", targetId: updatedStudent.id, relatedStudentId: updatedStudent.student_id, previousStatus: "Assigned", newStatus: "Unassigned", module: "RFID", details: `Removed RFID from student ${updatedStudent.student_id}.` });
      await publishStudentRealtimeInvalidation({ studentDbId: updatedStudent.id });

      return NextResponse.json({ success: true, student: updatedStudent }, { headers: noStoreHeaders });

    } else {
      return NextResponse.json({ success: false, message: "Invalid action." }, { status: 400 });
    }

  } catch (error: unknown) {
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : "Server error." },
      { status: 500 }
    );
  }
}
