const RECAPTCHA_VERIFY_URL = "https://www.google.com/recaptcha/api/siteverify";

type RecaptchaVerification = {
  success?: boolean;
  hostname?: string;
  "error-codes"?: string[];
};

function normalizeHostname(value: string) {
  const hostname = value.trim().toLowerCase();
  if (!hostname) return "";

  // Accept the documented hostname form as well as an accidentally pasted
  // URL, while comparing the value returned by Google consistently.
  try {
    return new URL(hostname.includes("://") ? hostname : `https://${hostname}`)
      .hostname
      .replace(/\.$/, "");
  } catch {
    return hostname.replace(/\.$/, "");
  }
}

function config() {
  const secret = process.env.RECAPTCHA_SECRET_KEY?.trim();
  const allowedHostnames = (process.env.RECAPTCHA_ALLOWED_HOSTNAMES ?? "")
    .split(",")
    .map(normalizeHostname)
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
    const verifiedHostname = typeof result?.hostname === "string"
      ? normalizeHostname(result.hostname)
      : "";
    const verified = Boolean(
      response.ok
      && result?.success
      && verifiedHostname
      && allowedHostnames.includes(verifiedHostname)
    );

    // This contains neither the visitor's token nor the server secret. It
    // lets the deployment log distinguish a domain configuration issue from
    // a user simply not completing a CAPTCHA.
    if (response.ok && result?.success && verifiedHostname && !verified) {
      console.warn("reCAPTCHA token rejected for unapproved hostname", { verifiedHostname });
    }
    return verified;
  } catch {
    return false;
  }
}
