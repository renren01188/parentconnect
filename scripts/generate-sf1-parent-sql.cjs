/*
 * Generates a one-time Supabase SQL Editor import from an SF1 workbook.
 * The source spreadsheet and generated SQL contain personal data; keep both
 * outside version control. This script never connects to Supabase itself.
 *
 * Example:
 * node scripts/generate-sf1-parent-sql.cjs \
 *   --input "C:\\path\\SF1.xls" \
 *   --grade "Grade 1" --section "Silver" --session "Afternoon" \
 *   --password "password" --output ".local-imports\\grade-1-silver.sql"
 */

const fs = require("fs");
const path = require("path");
const XLSX = require("xlsx");

function usage(message) {
  if (message) process.stderr.write(`Error: ${message}\n\n`);
  process.stderr.write("Usage: node scripts/generate-sf1-parent-sql.cjs --input <SF1.xls> --grade <grade> --section <section> --session <Morning|Afternoon> --password <initial-password> [--output <file>]\n");
  process.exit(1);
}

function argumentsByName(argv) {
  const values = {};
  for (let index = 2; index < argv.length; index += 1) {
    const key = argv[index];
    if (!key.startsWith("--")) usage(`Unexpected argument: ${key}`);
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) usage(`Missing value for ${key}`);
    values[key.slice(2)] = value;
    index += 1;
  }
  return values;
}

function text(value) {
  const cleaned = String(value ?? "")
    .trim()
    .replace(/^[\s"']+|[\s"']+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned || null;
}

function normalizedHeader(value) {
  return String(value ?? "").toLowerCase().replace(/[^a-z]/g, "");
}

const suffixPattern = /^(?:JR\.?|SR\.?|II|III|IV|V|VI|VII|VIII|IX|X)$/i;

function parseSf1Name(value) {
  const parts = String(value ?? "")
    .replace(/\uFF0C/g, ",")
    .split(",")
    .map(text)
    .filter(Boolean);
  let suffix = null;
  if (suffixPattern.test(parts.at(-1) ?? "")) suffix = parts.pop().replace(/^[,\s]+|[,\s]+$/g, "");
  return {
    lastName: text(parts[0]),
    firstName: text(parts[1]),
    middleName: text(parts.slice(2).join(" ").replace(/[,]+/g, " ")),
    suffix,
  };
}

function dateValue(value) {
  if (typeof value === "number") {
    const parsed = XLSX.SSF.parse_date_code(value);
    return parsed ? `${parsed.y}-${String(parsed.m).padStart(2, "0")}-${String(parsed.d).padStart(2, "0")}` : null;
  }
  if (value instanceof Date && !Number.isNaN(value.valueOf())) return value.toISOString().slice(0, 10);
  const raw = text(value);
  if (!raw) return null;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.valueOf()) ? raw : parsed.toISOString().slice(0, 10);
}

function findColumn(sheet, range, names) {
  for (let row = 0; row <= range.e.r; row += 1) {
    for (let column = 0; column <= range.e.c; column += 1) {
      const label = normalizedHeader(sheet[XLSX.utils.encode_cell({ r: row, c: column })]?.v);
      if (names.includes(label)) return column;
    }
  }
  return null;
}

function readRows(inputPath) {
  const workbook = XLSX.readFile(inputPath, { cellDates: true });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) usage("The workbook has no worksheet.");
  const range = XLSX.utils.decode_range(sheet["!ref"] || "A1");
  const cell = (row, column) => sheet[XLSX.utils.encode_cell({ r: row, c: column })]?.v;
  const value = (row, column) => String(cell(row, column) ?? "").trim();
  const emailColumn = findColumn(sheet, range, ["activeemail", "parentemail", "guardianemail", "parentguardianemail"]);

  const rows = [];
  for (let row = 6; row <= range.e.r; row += 1) {
    const lrn = value(row, 0).replace(/\.0$/, "");
    if (!/^\d{12}$/.test(lrn)) continue;
    const student = parseSf1Name(value(row, 2));
    const father = parseSf1Name(value(row, 27));
    const mother = parseSf1Name(value(row, 31));
    const guardian = parseSf1Name(value(row, 36));
    const rawAge = value(row, 9);
    rows.push({
      lrn,
      student,
      gender: value(row, 6).toUpperCase(),
      birthDate: dateValue(cell(row, 7)),
      age: rawAge && Number.isFinite(Number(rawAge)) ? Number(rawAge) : null,
      motherTongue: text(value(row, 11)),
      ipEthnicGroup: text(value(row, 13)),
      religion: text(value(row, 14)),
      houseStreetSitioPurok: text(value(row, 15)),
      barangay: text(value(row, 17)),
      municipalityCity: text(value(row, 20)),
      province: text(value(row, 22)),
      learningModality: text(value(row, 43)),
      family: [
        { role: "Father", ...father, relationship: "Father" },
        { role: "Mother", ...mother, relationship: "Mother" },
        { role: "Guardian", ...guardian, relationship: text(value(row, 40)) || "Guardian" },
      ].filter((member) => member.firstName && member.lastName),
      accountContactNumber: value(row, 41).replace(/\D/g, ""),
      accountEmail: emailColumn === null ? null : text(value(row, emailColumn))?.toLowerCase() ?? null,
    });
  }

  if (!rows.length) usage("No rows with a 12-digit LRN were found.");
  const errors = [];
  const lrns = new Set();
  const contactEmails = new Map();
  const emailContacts = new Map();
  for (const row of rows) {
    if (lrns.has(row.lrn)) errors.push(`Duplicate LRN ${row.lrn}.`);
    lrns.add(row.lrn);
    if (!row.student.firstName || !row.student.lastName) errors.push(`${row.lrn}: Student name is incomplete.`);
    if (!row.family.length) errors.push(`${row.lrn}: No complete Father, Mother, or Guardian name was found.`);
    if (!/^[MF]$/.test(row.gender)) errors.push(`${row.lrn}: Gender must be M or F.`);
    const hasValidEmail = row.accountEmail === null || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.accountEmail);
    const hasValidContact = row.accountContactNumber.length === 11;
    if (!hasValidEmail) errors.push(`${row.lrn}: ActiveEmail is invalid.`);
    if (!hasValidContact) errors.push(`${row.lrn}: Parent contact number must have 11 digits.`);

    if (hasValidContact && hasValidEmail && row.accountEmail) {
      const existingEmailForContact = contactEmails.get(row.accountContactNumber);
      if (existingEmailForContact && existingEmailForContact !== row.accountEmail) {
        errors.push(`${row.lrn}: Contact number ${row.accountContactNumber} is assigned to more than one ActiveEmail.`);
      } else {
        contactEmails.set(row.accountContactNumber, row.accountEmail);
      }

      const existingContactForEmail = emailContacts.get(row.accountEmail);
      if (existingContactForEmail && existingContactForEmail !== row.accountContactNumber) {
        errors.push(`${row.lrn}: ActiveEmail ${row.accountEmail} is assigned to more than one contact number.`);
      } else {
        emailContacts.set(row.accountEmail, row.accountContactNumber);
      }
    }
  }
  if (errors.length) usage(`The SF1 cannot be imported:\n- ${errors.join("\n- ")}`);
  return rows;
}

function createSql({ rows, grade, section, session, password, sourceName }) {
  const safeDelimiter = "$pc_sf1_import$";
  const payload = JSON.stringify(rows);
  if (payload.includes(safeDelimiter) || password.includes(safeDelimiter)) usage("Unexpected SQL delimiter in source data.");
  const quoted = (value) => value.replace(/'/g, "''");

  return `-- Generated from ${sourceName}. This file contains personal data and an initial password.
-- Run it as one complete script in the Supabase SQL Editor. It is atomic:
-- a validation failure rolls back every row.
-- Apply these migrations first, in this order:
-- 20261020140000_default_parent_attendance_notifications_to_sms.sql
-- 20261020150000_add_parent_account_owner_selection.sql
-- 20261020160000_add_parent_contact_number_login.sql
-- 20261020170000_require_bulk_parent_account_setup.sql
-- 20261020180000_allow_mobile_only_parent_accounts.sql
-- Parent accounts are active immediately, but stay unassigned until the first
-- mobile-number or email sign-in selects a verified Father, Mother, or
-- Guardian role.

BEGIN;

DO $$
DECLARE
  v_rows jsonb := ${safeDelimiter}${payload}${safeDelimiter}::jsonb;
  v_grade text := '${quoted(grade)}';
  v_section text := '${quoted(section)}';
  v_session text := '${quoted(session)}';
  v_initial_password text := '${quoted(password)}';
  v_row jsonb;
  v_lrn text;
  v_student_first_name text;
  v_student_middle_name text;
  v_student_last_name text;
  v_student_suffix text;
  v_gender text;
  v_parent_email text;
  v_parent_contact_number text;
  v_family_member jsonb;
  v_family_role text;
  v_family_first_name text;
  v_family_middle_name text;
  v_family_last_name text;
  v_family_suffix text;
  v_family_relationship text;
  v_student public.students%ROWTYPE;
  v_parent public.parents%ROWTYPE;
  v_parent_id integer;
  v_parent_matches integer;
  v_email_matches integer;
BEGIN
  IF coalesce(btrim(v_initial_password), '') = '' THEN
    RAISE EXCEPTION 'Initial password is required.';
  END IF;

  PERFORM 1
  FROM public.sections
  WHERE grade = v_grade
    AND name = v_section
    AND class_session = v_session;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Section % / % (%) does not exist.', v_grade, v_section, v_session;
  END IF;

  FOR v_row IN SELECT value FROM jsonb_array_elements(v_rows)
  LOOP
    v_lrn := btrim(v_row->>'lrn');
    v_student_first_name := btrim(v_row->'student'->>'firstName');
    v_student_middle_name := nullif(btrim(v_row->'student'->>'middleName'), '');
    v_student_last_name := btrim(v_row->'student'->>'lastName');
    v_student_suffix := nullif(btrim(v_row->'student'->>'suffix'), '');
    v_gender := upper(btrim(v_row->>'gender'));
    v_parent_email := nullif(lower(btrim(v_row->>'accountEmail')), '');
    v_parent_contact_number := regexp_replace(coalesce(v_row->>'accountContactNumber', ''), '[^0-9]', '', 'g');

    IF v_lrn !~ '^[0-9]{12}$'
      OR v_student_first_name = '' OR v_student_last_name = ''
      OR v_gender NOT IN ('M', 'F')
      OR (v_parent_email IS NOT NULL AND v_parent_email !~ '^[^[:space:]@]+@[^[:space:]@]+\\.[^[:space:]@]+$')
      OR length(v_parent_contact_number) <> 11
      OR jsonb_array_length(coalesce(v_row->'family', '[]'::jsonb)) = 0 THEN
      RAISE EXCEPTION 'Invalid SF1 data for LRN %.', v_lrn;
    END IF;

    SELECT * INTO v_student
    FROM public.students
    WHERE student_id = v_lrn;

    IF FOUND THEN
      IF lower(btrim(coalesce(v_student.first_name, ''))) <> lower(v_student_first_name)
        OR lower(btrim(coalesce(v_student.last_name, ''))) <> lower(v_student_last_name)
        OR upper(btrim(coalesce(v_student.gender, ''))) <> v_gender
        OR v_student.grade IS DISTINCT FROM v_grade
        OR v_student.section IS DISTINCT FROM v_section THEN
        RAISE EXCEPTION 'Existing student % does not match this SF1 import.', v_lrn;
      END IF;
    ELSE
      INSERT INTO public.students (
        student_id, first_name, middle_name, last_name, suffix, gender,
        grade, section, class_session, birth_date, age, mother_tongue,
        ip_ethnic_group, religion, house_street_sitio_purok, barangay,
        municipality_city, province, learning_modality
      ) VALUES (
        v_lrn, v_student_first_name, v_student_middle_name, v_student_last_name, v_student_suffix, v_gender,
        v_grade, v_section, v_session,
        nullif(v_row->>'birthDate', '')::date, nullif(v_row->>'age', '')::integer,
        nullif(v_row->>'motherTongue', ''), nullif(v_row->>'ipEthnicGroup', ''),
        nullif(v_row->>'religion', ''), nullif(v_row->>'houseStreetSitioPurok', ''),
        nullif(v_row->>'barangay', ''), nullif(v_row->>'municipalityCity', ''),
        nullif(v_row->>'province', ''), nullif(v_row->>'learningModality', '')
      )
      RETURNING * INTO v_student;
    END IF;

    SELECT count(*)::integer, min(id)
    INTO v_parent_matches, v_parent_id
    FROM public.parents
    WHERE login_contact_number = public.normalize_parent_login_contact_number(v_parent_contact_number);

    IF v_parent_matches > 1 THEN
      RAISE EXCEPTION 'Contact number % already belongs to multiple Parent records.', v_parent_contact_number;
    END IF;

    IF v_parent_email IS NOT NULL THEN
      SELECT count(*)::integer
      INTO v_email_matches
      FROM public.parents
      WHERE lower(btrim(email)) = v_parent_email
        AND id IS DISTINCT FROM v_parent_id;
      IF v_email_matches > 0 THEN
        RAISE EXCEPTION 'ActiveEmail % already belongs to another Parent record.', v_parent_email;
      END IF;
    END IF;

    IF v_parent_matches = 1 THEN
      SELECT * INTO v_parent FROM public.parents WHERE id = v_parent_id;
      IF v_parent.archive_status = 'archived'
        OR v_parent.account_owner_role IS NOT NULL
        OR v_parent.relationship IS NOT NULL
        OR v_parent.parent_first_name IS DISTINCT FROM 'Parent'
        OR v_parent.parent_last_name IS DISTINCT FROM 'Account Owner'
        OR regexp_replace(coalesce(v_parent.contact_number, ''), '[^0-9]', '', 'g') <> v_parent_contact_number THEN
        RAISE EXCEPTION 'Contact number % belongs to an existing Parent account and cannot be replaced by this import.', v_parent_contact_number;
      END IF;

      IF v_parent.email IS NOT NULL AND v_parent_email IS NOT NULL
        AND lower(btrim(v_parent.email)) <> v_parent_email THEN
        RAISE EXCEPTION 'The existing Parent account for contact number % has a different email address.', v_parent_contact_number;
      END IF;

      IF v_parent.email IS NULL AND v_parent_email IS NOT NULL THEN
        UPDATE public.parents
        SET email = v_parent_email
        WHERE id = v_parent_id;
      END IF;

      -- A repeated run may complete a prior, unregistered placeholder record.
      IF lower(coalesce(v_parent.password_set::text, '0')) NOT IN ('1', 'true') THEN
        UPDATE public.parents
        SET password = extensions.crypt(v_initial_password, extensions.gen_salt('bf', 12)),
            password_set = 1,
            temp_password = NULL,
            temporary_password_expires_at = NULL,
            status = 'active',
            attendance_email_notifications = false,
            attendance_sms_notifications = true,
            attendance_notification_preference = 'SMS',
            requires_account_setup = true,
            account_setup_completed_at = NULL
        WHERE id = v_parent_id;
      END IF;
    ELSE
      INSERT INTO public.parents (
        student_id, parent_first_name, parent_middle_name, parent_last_name, parent_suffix,
        relationship, contact_number, email, password, temp_password,
        temporary_password_expires_at, password_set, status, archive_status,
        attendance_email_notifications, attendance_sms_notifications,
        attendance_notification_preference, account_owner_role,
        requires_account_setup, account_setup_completed_at
      ) VALUES (
        v_lrn, 'Parent', NULL, 'Account Owner', NULL,
        NULL, v_parent_contact_number, v_parent_email,
        extensions.crypt(v_initial_password, extensions.gen_salt('bf', 12)), NULL,
        NULL, 1, 'active', 'active', false, true, 'SMS', NULL,
        true, NULL
      )
      RETURNING id INTO v_parent_id;
    END IF;

    INSERT INTO public.parent_student_links (parent_id, student_id, relationship)
    VALUES (v_parent_id, v_lrn, NULL)
    ON CONFLICT (parent_id, student_id) DO NOTHING;

    FOR v_family_member IN SELECT value FROM jsonb_array_elements(v_row->'family')
    LOOP
      v_family_role := btrim(v_family_member->>'role');
      v_family_first_name := btrim(v_family_member->>'firstName');
      v_family_middle_name := nullif(btrim(v_family_member->>'middleName'), '');
      v_family_last_name := btrim(v_family_member->>'lastName');
      v_family_suffix := nullif(btrim(v_family_member->>'suffix'), '');
      v_family_relationship := nullif(btrim(v_family_member->>'relationship'), '');

      IF v_family_role NOT IN ('Father', 'Mother', 'Guardian')
        OR v_family_first_name = '' OR v_family_last_name = '' THEN
        RAISE EXCEPTION 'Invalid family record for LRN %.', v_lrn;
      END IF;

      INSERT INTO public.student_family_members (
        student_db_id, role, first_name, middle_name, last_name, suffix, relationship, contact_number
      )
      SELECT v_student.id, v_family_role, v_family_first_name, v_family_middle_name, v_family_last_name,
        v_family_suffix, coalesce(v_family_relationship, v_family_role), v_parent_contact_number
      WHERE NOT EXISTS (
        SELECT 1
        FROM public.student_family_members AS family_member
        WHERE family_member.student_db_id = v_student.id
          AND family_member.role = v_family_role
          AND lower(btrim(coalesce(family_member.first_name, ''))) = lower(v_family_first_name)
          AND lower(btrim(coalesce(family_member.last_name, ''))) = lower(v_family_last_name)
      );
    END LOOP;
  END LOOP;
END;
$$;

COMMIT;
`;
}

const options = argumentsByName(process.argv);
for (const key of ["input", "grade", "section", "session", "password"]) {
  if (!options[key]) usage(`--${key} is required.`);
}
if (!fs.existsSync(options.input)) usage(`Input workbook was not found: ${options.input}`);
if (!['Morning', 'Afternoon'].includes(options.session)) usage("--session must be Morning or Afternoon.");

const rows = readRows(options.input);
const sql = createSql({
  rows,
  grade: options.grade.trim(),
  section: options.section.trim(),
  session: options.session,
  password: options.password,
  sourceName: path.basename(options.input),
});

if (options.output) {
  const outputPath = path.resolve(options.output);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, sql, "utf8");
  process.stdout.write(`Generated ${rows.length} Parent/Student rows at ${outputPath}\n`);
} else {
  process.stdout.write(sql);
}
