import { createHmac, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";
import { getJwtSecret } from "@/lib/authSecret";
import { verifyGoogleRecaptcha } from "@/lib/googleRecaptcha";

export type ProtectedLoginRole = "parent" | "adviser" | "guidance" | "principal" | "ict";

/**
 * Parent enrollment is not a password-login attempt. Keep its IP guard
 * separate so registration retries cannot make the Parent Login form require
 * CAPTCHA before that login itself reaches the configured threshold.
 */
export const PARENT_LOGIN_GUARD_SCOPE = "parent-login";
export const PARENT_SIGNUP_GUARD_SCOPE = "parent-signup";
type LoginGuardIpScope = typeof PARENT_LOGIN_GUARD_SCOPE | typeof PARENT_SIGNUP_GUARD_SCOPE;

type GuardRow = {
  failed_attempts: number;
  lockout_level: number;
  locked_until: string | null;
  captcha_required: boolean;
};

export type LoginGuard = {
  failedAttempts: number;
  lockoutLevel: number;
  lockedUntil: string | null;
  captchaRequired: boolean;
};

const LOGIN_GUARD_COOKIE_MAX_AGE = 60 * 60 * 24 * 30;
const INVALID_CREDENTIALS_MESSAGE = "Invalid email, employee ID, or password.";
const LOCKOUT_MESSAGE = "Too many failed attempts. Please try again later.";

function invalidCredentialsMessage(role: ProtectedLoginRole) {
  // Parent/Guardian authentication accepts an email address only. Keep the
  // staff-specific Employee ID guidance for the roles that support it.
  return role === "parent" ? "Invalid email or password." : INVALID_CREDENTIALS_MESSAGE;
}

function hmac(value: string) {
  return createHmac("sha256", getJwtSecret()).update(value).digest("hex");
}

function subjectHash(role: ProtectedLoginRole, subject: string) {
  return hmac(`account:${role}:${subject.trim().toLocaleLowerCase()}`);
}

function getClientIp(request: NextRequest) {
  // These headers are populated by the trusted reverse proxy in production.
  // Deployment proxies must strip client-supplied forwarding headers.
  const forwarded = request.headers.get("cf-connecting-ip")
    ?? request.headers.get("x-vercel-forwarded-for")
    ?? request.headers.get("x-forwarded-for")
    ?? request.headers.get("x-real-ip")
    ?? "unknown";
  const candidate = forwarded.split(",")[0]?.trim().toLowerCase() || "unknown";
  return candidate.length <= 64 ? candidate : "unknown";
}

function ipHash(request: NextRequest, scope?: LoginGuardIpScope) {
  // Preserve the legacy hash for every existing login flow. Parent Login and
  // Parent signup opt into distinct contexts below because they represent
  // different security actions.
  return hmac(scope ? `ip:${scope}:${getClientIp(request)}` : `ip:${getClientIp(request)}`);
}

function toGuard(row: GuardRow | null | undefined): LoginGuard {
  return {
    failedAttempts: Number(row?.failed_attempts ?? 0),
    lockoutLevel: Number(row?.lockout_level ?? 0),
    lockedUntil: row?.locked_until ?? null,
    captchaRequired: Boolean(row?.captcha_required),
  };
}

async function callGuard(
  functionName: string,
  role: ProtectedLoginRole,
  accountHash: string,
  currentIpHash: string,
) {
  const { data, error } = await supabase.rpc(functionName, {
    p_role: role,
    p_account_hash: accountHash,
    p_ip_hash: currentIpHash,
  });

  if (error) {
    // Never allow a database or migration failure to weaken this control.
    throw new Error("Login protection is temporarily unavailable. Please try again later.");
  }

  return toGuard(Array.isArray(data) ? data[0] : data as GuardRow | null);
}

async function getLoginGuardByHash(
  role: ProtectedLoginRole,
  accountHash: string,
  request: NextRequest,
  ipScope?: LoginGuardIpScope,
) {
  return callGuard("get_login_attempt_guard_v2", role, accountHash, ipHash(request, ipScope));
}

function guardCookieName(role: ProtectedLoginRole) {
  return `login_guard_${role}`;
}

function signedGuardCookie(role: ProtectedLoginRole, accountHash: string) {
  return `${accountHash}.${hmac(`login-guard:v1:${role}:${accountHash}`)}`;
}

function readSignedGuardCookie(role: ProtectedLoginRole, value: string | undefined) {
  if (!value) return null;
  const [accountHash, signature, ...rest] = value.split(".");
  if (!accountHash || !signature || rest.length > 0 || !/^[0-9a-f]{64}$/.test(accountHash) || !/^[0-9a-f]{64}$/.test(signature)) {
    return null;
  }

  const expected = hmac(`login-guard:v1:${role}:${accountHash}`);
  const signatureBuffer = Buffer.from(signature, "hex");
  const expectedBuffer = Buffer.from(expected, "hex");
  if (signatureBuffer.length !== expectedBuffer.length || !timingSafeEqual(signatureBuffer, expectedBuffer)) {
    return null;
  }
  return accountHash;
}

/** Stores only a signed account hash so a refresh can restore guard state. */
export async function rememberLoginGuard(role: ProtectedLoginRole, subject: string) {
  const accountHash = subjectHash(role, subject);
  const cookieStore = await cookies();
  cookieStore.set(guardCookieName(role), signedGuardCookie(role, accountHash), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: LOGIN_GUARD_COOKIE_MAX_AGE,
    path: "/",
  });
  return accountHash;
}

/** Returns the last server-tracked guard for this role without exposing an account identifier. */
export async function getRememberedLoginGuard(
  role: ProtectedLoginRole,
  request: NextRequest,
  ipScope?: LoginGuardIpScope,
) {
  const cookieStore = await cookies();
  const accountHash = readSignedGuardCookie(role, cookieStore.get(guardCookieName(role))?.value);
  if (!accountHash) return null;
  return getLoginGuardByHash(role, accountHash, request, ipScope);
}

export function isCurrentlyLocked(guard: LoginGuard) {
  return Boolean(guard.lockedUntil && new Date(guard.lockedUntil).getTime() > Date.now());
}

/**
 * Checks a subject's lockout without consuming a CAPTCHA token. Workflows
 * that always verify CAPTCHA themselves (such as Parent enrollment) use this
 * so one token is never verified twice.
 */
export async function getLoginLockStatus(
  role: ProtectedLoginRole,
  subject: string,
  request: NextRequest,
  ipScope?: LoginGuardIpScope,
) {
  const guard = await getLoginGuardByHash(role, subjectHash(role, subject), request, ipScope);
  return {
    locked: isCurrentlyLocked(guard),
    lockedUntil: guard.lockedUntil,
  };
}

export async function checkLoginProtection(
  role: ProtectedLoginRole,
  subject: string,
  request: NextRequest,
  captchaToken: unknown,
  ipScope?: LoginGuardIpScope,
) {
  const guard = await getLoginGuardByHash(role, subjectHash(role, subject), request, ipScope);
  if (isCurrentlyLocked(guard)) {
    return {
      allowed: false as const,
      status: 429,
      message: LOCKOUT_MESSAGE,
      captchaRequired: true,
      lockedUntil: guard.lockedUntil,
    };
  }

  if (guard.captchaRequired) {
    let verified = false;
    try {
      verified = await verifyGoogleRecaptcha(captchaToken, getClientIp(request));
    } catch {
      verified = false;
    }
    if (!verified) {
      return {
        allowed: false as const,
        status: 403,
        message: "Complete the CAPTCHA verification before trying to log in.",
        captchaRequired: true,
        lockedUntil: null,
      };
    }
  }

  return { allowed: true as const, captchaRequired: guard.captchaRequired, lockedUntil: null };
}

/** Atomically records every failed credential or account-access check. */
export async function failedLoginResult(
  role: ProtectedLoginRole,
  subject: string,
  request: NextRequest,
  ipScope?: LoginGuardIpScope,
) {
  const guard = await callGuard(
    "record_failed_login_attempt_v2",
    role,
    subjectHash(role, subject),
    ipHash(request, ipScope),
  );
  if (isCurrentlyLocked(guard)) {
    return {
      status: 429,
      message: LOCKOUT_MESSAGE,
      captchaRequired: true,
      lockedUntil: guard.lockedUntil,
    };
  }
  return {
    status: 401,
    message: invalidCredentialsMessage(role),
    captchaRequired: guard.captchaRequired,
    lockedUntil: null,
  };
}

/** Resets both account and current-IP guard state after verified authentication. */
export async function clearLoginFailures(
  role: ProtectedLoginRole,
  subject: string,
  request: NextRequest,
  ipScope?: LoginGuardIpScope,
) {
  await callGuard(
    "clear_login_attempt_guard_v2",
    role,
    subjectHash(role, subject),
    ipHash(request, ipScope),
  );
}
