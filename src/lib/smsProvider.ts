export type SmsProviderName = "semaphore" | "unisms";

export type SmsSendResult = {
  provider: SmsProviderName;
  providerMessageId: string | null;
  providerStatus: string;
  // Only delivery metadata is persisted. Provider payloads can echo a phone
  // number or SMS content, so they must not be copied into application logs.
  response: { provider_status: string; provider_message_id: string | null };
};

export class SmsProviderError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
    readonly response?: { http_status?: number; provider_code?: string },
    // A network timeout can happen after the provider accepted a request. Do
    // not auto-retry an unknown result, because that could text a parent twice.
    readonly outcomeUnknown = false,
  ) {
    super(message);
    this.name = "SmsProviderError";
  }
}

/** A confirmed temporary provider rejection may be retried; an unknown result may not. */
export function canRetrySmsProviderError(error: unknown) {
  return !(error instanceof SmsProviderError) || (error.retryable && !error.outcomeUnknown);
}

// Keep a failed provider call from holding a worker slot long enough to make
// a full scheduled batch outlive the scheduler HTTP request.
const SMS_PROVIDER_TIMEOUT_MS = Math.max(
  1_000,
  Math.min(10_000, Number(process.env.SMS_PROVIDER_TIMEOUT_MS) || 8_000),
);

function configuredProvider(): SmsProviderName {
  const provider = (process.env.SMS_PROVIDER || "semaphore").trim().toLowerCase();
  if (provider === "semaphore" || provider === "unisms") return provider;
  throw new SmsProviderError("SMS_PROVIDER must be semaphore or unisms.", false);
}

/**
 * Reads Semaphore's documented account endpoint. This is server-only: the
 * API key is sent to Semaphore and the caller receives only a numeric balance.
 */
export async function getSemaphoreCreditBalance(): Promise<number> {
  if (configuredProvider() !== "semaphore") {
    throw new SmsProviderError("Semaphore credit monitoring is unavailable because Semaphore is not the active SMS provider.", false);
  }

  const apiKey = process.env.SEMAPHORE_API_KEY;
  if (!apiKey) throw new SmsProviderError("SEMAPHORE_API_KEY is not configured.", false);

  let response: Response;
  try {
    const params = new URLSearchParams({ apikey: apiKey });
    response = await fetch(`https://api.semaphore.co/api/v4/account?${params}`, {
      method: "GET",
      cache: "no-store",
      signal: AbortSignal.timeout(SMS_PROVIDER_TIMEOUT_MS),
    });
  } catch {
    throw new SmsProviderError("Semaphore credits could not be checked because the provider is unavailable.", true, undefined, true);
  }

  const body = await readResponse(response);
  if (!response.ok) {
    throw new SmsProviderError(
      `Semaphore rejected the account credit check (${response.status}).`,
      response.status === 408 || response.status === 429 || response.status >= 500,
      { http_status: response.status },
    );
  }

  const row = Array.isArray(body) ? body[0] : body;
  const rawBalance = row && typeof row === "object"
    ? (row as Record<string, unknown>).credit_balance
    : undefined;
  const balance = typeof rawBalance === "number" ? rawBalance : Number(rawBalance);
  if (!Number.isSafeInteger(balance) || balance < 0) {
    throw new SmsProviderError("Semaphore returned an invalid credit balance.", false);
  }
  return balance;
}

function e164(phone: string) {
  return `+63${phone.slice(1)}`;
}

async function readResponse(response: Response) {
  const raw = await response.text();
  try {
    return raw ? JSON.parse(raw) : null;
  } catch {
    return raw;
  }
}

function errorForResponse(provider: string, response: Response, body: unknown) {
  const row = body && typeof body === "object" && !Array.isArray(body)
    ? body as Record<string, unknown>
    : {};
  const providerCode = [row.code, row.error_code, row.status_code]
    .find((value) => typeof value === "string" || typeof value === "number");
  const detail = typeof body === "string" ? body : JSON.stringify(body);
  // Semaphore can return a 500 for an invalid sender name. That is a
  // configuration error, not a temporary provider outage, so do not retry it.
  const validationError = /sendername.*not valid|invalid sender|no active sender name|apply for a sender name|invalid.*api.?key|invalid recipient/i.test(detail);
  const retryable = !validationError && (response.status === 408 || response.status === 429 || response.status >= 500);
  return new SmsProviderError(
    `${provider} rejected the SMS request (${response.status}).`,
    retryable,
    {
      http_status: response.status,
      ...(providerCode === undefined ? {} : { provider_code: String(providerCode).slice(0, 100) }),
    },
  );
}

function semaphoreDetails(body: unknown) {
  const first = Array.isArray(body) ? body[0] : body as Record<string, unknown> | null;
  const row = first && typeof first === "object" ? first as Record<string, unknown> : {};
  return {
    providerMessageId: String(row.message_id ?? row.id ?? "") || null,
    providerStatus: String(row.status ?? "accepted"),
  };
}

function unismsDetails(body: unknown) {
  const row = body && typeof body === "object" ? body as Record<string, unknown> : {};
  const message = row.message && typeof row.message === "object" ? row.message as Record<string, unknown> : row;
  return {
    providerMessageId: String(row.id ?? message.id ?? message.reference_id ?? "") || null,
    providerStatus: String(message.status ?? row.status ?? "accepted"),
  };
}

export async function sendSms({ recipient, message, queueId }: { recipient: string; message: string; queueId: string }): Promise<SmsSendResult> {
  const provider = configuredProvider();
  let response: Response;

  try {
    if (provider === "semaphore") {
      const apiKey = process.env.SEMAPHORE_API_KEY;
      if (!apiKey) throw new SmsProviderError("SEMAPHORE_API_KEY is not configured.", false);
      const form = new URLSearchParams({ apikey: apiKey, number: recipient, message });
      if (process.env.SEMAPHORE_SENDER_NAME) form.set("sendername", process.env.SEMAPHORE_SENDER_NAME);
      response = await fetch("https://api.semaphore.co/api/v4/messages", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: form,
        signal: AbortSignal.timeout(SMS_PROVIDER_TIMEOUT_MS),
      });
    } else {
      const apiKey = process.env.UNISMS_API_SECRET_KEY;
      const senderId = process.env.UNISMS_SENDER_ID;
      if (!apiKey || !senderId) throw new SmsProviderError("UNISMS_API_SECRET_KEY and UNISMS_SENDER_ID must be configured.", false);
      response = await fetch("https://unismsapi.com/api/sms", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Basic ${Buffer.from(`${apiKey}:`).toString("base64")}`,
        },
        body: JSON.stringify({
          recipient: e164(recipient),
          content: message,
          sender_id: senderId,
          metadata: { attendance_sms_job_id: queueId },
        }),
        signal: AbortSignal.timeout(SMS_PROVIDER_TIMEOUT_MS),
      });
    }
  } catch (error) {
    if (error instanceof SmsProviderError) throw error;
    // Fetch gives no receipt for a rejected connection or an abort. Treat the
    // result as unknown instead of retrying automatically and risking a
    // duplicate SMS. A staff member can verify/requeue it later.
    throw new SmsProviderError("SMS provider request ended before acceptance could be confirmed.", true, undefined, true);
  }

  const body = await readResponse(response);
  if (!response.ok) throw errorForResponse(provider, response, body);
  const details = provider === "semaphore" ? semaphoreDetails(body) : unismsDetails(body);
  if (/fail|reject|invalid|error/i.test(details.providerStatus)) {
    throw new SmsProviderError(
      `${provider} did not accept the SMS (${details.providerStatus}).`,
      false,
      { provider_code: details.providerStatus.slice(0, 100) },
    );
  }
  return {
    provider,
    ...details,
    response: {
      provider_status: details.providerStatus,
      provider_message_id: details.providerMessageId,
    },
  };
}
