import { NextResponse } from "next/server";
import { processAttendanceSmsJobs } from "@/lib/attendanceSmsWorker";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function processQueue(req: Request) {
  // Vercel sends CRON_SECRET, while existing internal callers may use the
  // queue-specific secret. Accept either configured secret without opening the
  // endpoint to an unauthenticated request.
  const expectedSecrets = [process.env.SMS_QUEUE_CRON_SECRET, process.env.CRON_SECRET]
    .filter((secret): secret is string => Boolean(secret));
  if (!expectedSecrets.length || !expectedSecrets.some((secret) => req.headers.get("authorization") === `Bearer ${secret}`)) {
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

// Vercel Cron invokes configured paths with GET. POST remains available for
// authenticated internal callers, but both paths use the same fail-closed
// authorization and conservative reconciliation worker.
export async function GET(req: Request) {
  return processQueue(req);
}

export async function POST(req: Request) {
  return processQueue(req);
}
