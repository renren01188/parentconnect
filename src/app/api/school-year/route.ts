import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { getActiveIct } from "@/lib/apiAuthorization";
import { logAudit } from "@/lib/audit";
import { publishRealtimeInvalidation, recipientsForRoles } from "@/lib/realtimeInvalidation";
import {
  hasOnlyValidAttendanceWeekdays,
  normalizeAttendanceWeekdays,
  scheduledAttendanceDates,
} from "@/lib/schoolCalendar";

function isMissingSchemaError(error: { code?: string; message?: string } | null) {
  return Boolean(error && (error.code === "PGRST205" || error.code === "42P01" || error.message?.toLowerCase().includes("does not exist") || error.message?.toLowerCase().includes("schema cache")));
}

type SchoolYearInput = {
  schoolYearLabel: string;
  startDate: string;
  endDate: string;
  attendanceWeekdays: string[];
};

function parseSchoolYearInput(body: unknown): { input?: SchoolYearInput; message?: string } {
  if (!body || typeof body !== "object") return { message: "All fields are required." };
  const record = body as Record<string, unknown>;
  const schoolYearLabel = typeof record.school_year_label === "string" ? record.school_year_label.trim() : "";
  const startDate = typeof record.start_date === "string" ? record.start_date : "";
  const endDate = typeof record.end_date === "string" ? record.end_date : "";
  const suppliedWeekdays = record.attendance_weekdays;

  if (!schoolYearLabel || !startDate || !endDate) return { message: "All fields are required." };
  if (suppliedWeekdays !== undefined && !hasOnlyValidAttendanceWeekdays(suppliedWeekdays)) {
    return { message: "Choose at least one valid class day." };
  }

  try {
    // This validates actual calendar dates and works for ranges spanning years.
    if (startDate >= endDate) {
      return { message: "End date must be after start date." };
    }

    if (scheduledAttendanceDates(startDate, endDate, suppliedWeekdays).length < 1) {
      return { message: "The selected date range has no enabled class days." };
    }
  } catch {
    return { message: "Choose valid calendar dates." };
  }

  return {
    input: {
      schoolYearLabel,
      startDate,
      endDate,
      attendanceWeekdays: normalizeAttendanceWeekdays(suppliedWeekdays),
    },
  };
}

async function publishSchoolYearRealtimeInvalidation() {
  // Parent attendance consumers already subscribe to attendance, while staff
  // configuration and dashboards subscribe to dashboard. Keep this fan-out
  // data-free and role-scoped instead of exposing school-year rows directly.
  const [staffRecipients, parentRecipients] = await Promise.all([
    recipientsForRoles(["ict", "adviser", "principal"]),
    recipientsForRoles(["parent"]),
  ]);
  await Promise.all([
    publishRealtimeInvalidation(staffRecipients, "dashboard"),
    publishRealtimeInvalidation(parentRecipients, "attendance"),
  ]);
}

// GET — fetch the active school year
export async function GET() {
  try {
    const ict = await getActiveIct();
    if (!ict) {
      return NextResponse.json({ success: false, message: "ICT administrator access is required." }, { status: 403 });
    }

    const { data, error } = await supabase
      .from("school_year_config")
      .select("*")
      .eq("is_active", true)
      .limit(1)
      .single();

    if (error && error.code !== "PGRST116" && !isMissingSchemaError(error)) throw error;

    return NextResponse.json({ success: true, schoolYear: data ?? null });
  } catch (error) {
    console.error("GET /api/school-year error:", error);
    return NextResponse.json(
      { success: false, message: "Failed to fetch school year" },
      { status: 500 }
    );
  }
}

// POST — create a new school year (deactivates any existing one)
export async function POST(req: NextRequest) {
  try {
    const ict = await getActiveIct();
    if (!ict) {
      return NextResponse.json({ success: false, message: "ICT administrator access is required." }, { status: 403 });
    }

    const parsed = parseSchoolYearInput(await req.json());
    if (!parsed.input) return NextResponse.json({ success: false, message: parsed.message }, { status: 400 });
    const {
      schoolYearLabel: school_year_label,
      startDate: start_date,
      endDate: end_date,
      attendanceWeekdays: attendance_weekdays,
    } = parsed.input;

    // Deactivate existing active school year
    await supabase
      .from("school_year_config")
      .update({ is_active: false })
      .eq("is_active", true);

    const { data, error } = await supabase
      .from("school_year_config")
      .insert({ school_year_label, start_date, end_date, attendance_weekdays, is_active: true })
      .select()
      .single();

    if (error) throw error;

    await logAudit({ action: "School Year Created", performedById: ict.id, performedBy: [ict.first_name, ict.middle_name, ict.last_name, ict.suffix].filter(Boolean).join(" ") || "ICT Admin", performedByRole: "ICT Admin", targetUser: school_year_label, targetRole: "School Year", targetType: "School Year", targetId: data.id, newStatus: "Active", module: "School Year Control", details: `Created and activated school year ${school_year_label}.` });
    await publishSchoolYearRealtimeInvalidation();

    return NextResponse.json({ success: true, schoolYear: data });
  } catch (error) {
    console.error("POST /api/school-year error:", error);
    return NextResponse.json(
      { success: false, message: "Failed to create school year" },
      { status: 500 }
    );
  }
}

// PATCH — edit the active school year dates
export async function PATCH(req: NextRequest) {
  try {
    const ict = await getActiveIct();
    if (!ict) {
      return NextResponse.json({ success: false, message: "ICT administrator access is required." }, { status: 403 });
    }

    const parsed = parseSchoolYearInput(await req.json());
    if (!parsed.input) return NextResponse.json({ success: false, message: parsed.message }, { status: 400 });
    const {
      schoolYearLabel: school_year_label,
      startDate: start_date,
      endDate: end_date,
      attendanceWeekdays: attendance_weekdays,
    } = parsed.input;

    const { data: existing, error: existingError } = await supabase.from("school_year_config").select("id, school_year_label").eq("is_active", true).maybeSingle();
    if (existingError) throw existingError;
    const { data, error } = await supabase
      .from("school_year_config")
      .update({ school_year_label, start_date, end_date, attendance_weekdays, updated_at: new Date().toISOString() })
      .eq("is_active", true)
      .select()
      .single();

    if (error) throw error;

    await logAudit({ action: "School Year Updated", performedById: ict.id, performedBy: [ict.first_name, ict.middle_name, ict.last_name, ict.suffix].filter(Boolean).join(" ") || "ICT Admin", performedByRole: "ICT Admin", targetUser: school_year_label, targetRole: "School Year", targetType: "School Year", targetId: data.id, previousStatus: existing?.school_year_label, newStatus: school_year_label, module: "School Year Control", details: `Updated active school year from ${existing?.school_year_label ?? "Unknown"} to ${school_year_label}.` });
    await publishSchoolYearRealtimeInvalidation();

    return NextResponse.json({ success: true, schoolYear: data });
  } catch (error) {
    console.error("PATCH /api/school-year error:", error);
    return NextResponse.json(
      { success: false, message: "Failed to update school year" },
      { status: 500 }
    );
  }
}
