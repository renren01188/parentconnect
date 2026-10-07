const DEFAULT_ATTEMPTS = 2;
const RETRY_DELAY_MS = 650;

type FetchJsonResult<T> = {
  response: Response;
  data: T | null;
};

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retries only idempotent reads. Callers must not use this for POST/PATCH
 * message writes, because an uncertain write must never be replayed.
 */
export async function fetchJsonWithRetry<T>(
  input: RequestInfo | URL,
  init?: RequestInit,
  attempts = DEFAULT_ATTEMPTS
): Promise<FetchJsonResult<T>> {
  let lastError: unknown;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetch(input, init);
      const data = await response.json().catch(() => null) as T | null;
      const shouldRetry = !response.ok && response.status >= 500 && attempt < attempts - 1;
      if (!shouldRetry) return { response, data };
    } catch (error) {
      lastError = error;
      if (attempt === attempts - 1) throw error;
    }

    await wait(RETRY_DELAY_MS * (attempt + 1));
  }

  throw lastError ?? new Error("The server did not return a response.");
}
