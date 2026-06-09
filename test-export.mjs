/**
 * test-export.mjs
 * 
 * Runs the whole templating pipeline against the real template file and
 * writes the test output to test-sf2-output.xlsx so it can be opened
 * in Excel/LibreOffice for visual verification.
 *
 * Usage:  node test-export.mjs
 */

import ExcelJS from "exceljs";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ─── Inline copies of the helpers (mirrors sf2Utils.ts logic) ────────────

const MONTHS = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];

const SF2_WEEK_DOW_COL = [
  [ 5,  7,  8,  9, 10],
  [11, 13, 14, 15, 16],
  [17, 19, 20, 21, 23],
  [25, 27, 28, 29, 30],
  [31, 32, 34, 35, 36],
];

const ALL_DAY_COLS = [
   5,  6,  7,  8,  9, 10,
  11, 12, 13, 14, 15, 16,
  17, 18, 19, 20, 21, 22, 23, 24,
  25, 26, 27, 28, 29, 30,
  31, 32, 33, 34, 35, 36, 37,
];

function isoWeekNum(date) {
  const tmp = new Date(date.valueOf());
  tmp.setDate(tmp.getDate() + 4 - (tmp.getDay() || 7));
  const ys = new Date(tmp.getFullYear(), 0, 1);
  return Math.ceil(((tmp.getTime() - ys.getTime()) / 86400000 + 1) / 7);
}

function buildDayColMap(month, year) {
  const monthIdx    = MONTHS.indexOf(month);
  const daysInMonth = new Date(year, monthIdx + 1, 0).getDate();
  const map         = new Map();
  const seenWeeks   = [];

  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(year, monthIdx, d);
    const dow  = date.getDay();
    if (dow === 0 || dow === 6) continue;

    const wk = isoWeekNum(date);
    if (!seenWeeks.includes(wk)) seenWeeks.push(wk);
    const weekIdx = seenWeeks.indexOf(wk);
    const dowIdx  = dow - 1;

    if (weekIdx < 5 && dowIdx < 5) {
      map.set(d, SF2_WEEK_DOW_COL[weekIdx][dowIdx]);
    }
  }
  return map;
}

function getSchoolDays(month, year) {
  const monthIdx    = MONTHS.indexOf(month);
  const daysInMonth = new Date(year, monthIdx + 1, 0).getDate();
  const days = [];
  for (let d = 1; d <= daysInMonth; d++) {
    const dow = new Date(year, monthIdx, d).getDay();
    if (dow !== 0 && dow !== 6) days.push(d);
  }
  return days;
}

function col0ToRef(col0, row) {
  const letter = (c) =>
    c < 26
      ? String.fromCharCode(65 + c)
      : String.fromCharCode(65 + Math.floor((c - 26) / 26)) +
        String.fromCharCode(65 + ((c - 26) % 26));
  return letter(col0) + row;
}

function schoolYearStart(month, year) {
  const monthIdx = MONTHS.indexOf(month);
  return monthIdx < 7 ? year - 1 : year;
}

// ─── Test data ─────────────────────────────────────────────────────────────

const EXPORT_MONTH = "April";
const EXPORT_YEAR  = 2026;

const schoolDays = getSchoolDays(EXPORT_MONTH, EXPORT_YEAR).length;
console.log(`Month: ${EXPORT_MONTH} ${EXPORT_YEAR}`);
console.log(`School days: ${schoolDays}`);

const dayColMap = buildDayColMap(EXPORT_MONTH, EXPORT_YEAR);
console.log(`Day→col mappings: ${dayColMap.size}`);
dayColMap.forEach((col0, day) => {
  const dow = new Date(EXPORT_YEAR, MONTHS.indexOf(EXPORT_MONTH), day).getDay();
  const dows = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][dow];
  console.log(`  April ${day} (${dows}) → col ${col0} (${col0ToRef(col0, 6)})`);
});

// Fake students
const makeStudents = (count, gender, absentDays) =>
  Array.from({ length: count }, (_, i) => ({
    name: `${gender === "M" ? "DELA CRUZ" : "SANTOS"}, Student ${String(i + 1).padStart(2, "0")} M.`,
    gender,
    absent: absentDays[i] ? absentDays[i].length : 0,
    dailyAbsences: absentDays[i]
      ? Object.fromEntries(absentDays[i].map(d => [d, true]))
      : {},
  }));

// M=15, F=12 students, a few with absences
const maleAbsences  = [null, [8], null, [14,15], null, null, [8,9,10], null, null, null, null, null, null, null, null];
const femaleAbsences = [null, [7], [14], null, null, null, null, null, null, null, null, null];

const section = {
  name: "MABINI",
  adviser: "Juan dela Cruz",
  students: [
    ...makeStudents(15, "M", maleAbsences),
    ...makeStudents(12, "F", femaleAbsences),
  ],
};

// ─── Run the templating ────────────────────────────────────────────────────

const templatePath = path.join(__dirname, "public", "SF2_2025_template-MARCH.xlsx");
const wb = new ExcelJS.Workbook();
await wb.xlsx.load(fs.readFileSync(templatePath));
const ws = wb.worksheets[0];

const wc  = (ref, val) => { ws.getCell(ref).value = val; };
const wcf = (ref, f, r = 0) => { ws.getCell(ref).value = { formula: f, result: r }; };
const clr = (ref) => { ws.getCell(ref).value = null; };

const maleStudents   = section.students.filter(s => s.gender === "M");
const femaleStudents = section.students.filter(s => s.gender === "F");
const monthIdx = MONTHS.indexOf(EXPORT_MONTH);
const DOW_MAP = { 1:"M", 2:"T", 3:"W", 4:"TH", 5:"F" };
const syStart = schoolYearStart(EXPORT_MONTH, EXPORT_YEAR);

// Header
wc("F3",  107966);
wc("M3",  `${syStart} - ${syStart + 1}`);
wc("AA3", EXPORT_MONTH.toUpperCase());
wc("F4",  "Santiago Elementary School");
wc("AA4", "Grade 4");
wc("AM4", section.name.toUpperCase());

// Day columns
ALL_DAY_COLS.forEach(c => { clr(col0ToRef(c, 6)); clr(col0ToRef(c, 7)); });
dayColMap.forEach((col0, day) => {
  const dow = new Date(EXPORT_YEAR, monthIdx, day).getDay();
  wc(col0ToRef(col0, 6), day);
  wc(col0ToRef(col0, 7), DOW_MAP[dow] ?? "");
});

// Helper for a gender group
const MALE_START   = 8,  MALE_TOTAL   = 29, MAX_MALE   = 21;
const FEMALE_START = 30, FEMALE_TOTAL = 47, MAX_FEMALE = 17;
const COMBINED     = 48;

function fillRows(students, startRow, maxRows, totalRow) {
  students.forEach((st, idx) => {
    const row = startRow + idx;
    wc(`A${row}`, idx + 1);
    wc(`C${row}`, st.name);
    wc(`AM${row}`, st.absent);
    wcf(`AO${row}`, `${schoolDays}-AM${row}`, schoolDays - st.absent);
    ALL_DAY_COLS.forEach(c => clr(col0ToRef(c, row)));
    if (st.dailyAbsences) {
      dayColMap.forEach((col0, day) => {
        if (st.dailyAbsences[day]) wc(col0ToRef(col0, row), "X");
      });
    }
  });
  for (let idx = students.length; idx < maxRows; idx++) {
    const row = startRow + idx;
    clr(`A${row}`); clr(`C${row}`); clr(`AM${row}`); clr(`AO${row}`);
    ALL_DAY_COLS.forEach(c => clr(col0ToRef(c, row)));
  }
  wc(`A${totalRow}`, students.length);
  wcf(`AM${totalRow}`, `SUM(AM${startRow}:AN${totalRow - 1})`);
  wcf(`AO${totalRow}`, `SUM(AO${startRow}:AP${totalRow - 1})`);
  ALL_DAY_COLS.forEach(c => clr(col0ToRef(c, totalRow)));
  const lastRow = startRow + maxRows - 1;
  dayColMap.forEach(col0 => {
    if (students.length > 0)
      wcf(col0ToRef(col0, totalRow), `COUNTA(${col0ToRef(col0, startRow)}:${col0ToRef(col0, lastRow)})`);
  });
}

fillRows(maleStudents,   MALE_START,   MAX_MALE,   MALE_TOTAL);
fillRows(femaleStudents, FEMALE_START, MAX_FEMALE, FEMALE_TOTAL);

// Combined row
wcf(`A${COMBINED}`,  `A${FEMALE_TOTAL}+A${MALE_TOTAL}`);
wcf(`AM${COMBINED}`, `AM${MALE_TOTAL}+AM${FEMALE_TOTAL}`);
wcf(`AO${COMBINED}`, `AO${MALE_TOTAL}+AO${FEMALE_TOTAL}`);
ALL_DAY_COLS.forEach(c => clr(col0ToRef(c, COMBINED)));
dayColMap.forEach(col0 => {
  const m = col0ToRef(col0, MALE_TOTAL);
  const f = col0ToRef(col0, FEMALE_TOTAL);
  wcf(col0ToRef(col0, COMBINED), `${m}+${f}`);
});

// Summary
wc("AM49", `Month : ${EXPORT_MONTH.toUpperCase()}`);
wc("AP49", `No. of Days of Classes: ${schoolDays}`);
wc("AR51", maleStudents.length);
wc("AS51", femaleStudents.length);
wc("AT51", section.students.length);
wc("AR57", maleStudents.length);
wc("AS57", femaleStudents.length);
wcf("AR61", `AO${MALE_TOTAL}/${schoolDays}`);
wcf("AS61", `AO${FEMALE_TOTAL}/${schoolDays}`);
wcf("AT61", `AO${COMBINED}/${schoolDays}`);

// Save
const outPath = path.join(__dirname, "test-sf2-output.xlsx");
await wb.xlsx.writeFile(outPath);
console.log(`\n✓ Written to: ${outPath}`);
console.log("  Open in Excel to verify the layout is correct.");
