import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { sendParentDeletionScheduledEmail } from "@/lib/mailer";
import {
  isTemporaryEmailError,
  MAX_DELETION_EMAIL_ATTEMPTS,
  mapWithConcurrency,
  retryAt,
} from "@/lib/deletionEmailQueue";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type EmailJob = {
  id: string;
  recipient_email: string;
  recipient_name: string;
  target_names: string[];
  reason: string;
  delete_after: string;
  scheduled_deletion_ids: number[];
  attempts: number;
};

const DEFAULT_BATCH_SIZE = 20;
const DEFAULT_CONCURRENCY = 3;
const INTER_SEND_DELAY_MS = 250;

function positiveInt(value: string | undefined, fallback: number, maximum: number) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? Math.min(parsed, maximum) : fallback;
}

function errorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || "Unknown email delivery error");
  return message.slice(0, 1_000);
}

async function claimJob(): Promise<EmailJob | null> {
  const now = new Date();
  const staleBefore = new Date(now.getTime() - 10 * 60_000).toISOString();

  const { data: candidates, error } = await supabase
    .from("deletion_email_jobs")
    .select("id, status")
    .or(`and(status.eq.pending,available_at.lte.${now.toISOString()}),and(status.eq.processing,locked_at.lt.${staleBefore})`)
    .order("created_at", { ascending: true })
    .limit(4);
  if (error) throw error;

  for (const candidate of candidates ?? []) {
    const baseQuery = supabase
      .from("deletion_email_jobs")
      .update({ status: "processing", locked_at: now.toISOString(), last_error: null })
      .eq("id", candidate.id);
    const claimQuery = candidate.status === "pending"
      ? baseQuery.eq("status", "pending").lte("available_at", now.toISOString())
      : baseQuery.eq("status", "processing").lt("locked_at", staleBefore);
    const { data: claimed, error: claimError } = await claimQuery
      .select("id, recipient_email, recipient_name, target_names, reason, delete_after, scheduled_deletion_ids, attempts")
      .maybeSingle();
    if (claimError) throw claimError;
    if (claimed) return claimed as EmailJob;
  }

  return null;
}

async function processJob(job: EmailJob) {
  const attempt = job.attempts + 1;
  try {
    await sendParentDeletionScheduledEmail({
      parentEmail: job.recipient_email,
      parentName: job.recipient_name || job.target_names.join(", ") || "Parent / Guardian",
      reason: job.reason,
      deleteAfter: new Date(job.delete_after).toLocaleDateString("en-PH", {
        year: "numeric",
        month: "long",
        day: "numeric",
      }),
    });
    const sentAt = new Date().toISOString();
    const { error } = await supabase
      .from("deletion_email_jobs")
      .update({ status: "sent", attempts: attempt, sent_at: sentAt, locked_at: null, last_error: null })
      .eq("id", job.id)
      .eq("status", "processing");
    if (error) throw error;
    await supabase
      .from("scheduled_deletions")
      .update({ notice_sent_at: sentAt })
      .in("id", job.scheduled_deletion_ids);
    return "sent" as const;
  } catch (error) {
    const temporary = isTemporaryEmailError(error);
    const status = temporary && attempt < MAX_DELETION_EMAIL_ATTEMPTS ? "pending" : "failed";
    const { error: updateError } = await supabase
      .from("deletion_email_jobs")
      .update({
        status,
        attempts: attempt,
        available_at: status === "pending" ? retryAt(attempt) : new Date().toISOString(),
        locked_at: null,
        last_error: errorMessage(error),
      })
      .eq("id", job.id)
      .eq("status", "processing");
    if (updateError) throw updateError;
    return status;
  }
}

export async function POST(req: Request) {
  if (!process.env.CRON_SECRET || req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ success: false }, { status: 401 });
  }

  try {
    const batchSize = positiveInt(process.env.DELETION_EMAIL_BATCH_SIZE, DEFAULT_BATCH_SIZE, 100);
    const concurrency = positiveInt(process.env.DELETION_EMAIL_CONCURRENCY, DEFAULT_CONCURRENCY, 10);
    const jobs: EmailJob[] = [];
    for (let index = 0; index < batchSize; index += 1) {
      const job = await claimJob();
      if (!job) break;
      jobs.push(job);
    }

    const outcomes = await mapWithConcurrency(jobs, concurrency, async (job) => {
      const outcome = await processJob(job);
      // Spread starts slightly within each controlled batch to respect SMTP
      // provider rate limits without holding the deletion request open.
      await new Promise((resolve) => setTimeout(resolve, INTER_SEND_DELAY_MS));
      return outcome;
    });
    return NextResponse.json({
      success: true,
      processed: jobs.length,
      sent: outcomes.filter((outcome) => outcome === "sent").length,
      pending: outcomes.filter((outcome) => outcome === "pending").length,
      failed: outcomes.filter((outcome) => outcome === "failed").length,
    });
  } catch (error) {
    console.error("deletion email worker failed:", error);
    return NextResponse.json({ success: false }, { status: 500 });
  }
}
