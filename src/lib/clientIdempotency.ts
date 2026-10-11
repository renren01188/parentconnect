export type IdempotencyAttempt = { fingerprint: string; key: string };

type RefLike = { current: IdempotencyAttempt | null };

/** Keep a key while the same draft is retried after an interrupted request. */
export function keyForSubmission(ref: RefLike, payload: unknown) {
  const fingerprint = JSON.stringify(payload);
  if (!ref.current || ref.current.fingerprint !== fingerprint) {
    ref.current = { fingerprint, key: crypto.randomUUID() };
  }
  return ref.current.key;
}
