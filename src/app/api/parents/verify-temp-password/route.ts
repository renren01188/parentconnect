import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { jwtVerify, SignJWT } from "jose";
import bcrypt from "bcryptjs";
import { supabase } from "@/lib/supabase";
import { getJwtSecret } from "@/lib/authSecret";
import { parentAccountCanAccess } from "@/lib/parentAccountAccess";
import {
  legacyTemporaryPasswordExpiryEpochSeconds,
  TEMPORARY_PASSWORD_EXPIRED_MESSAGE,
  temporaryPasswordExpiryEpochSeconds,
} from "@/lib/parentTemporaryPassword";

const SECRET = getJwtSecret();

const INCORRECT_PASSWORD_MESSAGE = "Please check the correct temporary password or check your email address if it is correct.";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    const password = body?.password;

    if (!password || typeof password !== "string") {
      return NextResponse.json({ success: false, message: INCORRECT_PASSWORD_MESSAGE }, { status: 401 });
    }

    const cookieStore = await cookies();
    const temporaryPasswordExpired = () => {
      cookieStore.delete("parent_token");
      return NextResponse.json({
        success: false,
        temporaryPasswordExpired: true,
        redirectTo: "/login/guardian?signup=1&tempPasswordExpired=1",
        message: TEMPORARY_PASSWORD_EXPIRED_MESSAGE,
      }, { status: 401 });
    };
    const token = cookieStore.get("parent_token")?.value;
    if (!token) {
      return temporaryPasswordExpired();
    }

    let payload: { id?: unknown; passwordSet?: unknown; [key: string]: unknown };
    try {
      ({ payload } = await jwtVerify(token, SECRET));
    } catch {
      return temporaryPasswordExpired();
    }

    const parentId = Number(payload.id);
    const tokenExpirySeconds = typeof payload.temporaryPasswordExpiresAt === "string"
      ? Math.floor(new Date(payload.temporaryPasswordExpiresAt).getTime() / 1_000)
      : Number.NaN;
    if (
      !Number.isInteger(parentId)
      || parentId <= 0
      || payload.role !== "parent"
      || payload.passwordSet === true
      || !Number.isFinite(tokenExpirySeconds)
      || tokenExpirySeconds * 1_000 <= Date.now()
    ) {
      return temporaryPasswordExpired();
    }

    const { data: parent, error } = await supabase
      .from("parents")
      .select("password, password_set, status, archive_status, temporary_password_expires_at")
      .eq("id", parentId)
      .maybeSingle();
    if (error) throw error;

    const matches = !!parent
      && parentAccountCanAccess(parent)
      && parent.password_set !== 1
      && await bcrypt.compare(password, parent.password);
    if (!matches) {
      return NextResponse.json({ success: false, message: INCORRECT_PASSWORD_MESSAGE }, { status: 401 });
    }

    const passwordExpirySeconds = temporaryPasswordExpiryEpochSeconds(parent?.temporary_password_expires_at)
      ?? legacyTemporaryPasswordExpiryEpochSeconds(password);
    if (
      !passwordExpirySeconds
      || passwordExpirySeconds !== tokenExpirySeconds
      || passwordExpirySeconds * 1_000 <= Date.now()
    ) return temporaryPasswordExpired();

    const verifiedToken = await new SignJWT({ ...payload, temporaryPasswordVerified: true })
      .setProtectedHeader({ alg: "HS256" })
      .setExpirationTime(tokenExpirySeconds)
      .sign(SECRET);

    cookieStore.set("parent_token", verifiedToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: Math.max(1, tokenExpirySeconds - Math.floor(Date.now() / 1_000)),
      path: "/",
    });

    return NextResponse.json({
      success: true,
      expiresAt: new Date(tokenExpirySeconds * 1_000).toISOString(),
      redirectTo: "/login/guardian/set-password",
    });
  } catch {
    return NextResponse.json({ success: false, message: "Unable to verify the temporary password. Please try again." }, { status: 500 });
  }
}
