import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { jwtVerify } from "jose";
import { getJwtSecret } from "@/lib/authSecret";
import { supabase } from "@/lib/supabase";

const SECRET = getJwtSecret();
const COMPLETION_COLUMN = "parent_reports_guide_completed_at";

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Server error.";
}

async function getParentId() {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("parent_token")?.value;
    if (!token) return null;

    const verified = await jwtVerify(token, SECRET);
    const parentId = Number(verified.payload.id);
    return parentId && verified.payload.role === "parent" ? parentId : null;
  } catch {
    return null;
  }
}

export async function GET() {
  try {
    const parentId = await getParentId();
    if (!parentId) {
      return NextResponse.json({ success: false, message: "Not authenticated." }, { status: 401 });
    }

    const { data, error } = await supabase
      .from("parents")
      .select(`id, ${COMPLETION_COLUMN}`)
      .eq("id", parentId)
      .maybeSingle();

    if (error) throw error;
    if (!data) {
      return NextResponse.json({ success: false, message: "Parent account not found." }, { status: 404 });
    }

    return NextResponse.json(
      { success: true, completed: Boolean(data[COMPLETION_COLUMN as keyof typeof data]) },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error: unknown) {
    console.error("GET /api/parents/reports-guide error:", error);
    return NextResponse.json({ success: false, message: errorMessage(error) }, { status: 500 });
  }
}

export async function PATCH() {
  try {
    const parentId = await getParentId();
    if (!parentId) {
      return NextResponse.json({ success: false, message: "Not authenticated." }, { status: 401 });
    }

    const { data, error } = await supabase
      .from("parents")
      .update({ [COMPLETION_COLUMN]: new Date().toISOString() })
      .eq("id", parentId)
      .is(COMPLETION_COLUMN, null)
      .select(COMPLETION_COLUMN)
      .maybeSingle();

    if (error) throw error;

    // Repeated finish requests retain the first completion timestamp.
    if (!data) {
      const { data: parent, error: parentError } = await supabase
        .from("parents")
        .select(COMPLETION_COLUMN)
        .eq("id", parentId)
        .maybeSingle();
      if (parentError) throw parentError;
      if (!parent?.[COMPLETION_COLUMN as keyof typeof parent]) {
        return NextResponse.json({ success: false, message: "Parent account not found." }, { status: 404 });
      }
    }

    return NextResponse.json(
      { success: true, completed: true },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error: unknown) {
    console.error("PATCH /api/parents/reports-guide error:", error);
    return NextResponse.json({ success: false, message: errorMessage(error) }, { status: 500 });
  }
}
