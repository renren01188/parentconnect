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

// GET — fetch all deletion requests (so the page knows which advisers have pending requests)
export async function GET() {
  try {
    const session = await requireIct();
    if (!session) {
      return NextResponse.json({ success: false, message: "Unauthorized." }, { status: 401 });
    }

    const { data, error } = await supabase
      .from("deletion_requests")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) throw error;

    return NextResponse.json({ success: true, deletionRequests: data ?? [] });
  } catch (error: unknown) {
    console.error("GET /api/ict/deletion-requests error:", error);
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : "Server error." },
      { status: 500 }
    );
  }
}

// POST — submit a new deletion request for principal approval
export async function POST(req: NextRequest) {
  try {
    const session = await requireIct();
    if (!session) {
      return NextResponse.json({ success: false, message: "Unauthorized." }, { status: 401 });
    }

    const body = await req.json();
    const { adviserId, adviserName, adviserEmail, reason } = body;

    if (!adviserId || !adviserName || !adviserEmail) {
      return NextResponse.json(
        { success: false, message: "Missing required fields." },
        { status: 400 }
      );
    }

    // Check if there's already a pending request for this adviser
    const { data: existing } = await supabase
      .from("deletion_requests")
      .select("id")
      .eq("adviser_id", adviserId)
      .eq("status", "PendingPrincipalApproval")
      .limit(1);

    if (existing && existing.length > 0) {
      return NextResponse.json(
        { success: false, message: "A deletion request for this adviser is already pending." },
        { status: 409 }
      );
    }

    const { data, error } = await supabase
      .from("deletion_requests")
      .insert({
        adviser_id:    adviserId,
        adviser_name:  adviserName,
        adviser_email: adviserEmail,
        reason:        reason ?? null,
        status:        "PendingPrincipalApproval",
        requested_by:  "ICT Admin",
      })
      .select("id")
      .single();

    if (error) throw error;

    return NextResponse.json({ success: true, id: data.id });
  } catch (error: unknown) {
    console.error("POST /api/ict/deletion-requests error:", error);
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : "Server error." },
      { status: 500 }
    );
  }
}