const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function idempotencyKeyFrom(request: Request) {
  const key = request.headers.get("Idempotency-Key")?.trim() ?? "";
  return UUID_PATTERN.test(key) ? key : null;
}

export function isUniqueViolation(error: { code?: string } | null | undefined) {
  return error?.code === "23505";
}
