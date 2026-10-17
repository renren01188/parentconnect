import { NextRequest, NextResponse } from "next/server";
import { processDueScheduledDeletions } from "@/lib/processScheduledDeletions";
import { processDueAdviserTransfers } from "@/lib/processDueAdviserTransfers";
import { processDueScheduledAnnouncements } from "@/lib/processScheduledAnnouncements";

async function processScheduledDeletions(req: NextRequest) {
  // CRON_SECRET is the standard Vercel cron secret. Keep the previous name
  // as a fallback for existing non-Vercel schedulers.
  const expected = process.env.CRON_SECRET ?? process.env.DELETION_CRON_SECRET;
  if (!expected || req.headers.get("authorization") !== `Bearer ${expected}`) {
    return NextResponse.json({ success: false, message: "Unauthorized." }, { status: 401 });
  }
  try {
    const [{ archived, failed }, transfers, announcements] = await Promise.all([
      processDueScheduledDeletions(),
      processDueAdviserTransfers(),
      processDueScheduledAnnouncements(),
    ]);
    return NextResponse.json({ success: true, archived, failed, transfers, announcements });
  } catch (error) {
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : "Unable to process scheduled work." },
      { status: 500 },
    );
  }
}

// Vercel Cron invokes configured paths with GET requests.
export async function GET(req: NextRequest) {
  return processScheduledDeletions(req);
}

// Retain POST support for any existing external scheduler integration.
export async function POST(req: NextRequest) {
  return processScheduledDeletions(req);
}
