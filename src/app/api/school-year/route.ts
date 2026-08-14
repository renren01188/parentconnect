import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

function isMissingSchemaError(error: { code?: string; message?: string } | null) {
  return Boolean(error && (error.code === "PGRST205" || error.code === "42P01" || error.message?.toLowerCase().includes("does not exist") || error.message?.toLowerCase().includes("schema cache")));
}

// GET — fetch the active school year
export async function GET() {
  try {
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

    const { data, error } = await supabase
      .from("school_year_config")
      .update({ school_year_label, start_date, end_date, updated_at: new Date().toISOString() })
      .eq("is_active", true)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ success: true, schoolYear: data });
  } catch (error) {
    console.error("PATCH /api/school-year error:", error);
    return NextResponse.json(
      { success: false, message: "Failed to update school year" },
      { status: 500 }
    );
  }
}
