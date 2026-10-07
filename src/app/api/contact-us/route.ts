import { NextRequest, NextResponse } from "next/server";
import { sendContactUsNotification } from "@/lib/mailer";
import { verifyGoogleRecaptcha } from "@/lib/googleRecaptcha";
import { supabase } from "@/lib/supabase";

export const runtime = "nodejs";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type ContactSubmission = {
  name: string;
  email: string;
  phone: string;
  subject: string;
  message: string;
};

function asTrimmedString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function validateSubmission(body: Record<string, unknown>): ContactSubmission | null {
  const submission = {
    name: asTrimmedString(body.name),
    email: asTrimmedString(body.email).toLowerCase(),
    phone: asTrimmedString(body.phone),
    subject: asTrimmedString(body.subject),
    message: asTrimmedString(body.message),
  };

  if (!submission.name || !submission.email || !submission.subject || !submission.message) return null;
  if (!EMAIL_PATTERN.test(submission.email)) return null;
  if (
    submission.name.length > 100
    || submission.email.length > 254
    || submission.phone.length > 50
    || submission.subject.length > 200
    || submission.message.length > 5_000
  ) return null;

  return submission;
}

function duplicateResponse(status: unknown) {
  if (status === "sent" || status === "skipped") {
    return NextResponse.json({ success: true, message: "Message sent successfully." });
  }

  return NextResponse.json(
    { success: false, message: "Your message was received, but its notification could not be delivered. Please contact the school directly." },
    { status: 503 },
  );
}

export async function POST(req: NextRequest) {
  try {
    const idempotencyKey = req.headers.get("Idempotency-Key")?.trim() ?? "";
    if (!UUID_PATTERN.test(idempotencyKey)) {
      return NextResponse.json({ success: false, message: "Unable to submit your message. Please refresh and try again." }, { status: 400 });
    }

    const body = await req.json() as Record<string, unknown>;
    const submission = validateSubmission(body);
    if (!submission) {
      return NextResponse.json(
        { success: false, message: "Please complete all required fields with valid information." },
        { status: 400 },
      );
    }

    let captchaVerified = false;
    try {
      captchaVerified = await verifyGoogleRecaptcha(body.recaptchaToken);
    } catch {
      captchaVerified = false;
    }
    if (!captchaVerified) {
      return NextResponse.json(
        { success: false, message: "The CAPTCHA verification is invalid, expired, or incomplete. Please try again." },
        { status: 400 },
      );
    }

    // Even retries must provide a fresh valid CAPTCHA. Once the submission is
    // known, its delivery state is returned without creating or mailing again.
    const { data: existing, error: existingError } = await supabase
      .from("contact_us_messages")
      .select("notification_status")
      .eq("idempotency_key", idempotencyKey)
      .maybeSingle();
    if (existingError) throw existingError;
    if (existing) return duplicateResponse(existing.notification_status);

    const { data: created, error: createError } = await supabase
      .from("contact_us_messages")
      .insert({
        idempotency_key: idempotencyKey,
        sender_name: submission.name,
        sender_email: submission.email,
        sender_phone: submission.phone || null,
        subject: submission.subject,
        message: submission.message,
        notification_status: "pending",
      })
      .select("id")
      .maybeSingle();

    // A simultaneous browser retry can lose this insert race. It must never
    // progress to mail delivery, because the winning request owns that send.
    if (createError?.code === "23505") {
      const { data: concurrent, error: concurrentError } = await supabase
        .from("contact_us_messages")
        .select("notification_status")
        .eq("idempotency_key", idempotencyKey)
        .maybeSingle();
      if (concurrentError) throw concurrentError;
      return duplicateResponse(concurrent?.notification_status);
    }
    if (createError || !created) throw createError ?? new Error("Contact message could not be saved.");

    try {
      const { data: ictUsers, error: ictError } = await supabase
        .from("ict_admins")
        .select("email, status, archive_status")
        .eq("status", "active");
      if (ictError) throw ictError;

      const recipients = [...new Set((ictUsers ?? [])
        .filter((user) => user.archive_status !== "archived")
        .map((user) => String(user.email ?? "").trim().toLowerCase())
        .filter((email) => EMAIL_PATTERN.test(email)))];

      if (recipients.length === 0) {
        const { error } = await supabase
          .from("contact_us_messages")
          .update({ notification_status: "skipped", notified_at: new Date().toISOString() })
          .eq("id", created.id);
        if (error) throw error;
        return NextResponse.json({ success: true, message: "Message sent successfully." }, { status: 201 });
      }

      await sendContactUsNotification({ recipients, ...submission });
    } catch {
      await supabase
        .from("contact_us_messages")
        .update({ notification_status: "failed", notification_error: "Email delivery failed." })
        .eq("id", created.id);
      return NextResponse.json(
        { success: false, message: "Your message was received, but we could not send its notification. Please contact the school directly." },
        { status: 503 },
      );
    }

    const { error: updateError } = await supabase
      .from("contact_us_messages")
      .update({ notification_status: "sent", notified_at: new Date().toISOString() })
      .eq("id", created.id);
    if (updateError) throw updateError;

    return NextResponse.json({ success: true, message: "Message sent successfully." }, { status: 201 });
  } catch (error) {
    console.error("POST /api/contact-us failed", error instanceof Error ? error.name : "Unknown error");
    return NextResponse.json(
      { success: false, message: "We could not send your message right now. Please try again later." },
      { status: 500 },
    );
  }
}
