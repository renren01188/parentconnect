import { NextRequest, NextResponse } from "next/server";
import { processAttendanceEmailJobs } from "@/lib/attendanceEmailWorker";

export async function POST(request: NextRequest) {
  const expected = process.env.ATTENDANCE_NOTIFICATION_QUEUE_CRON_SECRET || process.env.SMS_QUEUE_CRON_SECRET || process.env.CRON_SECRET;
  const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!expected || !supplied || supplied !== expected) {
    return NextResponse.json({ success: false, message: "Unauthorized." }, { status: 401 });
  }

  try {
    const outcomes = await processAttendanceEmailJobs();
    return NextResponse.json({ success: true, ...outcomes }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Attendance email worker failed:", error);
    return NextResponse.json({ success: false, message: "Attendance email worker failed." }, { status: 500 });
  }
}
