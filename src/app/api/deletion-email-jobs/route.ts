import { NextRequest, NextResponse } from "next/server";
import { getIctFromToken } from "@/lib/getIctFromToken";
import { supabase } from "@/lib/supabase";

export async function GET(req: NextRequest) {
  if (!await getIctFromToken()) {
    return NextResponse.json({ success: false, message: "Unauthorized." }, { status: 401 });
  }

  const batchId = req.nextUrl.searchParams.get("batchId") ?? "";
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(batchId)) {
    return NextResponse.json({ success: false, message: "A valid email batch is required." }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("deletion_email_jobs")
    .select("status")
    .eq("batch_id", batchId);
  if (error) {
    console.error("deletion email status failed:", error);
    return NextResponse.json({ success: false, message: "Could not load email status." }, { status: 500 });
  }

  const summary = { sent: 0, pending: 0, failed: 0 };
  for (const job of data ?? []) {
    if (job.status === "sent") summary.sent += 1;
    else if (job.status === "failed") summary.failed += 1;
    else summary.pending += 1;
  }
  return NextResponse.json({ success: true, ...summary });
}
