import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { supabase } from "@/lib/supabase";
import { getAdviserFromToken } from "@/lib/getAdviserFromToken";
import { ensureParentStudentLink, reconcileParentStudentLinks } from "@/lib/reconcileParentStudentLinks";
import { normalizeSf1Name, parseSf1Name, type Sf1Name } from "@/lib/sf1Name";
import { logAudit } from "@/lib/audit";
import { isFamilyRole, normalizeParentPhone, provisionParentForStudent } from "@/lib/parentEnrollment";
import { publishAccountRealtimeInvalidation, publishStudentsRealtimeInvalidation } from "@/lib/realtimeInvalidation";
import {
  assertSelectedActiveParentLink,
  findActiveParentLinkCandidates,
  type ActiveParentLinkCandidate,
  type ParentFamilyRole,
  type ParentLinkIdentity,
} from "@/lib/activeParentLinkCandidates";

type ImportRow = {
  lrn: string; firstName: string; middleName: string | null; lastName: string; suffix: string | null;
  sex: "M" | "F"; birthDate: string | null; age: number | null; motherTongue: string | null;
  ipEthnicGroup: string | null; religion: string | null; houseStreetSitioPurok: string | null;
  barangay: string | null; municipalityCity: string | null; province: string | null;
  father: Name; mother: Name; guardian: Name & { relationship: string | null };
  contactNumber: string | null; learningModality: string | null;
  /** Optional columns supported by parent/student masterlists, not standard SF1. */
  parentEmail: string | null; parentRole: "Father" | "Mother" | "Guardian" | null;
};
type Name = Sf1Name;
type ParentLinkState = "auto" | "ambiguous" | "none";
type ParentLinkSuggestion = {
  role: ParentFamilyRole;
  state: ParentLinkState;
  candidates: ActiveParentLinkCandidate[];
};
type ParentLinkSelections = Record<string, Partial<Record<ParentFamilyRole, string | number | null>>>;

const text = (value: unknown) => String(value ?? "").trim() || null;
function cell(sheet: XLSX.WorkSheet, row: number, col: number) { return sheet[XLSX.utils.encode_cell({ r: row, c: col })]; }
function dateValue(value: unknown): string | null {
  if (typeof value === "number") { const d = XLSX.SSF.parse_date_code(value); return d ? `${d.y}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}` : null; }
  const raw = text(value); if (!raw) return null;
  const parsed = new Date(raw); return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
}

function optionalMasterlistColumn(sheet: XLSX.WorkSheet, range: XLSX.Range, matcher: (label: string) => boolean) {
  // SF1 templates place headings above the data area. Limit the scan to the
  // first rows so a student's value can never be mistaken for a column name.
  for (let row = 0; row < Math.min(6, range.e.r + 1); row++) {
    for (let col = 0; col <= range.e.c; col++) {
      const label = text(cell(sheet, row, col)?.v)?.toLowerCase().replace(/[^a-z]/g, "") ?? "";
      if (matcher(label)) return col;
    }
  }
  return null;
}

function familyIdentities(row: ImportRow): ParentLinkIdentity[] {
  return ([
    { role: "Father" as const, name: row.father },
    { role: "Mother" as const, name: row.mother },
    { role: "Guardian" as const, name: row.guardian },
  ]).flatMap(({ role, name }) => (
    name.firstName && name.lastName
      ? [{
          role,
          firstName: name.firstName,
          middleName: name.middleName,
          lastName: name.lastName,
          contactNumber: row.contactNumber,
        }]
      : []
  ));
}

async function getParentLinkSuggestions(rows: ImportRow[]) {
  const candidateCache = new Map<string, Promise<ActiveParentLinkCandidate[]>>();
  const candidatesFor = (identity: ParentLinkIdentity) => {
    const key = [
      identity.role,
      identity.firstName?.trim().toLocaleLowerCase(),
      identity.middleName?.trim().toLocaleLowerCase(),
      identity.lastName?.trim().toLocaleLowerCase(),
      normalizeParentPhone(identity.contactNumber ?? ""),
    ].join("|");
    const existing = candidateCache.get(key);
    if (existing) return existing;
    const next = findActiveParentLinkCandidates(identity);
    candidateCache.set(key, next);
    return next;
  };

  return Object.fromEntries(await Promise.all(rows.map(async (row) => {
    const suggestions = await Promise.all(familyIdentities(row).map(async (identity) => {
      const candidates = await candidatesFor(identity);
      return {
        role: identity.role,
        state: candidates.length === 1 ? "auto" : candidates.length > 1 ? "ambiguous" : "none",
        candidates,
      } satisfies ParentLinkSuggestion;
    }));
    return [row.lrn, suggestions] as const;
  }))) as Record<string, ParentLinkSuggestion[]>;
}

function parseSheet(buffer: ArrayBuffer) {
  const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) throw new Error("The workbook does not contain a worksheet.");
  const rows: ImportRow[] = [], errors: string[] = [];
  const range = XLSX.utils.decode_range(sheet["!ref"] || "A1");
  const parentEmailColumn = optionalMasterlistColumn(sheet, range, (label) =>
    label === "parentemail" || label === "guardianemail" || label === "parentguardianemail",
  );
  const parentRoleColumn = optionalMasterlistColumn(sheet, range, (label) =>
    label === "parentrole" || label === "parentguardianrole" || label === "accountholderrole",
  );
  // SF1 templates vary their male/female block sizes. Locate the footer instead
  // of using fixed row numbers so every student row is included.
  let footerRow = range.e.r + 1;
  for (let r = 6; r <= range.e.r; r++) {
    const rowText = Array.from({ length: range.e.c + 1 }, (_, c) => text(cell(sheet, r, c)?.v) ?? "").join(" ").toLowerCase();
    if (rowText.includes("list and code of indicators")) { footerRow = r; break; }
  }
  for (let r = 6; r < footerRow; r++) {
    const lrn = text(cell(sheet, r, 0)?.v)?.replace(/\.0$/, "") ?? "";
    if (!lrn) continue;
    const studentName = parseSf1Name(cell(sheet, r, 2)?.v);
    const sex = (text(cell(sheet, r, 6)?.v) ?? "").toUpperCase();
    const rowLabel = text(cell(sheet, r, 2)?.v)?.toLowerCase() ?? "";
    if (rowLabel.includes("total") || rowLabel.includes("combined")) continue;
    if (!/^\d{12}$/.test(lrn)) { errors.push(`Row ${r + 1}: LRN must have 12 digits.`); continue; }
    if (!studentName.firstName || !studentName.lastName) { errors.push(`Row ${r + 1}: name must be Last Name, First Name, Middle Name.`); continue; }
    if (sex !== "M" && sex !== "F") { errors.push(`Row ${r + 1}: sex must be M or F.`); continue; }
    const guardian = parseSf1Name(cell(sheet, r, 36)?.v);
    const candidateRole = parentRoleColumn === null ? null : text(cell(sheet, r, parentRoleColumn)?.v);
    rows.push({
      lrn, firstName: studentName.firstName, middleName: studentName.middleName, lastName: studentName.lastName, suffix: studentName.suffix, sex,
      birthDate: dateValue(cell(sheet, r, 7)?.v), age: Number.isFinite(Number(cell(sheet, r, 9)?.v)) ? Number(cell(sheet, r, 9)?.v) : null, motherTongue: text(cell(sheet, r, 11)?.v), ipEthnicGroup: text(cell(sheet, r, 13)?.v), religion: text(cell(sheet, r, 14)?.v),
      houseStreetSitioPurok: text(cell(sheet, r, 15)?.v), barangay: text(cell(sheet, r, 17)?.v), municipalityCity: text(cell(sheet, r, 20)?.v), province: text(cell(sheet, r, 22)?.v),
      father: parseSf1Name(cell(sheet, r, 27)?.v), mother: parseSf1Name(cell(sheet, r, 31)?.v), guardian: { ...guardian, relationship: text(cell(sheet, r, 40)?.v) },
      contactNumber: text(cell(sheet, r, 41)?.v), learningModality: text(cell(sheet, r, 43)?.v),
      parentEmail: parentEmailColumn === null ? null : text(cell(sheet, r, parentEmailColumn)?.v),
      parentRole: isFamilyRole(candidateRole) ? candidateRole : null,
    });
  }
  const duplicate = rows.filter((row, index) => rows.findIndex(other => other.lrn === row.lrn) !== index).map(row => row.lrn);
  if (duplicate.length) errors.push(`Duplicate LRN(s) in file: ${[...new Set(duplicate)].join(", ")}.`);
  return { rows, errors, sheetName: workbook.SheetNames[0] };
}

export async function POST(request: NextRequest) {
  const adviser = await getAdviserFromToken();
  if (!adviser?.grade) return NextResponse.json({ success: false, message: "Unauthorized." }, { status: 401 });
  try {
    const form = await request.formData(); const file = form.get("file");
    if (!(file instanceof File)) return NextResponse.json({ success: false, message: "Select an SF1 Excel file." }, { status: 400 });
    if (!/\.(xls|xlsx)$/i.test(file.name)) return NextResponse.json({ success: false, message: "Only .xls and .xlsx files are supported." }, { status: 400 });
    const result = parseSheet(await file.arrayBuffer());
    const lrns = result.rows.map(row => row.lrn);
    const { data: existing, error } = lrns.length ? await supabase.from("students").select("student_id").in("student_id", lrns) : { data: [], error: null };
    if (error) throw error;
    const existingLrns = (existing ?? []).map(row => row.student_id);
    const parentLinkSuggestions = await getParentLinkSuggestions(result.rows);
    return NextResponse.json({ success: true, ...result, existingLrns, parentLinkSuggestions });
  } catch (error) { return NextResponse.json({ success: false, message: error instanceof Error ? error.message : "Could not analyze the file." }, { status: 500 }); }
}

export async function PUT(request: NextRequest) {
  const adviser = await getAdviserFromToken();
  if (!adviser?.grade) return NextResponse.json({ success: false, message: "Unauthorized." }, { status: 401 });
  try {
    const { rows, section, parentLinks } = await request.json() as {
      rows: ImportRow[];
      section: string;
      parentLinks?: ParentLinkSelections;
    };
    if (!adviser.sections.includes(section) || !Array.isArray(rows) || rows.length === 0) return NextResponse.json({ success: false, message: "Invalid import request." }, { status: 400 });
    // Preview data returns from the browser. Normalize again so altered or
    // stale preview data cannot save commas or formatting artifacts.
    const normalizedRows = rows.map(row => {
      const student = normalizeSf1Name(row);
      return {
        ...row,
        firstName: student.firstName ?? "",
        middleName: student.middleName,
        lastName: student.lastName ?? "",
        suffix: student.suffix,
        father: normalizeSf1Name(row.father),
        mother: normalizeSf1Name(row.mother),
        guardian: { ...normalizeSf1Name(row.guardian), relationship: text(row.guardian?.relationship) },
        contactNumber: text(row.contactNumber),
        parentEmail: text(row.parentEmail),
        parentRole: isFamilyRole(row.parentRole) ? row.parentRole : null,
      };
    });
    if (normalizedRows.some(row => !row.firstName || !row.lastName)) return NextResponse.json({ success: false, message: "Each imported student must have a first name and last name." }, { status: 400 });
    const lrns = normalizedRows.map(row => row.lrn);
    if (new Set(lrns).size !== lrns.length) return NextResponse.json({ success: false, message: "The preview contains duplicate LRNs." }, { status: 400 });
    const { data: existing } = await supabase.from("students").select("student_id").in("student_id", lrns);
    if (existing?.length) return NextResponse.json({ success: false, message: `These LRNs already exist: ${existing.map(s => s.student_id).join(", ")}.` }, { status: 409 });

    // Recompute choices from normalized server data. Browser preview IDs are
    // never trusted: a selected Parent must still be an active exact match.
    // More than one same-name account is deliberately blocked until the
    // Adviser selects the account or explicitly confirms that no existing
    // Parent account should be linked.
    const selectedParentLinks: Array<{ lrn: string; parentId: number; relationship: ParentFamilyRole }> = [];
    for (const row of normalizedRows) {
      for (const identity of familyIdentities(row)) {
        const requested = parentLinks?.[row.lrn]?.[identity.role];
        const requestedValue = String(requested ?? "").trim();
        if (!requestedValue) {
          const candidates = await findActiveParentLinkCandidates(identity);
          if (candidates.length > 1) {
            return NextResponse.json(
              { success: false, message: `Choose the correct ${identity.role} account or choose no existing Parent account for LRN ${row.lrn}.` },
              { status: 400 },
            );
          }
          if (candidates.length === 1) {
            selectedParentLinks.push({ lrn: row.lrn, parentId: candidates[0].id, relationship: identity.role });
          }
          continue;
        }
        if (requestedValue === "no_link") continue;
        const selected = await assertSelectedActiveParentLink(identity, requestedValue);
        selectedParentLinks.push({ lrn: row.lrn, parentId: selected.id, relationship: identity.role });
      }
    }
    if (new Set(selectedParentLinks.map((link) => `${link.lrn}:${link.parentId}`)).size !== selectedParentLinks.length) {
      return NextResponse.json(
        { success: false, message: "The same Parent account cannot be selected for multiple family roles of one student." },
        { status: 400 },
      );
    }

    const { data: created, error: insertError } = await supabase.from("students").insert(normalizedRows.map(row => ({
      student_id: row.lrn, first_name: row.firstName, middle_name: row.middleName, last_name: row.lastName, suffix: row.suffix, gender: row.sex, grade: adviser.grade, section,
      class_session: "Morning", birth_date: row.birthDate, age: row.age, mother_tongue: row.motherTongue, ip_ethnic_group: row.ipEthnicGroup, religion: row.religion,
      house_street_sitio_purok: row.houseStreetSitioPurok, barangay: row.barangay, municipality_city: row.municipalityCity, province: row.province, learning_modality: row.learningModality,
    }))).select("id, student_id");
    if (insertError) throw insertError;
    const idByLrn = new Map((created ?? []).map(student => [student.student_id, student.id]));
    const contacts = normalizedRows.flatMap(row => {
      const student_db_id = idByLrn.get(row.lrn); if (!student_db_id) return [];
      return ([ ["Father", row.father, null], ["Mother", row.mother, null], ["Guardian", row.guardian, row.guardian.relationship] ] as const)
        .filter(([, name]) => name.firstName || name.middleName || name.lastName)
        .map(([role, name, relationship]) => ({ student_db_id, role, first_name: name.firstName, middle_name: name.middleName, last_name: name.lastName, suffix: name.suffix, relationship, contact_number: row.contactNumber }));
    });
    if (contacts.length) { const { error } = await supabase.from("student_family_members").insert(contacts); if (error) throw error; }

    for (const link of selectedParentLinks) {
      await ensureParentStudentLink({
        parentId: link.parentId,
        studentId: link.lrn,
        relationship: link.relationship,
      });
    }

    // Parent/student masterlists may include the school-verified email and a
    // declared account-holder role. Only then can an adviser safely provision
    // a pending account. Standard SF1 imports have no email and deliberately
    // remain pending for ICT rather than letting a public request invent one.
    const parentProvisioning = normalizedRows.flatMap((row) => {
      const studentId = idByLrn.get(row.lrn);
      if (!studentId || !row.parentEmail || normalizeParentPhone(row.contactNumber).length !== 11) return [];

      const adults = [
        { role: "Father" as const, name: row.father },
        { role: "Mother" as const, name: row.mother },
        { role: "Guardian" as const, name: row.guardian },
      ].filter((adult) => adult.name.firstName && adult.name.lastName);
      const selected = row.parentRole
        ? adults.find((adult) => adult.role === row.parentRole)
        : adults.length === 1 ? adults[0] : undefined;
      if (!selected) return [];

      return [provisionParentForStudent({
        studentId: row.lrn,
        firstName: selected.name.firstName ?? "",
        middleName: selected.name.middleName,
        lastName: selected.name.lastName ?? "",
        suffix: selected.name.suffix,
        relationship: selected.role,
        email: row.parentEmail,
        contactNumber: row.contactNumber ?? "",
        address: row.houseStreetSitioPurok,
      })];
    });
    const provisionedParents = await Promise.all(parentProvisioning);
    // A new SF1 import can complete an existing parent's sibling match.
    // Reconciliation only adds missing, unambiguous links; it never removes a
    // staff-created link or includes an archived account/student.
    await Promise.all((created ?? []).map((student) => reconcileParentStudentLinks({ studentDbId: student.id })));
    await logAudit({ action: "Students Imported", performedById: adviser.id, performedBy: `${adviser.first_name} ${adviser.last_name}`, performedByRole: "Adviser", targetUser: `${created?.length ?? 0} students`, targetRole: "Student", targetType: "Student Import", targetId: section, relatedStudentId: (created ?? []).map(student => student.student_id).join(","), newStatus: "Imported", module: "Students", details: `Imported ${created?.length ?? 0} student record(s) from SF1 into ${adviser.grade} ${section}.` });
    await Promise.all([
      publishStudentsRealtimeInvalidation((created ?? []).map((student) => ({ studentDbId: Number(student.id) }))),
      // Provisioning may have created or linked a Parent account. Refresh the
      // protected ICT account list and the affected account(s), never the
      // imported roster itself through an account event.
      provisionedParents.length
        ? publishAccountRealtimeInvalidation(
            provisionedParents
              .map((parent) => Number(parent.parentId))
              .filter((id) => Number.isSafeInteger(id) && id > 0)
              .map((id) => ({ role: "parent" as const, id })),
          )
        : Promise.resolve(),
    ]);
    return NextResponse.json({ success: true, count: created?.length ?? 0, provisionedParents: provisionedParents.length });
  } catch (error) { return NextResponse.json({ success: false, message: error instanceof Error ? error.message : "Import failed. Ensure the SF1 migration has been run." }, { status: 500 }); }
}
