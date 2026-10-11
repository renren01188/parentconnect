import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Kept as an authenticated no-op while older cron schedules are retired.
 * Parent account-deletion communication is deliberately in-app only; this
 * endpoint must never claim queued jobs or invoke the mailer.
 */
export async function POST(req: Request) {
  if (!process.env.CRON_SECRET || req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ success: false }, { status: 401 });
  }

  return NextResponse.json({
    success: true,
    processed: 0,
    sent: 0,
    pending: 0,
    failed: 0,
    disabled: "Parent account-deletion emails are disabled; notifications are in-app only.",
  });
}
