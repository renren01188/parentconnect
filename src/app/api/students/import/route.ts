import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { supabase } from "@/lib/supabase";
import { getAdviserFromToken } from "@/lib/getAdviserFromToken";
import { cleanNamePart } from "@/lib/familyName";
import { reconcileParentStudentLinks } from "@/lib/reconcileParentStudentLinks";

type ImportRow = {
  lrn: string; firstName: string; middleName: string | null; lastName: string;
  sex: "M" | "F"; birthDate: string | null; age: number | null; motherTongue: string | null;
  ipEthnicGroup: string | null; religion: string | null; houseStreetSitioPurok: string | null;
  barangay: string | null; municipalityCity: string | null; province: string | null;
  father: Name; mother: Name; guardian: Name & { relationship: string | null };
  contactNumber: string | null; learningModality: string | null;
};
type Name = { firstName: string | null; middleName: string | null; lastName: string | null };

const text = (value: unknown) => String(value ?? "").trim() || null;
function cell(sheet: XLSX.WorkSheet, row: number, col: number) { return sheet[XLSX.utils.encode_cell({ r: row, c: col })]; }
function dateValue(value: unknown): string | null {
  if (typeof value === "number") { const d = XLSX.SSF.parse_date_code(value); return d ? `${d.y}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}` : null; }
  const raw = text(value); if (!raw) return null;
  const parsed = new Date(raw); return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
}
function splitName(value: unknown): Name {
  const parts = String(value ?? "").split(",").map(cleanNamePart);
  return {
    lastName: parts[0] ?? null,
    firstName: parts[1] ?? null,
    middleName: cleanNamePart(parts.slice(2).filter(Boolean).join(" ")),
  };
}
function parseSheet(buffer: ArrayBuffer) {
  const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) throw new Error("The workbook does not contain a worksheet.");
  const rows: ImportRow[] = [], errors: string[] = [];
  const range = XLSX.utils.decode_range(sheet["!ref"] || "A1");
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
    const studentName = splitName(cell(sheet, r, 2)?.v);
    const sex = (text(cell(sheet, r, 6)?.v) ?? "").toUpperCase();
    const rowLabel = text(cell(sheet, r, 2)?.v)?.toLowerCase() ?? "";
    if (rowLabel.includes("total") || rowLabel.includes("combined")) continue;
    if (!/^\d{12}$/.test(lrn)) { errors.push(`Row ${r + 1}: LRN must have 12 digits.`); continue; }
    if (!studentName.firstName || !studentName.lastName) { errors.push(`Row ${r + 1}: name must be Last Name, First Name, Middle Name.`); continue; }
    if (sex !== "M" && sex !== "F") { errors.push(`Row ${r + 1}: sex must be M or F.`); continue; }
    const guardian = splitName(cell(sheet, r, 36)?.v);
    rows.push({
      lrn, firstName: studentName.firstName, middleName: studentName.middleName, lastName: studentName.lastName, sex,
      birthDate: dateValue(cell(sheet, r, 7)?.v), age: Number.isFinite(Number(cell(sheet, r, 9)?.v)) ? Number(cell(sheet, r, 9)?.v) : null, motherTongue: text(cell(sheet, r, 11)?.v), ipEthnicGroup: text(cell(sheet, r, 13)?.v), religion: text(cell(sheet, r, 14)?.v),
      houseStreetSitioPurok: text(cell(sheet, r, 15)?.v), barangay: text(cell(sheet, r, 17)?.v), municipalityCity: text(cell(sheet, r, 20)?.v), province: text(cell(sheet, r, 22)?.v),
      father: splitName(cell(sheet, r, 27)?.v), mother: splitName(cell(sheet, r, 31)?.v), guardian: { ...guardian, relationship: text(cell(sheet, r, 40)?.v) },
      contactNumber: text(cell(sheet, r, 41)?.v), learningModality: text(cell(sheet, r, 43)?.v),
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
    return NextResponse.json({ success: true, ...result, existingLrns });
  } catch (error) { return NextResponse.json({ success: false, message: error instanceof Error ? error.message : "Could not analyze the file." }, { status: 500 }); }
}

export async function PUT(request: NextRequest) {
  const adviser = await getAdviserFromToken();
  if (!adviser?.grade) return NextResponse.json({ success: false, message: "Unauthorized." }, { status: 401 });
  try {
    const { rows, section } = await request.json() as { rows: ImportRow[]; section: string };
    if (!adviser.sections.includes(section) || !Array.isArray(rows) || rows.length === 0) return NextResponse.json({ success: false, message: "Invalid import request." }, { status: 400 });
    const lrns = rows.map(row => row.lrn);
    if (new Set(lrns).size !== lrns.length) return NextResponse.json({ success: false, message: "The preview contains duplicate LRNs." }, { status: 400 });
    const { data: existing } = await supabase.from("students").select("student_id").in("student_id", lrns);
    if (existing?.length) return NextResponse.json({ success: false, message: `These LRNs already exist: ${existing.map(s => s.student_id).join(", ")}.` }, { status: 409 });
    const { data: created, error: insertError } = await supabase.from("students").insert(rows.map(row => ({
      student_id: row.lrn, first_name: row.firstName, middle_name: row.middleName, last_name: row.lastName, gender: row.sex, grade: adviser.grade, section,
      class_session: "Morning", birth_date: row.birthDate, age: row.age, mother_tongue: row.motherTongue, ip_ethnic_group: row.ipEthnicGroup, religion: row.religion,
      house_street_sitio_purok: row.houseStreetSitioPurok, barangay: row.barangay, municipality_city: row.municipalityCity, province: row.province, learning_modality: row.learningModality,
    }))).select("id, student_id");
    if (insertError) throw insertError;
    const idByLrn = new Map((created ?? []).map(student => [student.student_id, student.id]));
    const contacts = rows.flatMap(row => {
      const student_db_id = idByLrn.get(row.lrn); if (!student_db_id) return [];
      return ([ ["Father", row.father, null], ["Mother", row.mother, null], ["Guardian", row.guardian, row.guardian.relationship] ] as const)
        .filter(([, name]) => name.firstName || name.middleName || name.lastName)
        .map(([role, name, relationship]) => ({ student_db_id, role, first_name: name.firstName, middle_name: name.middleName, last_name: name.lastName, relationship, contact_number: row.contactNumber }));
    });
    if (contacts.length) { const { error } = await supabase.from("student_family_members").insert(contacts); if (error) throw error; }
    // A new SF1 import can complete an existing parent's sibling match.
    // Reconciliation only adds missing links; it never removes a staff-created link.
    await Promise.all((created ?? []).map((student) => reconcileParentStudentLinks({ studentDbId: student.id })));
    return NextResponse.json({ success: true, count: created?.length ?? 0 });
  } catch (error) { return NextResponse.json({ success: false, message: error instanceof Error ? error.message : "Import failed. Ensure the SF1 migration has been run." }, { status: 500 }); }
}
