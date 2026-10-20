import { SignJWT, jwtVerify } from "jose";
import { getJwtSecret } from "@/lib/authSecret";

const SECRET = getJwtSecret();
export const PARENT_RESET_FLOW_COOKIE = "parent_password_reset_token";
export const PARENT_RESET_VERIFIED_COOKIE = "parent_password_reset_verified";
export const PARENT_RESET_FLOW_TTL_SECONDS = 30 * 60;
export const PARENT_RESET_VERIFIED_TTL_SECONDS = 10 * 60;

export type ParentResetChannel = "email" | "sms";
export type ParentResetFlow = {
  parentId: number;
  challengeId: string;
  channel: ParentResetChannel;
  canUseEmail: boolean;
};

type ParentResetCookieOptions = {
  httpOnly: boolean;
  secure: boolean;
  sameSite: "lax";
  maxAge: number;
  path: string;
};

const options = (maxAge: number): ParentResetCookieOptions => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  maxAge,
  path: "/",
});

function validFlow(payload: Record<string, unknown>): ParentResetFlow | null {
  const parentId = Number(payload.parentId);
  const challengeId = typeof payload.challengeId === "string" ? payload.challengeId : "";
  const channel = payload.channel === "email" || payload.channel === "sms" ? payload.channel : null;
  if (
    payload.role !== "parent-password-reset"
    || !Number.isSafeInteger(parentId) || parentId <= 0
    || !/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(challengeId)
    || !channel
  ) return null;
  return { parentId, challengeId, channel, canUseEmail: payload.canUseEmail === true };
}

export async function writeParentResetFlow(cookieStore: { set: (name: string, value: string, options: ParentResetCookieOptions) => void }, flow: ParentResetFlow) {
  const token = await new SignJWT({ role: "parent-password-reset", ...flow })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1_000) + PARENT_RESET_FLOW_TTL_SECONDS)
    .sign(SECRET);
  cookieStore.set(PARENT_RESET_FLOW_COOKIE, token, options(PARENT_RESET_FLOW_TTL_SECONDS));
}

export async function readParentResetFlow(cookieStore: { get: (name: string) => { value?: string } | undefined }): Promise<ParentResetFlow | null> {
  const token = cookieStore.get(PARENT_RESET_FLOW_COOKIE)?.value;
  if (!token) return null;
  try {
    const verified = await jwtVerify(token, SECRET);
    return validFlow(verified.payload);
  } catch {
    return null;
  }
}

export async function writeVerifiedParentReset(cookieStore: { set: (name: string, value: string, options: ParentResetCookieOptions) => void }, flow: ParentResetFlow) {
  const token = await new SignJWT({ role: "parent-password-reset-verified", parentId: flow.parentId, challengeId: flow.challengeId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1_000) + PARENT_RESET_VERIFIED_TTL_SECONDS)
    .sign(SECRET);
  cookieStore.set(PARENT_RESET_VERIFIED_COOKIE, token, options(PARENT_RESET_VERIFIED_TTL_SECONDS));
}

export async function readVerifiedParentReset(cookieStore: { get: (name: string) => { value?: string } | undefined }) {
  const token = cookieStore.get(PARENT_RESET_VERIFIED_COOKIE)?.value;
  if (!token) return null;
  try {
    const verified = await jwtVerify(token, SECRET);
    const parentId = Number(verified.payload.parentId);
    const challengeId = typeof verified.payload.challengeId === "string" ? verified.payload.challengeId : "";
    if (
      verified.payload.role !== "parent-password-reset-verified"
      || !Number.isSafeInteger(parentId) || parentId <= 0
      || !/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(challengeId)
    ) return null;
    return { parentId, challengeId };
  } catch {
    return null;
  }
}
