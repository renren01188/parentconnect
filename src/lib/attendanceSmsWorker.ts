import { supabase } from "@/lib/supabase";
import { isAttendanceSmsEnabled } from "@/lib/attendanceNotificationSettings";
import { configuredAttendanceSmsRoute } from "@/lib/attendanceSmsRoute";
import { mapWithConcurrency, retryAt } from "@/lib/deletionEmailQueue";
import { canRetrySmsProviderError, sendSms, SmsProviderError } from "@/lib/smsProvider";

type SmsJob = {
  id: string;
  recipient_phone: string;
  message: string;
  attempts: number;
};

export const DEFAULT_ATTENDANCE_SMS_BATCH_SIZE = 20;
export const DEFAULT_ATTENDANCE_SMS_CONCURRENCY = 4;
const MAX_ATTENDANCE_SMS_BATCH_SIZE = 20;
const MAX_ATTENDANCE_SMS_CONCURRENCY = 4;
const MAX_SMS_ATTEMPTS = 5;
const PROCESSING_STALE_AFTER_MS = 10 * 60_000;
const UNKNOWN_PROCESSING_ERROR = "SMS provider outcome is unknown after a worker interruption. Verify the provider before manually requeueing this job.";

function positiveInt(value: string | undefined, fallback: number, maximum: number) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? Math.min(parsed, maximum) : fallback;
}

function errorMessage(error: unknown) {
  return (error instanceof Error ? error.message : String(error || "Unknown SMS delivery error"))
    // Never place a likely Philippine phone number into the queue's error log.
    .replace(/(?:\+63|63|0)9\d{9}/g, "[redacted-phone]")
    .slice(0, 1_000);
}

function errorResponse(error: unknown) {
  return error instanceof SmsProviderError && error.response && typeof error.response === "object"
    ? error.response
    : null;
}

async function claimJob(attendanceLogId?: number): Promise<SmsJob | null> {
  const now = new Date();
  let query = supabase
    .from("attendance_sms_jobs")
    .select("id, status")
    .eq("status", "pending")
    .lte("available_at", now.toISOString())
    .order("created_at", { ascending: true })
    .limit(8);
  if (attendanceLogId !== undefined) query = query.eq("attendance_log_id", attendanceLogId);
  const { data: candidates, error } = await query;
  if (error) throw error;

  for (const candidate of candidates ?? []) {
    const base = supabase
      .from("attendance_sms_jobs")
      .update({ status: "processing", locked_at: now.toISOString(), last_error: null })
      .eq("id", candidate.id)
      .eq("status", "pending")
      .lte("available_at", now.toISOString());
    const { data: job, error: claimError } = await base
      .select("id, recipient_phone, message, attempts")
      .maybeSingle();
    if (claimError) throw claimError;
    if (job) return job as SmsJob;
  }
  return null;
}

/**
 * A process can die after an SMS provider accepts the request but before the
 * `sent` update commits. Re-sending a stale Processing job would duplicate a
 * parent's SMS, so leave a clear Failed record for provider verification.
 */
async function failStaleProcessingJobs(attendanceLogId?: number) {
  const staleBefore = new Date(Date.now() - PROCESSING_STALE_AFTER_MS).toISOString();
  let query = supabase
    .from("attendance_sms_jobs")
    .update({
      status: "failed",
      locked_at: null,
      last_error: UNKNOWN_PROCESSING_ERROR,
    })
    .eq("status", "processing")
    .lt("locked_at", staleBefore);
  if (attendanceLogId !== undefined) query = query.eq("attendance_log_id", attendanceLogId);
  const { error } = await query;
  if (error) throw error;
}

async function skipPendingJobs(attendanceLogId?: number) {
  let query = supabase
    .from("attendance_sms_jobs")
    .update({ status: "skipped", locked_at: null, last_error: "Attendance SMS notifications are disabled." })
    .eq("status", "pending");
  if (attendanceLogId !== undefined) query = query.eq("attendance_log_id", attendanceLogId);
  const { error } = await query;
  if (error) throw error;
}

async function processJob(job: SmsJob) {
  if (!await isAttendanceSmsEnabled()) {
    const { error } = await supabase
      .from("attendance_sms_jobs")
      .update({ status: "skipped", locked_at: null, last_error: "Attendance SMS notifications are disabled." })
      .eq("id", job.id)
      .eq("status", "processing");
    if (error) throw error;
    return "skipped" as const;
  }

  const attempt = job.attempts + 1;
  try {
    const result = await sendSms({
      recipient: job.recipient_phone,
      message: job.message,
      queueId: job.id,
      semaphoreRoute: configuredAttendanceSmsRoute(),
    });
    const { error } = await supabase
      .from("attendance_sms_jobs")
      .update({
        status: "sent",
        attempts: attempt,
        provider: result.provider,
        provider_message_id: result.providerMessageId,
        provider_status: result.providerStatus,
        provider_response: result.response,
        sent_at: new Date().toISOString(),
        locked_at: null,
        last_error: null,
      })
      .eq("id", job.id)
      .eq("status", "processing");
    if (error) throw error;
    return "sent" as const;
  } catch (error) {
    const retryable = canRetrySmsProviderError(error);
    const status = retryable && attempt < MAX_SMS_ATTEMPTS ? "pending" : "failed";
    const { error: updateError } = await supabase
      .from("attendance_sms_jobs")
      .update({
        status,
        attempts: attempt,
        provider: (process.env.SMS_PROVIDER || "semaphore").toLowerCase(),
        provider_status: "error",
        provider_response: errorResponse(error),
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

export async function processAttendanceSmsJobs(options?: { batchSize?: number; concurrency?: number; attendanceLogId?: number }) {
  if (!await isAttendanceSmsEnabled()) {
    await skipPendingJobs(options?.attendanceLogId);
    return { processed: 0, sent: 0, pending: 0, failed: 0, skipped: 0 };
  }

  const batchSize = positiveInt(
    options?.batchSize === undefined ? process.env.ATTENDANCE_SMS_BATCH_SIZE : String(options.batchSize),
    DEFAULT_ATTENDANCE_SMS_BATCH_SIZE,
    MAX_ATTENDANCE_SMS_BATCH_SIZE,
  );
  const concurrency = positiveInt(
    options?.concurrency === undefined ? process.env.ATTENDANCE_SMS_CONCURRENCY : String(options.concurrency),
    DEFAULT_ATTENDANCE_SMS_CONCURRENCY,
    MAX_ATTENDANCE_SMS_CONCURRENCY,
  );
  await failStaleProcessingJobs(options?.attendanceLogId);
  const jobs: SmsJob[] = [];
  for (let index = 0; index < batchSize; index += 1) {
    const job = await claimJob(options?.attendanceLogId);
    if (!job) break;
    jobs.push(job);
  }
  const outcomes = await mapWithConcurrency(jobs, concurrency, processJob);
  return {
    processed: jobs.length,
    sent: outcomes.filter((outcome) => outcome === "sent").length,
    pending: outcomes.filter((outcome) => outcome === "pending").length,
    failed: outcomes.filter((outcome) => outcome === "failed").length,
    skipped: outcomes.filter((outcome) => outcome === "skipped").length,
  };
}
