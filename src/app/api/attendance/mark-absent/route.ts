import { after, NextRequest, NextResponse } from "next/server";
import { getIctFromToken } from "@/lib/getIctFromToken";
import { publishAttendanceRealtimeInvalidation } from "@/lib/realtimeInvalidation";
import { getSchoolClock } from "@/lib/attendanceScannerSchedule";
import { markAutomaticAbsences } from "@/lib/automaticAttendanceAbsence";

/**
 * Manual retry endpoint for ICT. The scheduled processor is authoritative;
 * this is safe to call at or after the configured session end because the writer is
 * idempotent and never overwrites any existing Time In record.
 */
export async function POST(req: NextRequest) {
  try {
    const ict = await getIctFromToken();
    if (!ict) {
      return NextResponse.json({ success: false, message: "ICT authorization is required." }, { status: 401 });
    }
    const body = await req.json();
    const sessionType = body.session_type as "Morning" | "Afternoon" | undefined;
    if (sessionType !== "Morning" && sessionType !== "Afternoon") {
      return NextResponse.json({ success: false, message: "session_type must be Morning or Afternoon." }, { status: 400 });
    }

    const response = await markAutomaticAbsences({
      sessionType,
      sessionDate: body.session_date ?? getSchoolClock().date,
    });
    if (response.affectedStudentDbIds.length) {
      after(() => Promise.all(
        response.affectedStudentDbIds.map((studentDbId) => publishAttendanceRealtimeInvalidation({ studentDbId })),
      ).then(() => undefined));
    }
    return NextResponse.json(response, { status: response.status });
  } catch (error) {
    console.error("mark-absent error:", error);
    return NextResponse.json({ success: false, message: "Failed to mark absent students" }, { status: 500 });
  }
}
