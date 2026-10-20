import { after, NextRequest, NextResponse } from "next/server";
import { processDueAutomaticAbsences } from "@/lib/automaticAttendanceAbsence";
import { publishAttendanceRealtimeInvalidation } from "@/lib/realtimeInvalidation";

async function processAbsences(req: NextRequest) {
  const expected = process.env.CRON_SECRET;
  if (!expected || req.headers.get("authorization") !== `Bearer ${expected}`) {
    return NextResponse.json({ success: false, message: "Unauthorized." }, { status: 401 });
  }

  try {
    const processed = await processDueAutomaticAbsences();
    const affectedStudentDbIds = processed.processedSessions.flatMap((session) => session.affectedStudentDbIds);
    if (affectedStudentDbIds.length) {
      after(() => Promise.all(
        [...new Set(affectedStudentDbIds)].map((studentDbId) => publishAttendanceRealtimeInvalidation({ studentDbId })),
      ).then(() => undefined));
    }
    return NextResponse.json({ success: true, ...processed });
  } catch (error) {
    console.error("Automatic absence processor error:", error);
    return NextResponse.json({ success: false, message: "Unable to process automatic absences." }, { status: 500 });
  }
}

// Vercel Cron uses GET. POST is retained for a secured external scheduler.
export async function GET(req: NextRequest) {
  return processAbsences(req);
}

export async function POST(req: NextRequest) {
  return processAbsences(req);
}
