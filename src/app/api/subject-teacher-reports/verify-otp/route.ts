import { NextRequest, NextResponse } from "next/server";
import { SignJWT } from "jose";
import { supabase } from "@/lib/supabase";
import { logSecurityAlert } from "@/lib/audit";
import { isAllowedSubjectTeacherEmail, normalizeDepEdEmail, otpHash, signingKey, SUBJECT_TEACHER_REPORT_COOKIE } from "@/lib/subjectTeacherReportAuth";

export async function POST(req: NextRequest) {
  try {
    const { email, otp } = await req.json();
    const normalizedEmail = normalizeDepEdEmail(email);
    const invalid = async () => {
      await logSecurityAlert({ request: req, identifier: normalizedEmail || "Unknown email", role: "Subject Teacher", reason: "invalid subject teacher report OTP" });
      return NextResponse.json({ success: false, message: "The verification code is incorrect or expired." }, { status: 400 });
    };
    if (!isAllowedSubjectTeacherEmail(normalizedEmail) || !/^\d{6}$/.test(String(otp ?? ""))) return invalid();

    const submittedHash = otpHash(normalizedEmail, String(otp));
    // The database locks this OTP row while comparing, incrementing failed
    // attempts, and consuming a valid code. Concurrent guesses cannot bypass
    // the five-attempt limit.
    const { data: consumed, error: consumeError } = await supabase.rpc("consume_subject_teacher_report_otp", {
      p_email: normalizedEmail,
      p_otp_hash: submittedHash,
    });
    if (consumeError) throw consumeError;
    if (consumed !== true) return invalid();

    const token = await new SignJWT({ role: "subject_teacher_report", email: normalizedEmail })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("20m")
      .sign(signingKey());
    const response = NextResponse.json({ success: true });
    response.cookies.set(SUBJECT_TEACHER_REPORT_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 20 * 60,
      path: "/",
    });
    return response;
  } catch (error: unknown) {
    console.error("POST /api/subject-teacher-reports/verify-otp error:", error);
    return NextResponse.json({ success: false, message: error instanceof Error ? error.message : "Unable to verify the code." }, { status: 500 });
  }
}
