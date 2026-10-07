const RECAPTCHA_VERIFY_URL = "https://www.google.com/recaptcha/api/siteverify";

type RecaptchaVerification = {
  success?: boolean;
  hostname?: string;
};

function config() {
  const secret = process.env.RECAPTCHA_SECRET_KEY?.trim();
  const allowedHostnames = (process.env.RECAPTCHA_ALLOWED_HOSTNAMES ?? "")
    .split(",")
    .map((hostname) => hostname.trim().toLowerCase())
    .filter(Boolean);

  if (!secret || allowedHostnames.length === 0) {
    throw new Error("RECAPTCHA_SECRET_KEY and RECAPTCHA_ALLOWED_HOSTNAMES must be configured.");
  }

  return { secret, allowedHostnames };
}

/** Verifies a Google reCAPTCHA v2 response token on the server. */
export async function verifyGoogleRecaptcha(token: unknown, remoteIp?: string) {
  if (typeof token !== "string" || !token.trim() || token.length > 4_096) return false;

  const { secret, allowedHostnames } = config();
  try {
    const response = await fetch(RECAPTCHA_VERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        secret,
        response: token.trim(),
        ...(remoteIp && remoteIp !== "unknown" ? { remoteip: remoteIp } : {}),
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    const result = await response.json().catch(() => null) as RecaptchaVerification | null;
    return Boolean(
      response.ok
      && result?.success
      && result.hostname
      && allowedHostnames.includes(result.hostname.toLowerCase())
    );
  } catch {
    return false;
  }
}
