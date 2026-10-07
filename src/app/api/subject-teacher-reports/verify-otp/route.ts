import { NextRequest, NextResponse } from "next/server";
import { SignJWT } from "jose";
import { supabase } from "@/lib/supabase";
import { logSecurityAlert } from "@/lib/audit";
import { hashesMatch, isAllowedSubjectTeacherEmail, normalizeDepEdEmail, otpHash, signingKey, SUBJECT_TEACHER_OTP_MAX_ATTEMPTS, SUBJECT_TEACHER_REPORT_COOKIE } from "@/lib/subjectTeacherReportAuth";

export async function POST(req: NextRequest) {
  try {
    const { email, otp } = await req.json();
    const normalizedEmail = normalizeDepEdEmail(email);
    const invalid = async () => {
      await logSecurityAlert({ request: req, identifier: normalizedEmail || "Unknown email", role: "Subject Teacher", reason: "invalid subject teacher report OTP" });
      return NextResponse.json({ success: false, message: "The verification code is incorrect or expired." }, { status: 400 });
    };
    if (!isAllowedSubjectTeacherEmail(normalizedEmail) || !/^\d{6}$/.test(String(otp ?? ""))) return invalid();

    const { data: record, error } = await supabase
      .from("subject_teacher_report_otps")
      .select("otp_hash, expires_at, attempts")
      .eq("email", normalizedEmail)
      .maybeSingle();
    if (error) throw error;
    if (!record || new Date(record.expires_at).getTime() <= Date.now() || record.attempts >= SUBJECT_TEACHER_OTP_MAX_ATTEMPTS) return invalid();

    const submittedHash = otpHash(normalizedEmail, String(otp));
    if (!hashesMatch(record.otp_hash, submittedHash)) {
      await supabase.from("subject_teacher_report_otps")
        .update({ attempts: Math.min(record.attempts + 1, SUBJECT_TEACHER_OTP_MAX_ATTEMPTS) })
        .eq("email", normalizedEmail)
        .eq("otp_hash", record.otp_hash);
      return invalid();
    }

    const { data: consumed, error: consumeError } = await supabase
      .from("subject_teacher_report_otps")
      .delete()
      .eq("email", normalizedEmail)
      .eq("otp_hash", record.otp_hash)
      .gt("expires_at", new Date().toISOString())
      .lt("attempts", SUBJECT_TEACHER_OTP_MAX_ATTEMPTS)
      .select("email");
    if (consumeError) throw consumeError;
    if (!consumed?.length) return invalid();

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
