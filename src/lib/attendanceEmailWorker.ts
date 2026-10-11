import { supabase } from "@/lib/supabase";
import { isAttendanceEmailEnabled } from "@/lib/attendanceNotificationSettings";
import { sendWithEmail } from "@/lib/mailer";
import { mapWithConcurrency } from "@/lib/deletionEmailQueue";

type EmailJob = {
  id: string;
  recipient_email: string;
  subject: string;
  message: string;
  attempts: number;
};

export const DEFAULT_ATTENDANCE_EMAIL_BATCH_SIZE = 20;
export const DEFAULT_ATTENDANCE_EMAIL_CONCURRENCY = 4;
const MAX_ATTENDANCE_EMAIL_BATCH_SIZE = 20;
const MAX_ATTENDANCE_EMAIL_CONCURRENCY = 4;
const PROCESSING_STALE_AFTER_MS = 10 * 60_000;
const UNKNOWN_PROCESSING_ERROR = "Email provider outcome is unknown after a worker interruption. Verify the provider before manually requeueing this job.";

function positiveInt(value: string | undefined, fallback: number, maximum: number) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? Math.min(parsed, maximum) : fallback;
}

function errorMessage(error: unknown) {
  return (error instanceof Error ? error.message : String(error || "Unknown email delivery error"))
    .replace(/[^\s@]+@[^\s@]+\.[^\s@]+/g, "[redacted-email]")
    .slice(0, 1_000);
}

async function skipPendingJobs(attendanceLogId?: number) {
  let query = supabase
    .from("attendance_email_jobs")
    .update({ status: "skipped", locked_at: null, last_error: "Attendance email notifications are disabled." })
    .eq("status", "pending");
  if (attendanceLogId !== undefined) query = query.eq("attendance_log_id", attendanceLogId);
  const { error } = await query;
  if (error) throw error;
}

async function failStaleProcessingJobs(attendanceLogId?: number) {
  const staleBefore = new Date(Date.now() - PROCESSING_STALE_AFTER_MS).toISOString();
  let query = supabase
    .from("attendance_email_jobs")
    .update({ status: "failed", locked_at: null, last_error: UNKNOWN_PROCESSING_ERROR })
    .eq("status", "processing")
    .lt("locked_at", staleBefore);
  if (attendanceLogId !== undefined) query = query.eq("attendance_log_id", attendanceLogId);
  const { error } = await query;
  if (error) throw error;
}

async function claimJob(attendanceLogId?: number): Promise<EmailJob | null> {
  const now = new Date().toISOString();
  let query = supabase
    .from("attendance_email_jobs")
    .select("id")
    .eq("status", "pending")
    .lte("available_at", now)
    .order("created_at", { ascending: true })
    .limit(8);
  if (attendanceLogId !== undefined) query = query.eq("attendance_log_id", attendanceLogId);
  const { data: candidates, error } = await query;
  if (error) throw error;

  for (const candidate of candidates ?? []) {
    const { data: job, error: claimError } = await supabase
      .from("attendance_email_jobs")
      .update({ status: "processing", locked_at: now, last_error: null })
      .eq("id", candidate.id)
      .eq("status", "pending")
      .lte("available_at", now)
      .select("id, recipient_email, subject, message, attempts")
      .maybeSingle();
    if (claimError) throw claimError;
    if (job) return job as EmailJob;
  }
  return null;
}

async function processJob(job: EmailJob) {
  if (!await isAttendanceEmailEnabled()) {
    const { error } = await supabase
      .from("attendance_email_jobs")
      .update({ status: "skipped", locked_at: null, last_error: "Attendance email notifications are disabled." })
      .eq("id", job.id)
      .eq("status", "processing");
    if (error) throw error;
    return "skipped" as const;
  }

  const attempt = job.attempts + 1;
  try {
    const result = await sendWithEmail({ to: job.recipient_email, subject: job.subject, text: job.message });
    const { error } = await supabase
      .from("attendance_email_jobs")
      .update({
        status: "sent",
        attempts: attempt,
        provider: "brevo",
        provider_message_id: typeof result?.messageId === "string" ? result.messageId : null,
        sent_at: new Date().toISOString(),
        locked_at: null,
        last_error: null,
      })
      .eq("id", job.id)
      .eq("status", "processing");
    if (error) throw error;
    return "sent" as const;
  } catch (error) {
    // A network failure may have occurred after the provider accepted the mail.
    // Never retry automatically; the unique job stays failed for verification.
    const { error: updateError } = await supabase
      .from("attendance_email_jobs")
      .update({
        status: "failed",
        attempts: attempt,
        provider: "brevo",
        locked_at: null,
        last_error: errorMessage(error),
      })
      .eq("id", job.id)
      .eq("status", "processing");
    if (updateError) throw updateError;
    return "failed" as const;
  }
}

export async function processAttendanceEmailJobs(options?: { batchSize?: number; concurrency?: number; attendanceLogId?: number }) {
  if (!await isAttendanceEmailEnabled()) {
    await skipPendingJobs(options?.attendanceLogId);
    return { processed: 0, sent: 0, failed: 0, skipped: 0 };
  }

  const batchSize = positiveInt(
    options?.batchSize === undefined ? process.env.ATTENDANCE_EMAIL_BATCH_SIZE : String(options.batchSize),
    DEFAULT_ATTENDANCE_EMAIL_BATCH_SIZE,
    MAX_ATTENDANCE_EMAIL_BATCH_SIZE,
  );
  const concurrency = positiveInt(
    options?.concurrency === undefined ? process.env.ATTENDANCE_EMAIL_CONCURRENCY : String(options.concurrency),
    DEFAULT_ATTENDANCE_EMAIL_CONCURRENCY,
    MAX_ATTENDANCE_EMAIL_CONCURRENCY,
  );
  await failStaleProcessingJobs(options?.attendanceLogId);
  const jobs: EmailJob[] = [];
  for (let index = 0; index < batchSize; index += 1) {
    const job = await claimJob(options?.attendanceLogId);
    if (!job) break;
    jobs.push(job);
  }
  const outcomes = await mapWithConcurrency(jobs, concurrency, processJob);
  return {
    processed: jobs.length,
    sent: outcomes.filter((outcome) => outcome === "sent").length,
    failed: outcomes.filter((outcome) => outcome === "failed").length,
    skipped: outcomes.filter((outcome) => outcome === "skipped").length,
  };
}
