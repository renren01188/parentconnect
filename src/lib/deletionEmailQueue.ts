export const MAX_DELETION_EMAIL_ATTEMPTS = 3;

export type DeletionEmailStatus = "pending" | "processing" | "sent" | "failed";

export type ParentDeletionEmailRecipient = {
  parentId: number;
  recipientEmail: string | null;
  recipientName: string;
  targetName: string;
  scheduledDeletionId: number;
};

export type GroupedParentDeletionEmail = {
  recipientEmail: string;
  recipientName: string;
  targetNames: string[];
  scheduledDeletionIds: number[];
};

export function normalizeEmail(email: unknown) {
  return typeof email === "string" ? email.trim().toLowerCase() : "";
}

export function isValidEmail(email: string) {
  // This is intentionally conservative. The SMTP provider remains the final
  // authority, but malformed addresses should never consume a delivery retry.
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/** Groups only already-successful selected parent deletions by registered email. */
export function groupParentDeletionEmails(recipients: ParentDeletionEmailRecipient[]) {
  const groups = new Map<string, GroupedParentDeletionEmail>();
  for (const recipient of recipients) {
    const recipientEmail = normalizeEmail(recipient.recipientEmail);
    // Empty/invalid values cannot be deduplicated as an address. Keep a single
    // failed record per selected parent so the administrator can correct it.
    const key = recipientEmail || `invalid-parent-${recipient.parentId}`;
    const group = groups.get(key) ?? {
      recipientEmail,
      recipientName: recipient.recipientName,
      targetNames: [],
      scheduledDeletionIds: [],
    };
    group.targetNames.push(recipient.targetName);
    group.scheduledDeletionIds.push(recipient.scheduledDeletionId);
    groups.set(key, group);
  }
  return [...groups.values()].map((group) => ({
    ...group,
    targetNames: [...new Set(group.targetNames)],
    scheduledDeletionIds: [...new Set(group.scheduledDeletionIds)],
  }));
}

export function isTemporaryEmailError(error: unknown) {
  const candidate = error as { code?: string; responseCode?: number; message?: string };
  const code = String(candidate?.code ?? "").toUpperCase();
  const responseCode = Number(candidate?.responseCode ?? 0);
  const message = String(candidate?.message ?? "").toLowerCase();

  return (
    ["ETIMEDOUT", "ECONNRESET", "ECONNREFUSED", "ESOCKET", "EAI_AGAIN", "ENOTFOUND", "ECONNECTION", "RATE_LIMIT"].includes(code) ||
    // SMTP 5xx responses (for example 550 mailbox unavailable) are generally
    // permanent. Retry only SMTP's transient 4xx delivery conditions.
    responseCode === 429 ||
    [421, 450, 451, 452].includes(responseCode) ||
    /timeout|temporar|rate limit|too many|try again|connection reset|socket hang up/.test(message)
  );
}

export function retryAt(attempt: number, now = new Date()) {
  // 1, 5, then 15 minutes. Delaying in the queue, rather than sleeping in a
  // route handler, keeps serverless requests short and provider-friendly.
  const delayMinutes = [1, 5, 15][Math.max(0, attempt - 1)] ?? 15;
  return new Date(now.getTime() + delayMinutes * 60_000).toISOString();
}

export async function mapWithConcurrency<T, R>(
  values: T[],
  concurrency: number,
  worker: (value: T) => Promise<R>,
) {
  const results: R[] = [];
  let cursor = 0;
  const workerCount = Math.max(1, Math.min(concurrency, values.length));

  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (cursor < values.length) {
        const index = cursor++;
        results[index] = await worker(values[index]);
      }
    }),
  );

  return results;
}
