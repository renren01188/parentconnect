import { NextResponse } from "next/server";
import { getIctFromToken } from "@/lib/getIctFromToken";
import { supabase } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStoreHeaders = { "Cache-Control": "private, no-store" };
const jobColumns = "id, attendance_log_id, status, attempts, provider, provider_message_id, provider_status, last_error, created_at, updated_at, provider_requested_at, provider_accepted_at, reconciliation_required_at, reconciled_at, retry_eligible_at";

export async function GET() {
  try {
    const ict = await getIctFromToken();
    if (!ict) return NextResponse.json({ success: false, message: "Unauthorized." }, { status: 401 });

    // Recipient phone numbers and SMS bodies are intentionally omitted. ICT
    // gets operational state without broadening access to family data.
    const { data, error } = await supabase
      .from("attendance_sms_jobs")
      .select(jobColumns)
      .order("updated_at", { ascending: false })
      .limit(50);
    if (error) throw error;

    const jobs = data ?? [];
    const summary = jobs.reduce<Record<string, number>>((counts, job) => {
      const status = String(job.status || "unknown");
      counts[status] = (counts[status] ?? 0) + 1;
      return counts;
    }, {});
    return NextResponse.json({ success: true, jobs, summary }, { headers: noStoreHeaders });
  } catch (error) {
    console.error("GET /api/ict/attendance-sms-jobs error:", error);
    return NextResponse.json({ success: false, message: "Could not load attendance SMS jobs." }, { status: 500, headers: noStoreHeaders });
  }
}
