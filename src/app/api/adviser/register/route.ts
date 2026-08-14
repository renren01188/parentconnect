import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import bcrypt from "bcryptjs";
import { sendAdviserTempPasswordEmail } from "@/lib/mailer";

function generateTempPassword(): string {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789@#$!";
  return Array.from({ length: 10 }, () =>
    chars[Math.floor(Math.random() * chars.length)]
  ).join("");
}

async function deriveClassSession(
  allSections: string[],
  grade: string
): Promise<"Morning" | "Afternoon" | "Mixed"> {
  if (allSections.length === 0) return "Morning";

  const { data, error } = await supabase
    .from("sections")
    .select("name, class_session")
    .eq("grade", grade.trim())
    .in("name", allSections);

  if (error) {
    console.error("[deriveClassSession] Supabase error:", JSON.stringify(error));
    return "Morning";
  }
  if (!data || data.length === 0) return "Morning";

  const sessions = new Set<"Morning" | "Afternoon">();
  for (const row of data) {
    if (row.class_session === "Morning" || row.class_session === "Afternoon") {
      sessions.add(row.class_session);
    }
  }

  if (sessions.size === 0) return "Morning";
  if (sessions.size > 1) return "Mixed";
  return [...sessions][0];
}

export async function POST(req: NextRequest) {
  console.log("[adviser/register] Request received");

  try {
    const body = await req.json();
    console.log("[adviser/register] Body parsed:", JSON.stringify({
      ...body,
      email: body.email ? "***@***.***" : undefined,
    }));

    const {
      firstName, middleName, lastName, suffix,
      gradeLevel, section, additionalSections,
      contactNumber, email, employeeId,
    } = body;

    const clientClassSession: string | undefined = body.classSession;

    // ── Validation ───────────────────────────────────────────────────────────
    if (!firstName || !lastName || !gradeLevel || !section || !contactNumber || !email || !employeeId) {
      return NextResponse.json(
        { success: false, message: "All required fields must be filled in." },
        { status: 400 }
      );
    }
    if (!/\S+@\S+\.\S+/.test(email)) {
      return NextResponse.json(
        { success: false, message: "Invalid email address." },
        { status: 400 }
      );
    }

    // ── Duplicate email check ────────────────────────────────────────────────
    console.log("[adviser/register] Checking email duplicate...");
    const { data: emailExists, error: emailCheckErr } = await supabase
      .from("advisers")
      .select("id")
      .eq("email", email.toLowerCase().trim())
      .limit(1);

    if (emailCheckErr) {
      console.error("[adviser/register] Email check error:", JSON.stringify(emailCheckErr));
      throw new Error(`Email check failed: ${emailCheckErr.message}`);
    }
    if (emailExists && emailExists.length > 0) {
      return NextResponse.json(
        { success: false, message: "An adviser account with this email already exists." },
        { status: 409 }
      );
    }

    // ── Duplicate employee ID check ──────────────────────────────────────────
    console.log("[adviser/register] Checking employee ID duplicate...");
    const { data: empExists, error: empCheckErr } = await supabase
      .from("advisers")
      .select("id")
      .eq("employee_id", employeeId.trim())
      .limit(1);

    if (empCheckErr) {
      console.error("[adviser/register] Employee ID check error:", JSON.stringify(empCheckErr));
      throw new Error(`Employee ID check failed: ${empCheckErr.message}`);
    }
    if (empExists && empExists.length > 0) {
      return NextResponse.json(
        { success: false, message: "An adviser account with this Employee ID already exists." },
        { status: 409 }
      );
    }

    // ── Derive classSession ──────────────────────────────────────────────────
    const allSections: string[] = additionalSections?.length
      ? [section, ...additionalSections]
      : [section];

    console.log("[adviser/register] Deriving class session for sections:", allSections);
    const classSession =
      (await deriveClassSession(allSections, gradeLevel)) ??
      clientClassSession ??
      "Morning";
    console.log("[adviser/register] Class session resolved:", classSession);

    // ── Hash password ────────────────────────────────────────────────────────
    console.log("[adviser/register] Hashing temp password...");
    const tempPassword = generateTempPassword();
    const hashedTemp = await bcrypt.hash(tempPassword, 10);

    // ── Insert adviser ───────────────────────────────────────────────────────
    console.log("[adviser/register] Inserting adviser record...");
    const { error: insertError } = await supabase.from("advisers").insert({
      first_name: firstName,
      middle_name: middleName || null,
      last_name: lastName,
      suffix: suffix && suffix !== "None" ? suffix : null,
      grade: gradeLevel,
      section,
      sections: allSections,
      phone: contactNumber,
      email: email.toLowerCase().trim(),
      employee_id: employeeId.trim(),
      password_hash: hashedTemp,
      password_set: false,
      status: "active",
      class_session: classSession,
    });

    if (insertError) {
      console.error("[adviser/register] INSERT ERROR:", JSON.stringify(insertError));
      throw new Error(`Insert failed: ${insertError.message} (code: ${insertError.code})`);
    }
    console.log("[adviser/register] Adviser inserted successfully");

    // ── Upsert sections ──────────────────────────────────────────────────────
    console.log("[adviser/register] Upserting sections...");
    for (const sec of allSections) {
      const { error: upsertErr } = await supabase
        .from("sections")
        .upsert(
          { name: sec.trim(), grade: gradeLevel.trim() },
          { onConflict: "name,grade", ignoreDuplicates: true }
        );
      if (upsertErr) {
        console.warn(`[adviser/register] Section upsert warning for "${sec}":`, JSON.stringify(upsertErr));
      }
    }

    // ── Send email ───────────────────────────────────────────────────────────
    console.log("[adviser/register] Sending email...");
    try {
      await sendAdviserTempPasswordEmail({
        adviserEmail: email.toLowerCase().trim(),
        adviserName: `${firstName} ${lastName}`,
        grade: gradeLevel,
        section,
        additionalSections: allSections.slice(1), // everything after the primary section
        tempPassword,
      });
      console.log("[adviser/register] Email sent");
    } catch (mailErr) {
      console.error("[adviser/register] Email send failed:", mailErr);
    }

    return NextResponse.json({
      success: true,
      tempPassword,
      message: `Adviser account created. A temporary password has been sent to ${email}.`,
    });

  } catch (error: unknown) {
    console.error("[adviser/register] FATAL ERROR:", error);
    if (error instanceof Error) {
      console.error("[adviser/register] Error message:", error.message);
      console.error("[adviser/register] Error stack:", error.stack);
    }
    return NextResponse.json(
      {
        success: false,
        message: error instanceof Error ? error.message : "Server error.",
      },
      { status: 500 }
    );
  }
}