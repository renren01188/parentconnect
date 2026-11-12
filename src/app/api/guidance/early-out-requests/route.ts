import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { getGuidanceSession } from "@/app/api/reports/parent-adviser/_lib";

export async function GET(request: NextRequest) {
  try {
    if (!await getGuidanceSession()) {
      return NextResponse.json({ success: false, message: "Not authenticated." }, { status: 401 });
    }

    const requestedStatus = request.nextUrl.searchParams.get("status");
    let query = supabase
      .from("early_out_requests")
      .select("id, student_id, student_name, adviser_id, adviser_name, grade, section, attendance_date, reason, message, status, rejection_reason, created_at, reviewed_at")
      .order("status", { ascending: true })
      .order("attendance_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(200);
    if (requestedStatus && ["Pending", "Approved", "Rejected"].includes(requestedStatus)) {
      query = query.eq("status", requestedStatus);
    }
    const { data, error } = await query;
    if (error) throw error;
    return NextResponse.json({ success: true, requests: data ?? [] });
  } catch (error) {
    console.error("GET /api/guidance/early-out-requests error:", error);
    return NextResponse.json({ success: false, message: "Unable to load Early Out requests." }, { status: 500 });
  }
}
