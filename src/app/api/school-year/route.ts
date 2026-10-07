import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { getActiveIct } from "@/lib/apiAuthorization";
import { logAudit } from "@/lib/audit";

function isMissingSchemaError(error: { code?: string; message?: string } | null) {
  return Boolean(error && (error.code === "PGRST205" || error.code === "42P01" || error.message?.toLowerCase().includes("does not exist") || error.message?.toLowerCase().includes("schema cache")));
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

    const body = await req.json();
    const { school_year_label, start_date, end_date } = body;

    if (!school_year_label || !start_date || !end_date) {
      return NextResponse.json(
        { success: false, message: "All fields are required." },
        { status: 400 }
      );
    }

    if (new Date(end_date) <= new Date(start_date)) {
      return NextResponse.json(
        { success: false, message: "End date must be after start date." },
        { status: 400 }
      );
    }

    // Deactivate existing active school year
    await supabase
      .from("school_year_config")
      .update({ is_active: false })
      .eq("is_active", true);

    const { data, error } = await supabase
      .from("school_year_config")
      .insert({ school_year_label, start_date, end_date, is_active: true })
      .select()
      .single();

    if (error) throw error;

    await logAudit({ action: "School Year Created", performedById: ict.id, performedBy: [ict.first_name, ict.middle_name, ict.last_name, ict.suffix].filter(Boolean).join(" ") || "ICT Admin", performedByRole: "ICT Admin", targetUser: school_year_label, targetRole: "School Year", targetType: "School Year", targetId: data.id, newStatus: "Active", module: "School Year Control", details: `Created and activated school year ${school_year_label}.` });

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

    const body = await req.json();
    const { school_year_label, start_date, end_date } = body;

    if (!school_year_label || !start_date || !end_date) {
      return NextResponse.json(
        { success: false, message: "All fields are required." },
        { status: 400 }
      );
    }

    if (new Date(end_date) <= new Date(start_date)) {
      return NextResponse.json(
        { success: false, message: "End date must be after start date." },
        { status: 400 }
      );
    }

    const { data: existing, error: existingError } = await supabase.from("school_year_config").select("id, school_year_label").eq("is_active", true).maybeSingle();
    if (existingError) throw existingError;
    const { data, error } = await supabase
      .from("school_year_config")
      .update({ school_year_label, start_date, end_date, updated_at: new Date().toISOString() })
      .eq("is_active", true)
      .select()
      .single();

    if (error) throw error;

    await logAudit({ action: "School Year Updated", performedById: ict.id, performedBy: [ict.first_name, ict.middle_name, ict.last_name, ict.suffix].filter(Boolean).join(" ") || "ICT Admin", performedByRole: "ICT Admin", targetUser: school_year_label, targetRole: "School Year", targetType: "School Year", targetId: data.id, previousStatus: existing?.school_year_label, newStatus: school_year_label, module: "School Year Control", details: `Updated active school year from ${existing?.school_year_label ?? "Unknown"} to ${school_year_label}.` });

    return NextResponse.json({ success: true, schoolYear: data });
  } catch (error) {
    console.error("PATCH /api/school-year error:", error);
    return NextResponse.json(
      { success: false, message: "Failed to update school year" },
      { status: 500 }
    );
  }
}
