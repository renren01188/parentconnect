import { NextResponse } from "next/server";
import { processAttendanceSmsJobs } from "@/lib/attendanceSmsWorker";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const secret = process.env.SMS_QUEUE_CRON_SECRET || process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ success: false }, { status: 401 });
  }

  try {
    const outcomes = await processAttendanceSmsJobs();
    return NextResponse.json({
      success: true,
      ...outcomes,
    });
  } catch (error) {
    console.error("attendance SMS worker failed:", error);
    return NextResponse.json({ success: false }, { status: 500 });
  }
}
