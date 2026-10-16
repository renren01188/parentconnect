import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import bcrypt from "bcryptjs";
import { sendAdviserTempPasswordEmail } from "@/lib/mailer";
import { getActiveIct } from "@/lib/apiAuthorization";
import { publishAccountRealtimeInvalidation, publishPublicSectionsInvalidation } from "@/lib/realtimeInvalidation";

type AdviserAssignmentRecord = {
  id: number;
  first_name: string | null;
  middle_name: string | null;
  last_name: string | null;
  suffix: string | null;
  email: string | null;
  grade: string | null;
  section: string | null;
  sections: string[] | null;
  status: string | null;
  archive_status: string | null;
};

function assignedSections(adviser: AdviserAssignmentRecord) {
  return (adviser.sections?.length ? adviser.sections : adviser.section ? [adviser.section] : [])
    .map((section) => section.trim())
    .filter(Boolean);
}

function isCurrentAssignment(adviser: AdviserAssignmentRecord) {
  const status = String(adviser.status ?? "active").toLowerCase();
  const archiveStatus = String(adviser.archive_status ?? "active").toLowerCase();
  return status !== "inactive" && archiveStatus !== "archived" && archiveStatus !== "deleted";
}

function adviserName(adviser: AdviserAssignmentRecord) {
  return [adviser.first_name, adviser.middle_name, adviser.last_name, adviser.suffix]
    .filter(Boolean)
    .join(" ")
    .trim() || "Existing adviser";
}

async function findAssignmentConflicts(grade: string, requestedSections: string[]) {
  const { data, error } = await supabase
    .from("advisers")
    .select("id, first_name, middle_name, last_name, suffix, email, grade, section, sections, status, archive_status")
    .eq("grade", grade);
  if (error) throw error;

  return ((data ?? []) as AdviserAssignmentRecord[]).flatMap((adviser) => {
    if (!isCurrentAssignment(adviser)) return [];
    const assigned = assignedSections(adviser);
    return requestedSections
      .filter((section) => assigned.includes(section))
      .map((section) => ({
        section,
        adviserId: adviser.id,
        adviserName: adviserName(adviser),
        adviserEmail: adviser.email ?? "",
        status: adviser.status ?? "active",
      }));
  });
}

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

/** Reports whether a selected grade/section is already reserved by an adviser. */
export async function GET(request: NextRequest) {
  if (!(await getActiveIct())) {
    return NextResponse.json({ success: false, message: "ICT administrator access is required." }, { status: 403 });
  }

  try {
    const grade = request.nextUrl.searchParams.get("grade")?.trim() ?? "";
    const sections = [...new Set(
      (request.nextUrl.searchParams.get("sections") ?? "")
        .split(",")
        .map((section) => section.trim())
        .filter(Boolean),
    )];
    if (!grade || sections.length === 0) {
      return NextResponse.json({ success: false, message: "A grade and at least one section are required." }, { status: 400 });
    }

    const conflicts = await findAssignmentConflicts(grade, sections);
    return NextResponse.json({ success: true, conflicts });
  } catch (error) {
    console.error("GET /api/adviser/register assignment check error:", error);
    return NextResponse.json({ success: false, message: "Unable to check adviser assignments." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  console.log("[adviser/register] Request received");

  try {
    if (!(await getActiveIct())) {
      return NextResponse.json({ success: false, message: "ICT administrator access is required." }, { status: 403 });
    }

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
    if (!/^\d{11}$/.test(contactNumber.trim())) {
      return NextResponse.json({ success: false, message: "Contact number must contain exactly 11 digits." }, { status: 400 });
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
    const allSections = [...new Set([
      String(section).trim(),
      ...(Array.isArray(additionalSections) ? additionalSections : [])
        .map((item) => String(item).trim())
        .filter(Boolean),
    ])];
    const conflicts = await findAssignmentConflicts(String(gradeLevel).trim(), allSections);
    if (conflicts.length > 0) {
      return NextResponse.json(
        {
          success: false,
          code: "ADVISER_SECTION_OCCUPIED",
          message: "One or more selected sections already have an adviser assigned. Choose an available section or use Adviser Transfer.",
          conflicts,
        },
        { status: 409 },
      );
    }

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
    const { data: createdAdviser, error: insertError } = await supabase.from("advisers").insert({
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
      // The account is not usable as an adviser until its owner has set a
      // permanent password. This also lets ICT correct a mistyped email and
      // resend a fresh temporary password from User Management.
      status: "pending_activation",
      class_session: classSession,
    }).select("id").single();

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
      await supabase.from("advisers").delete().eq("id", createdAdviser.id);
      return NextResponse.json(
        { success: false, message: "The adviser account was not created because the temporary-password email could not be sent." },
        { status: 503 },
      );
    }

    // The account and its assignment are now durable. Refresh every open ICT
    // User Management view and the public report form's section catalogue.
    await Promise.all([
      publishAccountRealtimeInvalidation([{ role: "adviser", id: Number(createdAdviser.id) }]),
      publishPublicSectionsInvalidation(),
    ]);

    return NextResponse.json({
      success: true,
      message: `Adviser account is pending activation. A temporary password has been sent to ${email}.`,
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
