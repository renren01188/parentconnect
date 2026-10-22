import { randomUUID } from "node:crypto";
import { supabase } from "@/lib/supabase";
import { isAttendanceSmsEnabled } from "@/lib/attendanceNotificationSettings";
import { configuredAttendanceSmsRoute } from "@/lib/attendanceSmsRoute";
import { mapWithConcurrency } from "@/lib/deletionEmailQueue";
import { getSemaphoreMessageStatus, sendSms, SmsProviderError } from "@/lib/smsProvider";

type SmsJob = {
  id: string;
  attendance_log_id: number;
  status: string;
  recipient_phone: string;
  message: string;
  attempts: number;
  idempotency_key: string;
  provider: string | null;
  provider_message_id: string | null;
  provider_status: string | null;
  provider_requested_at: string | null;
  reconciliation_attempts: number;
};

type ReconciliationOutcome = "accepted" | "retry_eligible" | "review" | "not_applicable";
type JobOutcome = "sent" | "failed" | "skipped" | "review" | "retry_eligible";
type AutomaticRetryOutcome = JobOutcome | "not_retry_eligible";

export const DEFAULT_ATTENDANCE_SMS_BATCH_SIZE = 20;
export const DEFAULT_ATTENDANCE_SMS_CONCURRENCY = 4;
const MAX_ATTENDANCE_SMS_BATCH_SIZE = 20;
const MAX_ATTENDANCE_SMS_CONCURRENCY = 4;
const MAX_SMS_ATTEMPTS = 5;
const MAX_AUTOMATIC_RECONCILIATION_ATTEMPTS = 3;
const PROCESSING_STALE_AFTER_MS = 10 * 60_000;
const ATTENDANCE_SMS_DISPATCH_LEASE_SECONDS = 120;
const UNKNOWN_PROCESSING_ERROR = "SMS provider outcome is unknown after a worker interruption. It was not resent; reconcile it with Semaphore before any retry.";
const jobColumns = "id, attendance_log_id, status, recipient_phone, message, attempts, idempotency_key, provider, provider_message_id, provider_status, provider_requested_at, reconciliation_attempts";

function positiveInt(value: string | undefined, fallback: number, maximum: number) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? Math.min(parsed, maximum) : fallback;
}

function errorMessage(error: unknown) {
  return (error instanceof Error ? error.message : String(error || "Unknown SMS delivery error"))
    .replace(/(?:\+63|63|0)9\d{9}/g, "[redacted-phone]")
    .slice(0, 1_000);
}

function errorResponse(error: unknown) {
  return error instanceof SmsProviderError && error.response && typeof error.response === "object"
    ? error.response
    : null;
}

function configuredProviderForRecord() {
  return (process.env.SMS_PROVIDER || "semaphore").trim().toLowerCase() === "unisms" ? "unisms" : "semaphore";
}

function semaphoreState(status: string | null | undefined) {
  switch (String(status ?? "").trim().toLowerCase()) {
    case "queued": return "queued";
    case "pending": return "pending";
    case "sent":
    case "success": return "sent";
    case "failed": return "failed";
    case "refunded": return "refunded";
    default: return "unknown";
  }
}

async function recordProviderEvent(input: {
  job: Pick<SmsJob, "id" | "idempotency_key">;
  eventType: string;
  provider?: string | null;
  providerMessageId?: string | null;
  providerStatus?: string | null;
  detail?: Record<string, unknown> | null;
}) {
  const { error } = await supabase
    .from("attendance_sms_provider_events")
    .insert({
      attendance_sms_job_id: input.job.id,
      idempotency_key: input.job.idempotency_key,
      event_type: input.eventType,
      provider: input.provider ?? null,
      provider_message_id: input.providerMessageId ?? null,
      provider_status: input.providerStatus ?? null,
      detail: input.detail ?? null,
    });
  if (error) throw error;
}

async function recordProviderEventBestEffort(input: Parameters<typeof recordProviderEvent>[0]) {
  try {
    await recordProviderEvent(input);
  } catch (error) {
    // A provider result must never be retried just because audit storage is down.
    console.error("Could not write attendance SMS provider event:", error instanceof Error ? error.message : "Unknown error");
  }
}

async function claimFreshJob(attendanceLogId?: number): Promise<SmsJob | null> {
  const now = new Date().toISOString();
  let query = supabase
    .from("attendance_sms_jobs")
    .select("id")
    .eq("status", "pending")
    .eq("attempts", 0)
    .is("provider_requested_at", null)
    .is("provider_message_id", null)
    .lte("available_at", now)
    .order("created_at", { ascending: true })
    .limit(8);
  if (attendanceLogId !== undefined) query = query.eq("attendance_log_id", attendanceLogId);
  const { data: candidates, error } = await query;
  if (error) throw error;

  for (const candidate of candidates ?? []) {
    const { data: job, error: claimError } = await supabase
      .from("attendance_sms_jobs")
      .update({ status: "processing", locked_at: now })
      .eq("id", candidate.id)
      .eq("status", "pending")
      .eq("attempts", 0)
      .is("provider_requested_at", null)
      .is("provider_message_id", null)
      .lte("available_at", now)
      .select(jobColumns)
      .maybeSingle();
    if (claimError) throw claimError;
    if (job) return job as SmsJob;
  }
  return null;
}

async function claimRetryEligibleJob(job: SmsJob): Promise<SmsJob | null> {
  const { data: claimedJob, error } = await supabase
    .from("attendance_sms_jobs")
    .update({ status: "processing", locked_at: new Date().toISOString() })
    .eq("id", job.id)
    .eq("status", "retry_eligible")
    .eq("provider_message_id", job.provider_message_id)
    .select(jobColumns)
    .maybeSingle();
  if (error) throw error;
  return claimedJob as SmsJob | null;
}

/** An interrupted request is review-only; it must never return to Pending. */
async function moveStaleProcessingJobsToReview(attendanceLogId?: number) {
  const staleBefore = new Date(Date.now() - PROCESSING_STALE_AFTER_MS).toISOString();
  let query = supabase
    .from("attendance_sms_jobs")
    .select(jobColumns)
    .eq("status", "processing")
    .lt("locked_at", staleBefore)
    .limit(MAX_ATTENDANCE_SMS_BATCH_SIZE);
  if (attendanceLogId !== undefined) query = query.eq("attendance_log_id", attendanceLogId);
  const { data: staleJobs, error } = await query;
  if (error) throw error;

  let moved = 0;
  for (const rawJob of staleJobs ?? []) {
    const job = rawJob as SmsJob;
    const { data: updated, error: updateError } = await supabase
      .from("attendance_sms_jobs")
      .update({
        status: "reconciliation_required",
        provider_status: "unknown",
        locked_at: null,
        reconciliation_required_at: new Date().toISOString(),
        last_error: UNKNOWN_PROCESSING_ERROR,
      })
      .eq("id", job.id)
      .eq("status", "processing")
      .lt("locked_at", staleBefore)
      .select("id")
      .maybeSingle();
    if (updateError) throw updateError;
    if (updated) {
      moved += 1;
      await recordProviderEventBestEffort({
        job,
        eventType: "reconciliation_required",
        provider: job.provider,
        providerMessageId: job.provider_message_id,
        providerStatus: "unknown",
        detail: { reason: "worker_interruption" },
      });
    }
  }
  return moved;
}

async function skipPendingJobs(attendanceLogId?: number) {
  let query = supabase
    .from("attendance_sms_jobs")
    .update({ status: "skipped", locked_at: null, last_error: "Attendance SMS notifications are disabled." })
    .eq("status", "pending")
    .eq("attempts", 0)
    .is("provider_requested_at", null);
  if (attendanceLogId !== undefined) query = query.eq("attendance_log_id", attendanceLogId);
  const { error } = await query;
  if (error) throw error;
}

async function setReconciliationRequired(job: SmsJob, error: unknown) {
  const now = new Date().toISOString();
  const provider = configuredProviderForRecord();
  const { error: updateError } = await supabase
    .from("attendance_sms_jobs")
    .update({
      status: "reconciliation_required",
      attempts: job.attempts + 1,
      provider,
      provider_status: "unknown",
      provider_response: errorResponse(error),
      locked_at: null,
      reconciliation_required_at: now,
      last_error: `${errorMessage(error)} Reconciliation is required before any retry.`,
    })
    .eq("id", job.id)
    .eq("status", "processing");
  if (updateError) throw updateError;
  await recordProviderEventBestEffort({
    job,
    eventType: "reconciliation_required",
    provider,
    providerMessageId: job.provider_message_id,
    providerStatus: "unknown",
    detail: { reason: "provider_outcome_unknown" },
  });
}

async function setFailed(job: SmsJob, error: unknown) {
  const provider = configuredProviderForRecord();
  const { error: updateError } = await supabase
    .from("attendance_sms_jobs")
    .update({
      status: "failed",
      attempts: job.attempts + 1,
      provider,
      provider_status: "rejected",
      provider_response: errorResponse(error),
      available_at: new Date().toISOString(),
      locked_at: null,
      last_error: errorMessage(error),
    })
    .eq("id", job.id)
    .eq("status", "processing");
  if (updateError) throw updateError;
  await recordProviderEventBestEffort({
    job,
    eventType: "send_rejected",
    provider,
    providerStatus: "rejected",
    detail: { reason: "provider_rejected_request" },
  });
}

async function processJob(job: SmsJob): Promise<JobOutcome> {
  if (!await isAttendanceSmsEnabled()) {
    const { error } = await supabase
      .from("attendance_sms_jobs")
      .update({ status: "skipped", locked_at: null, last_error: "Attendance SMS notifications are disabled." })
      .eq("id", job.id)
      .eq("status", "processing");
    if (error) throw error;
    return "skipped";
  }

  if (job.attempts >= MAX_SMS_ATTEMPTS) {
    const { error } = await supabase
      .from("attendance_sms_jobs")
      .update({ status: "failed", locked_at: null, last_error: "Maximum SMS retry attempts reached. No further message was sent." })
      .eq("id", job.id)
      .eq("status", "processing");
    if (error) throw error;
    return "failed";
  }

  const attempt = job.attempts + 1;
  const provider = configuredProviderForRecord();
  const requestedAt = new Date().toISOString();
  // Persist intent before calling the provider. A crash after this point is
  // reconciled or reviewed, never blindly retried.
  const { error: startedError } = await supabase
    .from("attendance_sms_jobs")
    .update({
      provider,
      // An eligible retry supersedes a known-old provider message. Preserve
      // that old ID in the event just written, then clear it before sending so
      // an unknown new request can never be "reconciled" against the old one.
      provider_message_id: null,
      provider_status: "requesting",
      provider_response: null,
      provider_requested_at: requestedAt,
    })
    .eq("id", job.id)
    .eq("status", "processing");
  if (startedError) throw startedError;
  await recordProviderEvent({
    job,
    eventType: "send_requested",
    provider,
    providerMessageId: job.provider_message_id,
    providerStatus: "requesting",
    detail: { attempt },
  });

  let providerResponseReceived = false;
  try {
    const result = await sendSms({
      recipient: job.recipient_phone,
      message: job.message,
      queueId: job.id,
      idempotencyKey: job.idempotency_key,
      semaphoreRoute: configuredAttendanceSmsRoute(),
    });
    providerResponseReceived = true;
    const now = new Date().toISOString();
    const state = result.provider === "semaphore" ? semaphoreState(result.providerStatus) : "sent";

    if (result.provider === "semaphore" && state === "unknown") {
      const { error } = await supabase
        .from("attendance_sms_jobs")
        .update({
          status: "reconciliation_required",
          attempts: attempt,
          provider: result.provider,
          provider_message_id: result.providerMessageId,
          provider_status: result.providerStatus,
          provider_response: result.response,
          provider_accepted_at: now,
          reconciliation_required_at: now,
          locked_at: null,
          last_error: "Semaphore accepted the request but returned an unrecognized status. Reconcile before any retry.",
        })
        .eq("id", job.id)
        .eq("status", "processing");
      if (error) throw error;
      await recordProviderEventBestEffort({
        job,
        eventType: "reconciliation_required",
        provider: result.provider,
        providerMessageId: result.providerMessageId,
        providerStatus: result.providerStatus,
        detail: { reason: "unrecognized_send_status", attempt },
      });
      return "review";
    }

    if (result.provider === "semaphore" && (state === "failed" || state === "refunded")) {
      const { error } = await supabase
        .from("attendance_sms_jobs")
        .update({
          status: "retry_eligible",
          attempts: attempt,
          provider: result.provider,
          provider_message_id: result.providerMessageId,
          provider_status: result.providerStatus,
          provider_response: result.response,
          provider_accepted_at: now,
          reconciled_at: now,
          retry_eligible_at: now,
          locked_at: null,
          last_error: state === "refunded"
            ? "Semaphore confirmed the original message was refunded. The queue will retry it automatically."
            : "Semaphore confirmed the original message failed. The queue will retry it automatically, but the credit is not assumed refunded.",
        })
        .eq("id", job.id)
        .eq("status", "processing");
      if (error) throw error;
      await recordProviderEventBestEffort({
        job,
        eventType: "retry_eligible",
        provider: result.provider,
        providerMessageId: result.providerMessageId,
        providerStatus: result.providerStatus,
        detail: { attempt, confirmed_state: state },
      });
      return "retry_eligible";
    }

    if (result.provider !== "semaphore" && /fail|reject|invalid|error/i.test(result.providerStatus)) {
      await setFailed(job, new SmsProviderError(`${result.provider} rejected the SMS (${result.providerStatus}).`, false));
      return "failed";
    }

    const { error } = await supabase
      .from("attendance_sms_jobs")
      .update({
        status: "sent",
        attempts: attempt,
        provider: result.provider,
        provider_message_id: result.providerMessageId,
        provider_status: result.providerStatus,
        provider_response: result.response,
        provider_accepted_at: now,
        sent_at: now,
        locked_at: null,
        reconciliation_required_at: null,
        last_error: null,
      })
      .eq("id", job.id)
      .eq("status", "processing");
    if (error) throw error;
    await recordProviderEventBestEffort({
      job,
      eventType: "send_accepted",
      provider: result.provider,
      providerMessageId: result.providerMessageId,
      providerStatus: result.providerStatus,
      detail: { attempt, provider_route: result.providerRoute },
    });
    return "sent";
  } catch (error) {
    if (providerResponseReceived || (error instanceof SmsProviderError && error.outcomeUnknown)) {
      await setReconciliationRequired(job, error);
      return "review";
    }
    // A returned rejection remains Failed. The scheduled worker does not retry it.
    await setFailed(job, error);
    return "failed";
  }
}

async function reconcileSemaphoreJob(job: SmsJob): Promise<ReconciliationOutcome> {
  if (job.provider !== "semaphore" || !job.provider_message_id) return "not_applicable";

  // Unknown provider outcomes get a few automatic checks, then await ICT
  // review. Rechecking forever creates provider/API and database load without
  // making an indeterminate delivery safer to retry.
  if (
    job.status === "reconciliation_required" &&
    job.reconciliation_attempts >= MAX_AUTOMATIC_RECONCILIATION_ATTEMPTS
  ) {
    return "review";
  }

  const reconciledAt = new Date().toISOString();
  try {
    const result = await getSemaphoreMessageStatus(job.provider_message_id);
    if (["queued", "pending", "sent"].includes(result.state)) {
      const { error } = await supabase
        .from("attendance_sms_jobs")
        .update({
          status: "sent",
          provider_status: result.providerStatus,
          provider_response: result.response,
          reconciled_at: reconciledAt,
          reconciliation_required_at: null,
          delivered_at: result.state === "sent" ? reconciledAt : null,
          last_error: null,
        })
        .eq("id", job.id)
        .neq("status", "processing");
      if (error) throw error;
      await recordProviderEventBestEffort({
        job,
        eventType: "provider_status_checked",
        provider: "semaphore",
        providerMessageId: result.providerMessageId,
        providerStatus: result.providerStatus,
        detail: { state: result.state },
      });
      return "accepted";
    }

    if (result.state === "failed" || result.state === "refunded") {
      const { error } = await supabase
        .from("attendance_sms_jobs")
        .update({
          status: "retry_eligible",
          provider_status: result.providerStatus,
          provider_response: result.response,
          reconciled_at: reconciledAt,
          retry_eligible_at: reconciledAt,
          reconciliation_required_at: null,
          last_error: result.state === "refunded"
            ? "Semaphore confirmed the original message was refunded. The queue will retry it automatically."
            : "Semaphore confirmed the original message failed. The queue will retry it automatically, but the credit is not assumed refunded.",
        })
        .eq("id", job.id)
        .neq("status", "processing");
      if (error) throw error;
      await recordProviderEventBestEffort({
        job,
        eventType: "retry_eligible",
        provider: "semaphore",
        providerMessageId: result.providerMessageId,
        providerStatus: result.providerStatus,
        detail: { confirmed_state: result.state },
      });
      return "retry_eligible";
    }

    const { error } = await supabase
      .from("attendance_sms_jobs")
      .update({
        status: "reconciliation_required",
        provider_status: result.providerStatus,
        provider_response: result.response,
        reconciled_at: reconciledAt,
        reconciliation_required_at: reconciledAt,
        reconciliation_attempts: job.reconciliation_attempts + 1,
        last_error: "Semaphore returned an unrecognized message status. Review this job before any retry.",
      })
      .eq("id", job.id)
      .neq("status", "processing");
    if (error) throw error;
    await recordProviderEventBestEffort({
      job,
      eventType: "reconciliation_required",
      provider: "semaphore",
      providerMessageId: result.providerMessageId,
      providerStatus: result.providerStatus,
      detail: { reason: "unrecognized_provider_status" },
    });
    return "review";
  } catch (error) {
    // A failed lookup is not proof of a failed SMS, so retain review state.
    const { error: updateError } = await supabase
      .from("attendance_sms_jobs")
      .update({
        status: "reconciliation_required",
        reconciliation_required_at: reconciledAt,
        reconciled_at: reconciledAt,
        reconciliation_attempts: job.reconciliation_attempts + 1,
        last_error: `${errorMessage(error)} Provider status could not be confirmed; do not resend.`,
      })
      .eq("id", job.id)
      .neq("status", "processing");
    if (updateError) throw updateError;
    await recordProviderEventBestEffort({
      job,
      eventType: "reconciliation_required",
      provider: "semaphore",
      providerMessageId: job.provider_message_id,
      providerStatus: job.provider_status,
      detail: { reason: "status_lookup_failed" },
    });
    return "review";
  }
}

type ReconciliationBatch = {
  jobs: SmsJob[];
  outcomes: ReconciliationOutcome[];
  summary: {
    checked: number;
    accepted: number;
    retryEligible: number;
    review: number;
  };
};

async function reconcileAttendanceSmsJobBatch(options?: { batchSize?: number; attendanceLogId?: number; jobId?: string }): Promise<ReconciliationBatch> {
  const batchSize = Math.min(
    options?.jobId ? 1 : positiveInt(options?.batchSize === undefined ? undefined : String(options.batchSize), DEFAULT_ATTENDANCE_SMS_BATCH_SIZE, MAX_ATTENDANCE_SMS_BATCH_SIZE),
    MAX_ATTENDANCE_SMS_BATCH_SIZE,
  );
  let query = supabase
    .from("attendance_sms_jobs")
    .select(jobColumns)
    .eq("provider", "semaphore")
    .not("provider_message_id", "is", null)
    .in("status", ["reconciliation_required", "retry_eligible"])
    .order("updated_at", { ascending: true })
    .limit(batchSize);
  if (options?.attendanceLogId !== undefined) query = query.eq("attendance_log_id", options.attendanceLogId);
  if (options?.jobId) query = query.eq("id", options.jobId);
  const { data: rows, error } = await query;
  if (error) throw error;

  const jobs = (rows ?? []) as SmsJob[];
  const outcomes = await mapWithConcurrency(
    jobs,
    Math.min(DEFAULT_ATTENDANCE_SMS_CONCURRENCY, batchSize),
    reconcileSemaphoreJob,
  );
  return {
    jobs,
    outcomes,
    summary: {
      checked: outcomes.length,
      accepted: outcomes.filter((outcome) => outcome === "accepted").length,
      retryEligible: outcomes.filter((outcome) => outcome === "retry_eligible").length,
      review: outcomes.filter((outcome) => outcome === "review").length,
    },
  };
}

/**
 * Semaphore is checked immediately before every automatic retry. This helper
 * is deliberately private so an ICT dashboard cannot cause a second send.
 */
async function retryConfirmedAttendanceSmsJob(job: SmsJob): Promise<AutomaticRetryOutcome> {
  // reconcileSemaphoreJob just received Failed or Refunded from Semaphore for
  // this exact provider message. Claim against that message ID so a concurrent
  // worker cannot send after a different outcome has been recorded.
  const claimed = await claimRetryEligibleJob(job);
  if (!claimed) return "not_retry_eligible";
  await recordProviderEventBestEffort({
    job: claimed,
    eventType: "automatic_retry_started",
    provider: claimed.provider,
    providerMessageId: claimed.provider_message_id,
    providerStatus: claimed.provider_status,
    detail: { previous_attempts: claimed.attempts },
  });
  return processJob(claimed);
}

export async function reconcileAttendanceSmsJobs(options?: { batchSize?: number; attendanceLogId?: number; jobId?: string }) {
  return (await reconcileAttendanceSmsJobBatch(options)).summary;
}

export async function processAttendanceSmsJobs(options?: { batchSize?: number; concurrency?: number; attendanceLogId?: number }) {
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
  const movedToReview = await moveStaleProcessingJobsToReview(options?.attendanceLogId);
  const reconciliationBatch = await reconcileAttendanceSmsJobBatch({ batchSize, attendanceLogId: options?.attendanceLogId });
  const reconciliation = reconciliationBatch.summary;

  if (!await isAttendanceSmsEnabled()) {
    await skipPendingJobs(options?.attendanceLogId);
    return { processed: 0, sent: 0, failed: 0, skipped: 0, review: movedToReview + reconciliation.review, retryEligible: reconciliation.retryEligible, reconciliation };
  }

  // A retry is submitted only in the same worker pass that received a
  // terminal Failed or Refunded result from Semaphore. Queued, Pending, Sent,
  // and unknown outcomes never enter this list and can never be resent.
  const confirmedRetries = reconciliationBatch.jobs.filter(
    (_job, index) => reconciliationBatch.outcomes[index] === "retry_eligible",
  );
  const automaticRetryOutcomes = await mapWithConcurrency(
    confirmedRetries,
    concurrency,
    retryConfirmedAttendanceSmsJob,
  );

  // Bound all outgoing sends in one globally leased worker pass. RFID taps
  // only create durable queue rows; the scheduled dispatcher drains them.
  const jobs: SmsJob[] = [];
  const freshCapacity = Math.max(0, batchSize - confirmedRetries.length);
  for (let index = 0; index < freshCapacity; index += 1) {
    const job = await claimFreshJob(options?.attendanceLogId);
    if (!job) break;
    jobs.push(job);
  }
  const freshOutcomes = await mapWithConcurrency(jobs, concurrency, processJob);
  const outcomes = [...automaticRetryOutcomes, ...freshOutcomes];
  const stillRetryEligible = automaticRetryOutcomes.filter((outcome) => outcome === "retry_eligible").length
    + freshOutcomes.filter((outcome) => outcome === "retry_eligible").length;
  return {
    processed: confirmedRetries.length + jobs.length,
    sent: outcomes.filter((outcome) => outcome === "sent").length,
    failed: outcomes.filter((outcome) => outcome === "failed").length,
    skipped: outcomes.filter((outcome) => outcome === "skipped").length,
    review: movedToReview + reconciliation.review + outcomes.filter((outcome) => outcome === "review").length,
    retryEligible: stillRetryEligible,
    automaticallyRetried: automaticRetryOutcomes.filter((outcome) => outcome !== "not_retry_eligible").length,
    reconciliation,
  };
}

/**
 * Run at most one SMS dispatcher across every Vercel invocation. Attendance
 * requests only enqueue durable jobs; the scheduled route owns provider I/O.
 * This is intentionally separate from `processAttendanceSmsJobs` so tests and
 * maintenance tools can exercise queue logic without acquiring a lease.
 */
export async function dispatchAttendanceSmsJobs() {
  const ownerToken = randomUUID();
  const { data: acquired, error: acquireError } = await supabase.rpc(
    "try_acquire_attendance_sms_dispatch_lease",
    {
      p_owner_token: ownerToken,
      p_lease_seconds: ATTENDANCE_SMS_DISPATCH_LEASE_SECONDS,
    },
  );
  if (acquireError) throw acquireError;

  if (!acquired) {
    return {
      acquired: false,
      processed: 0,
      sent: 0,
      failed: 0,
      skipped: 0,
      review: 0,
      retryEligible: 0,
      automaticallyRetried: 0,
    };
  }

  try {
    return { acquired: true, ...await processAttendanceSmsJobs() };
  } finally {
    const { error: releaseError } = await supabase.rpc(
      "release_attendance_sms_dispatch_lease",
      { p_owner_token: ownerToken },
    );
    // A failed release is safe: the lease automatically expires. Do not mark
    // a completed dispatch as failed just because this cleanup update failed.
    if (releaseError) {
      console.error("Could not release attendance SMS dispatch lease:", releaseError.message);
    }
  }
}
