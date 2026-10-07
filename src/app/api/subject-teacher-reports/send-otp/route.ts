import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { supabase } from "@/lib/supabase";
import { sendWithEmail } from "@/lib/mailer";
import { logAudit } from "@/lib/audit";
import { verifyGoogleRecaptcha } from "@/lib/googleRecaptcha";
import { consumePublicRateLimit } from "@/lib/publicRateLimit";
import { isAllowedSubjectTeacherEmail, normalizeDepEdEmail, otpHash, SUBJECT_TEACHER_OTP_EXPIRY_MINUTES, SUBJECT_TEACHER_OTP_RESEND_COOLDOWN_MS } from "@/lib/subjectTeacherReportAuth";

export async function POST(req: NextRequest) {
  try {
    const { email, recaptchaToken } = await req.json();
    const normalizedEmail = normalizeDepEdEmail(email);
    if (!isAllowedSubjectTeacherEmail(normalizedEmail)) {
      return NextResponse.json({ success: false, message: "Use your valid @deped.gov.ph email address." }, { status: 400 });
    }
    if (!await verifyGoogleRecaptcha(recaptchaToken)) {
      await logAudit({ action: "Subject Teacher OTP CAPTCHA Failed", performedBy: normalizedEmail, performedByRole: "Subject Teacher", targetUser: "ParentConnect", targetRole: "System", targetEmail: normalizedEmail, module: "Security", details: "A Subject Teacher OTP request failed CAPTCHA validation." });
      return NextResponse.json({ success: false, message: "CAPTCHA verification failed. Please try again." }, { status: 400 });
    }
    const rateLimit = await consumePublicRateLimit("subject-teacher-otp", normalizedEmail, 3, 15 * 60);
    if (!rateLimit.allowed) {
      await logAudit({ action: "Subject Teacher OTP Rate Limited", performedBy: normalizedEmail, performedByRole: "Subject Teacher", targetUser: "ParentConnect", targetRole: "System", targetEmail: normalizedEmail, module: "Security", details: "A Subject Teacher OTP request exceeded the server-side limit." });
      return NextResponse.json({ success: false, message: "Too many verification requests. Please try again later." }, { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds) } });
    }

    const { data: existing, error: existingError } = await supabase
      .from("subject_teacher_report_otps")
      .select("requested_at")
      .eq("email", normalizedEmail)
      .maybeSingle();
    if (existingError) throw existingError;

    if (existing && Date.now() - new Date(existing.requested_at).getTime() < SUBJECT_TEACHER_OTP_RESEND_COOLDOWN_MS) {
      return NextResponse.json({ success: true, throttled: true, message: "A code was sent recently. Please wait a minute before requesting another." });
    }

    const otp = crypto.randomInt(100_000, 1_000_000).toString();
    const expiresAt = new Date(Date.now() + SUBJECT_TEACHER_OTP_EXPIRY_MINUTES * 60_000).toISOString();
    const { error: upsertError } = await supabase.from("subject_teacher_report_otps").upsert({
      email: normalizedEmail,
      otp_hash: otpHash(normalizedEmail, otp),
      expires_at: expiresAt,
      attempts: 0,
      requested_at: new Date().toISOString(),
    }, { onConflict: "email" });
    if (upsertError) throw upsertError;

    try {
      await sendWithEmail({
        to: normalizedEmail,
        subject: "ParentConnect - Subject Teacher Report Code",
        html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;padding:28px;background:#f8fafc;border-radius:16px;">
          <h1 style="color:#1e293b;font-size:22px;">Verify your Subject Teacher report</h1>
          <p style="color:#475569;line-height:1.6;">Enter this six-digit code in ParentConnect to continue with your student report.</p>
          <p style="margin:20px 0;padding:14px 20px;background:#eff6ff;border-radius:12px;color:#1e3a8a;font-size:28px;font-weight:800;letter-spacing:8px;text-align:center;">${otp}</p>
          <p style="color:#64748b;font-size:13px;">This code expires in ${SUBJECT_TEACHER_OTP_EXPIRY_MINUTES} minutes and can be used once. If you did not request it, ignore this email.</p>
        </div>`,
      });
    } catch (mailError) {
      await supabase.from("subject_teacher_report_otps").delete().eq("email", normalizedEmail);
      throw mailError;
    }

    await logAudit({
      action: "Subject Teacher Report OTP",
      performedBy: normalizedEmail,
      performedByRole: "Subject Teacher",
      targetUser: "ParentConnect",
      targetRole: "System",
      targetEmail: normalizedEmail,
      module: "Reports",
      details: "Subject Teacher report verification code requested.",
      ipAddress: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? undefined,
      browser: req.headers.get("user-agent") ?? undefined,
    });
    return NextResponse.json({ success: true, message: "Verification code sent. Check your DepEd email." });
  } catch (error: unknown) {
    console.error("POST /api/subject-teacher-reports/send-otp error:", error);
    return NextResponse.json({ success: false, message: error instanceof Error ? error.message : "Unable to send the verification code." }, { status: 500 });
  }
}
