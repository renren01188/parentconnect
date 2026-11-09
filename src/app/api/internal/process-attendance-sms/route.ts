import { NextResponse } from "next/server";
import { dispatchAttendanceSmsJobs } from "@/lib/attendanceSmsWorker";
import { processAttendanceEmailJobs } from "@/lib/attendanceEmailWorker";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function processQueue(req: Request) {
  // Vercel sends CRON_SECRET, while existing internal callers may use the
  // queue-specific secret. Accept either configured secret without opening the
  // endpoint to an unauthenticated request.
  const expectedSecrets = [
    process.env.SMS_QUEUE_CRON_SECRET,
    process.env.ATTENDANCE_NOTIFICATION_QUEUE_CRON_SECRET,
    process.env.CRON_SECRET,
  ]
    .filter((secret): secret is string => Boolean(secret));
  if (!expectedSecrets.length || !expectedSecrets.some((secret) => req.headers.get("authorization") === `Bearer ${secret}`)) {
    return NextResponse.json({ success: false }, { status: 401 });
  }

  try {
    const [sms, email] = await Promise.all([
      dispatchAttendanceSmsJobs(),
      processAttendanceEmailJobs(),
    ]);
    return NextResponse.json({
      success: true,
      sms,
      email,
    });
  } catch (error) {
    console.error("attendance SMS worker failed:", error);
    return NextResponse.json({ success: false }, { status: 500 });
  }
}

// Vercel Cron invokes configured paths with GET. POST remains available for
// authenticated internal callers, but both paths use the same fail-closed
// authorization and conservative reconciliation worker.
export async function GET(req: Request) {
  return processQueue(req);
}

export async function POST(req: Request) {
  return processQueue(req);
}
