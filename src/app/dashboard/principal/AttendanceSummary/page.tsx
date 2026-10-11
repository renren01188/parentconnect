"use client";

import { useState, useEffect } from "react";
import type ExcelJS from "exceljs";
import PrincipalAttendanceSummaryGuide from "../components/PrincipalAttendanceSummaryGuide";


// ─── Color Palette ────────────────────────────────────────────────
const PRIMARY = "#522081";
const PRIMARY_LIGHT = "#6b2fa0";
const ACCENT = "#8b5cf6";
const WHITE = "#ffffff";
const GRAY_50 = "#fafafa";
const GRAY_100 = "#f3f4f6";
const GRAY_200 = "#e5e7eb";
const GRAY_400 = "#9ca3af";
const GRAY_600 = "#4b5563";
const GRAY_800 = "#1f2937";
const SUCCESS_GREEN = "#10b981";
const URGENT_RED = "#ef4444";
const WARNING_AMBER = "#f59e0b";

// ─── Types ────────────────────────────────────────────────────────
interface StudentRecord {
  id: number;
  student_id: string;
  name: string;
  gender: string | null;
  present: number;
  absent: number;
  late: number;
  excused: number;
  dailyAbsences?: Record<number, boolean>;
  dailyExcused?: Record<number, boolean>;
  active_from: string;
}

interface Section {
  id: string;
  name: string;
  adviser: string;
  students: StudentRecord[];
}

interface GradeLevel {
  grade: string;
  label: string;
  sections: Section[];
}

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

// ─── Holiday helpers ──────────────────────────────────────────────
function getWeekdayDatesOfMonth(month: string, year: number): string[] {
  const monthIdx = MONTHS.indexOf(month);
  if (monthIdx < 0) return [];
  const daysInMonth = new Date(year, monthIdx + 1, 0).getDate();
  const dates: string[] = [];
  for (let d = 1; d <= daysInMonth; d++) {
    const dow = new Date(year, monthIdx, d).getDay();
    if (dow !== 0 && dow !== 6) {
      dates.push(`${year}-${String(monthIdx + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`);
    }
  }
  return dates;
}

function formatDateLabel(dateStr: string) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", {
    month: "long", day: "numeric", year: "numeric",
  });
}

// ─── Template-matching SF2 XLSX Export ────────────────────────────
const SF2_DAY_SLOTS: [number, number | null][] = [
  [5, 6], [7, null], [8, null], [9, null], [10, null],
  [11, 12], [13, null], [14, null], [15, null], [16, null],
  [17, 18], [19, null], [20, null], [21, 22], [23, 24],
  [25, 26], [27, null], [28, null], [29, null], [30, null],
  [31, null], [32, 33], [34, null], [35, null], [36, 37],
];

const MALE_START_ROW = 8;
const MALE_TOTAL_ROW = 29;
const FEMALE_START_ROW = 30;
const FEMALE_TOTAL_ROW = 47;
const COMBINED_ROW = 48;
const MAX_MALE_ROWS = 21;
const MAX_FEMALE_ROWS = 17;

function getSchoolDaysOfMonth(m: string, y: number): number[] {
  const monthIdx = MONTHS.indexOf(m);
  if (monthIdx < 0) return [];
  const daysInMonth = new Date(y, monthIdx + 1, 0).getDate();
  const days: number[] = [];
  for (let d = 1; d <= daysInMonth; d++) {
    const dow = new Date(y, monthIdx, d).getDay();
    if (dow !== 0 && dow !== 6) days.push(d);
  }
  return days;
}

type SchoolDayPlacement = {
  day: number;
  slotIdx: number;
  dowLabel: "M" | "T" | "W" | "TH" | "F";
};

function getSchoolDayPlacements(month: string, year: number): SchoolDayPlacement[] {
  const monthIdx = MONTHS.indexOf(month);
  if (monthIdx < 0) return [];
  const daysInMonth = new Date(year, monthIdx + 1, 0).getDate();
  const firstJsDay = new Date(year, monthIdx, 1).getDay();
  const firstMondayBased = firstJsDay === 0 ? 6 : firstJsDay - 1;
  const DOW_LABELS: Record<number, "M" | "T" | "W" | "TH" | "F"> = {
    1: "M", 2: "T", 3: "W", 4: "TH", 5: "F",
  };
  const placements: SchoolDayPlacement[] = [];
  for (let day = 1; day <= daysInMonth; day++) {
    const jsDow = new Date(year, monthIdx, day).getDay();
    if (jsDow === 0 || jsDow === 6) continue;
    const mondayBasedDow = jsDow - 1;
    const weekIndex = Math.floor((firstMondayBased + (day - 1)) / 7);
    const slotIdx = weekIndex * 5 + mondayBasedDow;
    if (slotIdx >= 0 && slotIdx < SF2_DAY_SLOTS.length) {
      placements.push({ day, slotIdx, dowLabel: DOW_LABELS[jsDow] });
    }
  }
  return placements;
}

function col0ToRef(col0: number, row: number): string {
  const colLetter = (c: number): string => {
    if (c < 26) return String.fromCharCode(65 + c);
    return String.fromCharCode(64 + Math.floor(c / 26)) + String.fromCharCode(65 + (c % 26));
  };
  return colLetter(col0) + row;
}

function downloadArrayBuffer(buffer: ArrayBuffer, filename: string) {
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

type ExcelJSRuntime = { Workbook: new () => ExcelJS.Workbook };

async function loadTemplateWorkbook(exceljs: ExcelJSRuntime): Promise<ExcelJS.Workbook> {
  const templateResp = await fetch("/SF2_2025_newtemplate.xlsx");
  if (!templateResp.ok) throw new Error("Failed to load SF2 template workbook.");
  const templateBuf = await templateResp.arrayBuffer();
  const workbook = new exceljs.Workbook();
  await workbook.xlsx.load(templateBuf);
  return workbook;
}

function getTemplateWorksheet(workbook: ExcelJS.Workbook): ExcelJS.Worksheet {
  const worksheet = workbook.worksheets[0];
  if (!worksheet) throw new Error("Template worksheet not found.");
  return worksheet;
}

function setCellValue(ws: ExcelJS.Worksheet, ref: string, value: string | number | null) {
  ws.getCell(ref).value = value;
}

function escapePrintHtml(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]!);
}

function toManilaDateString(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;
  return `${year}-${month}-${day}`;
}

function setSf2DateHeader(ws: ExcelJS.Worksheet, col0: number, day: number) {
  const cell = ws.getCell(col0ToRef(col0, 6));
  cell.value = String(day);
  cell.numFmt = "@";
  cell.alignment = {
    ...cell.alignment,
    horizontal: "center",
    vertical: "top",
    wrapText: false,
    shrinkToFit: true,
  };
}

function setCellFormula(ws: ExcelJS.Worksheet, ref: string, formula: string, result: number = 0) {
  ws.getCell(ref).value = { formula, result };
}

function clearCellPreserveFormat(ws: ExcelJS.Worksheet, ref: string) {
  ws.getCell(ref).value = null;
}

function copyWorksheetToWorkbook(
  source: ExcelJS.Worksheet,
  targetWorkbook: ExcelJS.Workbook,
  targetName: string
): ExcelJS.Worksheet {
  const target = targetWorkbook.addWorksheet(targetName, {
    properties: { ...source.properties },
    views: source.views ? [...source.views] : undefined,
    pageSetup: { ...source.pageSetup },
    headerFooter: { ...source.headerFooter },
    state: source.state,
  });
  source.columns?.forEach((col, idx) => {
    const targetCol = target.getColumn(idx + 1);
    if (typeof col.width === "number") targetCol.width = col.width;
    targetCol.hidden = !!col.hidden;
    targetCol.outlineLevel = typeof col.outlineLevel === "number" ? col.outlineLevel : 0;
    targetCol.style = { ...(col.style || {}) };
  });
  source.eachRow({ includeEmpty: true }, (row, rowNumber) => {
    const targetRow = target.getRow(rowNumber);
    if (typeof row.height === "number") targetRow.height = row.height;
    targetRow.hidden = !!row.hidden;
    targetRow.outlineLevel = typeof row.outlineLevel === "number" ? row.outlineLevel : 0;
    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      const targetCell = targetRow.getCell(colNumber);
      targetCell.value = cell.value as ExcelJS.CellValue;
      if (cell.style) targetCell.style = JSON.parse(JSON.stringify(cell.style));
      if (cell.numFmt) targetCell.numFmt = cell.numFmt;
      if (cell.alignment) targetCell.alignment = { ...cell.alignment };
      if (cell.font) targetCell.font = { ...cell.font };
      if (cell.fill) targetCell.fill = JSON.parse(JSON.stringify(cell.fill));
      if (cell.border) targetCell.border = JSON.parse(JSON.stringify(cell.border));
      if (cell.protection) targetCell.protection = { ...cell.protection };
    });
    targetRow.commit();
  });
  const worksheetModel = source.model as { merges?: string[] } | undefined;
  const merges = Array.isArray(worksheetModel?.merges) ? worksheetModel.merges : [];
  merges.forEach((mergeRef) => target.mergeCells(mergeRef));
  return target;
}

type MergeRange = { top: number; left: number; bottom: number; right: number };

function getMergeRanges(ws: ExcelJS.Worksheet): MergeRange[] {
  const merges = (ws as unknown as { _merges?: Record<string, MergeRange> })._merges ?? {};
  return Object.values(merges).map(({ top, left, bottom, right }) => ({ top, left, bottom, right }));
}

function copyWorksheetWithDynamicAttendanceRows(
  workbook: ExcelJS.Workbook,
  templateWs: ExcelJS.Worksheet,
  maleStudentCount: number,
  femaleStudentCount: number,
) {
  const maleDelta = maleStudentCount - MAX_MALE_ROWS;
  const femaleDelta = femaleStudentCount - MAX_FEMALE_ROWS;
  if (maleDelta === 0 && femaleDelta === 0) return templateWs;

  const maleTotalRow = MALE_START_ROW + maleStudentCount;
  const femaleStartRow = maleTotalRow + 1;
  const femaleTotalRow = femaleStartRow + femaleStudentCount;
  const combinedRow = femaleTotalRow + 1;
  const totalDelta = maleDelta + femaleDelta;
  const originalName = templateWs.name;
  const expanded = workbook.addWorksheet(`${originalName} Expanded`);
  expanded.properties = { ...templateWs.properties };
  expanded.pageSetup = { ...templateWs.pageSetup };
  expanded.views = templateWs.views.map((view) => ({ ...view }));

  for (let col = 1; col <= templateWs.columnCount; col++) {
    const source = templateWs.getColumn(col);
    const target = expanded.getColumn(col);
    target.width = source.width;
    target.hidden = source.hidden;
    target.outlineLevel = source.outlineLevel;
    target.style = source.style;
  }

  const mapRow = (row: number): number | null => {
    if (row < MALE_START_ROW) return row;
    if (row < MALE_TOTAL_ROW) return row - MALE_START_ROW < maleStudentCount ? row : null;
    if (row === MALE_TOTAL_ROW) return maleTotalRow;
    if (row < FEMALE_TOTAL_ROW) {
      const index = row - FEMALE_START_ROW;
      return index < femaleStudentCount ? femaleStartRow + index : null;
    }
    if (row === FEMALE_TOTAL_ROW) return femaleTotalRow;
    if (row === COMBINED_ROW) return combinedRow;
    return row + totalDelta;
  };

  for (let row = 1; row <= templateWs.rowCount; row++) {
    const targetRowNumber = mapRow(row);
    if (targetRowNumber === null) continue;
    const sourceRow = templateWs.getRow(row);
    const targetRow = expanded.getRow(targetRowNumber);
    targetRow.height = sourceRow.height;
    targetRow.hidden = sourceRow.hidden;
    targetRow.outlineLevel = sourceRow.outlineLevel;
    for (let col = 1; col <= templateWs.columnCount; col++) {
      const source = sourceRow.getCell(col);
      const target = targetRow.getCell(col);
      target.value = source.value;
      target.style = source.style;
    }
  }

  const copyStudentFormat = (sourceRowNumber: number, firstTargetRow: number, count: number) => {
    const sourceRow = templateWs.getRow(sourceRowNumber);
    for (let index = 0; index < count; index++) {
      const targetRow = expanded.getRow(firstTargetRow + index);
      targetRow.height = sourceRow.height;
      for (let col = 1; col <= templateWs.columnCount; col++) {
        targetRow.getCell(col).value = null;
        targetRow.getCell(col).style = sourceRow.getCell(col).style;
      }
    }
  };
  copyStudentFormat(MALE_TOTAL_ROW - 1, MALE_START_ROW + MAX_MALE_ROWS, Math.max(0, maleDelta));
  copyStudentFormat(FEMALE_TOTAL_ROW - 1, femaleStartRow + MAX_FEMALE_ROWS, Math.max(0, femaleDelta));

  const merges = getMergeRanges(templateWs);
  const mergeWithBorders = (merge: MergeRange, top: number, bottom: number) => {
    expanded.mergeCells(top, merge.left, bottom, merge.right);
    const first = templateWs.getCell(merge.top, merge.left);
    const last = templateWs.getCell(merge.bottom, merge.right);
    expanded.getCell(top, merge.left).border = {
      ...first.border,
      right: last.border.right ?? first.border.right,
      bottom: last.border.bottom ?? first.border.bottom,
    };
  };
  for (const merge of merges) {
    const top = mapRow(merge.top);
    const bottom = mapRow(merge.bottom);
    if (top !== null && bottom !== null) mergeWithBorders(merge, top, bottom);
  }
  const copyStudentMerges = (sourceRow: number, targetStart: number, count: number) => {
    const rowMerges = merges.filter((merge) => merge.top === sourceRow && merge.bottom === sourceRow);
    for (let index = 0; index < count; index++) {
      for (const merge of rowMerges) mergeWithBorders(merge, targetStart + index, targetStart + index);
    }
  };
  copyStudentMerges(MALE_TOTAL_ROW - 1, MALE_START_ROW + MAX_MALE_ROWS, Math.max(0, maleDelta));
  copyStudentMerges(FEMALE_TOTAL_ROW - 1, femaleStartRow + MAX_FEMALE_ROWS, Math.max(0, femaleDelta));

  workbook.removeWorksheet(templateWs.id);
  expanded.name = originalName;
  return expanded;
}

function populateSF2Worksheet(
  workbook: ExcelJS.Workbook,
  templateWs: ExcelJS.Worksheet,
  section: Section,
  gradeLabel: string,
  month: string,
  year: number,
  holidayDates: string[] = [],
  schoolDayDates: string[] = [],
) {
  const maleCount = section.students.filter((student) => student.gender === "M").length;
  const femaleCount = section.students.filter((student) => student.gender === "F").length;
  const ws = copyWorksheetWithDynamicAttendanceRows(workbook, templateWs, maleCount, femaleCount);
  const holidaySet = new Set(holidayDates);
  const allSchoolDaysList = getSchoolDaysOfMonth(month, year);
  const monthIdx = MONTHS.indexOf(month);
  const allSchoolDayPlacements = getSchoolDayPlacements(month, year);
  const fallbackSchoolDays = allSchoolDaysList
    .map((day) => `${year}-${String(monthIdx + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`)
    .filter((date) => date <= toManilaDateString());
  const schoolDaySet = new Set(schoolDayDates.length ? schoolDayDates : fallbackSchoolDays);

  // Class days are the server-provided, eligible dates excluding selected holidays.
  const classPlacements = allSchoolDayPlacements.filter(({ day }) => {
    const iso = `${year}-${String(monthIdx + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    return schoolDaySet.has(iso) && !holidaySet.has(iso);
  });
  const schoolDays = classPlacements.length;

  const maleStudents = section.students.filter((s) => s.gender === "M");
  const femaleStudents = section.students.filter((s) => s.gender === "F");
  const maleTotalRow = MALE_START_ROW + maleStudents.length;
  const femaleStartRow = maleTotalRow + 1;
  const femaleTotalRow = femaleStartRow + femaleStudents.length;
  const combinedRow = femaleTotalRow + 1;
  const summaryStartRow = combinedRow + 1;
  const totalRowDelta = (maleStudents.length - MAX_MALE_ROWS) + (femaleStudents.length - MAX_FEMALE_ROWS);

  setCellValue(ws, "F3", 107966);
  setCellValue(ws, "M3", `${year} - ${year + 1}`);
  setCellValue(ws, "AA3", month.toUpperCase());
  setCellValue(ws, "F4", "Santiago Elementary School");
  setCellValue(ws, "AA4", gradeLabel);
  setCellValue(ws, "AM4", section.name.toUpperCase());

  // Clear all date slots first
  for (const [col0, mergePartner] of SF2_DAY_SLOTS) {
    clearCellPreserveFormat(ws, col0ToRef(col0, 6));
    clearCellPreserveFormat(ws, col0ToRef(col0, 7));
    if (mergePartner !== null) {
      clearCellPreserveFormat(ws, col0ToRef(mergePartner, 6));
      clearCellPreserveFormat(ws, col0ToRef(mergePartner, 7));
    }
  }

  // Write date headers — holidays get "H" label
  allSchoolDayPlacements.forEach(({ day, slotIdx, dowLabel }) => {
    const [col0] = SF2_DAY_SLOTS[slotIdx];
    const iso = `${year}-${String(monthIdx + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    setSf2DateHeader(ws, col0, day);
    setCellValue(ws, col0ToRef(col0, 7), holidaySet.has(iso) ? "H" : dowLabel);
  });

  function fillRows(
    students: StudentRecord[],
    startRow: number,
    totalRow: number
  ) {
    students.forEach((st, idx) => {
      const row = startRow + idx;
      setCellValue(ws, `A${row}`, idx + 1);
      setCellValue(ws, `C${row}`, st.name);

      for (const [col0, mergePartner] of SF2_DAY_SLOTS) {
        clearCellPreserveFormat(ws, col0ToRef(col0, row));
        if (mergePartner !== null) clearCellPreserveFormat(ws, col0ToRef(mergePartner, row));
      }

      let absenceCount = 0;

      allSchoolDayPlacements.forEach(({ day, slotIdx }) => {
        const [col0] = SF2_DAY_SLOTS[slotIdx];
        const iso = `${year}-${String(monthIdx + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
        if (!schoolDaySet.has(iso)) return;
        if (iso < st.active_from) return;
        if (holidaySet.has(iso)) {
          setCellValue(ws, col0ToRef(col0, row), "H");
          return;
        }
        const isExcused = !!st.dailyExcused?.[day];
        const isAbsent = !!st.dailyAbsences?.[day];
        if (isExcused) {
          setCellValue(ws, col0ToRef(col0, row), "E");
          // Excused days: not counted as absent, not counted as present
        } else if (isAbsent) {
          setCellValue(ws, col0ToRef(col0, row), "X");
          absenceCount += 1;
        }
      });

      setCellValue(ws, `AM${row}`, absenceCount);
      const pastClassDays = classPlacements.filter(({ day }) => {
        const iso = `${year}-${String(monthIdx + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
        return iso >= st.active_from;
      }).length;
      setCellValue(ws, `AO${row}`, pastClassDays - absenceCount);
    });

    setCellValue(ws, `A${totalRow}`, students.length);
    setCellFormula(ws, `AM${totalRow}`, students.length ? `SUM(AM${startRow}:AM${totalRow - 1})` : "0");
    setCellFormula(ws, `AO${totalRow}`, students.length ? `SUM(AO${startRow}:AO${totalRow - 1})` : "0");

    for (const [col0, mergePartner] of SF2_DAY_SLOTS) {
      clearCellPreserveFormat(ws, col0ToRef(col0, totalRow));
      if (mergePartner !== null) clearCellPreserveFormat(ws, col0ToRef(mergePartner, totalRow));
    }

    // Per-day totals only for non-holiday days
    classPlacements.forEach(({ slotIdx }) => {
      const [col0] = SF2_DAY_SLOTS[slotIdx];
      const formula = students.length
        ? `COUNTIF(${col0ToRef(col0, startRow)}:${col0ToRef(col0, totalRow - 1)},"X")`
        : "0";
      setCellFormula(ws, col0ToRef(col0, totalRow), formula);
    });
  }

  fillRows(maleStudents, MALE_START_ROW, maleTotalRow);
  fillRows(femaleStudents, femaleStartRow, femaleTotalRow);

  for (const [col0, mergePartner] of SF2_DAY_SLOTS) {
    clearCellPreserveFormat(ws, col0ToRef(col0, combinedRow));
    if (mergePartner !== null) clearCellPreserveFormat(ws, col0ToRef(mergePartner, combinedRow));
  }

  setCellFormula(ws, `A${combinedRow}`, `A${femaleTotalRow}+A${maleTotalRow}`);
  setCellFormula(ws, `AM${combinedRow}`, `AM${maleTotalRow}+AM${femaleTotalRow}`);
  setCellFormula(ws, `AO${combinedRow}`, `AO${maleTotalRow}+AO${femaleTotalRow}`);

  classPlacements.forEach(({ slotIdx }) => {
    const [col0] = SF2_DAY_SLOTS[slotIdx];
    setCellFormula(ws, col0ToRef(col0, combinedRow),
      `${col0ToRef(col0, maleTotalRow)}+${col0ToRef(col0, femaleTotalRow)}`);
  });

  [74, 80].forEach((templateRow) => {
    const row = templateRow + totalRowDelta;
    clearCellPreserveFormat(ws, `AN${row}`);
    if (templateRow === 80) clearCellPreserveFormat(ws, `Z${row}`);
  });

  const enrollmentRow = summaryStartRow + 2;
  const registeredRow = summaryStartRow + 8;
  const enrollmentPctRow = summaryStartRow + 10;
  const dailyAttendanceRow = summaryStartRow + 12;
  const attendancePctRow = summaryStartRow + 14;
  setCellValue(ws, `AM${summaryStartRow}`, `Month : ${month.toUpperCase()}`);
  setCellValue(ws, `AP${summaryStartRow}`, `No. of Days of Classes: ${schoolDays}`);
  setCellValue(ws, `AR${enrollmentRow}`, maleStudents.length);
  setCellValue(ws, `AS${enrollmentRow}`, femaleStudents.length);
  setCellValue(ws, `AT${enrollmentRow}`, section.students.length);
  setCellValue(ws, `AR${registeredRow}`, maleStudents.length);
  setCellValue(ws, `AS${registeredRow}`, femaleStudents.length);
  setCellFormula(ws, `AT${registeredRow}`, `AR${registeredRow}+AS${registeredRow}`);
  setCellFormula(ws, `AR${enrollmentPctRow}`, `IF(AR${enrollmentRow}=0,0,AR${registeredRow}/AR${enrollmentRow})`);
  setCellFormula(ws, `AS${enrollmentPctRow}`, `IF(AS${enrollmentRow}=0,0,AS${registeredRow}/AS${enrollmentRow})`);
  setCellFormula(ws, `AT${enrollmentPctRow}`, `IF(AT${enrollmentRow}=0,0,AT${registeredRow}/AT${enrollmentRow})`);
  setCellFormula(ws, `AR${dailyAttendanceRow}`, `AO${maleTotalRow}/${schoolDays || 1}`);
  setCellFormula(ws, `AS${dailyAttendanceRow}`, `AO${femaleTotalRow}/${schoolDays || 1}`);
  setCellFormula(ws, `AT${dailyAttendanceRow}`, `AO${combinedRow}/${schoolDays || 1}`);
  setCellFormula(ws, `AR${attendancePctRow}`, `IF(AR${registeredRow}=0,0,AR${dailyAttendanceRow}/AR${registeredRow})`);
  setCellFormula(ws, `AS${attendancePctRow}`, `IF(AS${registeredRow}=0,0,AS${dailyAttendanceRow}/AS${registeredRow})`);
  setCellFormula(ws, `AT${attendancePctRow}`, `IF(AT${registeredRow}=0,0,AT${dailyAttendanceRow}/AT${registeredRow})`);
}

async function exportSF2(
  section: Section,
  gradeLabel: string,
  month: string,
  year: number,
  holidayDates: string[] = [],
  schoolDayDates: string[] = [],
) {
  const { default: ExcelJS } = await import("exceljs");
  const workbook = await loadTemplateWorkbook(ExcelJS);
  const worksheet = getTemplateWorksheet(workbook);
  populateSF2Worksheet(workbook, worksheet, section, gradeLabel, month, year, holidayDates, schoolDayDates);
  const out = await workbook.xlsx.writeBuffer();
  downloadArrayBuffer(out as ArrayBuffer, `SF2_${section.name}_${month}_${year}.xlsx`);
}

async function exportGradeSF2(
  grade: GradeLevel,
  month: string,
  year: number,
  holidayDates: string[] = [],
  schoolDayDates: string[] = [],
) {
  const { default: ExcelJS } = await import("exceljs");
  const templateWorkbook = await loadTemplateWorkbook(ExcelJS);
  const templateSheet = getTemplateWorksheet(templateWorkbook);
  const outputWorkbook = new ExcelJS.Workbook();
  outputWorkbook.creator = "Principal Dashboard";
  outputWorkbook.created = new Date();
  outputWorkbook.modified = new Date();
  for (const section of grade.sections) {
    const sheetName = String(section?.name ?? "").replace(/[:\\/?*\[\]]/g, "").substring(0, 31) || "Sheet";
    const ws = copyWorksheetToWorkbook(templateSheet, outputWorkbook, sheetName);
    populateSF2Worksheet(outputWorkbook, ws, section, grade.label, month, year, holidayDates, schoolDayDates);
  }
  const out = await outputWorkbook.xlsx.writeBuffer();
  downloadArrayBuffer(out as ArrayBuffer, `SF2_${grade.label.replace(" ", "_")}_${month}_${year}.xlsx`);
}

// ─── Icons ────────────────────────────────────────────────────────
const ChevronRight = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
    <polyline points="9,18 15,12 9,6" />
  </svg>
);
const ChevronLeft = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
    <polyline points="15,18 9,12 15,6" />
  </svg>
);
const Download = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="7,10 12,15 17,10" />
    <line x1="12" y1="15" x2="12" y2="3" />
  </svg>
);
const Users = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </svg>
);
const CloseIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);
const PrintIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <polyline points="6,9 6,2 18,2 18,9" />
    <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
    <rect x="6" y="14" width="12" height="8" />
  </svg>
);
const ExcelIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14,2 14,8 20,8" />
    <line x1="8" y1="13" x2="16" y2="13" /><line x1="8" y1="17" x2="16" y2="17" />
  </svg>
);
const CalendarIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
    <line x1="16" y1="2" x2="16" y2="6" />
    <line x1="8" y1="2" x2="8" y2="6" />
    <line x1="3" y1="10" x2="21" y2="10" />
  </svg>
);
const AlertIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="12" cy="12" r="10" />
    <line x1="12" y1="8" x2="12" y2="12" />
    <line x1="12" y1="16" x2="12.01" y2="16" />
  </svg>
);

// ─── SF2 Export Modal with Holiday Picker (Purple theme) ──────────
interface SF2ExportModalProps {
  section: Section;
  gradeLabel: string;
  month: string;
  year: number;
  schoolDayDates: string[];
  onClose: () => void;
}

function SF2ExportModal({ section, gradeLabel, month, year, schoolDayDates, onClose }: SF2ExportModalProps) {
  const [holidayDates, setHolidayDates] = useState<string[]>([]);
  const [exporting, setExporting] = useState(false);
  const [exported, setExported] = useState<"sf2" | "print" | null>(null);

  const availableWeekdays = getWeekdayDatesOfMonth(month, year);
  const now = new Date();
  const isFuture =
    year > now.getFullYear() ||
    (year === now.getFullYear() && MONTHS.indexOf(month) > now.getMonth());

  const classDays = availableWeekdays.length - holidayDates.length;

  async function handleExportSF2() {
    setExporting(true);
    try {
      await exportSF2(section, gradeLabel, month, year, holidayDates, schoolDayDates);
      setExported("sf2");
      setTimeout(() => setExported(null), 2500);
    } catch (e) {
      console.error(e);
      alert("Export failed. Please try again.");
    } finally {
      setExporting(false);
    }
  }

  function handlePrint() {
    const maleStudents = section.students.filter(s => s.gender === "M");
    const femaleStudents = section.students.filter(s => s.gender === "F");
    const mPresent = maleStudents.reduce((a, s) => a + s.present, 0);
    const mAbsent = maleStudents.reduce((a, s) => a + s.absent, 0);
    const fPresent = femaleStudents.reduce((a, s) => a + s.present, 0);
    const fAbsent = femaleStudents.reduce((a, s) => a + s.absent, 0);
    const totalPresent = section.students.reduce((s, r) => s + r.present, 0);
    const totalAbsent = section.students.reduce((s, r) => s + r.absent, 0);

    const printContent = `
      <html><head><title>SF2 – ${escapePrintHtml(section.name)} – ${escapePrintHtml(month)} ${year}</title>
      <style>
        body { font-family: Arial, sans-serif; padding: 18px; color: #1f2937; font-size: 11px; }
        h2 { color: #522081; margin-bottom: 2px; font-size: 14px; }
        .meta { font-size: 11px; color: #6b7280; margin-bottom: 12px; }
        table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 11px; }
        th { background: #522081; color: white; padding: 6px 8px; text-align: left; }
        td { padding: 5px 8px; border-bottom: 1px solid #e5e7eb; }
        tr:nth-child(even) td { background: #f9fafb; }
        .total-row td { background: #f3f4f6; font-weight: 700; border-top: 2px solid #d1d5db; }
        .present { color: #10b981; font-weight: 600; }
        .absent  { color: #ef4444; font-weight: 600; }
        .summary { margin-top: 16px; border: 1px solid #d1d5db; padding: 10px; border-radius: 6px; }
        .holiday-note { margin-top: 10px; padding: 8px; background: #ede9fe; border-radius: 6px; font-size: 10px; color: #522081; }
        .sig-area { margin-top: 30px; display: flex; justify-content: space-between; }
        .sig-line { border-top: 1px solid #374151; padding-top: 4px; font-size: 10px; color: #6b7280; min-width: 180px; text-align: center; }
        .sig-name { font-weight: 700; font-size: 13px; color: #111827; }
      </style></head><body>
      <h2>School Form 2 (SF2) Daily Attendance Report</h2>
      <div class="meta">
        School: Santiago Elementary School &nbsp;|&nbsp; ${escapePrintHtml(gradeLabel)} – Section ${escapePrintHtml(section.name)}
        &nbsp;|&nbsp; Adviser: ${escapePrintHtml(section.adviser)} &nbsp;|&nbsp; Month: ${escapePrintHtml(month)} ${year}
        &nbsp;|&nbsp; Class Days: ${classDays}
      </div>
      ${holidayDates.length > 0 ? `<div class="holiday-note">Holidays (marked H in SF2): ${holidayDates.map(d => formatDateLabel(d)).join(", ")}</div>` : ""}
      <div style="font-weight:700;color:#522081;margin-bottom:6px;margin-top:14px;">MALE (${maleStudents.length} students)</div>
      <table>
        <thead><tr><th>#</th><th>Name (Last, First MI)</th><th>Absent</th><th>Present</th></tr></thead>
        <tbody>
          ${maleStudents.map((s, i) => `<tr><td>${i + 1}</td><td>${escapePrintHtml(s.name)}</td><td class="absent">${s.absent}</td><td class="present">${s.present}</td></tr>`).join("")}
          <tr class="total-row"><td colspan="2">Male Total</td><td class="absent">${mAbsent}</td><td class="present">${mPresent}</td></tr>
        </tbody>
      </table>
      <div style="font-weight:700;color:#522081;margin:14px 0 6px;">FEMALE (${femaleStudents.length} students)</div>
      <table>
        <thead><tr><th>#</th><th>Name (Last, First MI)</th><th>Absent</th><th>Present</th></tr></thead>
        <tbody>
          ${femaleStudents.map((s, i) => `<tr><td>${i + 1}</td><td>${escapePrintHtml(s.name)}</td><td class="absent">${s.absent}</td><td class="present">${s.present}</td></tr>`).join("")}
          <tr class="total-row"><td colspan="2">Female Total</td><td class="absent">${fAbsent}</td><td class="present">${fPresent}</td></tr>
        </tbody>
      </table>
      <div class="summary">
        <strong>Summary</strong>
        <table>
          <thead><tr><th></th><th>M</th><th>F</th><th>TOTAL</th></tr></thead>
          <tbody>
            <tr><td>Enrolment</td><td>${maleStudents.length}</td><td>${femaleStudents.length}</td><td>${section.students.length}</td></tr>
            <tr><td>Total Absent</td><td class="absent">${mAbsent}</td><td class="absent">${fAbsent}</td><td class="absent">${totalAbsent}</td></tr>
            <tr><td>Total Present</td><td class="present">${mPresent}</td><td class="present">${fPresent}</td><td class="present">${totalPresent}</td></tr>
          </tbody>
        </table>
      </div>
      <div class="sig-area">
        <div class="sig-line"><div class="sig-name">${escapePrintHtml(section.adviser)}</div>(Signature of Adviser over Printed Name)</div>
        <div class="sig-line"><div class="sig-name">&nbsp;</div>(Signature of School Head over Printed Name)</div>
      </div>
      </body></html>
    `;
    const w = window.open("", "_blank", "width=800,height=650");
    if (w) { w.document.write(printContent); w.document.close(); w.print(); }
    setExported("print");
    setTimeout(() => setExported(null), 2000);
  }

  return (
    <div
      className="principal-attendance-modal-overlay"
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", backdropFilter: "blur(6px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 16 }}
      onClick={onClose}
    >
      <div
        className="principal-attendance-modal"
        style={{ background: WHITE, borderRadius: 22, width: "100%", maxWidth: 480, boxShadow: "0 24px 64px rgba(82,32,129,0.28)", animation: "modalIn 0.22s cubic-bezier(.34,1.56,.64,1)", maxHeight: "92vh", display: "flex", flexDirection: "column" }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ padding: "20px 24px 16px", borderBottom: `1px solid ${GRAY_100}`, background: "linear-gradient(135deg, #ede9fe 0%, #f5f3ff 100%)", borderRadius: "22px 22px 0 0", flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ width: 40, height: 40, borderRadius: 12, background: PRIMARY, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <CalendarIcon />
              </div>
              <div>
                <div style={{ fontWeight: 800, fontSize: 16, color: GRAY_800 }}>Export SF2</div>
                <div style={{ fontSize: 12, color: GRAY_400, marginTop: 2 }}>Configure holidays before exporting</div>
              </div>
            </div>
            <button onClick={onClose} style={{ width: 34, height: 34, borderRadius: 10, border: `1px solid ${GRAY_200}`, background: WHITE, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: GRAY_400 }}>
              <CloseIcon />
            </button>
          </div>
        </div>

        <div style={{ overflowY: "auto", flex: 1, padding: "20px 24px" }}>
          {/* Section info pill */}
          <div style={{ marginBottom: 18, display: "flex", alignItems: "center", gap: 8, background: GRAY_50, border: `1px solid ${GRAY_100}`, borderRadius: 12, padding: "10px 14px" }}>
            <ExcelIcon />
            <span style={{ fontSize: 12, fontWeight: 600, color: GRAY_600 }}>{gradeLabel} · Section {section.name}</span>
            <span style={{ color: GRAY_400, margin: "0 2px" }}>·</span>
            <span style={{ fontSize: 12, color: GRAY_400 }}>{section.adviser}</span>
          </div>

          {/* Selected period display */}
          <div style={{ marginBottom: 18, borderRadius: 14, background: "#ede9fe", border: `1px solid #c4b5fd`, padding: "14px 18px", textAlign: "center" }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: PRIMARY, opacity: 0.75, marginBottom: 4 }}>Selected Period</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: PRIMARY }}>{month} {year}</div>
            <div style={{ fontSize: 11, color: PRIMARY, opacity: 0.65, marginTop: 4 }}>
              {availableWeekdays.length} school days · <strong>{classDays} class days</strong>{holidayDates.length > 0 ? ` · ${holidayDates.length} holiday${holidayDates.length > 1 ? "s" : ""}` : ""}
            </div>
            {isFuture && (
              <div style={{ marginTop: 8, display: "flex", alignItems: "center", justifyContent: "center", gap: 4, fontSize: 11, color: WARNING_AMBER }}>
                <AlertIcon /> This month is in the future
              </div>
            )}
          </div>

          {/* Holiday selector */}
          <div style={{ marginBottom: 20, borderRadius: 14, border: `1px solid ${GRAY_200}`, overflow: "hidden" }}>
            <div style={{ padding: "12px 16px", borderBottom: `1px solid ${GRAY_100}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: GRAY_800 }}>Holiday Dates</div>
                <div style={{ fontSize: 11, color: GRAY_400, marginTop: 2 }}>Selected dates will be marked as <strong>H</strong> in SF2 and excluded from class days.</div>
              </div>
              {holidayDates.length > 0 && (
                <button
                  onClick={() => setHolidayDates([])}
                  style={{ fontSize: 11, fontWeight: 700, color: PRIMARY, background: "none", border: "none", cursor: "pointer", padding: "4px 8px", borderRadius: 6 }}
                >
                  Clear all
                </button>
              )}
            </div>
            <div style={{ padding: 12, maxHeight: 200, overflowY: "auto", background: GRAY_50 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                {availableWeekdays.map((dateStr) => {
                  const checked = holidayDates.includes(dateStr);
                  return (
                    <label
                      key={dateStr}
                      style={{
                        display: "flex", alignItems: "center", gap: 8, cursor: "pointer",
                        borderRadius: 10, border: `1.5px solid ${checked ? "#c4b5fd" : GRAY_200}`,
                        padding: "8px 10px", fontSize: 11, fontWeight: 500,
                        background: checked ? "#ede9fe" : WHITE,
                        color: checked ? PRIMARY : GRAY_600,
                        transition: "all 0.12s",
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) => {
                          setHolidayDates(prev =>
                            e.target.checked
                              ? [...prev, dateStr].sort()
                              : prev.filter(d => d !== dateStr)
                          );
                        }}
                        style={{ width: 14, height: 14, accentColor: PRIMARY, cursor: "pointer" }}
                      />
                      <span>{formatDateLabel(dateStr)}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Export info banner */}
          <div style={{ marginBottom: 20, padding: "10px 14px", background: "#ede9fe", borderRadius: 12, border: `1px solid #c4b5fd`, fontSize: 11, color: PRIMARY, fontWeight: 500, display: "flex", alignItems: "center", gap: 8 }}>
            <ExcelIcon />
            <span>Exports as <strong>DepEd SF2 format</strong> — fills the official template with male/female sections, daily X marks, H marks for holidays, and all summary statistics.</span>
          </div>

          {/* Action buttons */}
          <div style={{ display: "flex", gap: 10 }}>
            <button
              onClick={handleExportSF2}
              disabled={exporting}
              style={{
                flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                padding: "12px 16px", borderRadius: 12, border: "none",
                background: exported === "sf2" ? "#047857" : SUCCESS_GREEN,
                color: WHITE, fontWeight: 700, fontSize: 13, cursor: exporting ? "not-allowed" : "pointer",
                boxShadow: "0 3px 10px rgba(16,185,129,0.3)", opacity: exporting ? 0.7 : 1, transition: "all 0.15s"
              }}
            >
              <ExcelIcon />
              {exporting ? "Generating..." : exported === "sf2" ? "✓ Downloaded!" : "Export SF2 (.xlsx)"}
            </button>
            <button
              onClick={handlePrint}
              style={{
                flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                padding: "12px 16px", borderRadius: 12, border: "none",
                background: `linear-gradient(135deg, ${PRIMARY} 0%, ${PRIMARY_LIGHT} 100%)`,
                color: WHITE, fontWeight: 700, fontSize: 13, cursor: "pointer",
                boxShadow: "0 3px 10px rgba(82,32,129,0.3)", opacity: exported === "print" ? 0.65 : 1, transition: "all 0.15s"
              }}
            >
              <PrintIcon /> Print PDF
            </button>
          </div>

          <p style={{ marginTop: 10, textAlign: "center", fontSize: 10, color: GRAY_400 }}>
            Choose whether to export as SF2 Excel or print as PDF. Selected holidays will be marked as H and excluded from totals.
          </p>
        </div>
      </div>
      <style>{`@keyframes modalIn{from{opacity:0;transform:scale(0.93) translateY(14px)}to{opacity:1;transform:scale(1) translateY(0)}}`}</style>
    </div>
  );
}

// ─── Grade SF2 Export Modal with Holiday Picker (Purple theme) ────
interface GradeSF2ExportModalProps {
  grade: GradeLevel;
  month: string;
  year: number;
  schoolDayDates: string[];
  onClose: () => void;
}

function GradeSF2ExportModal({ grade, month, year, schoolDayDates, onClose }: GradeSF2ExportModalProps) {
  const [holidayDates, setHolidayDates] = useState<string[]>([]);
  const [exporting, setExporting] = useState(false);
  const [exported, setExported] = useState<"sf2" | "print" | null>(null);

  const availableWeekdays = getWeekdayDatesOfMonth(month, year);
  const now = new Date();
  const isFuture =
    year > now.getFullYear() ||
    (year === now.getFullYear() && MONTHS.indexOf(month) > now.getMonth());

  const classDays = availableWeekdays.length - holidayDates.length;
  const allStudents = grade.sections.flatMap(sec => sec.students);
  const totalPresent = allStudents.reduce((s, r) => s + r.present, 0);
  const totalAbsent = allStudents.reduce((s, r) => s + r.absent, 0);
  const totalLate = allStudents.reduce((s, r) => s + r.late, 0);

  async function handleExportSF2() {
    setExporting(true);
    try {
      await exportGradeSF2(grade, month, year, holidayDates, schoolDayDates);
      setExported("sf2");
      setTimeout(() => setExported(null), 2500);
    } catch (e) {
      console.error(e);
      alert("Export failed. Please try again.");
    } finally {
      setExporting(false);
    }
  }

  function handlePrint() {
    let sectionRows = "";
    grade.sections.forEach(sec => {
      const sp = sec.students.reduce((a, r) => a + r.present, 0);
      const sa = sec.students.reduce((a, r) => a + r.absent, 0);
      const sl = sec.students.reduce((a, r) => a + r.late, 0);
      sectionRows += `
        <tr class="section-header"><td colspan="5">Section ${escapePrintHtml(sec.name)} — ${escapePrintHtml(sec.adviser)}</td></tr>
        ${sec.students.map((s, i) => `<tr><td>${i + 1}</td><td>${escapePrintHtml(s.name)}</td><td class="present">${s.present}</td><td class="absent">${s.absent}</td><td class="late">${s.late}</td></tr>`).join("")}
        <tr class="subtotal-row"><td colspan="2">Section ${escapePrintHtml(sec.name)} Subtotal</td><td class="present">${sp}</td><td class="absent">${sa}</td><td class="late">${sl}</td></tr>
        <tr><td colspan="5" style="height:8px"></td></tr>`;
    });
    const holidayNote = holidayDates.length > 0
      ? `<div style="margin-bottom:14px;padding:8px 12px;background:#ede9fe;border-radius:6px;font-size:11px;color:#522081;">Holidays (marked H in SF2): ${holidayDates.map(d => formatDateLabel(d)).join(", ")}</div>`
      : "";
    const printContent = `<html><head><title>SF2 ${escapePrintHtml(grade.label)} – ${escapePrintHtml(month)} ${year}</title>
      <style>body{font-family:Arial,sans-serif;padding:20px;color:#1f2937;font-size:11px}h2{color:#522081;margin-bottom:3px;font-size:13px}p{margin:2px 0;font-size:11px;color:#6b7280}table{width:100%;border-collapse:collapse;margin-top:12px;font-size:11px}th{background:#522081;color:white;padding:6px 8px;text-align:left}td{padding:5px 8px;border-bottom:1px solid #e5e7eb}tr:nth-child(even) td{background:#f9fafb}.section-header td{background:#ede9fe;color:#522081;font-weight:700}.subtotal-row td{background:#f3f4f6;font-weight:700;border-top:1.5px solid #d1d5db}.total-row td{background:#522081;color:white;font-weight:700}.present{color:#10b981;font-weight:600}.absent{color:#ef4444;font-weight:600}.late{color:#f59e0b;font-weight:600}</style></head><body>
      <h2>School Form 2 (SF2) – ${escapePrintHtml(grade.label)}</h2><p>Santiago Elementary School &nbsp;|&nbsp; ${escapePrintHtml(month)} ${year} &nbsp;|&nbsp; Class Days: ${classDays}</p>
      ${holidayNote}
      <table><thead><tr><th>#</th><th>Student Name</th><th>Present</th><th>Absent</th><th>Late</th></tr></thead>
      <tbody>${sectionRows}<tr class="total-row"><td colspan="2">${escapePrintHtml(grade.label)} GRAND TOTAL</td><td>${totalPresent}</td><td>${totalAbsent}</td><td>${totalLate}</td></tr></tbody></table>
      </body></html>`;
    const w = window.open("", "_blank", "width=800,height=700");
    if (w) { w.document.write(printContent); w.document.close(); w.print(); }
    setExported("print");
    setTimeout(() => setExported(null), 2000);
  }

  return (
    <div
      className="principal-attendance-modal-overlay"
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", backdropFilter: "blur(6px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 16 }}
      onClick={onClose}
    >
      <div
        className="principal-attendance-modal"
        style={{ background: WHITE, borderRadius: 22, width: "100%", maxWidth: 500, boxShadow: "0 24px 64px rgba(82,32,129,0.28)", animation: "modalIn 0.22s cubic-bezier(.34,1.56,.64,1)", maxHeight: "92vh", display: "flex", flexDirection: "column" }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ padding: "20px 24px 16px", borderBottom: `1px solid ${GRAY_100}`, background: "linear-gradient(135deg, #ede9fe 0%, #f5f3ff 100%)", borderRadius: "22px 22px 0 0", flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ width: 40, height: 40, borderRadius: 12, background: PRIMARY, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <CalendarIcon />
              </div>
              <div>
                <div style={{ fontWeight: 800, fontSize: 16, color: GRAY_800 }}>{grade.label} — Export SF2</div>
                <div style={{ fontSize: 12, color: GRAY_400, marginTop: 2 }}>{grade.sections.length} sections · {allStudents.length} students</div>
              </div>
            </div>
            <button onClick={onClose} style={{ width: 34, height: 34, borderRadius: 10, border: `1px solid ${GRAY_200}`, background: WHITE, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: GRAY_400 }}>
              <CloseIcon />
            </button>
          </div>
        </div>

        <div style={{ overflowY: "auto", flex: 1, padding: "20px 24px" }}>
          {/* Stats row */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10, marginBottom: 18 }}>
            {[
              { label: "Total Present", value: totalPresent, color: SUCCESS_GREEN, bg: "#f0fdf4", border: "#bbf7d0" },
              { label: "Total Absent", value: totalAbsent, color: URGENT_RED, bg: "#fef2f2", border: "#fecaca" },
              { label: "Total Late", value: totalLate, color: WARNING_AMBER, bg: "#fffbeb", border: "#fde68a" },
            ].map(s => (
              <div key={s.label} style={{ background: s.bg, border: `1.5px solid ${s.border}`, borderRadius: 12, padding: "10px 12px", textAlign: "center" }}>
                <div style={{ fontSize: 10, fontWeight: 600, color: s.color, opacity: 0.75 }}>{s.label}</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: s.color, lineHeight: 1.2 }}>{s.value}</div>
              </div>
            ))}
          </div>

          {/* Selected period */}
          <div style={{ marginBottom: 18, borderRadius: 14, background: "#ede9fe", border: `1px solid #c4b5fd`, padding: "14px 18px", textAlign: "center" }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: PRIMARY, opacity: 0.75, marginBottom: 4 }}>Selected Period</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: PRIMARY }}>{month} {year}</div>
            <div style={{ fontSize: 11, color: PRIMARY, opacity: 0.65, marginTop: 4 }}>
              {availableWeekdays.length} school days · <strong>{classDays} class days</strong>{holidayDates.length > 0 ? ` · ${holidayDates.length} holiday${holidayDates.length > 1 ? "s" : ""}` : ""}
            </div>
            {isFuture && (
              <div style={{ marginTop: 8, display: "flex", alignItems: "center", justifyContent: "center", gap: 4, fontSize: 11, color: WARNING_AMBER }}>
                <AlertIcon /> This month is in the future
              </div>
            )}
          </div>

          {/* Holiday selector */}
          <div style={{ marginBottom: 20, borderRadius: 14, border: `1px solid ${GRAY_200}`, overflow: "hidden" }}>
            <div style={{ padding: "12px 16px", borderBottom: `1px solid ${GRAY_100}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: GRAY_800 }}>Holiday Dates</div>
                <div style={{ fontSize: 11, color: GRAY_400, marginTop: 2 }}>Selected dates will be marked as <strong>H</strong> in SF2 and excluded from class days.</div>
              </div>
              {holidayDates.length > 0 && (
                <button
                  onClick={() => setHolidayDates([])}
                  style={{ fontSize: 11, fontWeight: 700, color: PRIMARY, background: "none", border: "none", cursor: "pointer", padding: "4px 8px", borderRadius: 6 }}
                >
                  Clear all
                </button>
              )}
            </div>
            <div style={{ padding: 12, maxHeight: 200, overflowY: "auto", background: GRAY_50 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                {availableWeekdays.map((dateStr) => {
                  const checked = holidayDates.includes(dateStr);
                  return (
                    <label
                      key={dateStr}
                      style={{
                        display: "flex", alignItems: "center", gap: 8, cursor: "pointer",
                        borderRadius: 10, border: `1.5px solid ${checked ? "#c4b5fd" : GRAY_200}`,
                        padding: "8px 10px", fontSize: 11, fontWeight: 500,
                        background: checked ? "#ede9fe" : WHITE,
                        color: checked ? PRIMARY : GRAY_600,
                        transition: "all 0.12s",
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) => {
                          setHolidayDates(prev =>
                            e.target.checked
                              ? [...prev, dateStr].sort()
                              : prev.filter(d => d !== dateStr)
                          );
                        }}
                        style={{ width: 14, height: 14, accentColor: PRIMARY, cursor: "pointer" }}
                      />
                      <span>{formatDateLabel(dateStr)}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Export info banner */}
          <div style={{ marginBottom: 20, padding: "10px 14px", background: "#ede9fe", borderRadius: 12, border: `1px solid #c4b5fd`, fontSize: 11, color: PRIMARY, fontWeight: 500, display: "flex", alignItems: "center", gap: 8 }}>
            <ExcelIcon />
            <span>Exports <strong>one SF2 sheet per section</strong> in a single workbook using the official DepEd template. Holidays marked as H.</span>
          </div>

          {/* Action buttons */}
          <div style={{ display: "flex", gap: 10 }}>
            <button
              onClick={handleExportSF2}
              disabled={exporting}
              style={{
                flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                padding: "12px 16px", borderRadius: 12, border: "none",
                background: exported === "sf2" ? "#047857" : SUCCESS_GREEN,
                color: WHITE, fontWeight: 700, fontSize: 13, cursor: exporting ? "not-allowed" : "pointer",
                boxShadow: "0 3px 10px rgba(16,185,129,0.3)", opacity: exporting ? 0.7 : 1, transition: "all 0.15s"
              }}
            >
              <ExcelIcon />
              {exporting ? "Generating..." : exported === "sf2" ? "✓ Downloaded!" : "Export SF2 (.xlsx)"}
            </button>
            <button
              onClick={handlePrint}
              style={{
                flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                padding: "12px 16px", borderRadius: 12, border: "none",
                background: `linear-gradient(135deg, ${PRIMARY} 0%, ${PRIMARY_LIGHT} 100%)`,
                color: WHITE, fontWeight: 700, fontSize: 13, cursor: "pointer",
                boxShadow: "0 3px 10px rgba(82,32,129,0.3)", opacity: exported === "print" ? 0.65 : 1, transition: "all 0.15s"
              }}
            >
              <PrintIcon /> Print PDF
            </button>
          </div>

          <p style={{ marginTop: 10, textAlign: "center", fontSize: 10, color: GRAY_400 }}>
            Choose whether to export as SF2 Excel or print as PDF. Selected holidays will be marked as H and excluded from totals.
          </p>
        </div>
      </div>
      <style>{`@keyframes modalIn{from{opacity:0;transform:scale(0.93) translateY(14px)}to{opacity:1;transform:scale(1) translateY(0)}}`}</style>
    </div>
  );
}

// ─── Original Export Modal (Monthly Tally — kept for section detail view) ─────
function ExportModal({
  section,
  gradeLabel,
  month,
  year,
  schoolDayDates,
  onClose,
}: {
  section: Section;
  gradeLabel: string;
  month: string;
  year: number;
  schoolDayDates: string[];
  onClose: () => void;
}) {
  const [showSF2Modal, setShowSF2Modal] = useState(false);

  const totalPresent = section.students.reduce((s, r) => s + r.present, 0);
  const totalAbsent = section.students.reduce((s, r) => s + r.absent, 0);
  const totalLate = section.students.reduce((s, r) => s + r.late, 0);
  const maleCount = section.students.filter(s => s.gender === "M").length;
  const femaleCount = section.students.filter(s => s.gender === "F").length;

  if (showSF2Modal) {
    return (
      <SF2ExportModal
        section={section}
        gradeLabel={gradeLabel}
        month={month}
        year={year}
        schoolDayDates={schoolDayDates}
        onClose={onClose}
      />
    );
  }

  return (
    <div
      className="principal-attendance-modal-overlay"
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", backdropFilter: "blur(6px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 16 }}
      onClick={onClose}
    >
      <div
        className="principal-attendance-modal"
        style={{ background: WHITE, borderRadius: 22, width: "100%", maxWidth: 640, boxShadow: "0 24px 64px rgba(82,32,129,0.28)", animation: "modalIn 0.22s cubic-bezier(.34,1.56,.64,1)", maxHeight: "90vh", display: "flex", flexDirection: "column" }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ padding: "20px 24px 16px", borderBottom: `1px solid ${GRAY_100}`, display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0, gap: 12, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontWeight: 800, fontSize: 17, color: GRAY_800 }}>Monthly Attendance Tally</div>
            <div style={{ fontSize: 12, color: GRAY_400, marginTop: 3 }}>{section.name} &nbsp;·&nbsp; Adviser: {section.adviser} &nbsp;·&nbsp; {month} {year}</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            {/* Export SF2 now opens holiday picker modal */}
            <button
              onClick={() => setShowSF2Modal(true)}
              style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 10, border: "none", background: SUCCESS_GREEN, color: WHITE, fontWeight: 700, fontSize: 12, cursor: "pointer", boxShadow: "0 3px 10px rgba(16,185,129,0.3)", transition: "all 0.15s" }}
            >
              <ExcelIcon /> Export SF2 (.xlsx)
            </button>
            <button onClick={onClose} style={{ width: 34, height: 34, borderRadius: 10, border: `1px solid ${GRAY_200}`, background: WHITE, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: GRAY_400 }}>
              <CloseIcon />
            </button>
          </div>
        </div>
        <div style={{ margin: "12px 24px 0", padding: "10px 14px", background: "#ede9fe", borderRadius: 12, border: `1px solid #c4b5fd`, fontSize: 12, color: PRIMARY, fontWeight: 500, display: "flex", alignItems: "center", gap: 8 }}>
          <CalendarIcon />
          <span>Click <strong>Export SF2</strong> to configure holidays before exporting the official DepEd template.</span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12, padding: "16px 24px", borderBottom: `1px solid ${GRAY_100}`, flexShrink: 0, marginTop: 12 }}>
          {[
            { label: "Total Present", value: totalPresent, color: SUCCESS_GREEN, bg: "#f0fdf4", border: "#bbf7d0" },
            { label: "Total Absent", value: totalAbsent, color: URGENT_RED, bg: "#fef2f2", border: "#fecaca" },
            { label: "Total Late", value: totalLate, color: WARNING_AMBER, bg: "#fffbeb", border: "#fde68a" },
          ].map(s => (
            <div key={s.label} style={{ background: s.bg, border: `1.5px solid ${s.border}`, borderRadius: 14, padding: "14px 16px" }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: s.color, marginBottom: 6 }}>{s.label}</div>
              <div style={{ fontSize: 28, fontWeight: 800, color: s.color, lineHeight: 1 }}>{s.value}</div>
              <div style={{ fontSize: 11, color: s.color, opacity: 0.65, marginTop: 4 }}>{maleCount}M + {femaleCount}F = {section.students.length} students</div>
            </div>
          ))}
        </div>
        <div style={{ overflowY: "auto", flex: 1 }}>
          <div style={{ padding: "10px 24px 4px", background: "#ede9fe", borderBottom: `1px solid #ddd6fe` }}>
            <span style={{ fontWeight: 700, fontSize: 12, color: PRIMARY }}>MALE — {maleCount} students</span>
          </div>
          <StudentTable students={section.students.filter(s => s.gender === "M")} />
          <div style={{ padding: "10px 24px 4px", background: "#fce7f3", borderBottom: `1px solid #fbcfe8`, borderTop: `2px solid ${GRAY_100}` }}>
            <span style={{ fontWeight: 700, fontSize: 12, color: "#9d174d" }}>FEMALE — {femaleCount} students</span>
          </div>
          <StudentTable students={section.students.filter(s => s.gender === "F")} />
          <div style={{ display: "grid", gridTemplateColumns: "1fr repeat(3,90px)", padding: "12px 24px", background: `${PRIMARY}10`, borderTop: `2px solid ${PRIMARY}30`, alignItems: "center" }}>
            <span style={{ fontWeight: 800, fontSize: 13, color: PRIMARY }}>Combined Total</span>
            {[{ val: totalPresent, color: SUCCESS_GREEN }, { val: totalAbsent, color: URGENT_RED }, { val: totalLate, color: WARNING_AMBER }].map((s, i) => (
              <span key={i} style={{ textAlign: "center", fontWeight: 800, fontSize: 15, color: s.color }}>{s.val}</span>
            ))}
          </div>
        </div>
      </div>
      <style>{`@keyframes modalIn{from{opacity:0;transform:scale(0.93) translateY(14px)}to{opacity:1;transform:scale(1) translateY(0)}}`}</style>
    </div>
  );
}

function StudentTable({ students }: { students: StudentRecord[] }) {
  if (students.length === 0) return <div style={{ padding: "12px 24px", color: GRAY_400, fontSize: 12 }}>No students.</div>;
  const tPresent = students.reduce((a, s) => a + s.present, 0);
  const tAbsent = students.reduce((a, s) => a + s.absent, 0);
  const tLate = students.reduce((a, s) => a + s.late, 0);
  return (
    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
      <thead>
        <tr style={{ background: GRAY_50 }}>
          <th style={{ padding: "10px 24px", textAlign: "left", fontWeight: 700, color: GRAY_600, fontSize: 11, borderBottom: `1px solid ${GRAY_200}` }}>#</th>
          <th style={{ padding: "10px 8px", textAlign: "left", fontWeight: 700, color: GRAY_600, fontSize: 11, borderBottom: `1px solid ${GRAY_200}` }}>Student Name</th>
          <th style={{ padding: "10px 16px", textAlign: "center", fontWeight: 700, color: SUCCESS_GREEN, fontSize: 11, borderBottom: `1px solid ${GRAY_200}` }}>Present</th>
          <th style={{ padding: "10px 16px", textAlign: "center", fontWeight: 700, color: URGENT_RED, fontSize: 11, borderBottom: `1px solid ${GRAY_200}` }}>Absent</th>
          <th style={{ padding: "10px 16px", textAlign: "center", fontWeight: 700, color: WARNING_AMBER, fontSize: 11, borderBottom: `1px solid ${GRAY_200}` }}>Late</th>
        </tr>
      </thead>
      <tbody>
        {students.map((student, idx) => (
          <tr key={student.id} style={{ background: idx % 2 === 0 ? WHITE : GRAY_50 }}>
            <td style={{ padding: "9px 24px", color: GRAY_400, fontSize: 12 }}>{idx + 1}</td>
            <td style={{ padding: "9px 8px", color: GRAY_800, fontWeight: 600, fontSize: 12 }}>{student.name}</td>
            <td style={{ padding: "9px 16px", textAlign: "center" }}><span style={{ background: "#f0fdf4", color: SUCCESS_GREEN, border: "1px solid #bbf7d0", borderRadius: 7, padding: "2px 9px", fontWeight: 700, fontSize: 12 }}>{student.present}</span></td>
            <td style={{ padding: "9px 16px", textAlign: "center" }}><span style={{ background: student.absent > 0 ? "#fef2f2" : GRAY_50, color: student.absent > 0 ? URGENT_RED : GRAY_400, border: `1px solid ${student.absent > 0 ? "#fecaca" : GRAY_200}`, borderRadius: 7, padding: "2px 9px", fontWeight: 700, fontSize: 12 }}>{student.absent}</span></td>
            <td style={{ padding: "9px 16px", textAlign: "center" }}><span style={{ background: student.late > 0 ? "#fffbeb" : GRAY_50, color: student.late > 0 ? WARNING_AMBER : GRAY_400, border: `1px solid ${student.late > 0 ? "#fde68a" : GRAY_200}`, borderRadius: 7, padding: "2px 9px", fontWeight: 700, fontSize: 12 }}>{student.late}</span></td>
          </tr>
        ))}
      </tbody>
      <tfoot>
        <tr style={{ background: `${PRIMARY}06`, borderTop: `1.5px solid ${GRAY_200}` }}>
          <td colSpan={2} style={{ padding: "9px 24px", fontWeight: 800, fontSize: 12, color: GRAY_800 }}>Subtotal</td>
          <td style={{ padding: "9px 16px", textAlign: "center", fontWeight: 800, color: SUCCESS_GREEN }}>{tPresent}</td>
          <td style={{ padding: "9px 16px", textAlign: "center", fontWeight: 800, color: URGENT_RED }}>{tAbsent}</td>
          <td style={{ padding: "9px 16px", textAlign: "center", fontWeight: 800, color: WARNING_AMBER }}>{tLate}</td>
        </tr>
      </tfoot>
    </table>
  );
}

// ─── Grade Export Modal (with holiday picker trigger) ─────────────
function GradeExportModal({ grade, month, year, schoolDayDates, onClose }: { grade: GradeLevel; month: string; year: number; schoolDayDates: string[]; onClose: () => void; }) {
  const [showSF2Modal, setShowSF2Modal] = useState(false);

  const allStudents = grade.sections.flatMap(sec => sec.students.map(st => ({ ...st, section: sec.name, adviser: sec.adviser })));
  const totalPresent = allStudents.reduce((s, r) => s + r.present, 0);
  const totalAbsent = allStudents.reduce((s, r) => s + r.absent, 0);
  const totalLate = allStudents.reduce((s, r) => s + r.late, 0);

  function handlePrint() {
    let sectionRows = "";
    grade.sections.forEach(sec => {
      const sp = sec.students.reduce((a, r) => a + r.present, 0);
      const sa = sec.students.reduce((a, r) => a + r.absent, 0);
      const sl = sec.students.reduce((a, r) => a + r.late, 0);
      sectionRows += `
        <tr class="section-header"><td colspan="5">Section ${escapePrintHtml(sec.name)} — ${escapePrintHtml(sec.adviser)}</td></tr>
        ${sec.students.map((s, i) => `<tr><td>${i + 1}</td><td>${escapePrintHtml(s.name)}</td><td class="present">${s.present}</td><td class="absent">${s.absent}</td><td class="late">${s.late}</td></tr>`).join("")}
        <tr class="subtotal-row"><td colspan="2">Section ${escapePrintHtml(sec.name)} Subtotal</td><td class="present">${sp}</td><td class="absent">${sa}</td><td class="late">${sl}</td></tr>
        <tr><td colspan="5" style="height:8px"></td></tr>`;
    });
    const printContent = `<html><head><title>SF2 ${escapePrintHtml(grade.label)} – ${escapePrintHtml(month)} ${year}</title>
      <style>body{font-family:Arial,sans-serif;padding:20px;color:#1f2937;font-size:11px}h2{color:#522081;margin-bottom:3px;font-size:13px}p{margin:2px 0;font-size:11px;color:#6b7280}table{width:100%;border-collapse:collapse;margin-top:12px;font-size:11px}th{background:#522081;color:white;padding:6px 8px;text-align:left}td{padding:5px 8px;border-bottom:1px solid #e5e7eb}tr:nth-child(even) td{background:#f9fafb}.section-header td{background:#ede9fe;color:#522081;font-weight:700}.subtotal-row td{background:#f3f4f6;font-weight:700;border-top:1.5px solid #d1d5db}.total-row td{background:#522081;color:white;font-weight:700}.present{color:#10b981;font-weight:600}.absent{color:#ef4444;font-weight:600}.late{color:#f59e0b;font-weight:600}</style></head><body>
      <h2>School Form 2 (SF2) – ${escapePrintHtml(grade.label)}</h2><p>Santiago Elementary School &nbsp;|&nbsp; ${escapePrintHtml(month)} ${year}</p>
      <table><thead><tr><th>#</th><th>Student Name</th><th>Present</th><th>Absent</th><th>Late</th></tr></thead>
      <tbody>${sectionRows}<tr class="total-row"><td colspan="2">${escapePrintHtml(grade.label)} GRAND TOTAL</td><td>${totalPresent}</td><td>${totalAbsent}</td><td>${totalLate}</td></tr></tbody></table>
      </body></html>`;
    const w = window.open("", "_blank", "width=800,height=700");
    if (w) { w.document.write(printContent); w.document.close(); w.print(); }
  }

  if (showSF2Modal) {
    return <GradeSF2ExportModal grade={grade} month={month} year={year} schoolDayDates={schoolDayDates} onClose={onClose} />;
  }

  return (
    <div className="principal-attendance-modal-overlay" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", backdropFilter: "blur(6px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 16 }} onClick={onClose}>
      <div className="principal-attendance-modal" style={{ background: WHITE, borderRadius: 22, width: "100%", maxWidth: 720, boxShadow: "0 24px 64px rgba(82,32,129,0.28)", animation: "modalIn 0.22s cubic-bezier(.34,1.56,.64,1)", maxHeight: "92vh", display: "flex", flexDirection: "column" }} onClick={e => e.stopPropagation()}>
        <div style={{ padding: "20px 24px 16px", borderBottom: `1px solid ${GRAY_100}`, display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0, gap: 12, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontWeight: 800, fontSize: 17, color: GRAY_800 }}>{grade.label} — Monthly Attendance Tally</div>
            <div style={{ fontSize: 12, color: GRAY_400, marginTop: 3 }}>All sections &nbsp;·&nbsp; {grade.sections.length} sections &nbsp;·&nbsp; {allStudents.length} students &nbsp;·&nbsp; {month} {year}</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            {/* Export SF2 now opens holiday picker */}
            <button
              onClick={() => setShowSF2Modal(true)}
              style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 10, border: "none", background: SUCCESS_GREEN, color: WHITE, fontWeight: 700, fontSize: 12, cursor: "pointer", boxShadow: "0 3px 10px rgba(16,185,129,0.3)" }}
            >
              <ExcelIcon /> Export SF2 (.xlsx)
            </button>
            <button onClick={handlePrint} style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 10, border: "none", background: PRIMARY, color: WHITE, fontWeight: 700, fontSize: 12, cursor: "pointer", boxShadow: "0 3px 10px rgba(82,32,129,0.3)" }}><PrintIcon /> Print</button>
            <button onClick={onClose} style={{ width: 34, height: 34, borderRadius: 10, border: `1px solid ${GRAY_200}`, background: WHITE, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: GRAY_400 }}><CloseIcon /></button>
          </div>
        </div>
        <div style={{ margin: "12px 24px 0", padding: "10px 14px", background: "#ede9fe", borderRadius: 12, border: `1px solid #c4b5fd`, fontSize: 12, color: PRIMARY, fontWeight: 500, display: "flex", alignItems: "center", gap: 8 }}>
          <CalendarIcon /><span>Click <strong>Export SF2</strong> to configure holidays before exporting one sheet per section in the official DepEd template.</span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12, padding: "16px 24px", borderBottom: `1px solid ${GRAY_100}`, flexShrink: 0, marginTop: 12 }}>
          {[
            { label: "Total Present", value: totalPresent, color: SUCCESS_GREEN, bg: "#f0fdf4", border: "#bbf7d0" },
            { label: "Total Absent", value: totalAbsent, color: URGENT_RED, bg: "#fef2f2", border: "#fecaca" },
            { label: "Total Late", value: totalLate, color: WARNING_AMBER, bg: "#fffbeb", border: "#fde68a" },
          ].map(s => (
            <div key={s.label} style={{ background: s.bg, border: `1.5px solid ${s.border}`, borderRadius: 14, padding: "14px 16px" }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: s.color, marginBottom: 6 }}>{s.label}</div>
              <div style={{ fontSize: 28, fontWeight: 800, color: s.color, lineHeight: 1 }}>{s.value}</div>
              <div style={{ fontSize: 11, color: s.color, opacity: 0.65, marginTop: 4 }}>{allStudents.length} students · {grade.sections.length} sections</div>
            </div>
          ))}
        </div>
        <div style={{ overflowY: "auto", flex: 1 }}>
          {grade.sections.map(sec => {
            const sp = sec.students.reduce((a, r) => a + r.present, 0);
            const sa = sec.students.reduce((a, r) => a + r.absent, 0);
            const sl = sec.students.reduce((a, r) => a + r.late, 0);
            const mCount = sec.students.filter(s => s.gender === "M").length;
            const fCount = sec.students.filter(s => s.gender === "F").length;
            return (
              <div key={sec.id}>
                <div style={{ padding: "10px 24px", background: "#ede9fe", borderBottom: `1px solid #ddd6fe`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span style={{ fontWeight: 700, fontSize: 13, color: PRIMARY }}>Section {sec.name}</span>
                  <span style={{ fontSize: 12, color: GRAY_400 }}>{sec.adviser} · {mCount}M {fCount}F</span>
                </div>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead><tr style={{ background: GRAY_50 }}>
                    <th style={{ padding: "9px 24px", textAlign: "left", fontWeight: 700, color: GRAY_600, fontSize: 11, borderBottom: `1px solid ${GRAY_200}` }}>#</th>
                    <th style={{ padding: "9px 8px", textAlign: "left", fontWeight: 700, color: GRAY_600, fontSize: 11, borderBottom: `1px solid ${GRAY_200}` }}>Name</th>
                    <th style={{ padding: "9px 12px", textAlign: "center", fontWeight: 700, color: GRAY_600, fontSize: 11, borderBottom: `1px solid ${GRAY_200}` }}>G</th>
                    <th style={{ padding: "9px 16px", textAlign: "center", fontWeight: 700, color: SUCCESS_GREEN, fontSize: 11, borderBottom: `1px solid ${GRAY_200}` }}>Present</th>
                    <th style={{ padding: "9px 16px", textAlign: "center", fontWeight: 700, color: URGENT_RED, fontSize: 11, borderBottom: `1px solid ${GRAY_200}` }}>Absent</th>
                    <th style={{ padding: "9px 16px", textAlign: "center", fontWeight: 700, color: WARNING_AMBER, fontSize: 11, borderBottom: `1px solid ${GRAY_200}` }}>Late</th>
                  </tr></thead>
                  <tbody>
                    {sec.students.map((st, idx) => (
                      <tr key={st.id} style={{ background: idx % 2 === 0 ? WHITE : GRAY_50 }}>
                        <td style={{ padding: "8px 24px", color: GRAY_400, fontSize: 12 }}>{idx + 1}</td>
                        <td style={{ padding: "8px 8px", fontWeight: 600, color: GRAY_800, fontSize: 12 }}>{st.name}</td>
                        <td style={{ padding: "8px 12px", textAlign: "center" }}><span style={{ fontSize: 11, fontWeight: 700, color: st.gender === "M" ? "#3b82f6" : "#ec4899", background: st.gender === "M" ? "#eff6ff" : "#fdf2f8", borderRadius: 6, padding: "1px 7px" }}>{st.gender}</span></td>
                        <td style={{ padding: "8px 16px", textAlign: "center" }}><span style={{ background: "#f0fdf4", color: SUCCESS_GREEN, border: "1px solid #bbf7d0", borderRadius: 7, padding: "2px 9px", fontWeight: 700, fontSize: 12 }}>{st.present}</span></td>
                        <td style={{ padding: "8px 16px", textAlign: "center" }}><span style={{ background: st.absent > 0 ? "#fef2f2" : GRAY_50, color: st.absent > 0 ? URGENT_RED : GRAY_400, border: `1px solid ${st.absent > 0 ? "#fecaca" : GRAY_200}`, borderRadius: 7, padding: "2px 9px", fontWeight: 700, fontSize: 12 }}>{st.absent}</span></td>
                        <td style={{ padding: "8px 16px", textAlign: "center" }}><span style={{ background: st.late > 0 ? "#fffbeb" : GRAY_50, color: st.late > 0 ? WARNING_AMBER : GRAY_400, border: `1px solid ${st.late > 0 ? "#fde68a" : GRAY_200}`, borderRadius: 7, padding: "2px 9px", fontWeight: 700, fontSize: 12 }}>{st.late}</span></td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot><tr style={{ background: `${PRIMARY}08`, borderTop: `1.5px solid ${GRAY_200}` }}>
                    <td colSpan={3} style={{ padding: "9px 24px", fontWeight: 800, fontSize: 12, color: GRAY_800 }}>Section {sec.name} Subtotal</td>
                    <td style={{ padding: "9px 16px", textAlign: "center", fontWeight: 800, color: SUCCESS_GREEN }}>{sp}</td>
                    <td style={{ padding: "9px 16px", textAlign: "center", fontWeight: 800, color: URGENT_RED }}>{sa}</td>
                    <td style={{ padding: "9px 16px", textAlign: "center", fontWeight: 800, color: WARNING_AMBER }}>{sl}</td>
                  </tr></tfoot>
                </table>
              </div>
            );
          })}
          <div style={{ display: "grid", gridTemplateColumns: "1fr repeat(3,90px)", padding: "14px 24px", background: `${PRIMARY}10`, borderTop: `2px solid ${PRIMARY}30`, alignItems: "center" }}>
            <span style={{ fontWeight: 800, fontSize: 13, color: PRIMARY }}>{grade.label} Grand Total</span>
            {[{ val: totalPresent, color: SUCCESS_GREEN }, { val: totalAbsent, color: URGENT_RED }, { val: totalLate, color: WARNING_AMBER }].map((s, i) => (
              <span key={i} style={{ textAlign: "center", fontWeight: 800, fontSize: 15, color: s.color }}>{s.val}</span>
            ))}
          </div>
        </div>
      </div>
      <style>{`@keyframes modalIn{from{opacity:0;transform:scale(0.93) translateY(14px)}to{opacity:1;transform:scale(1) translateY(0)}}`}</style>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────
export default function AttendanceSummaryPage() {
  const [manilaToday] = useState(() => toManilaDateString());
  const [manilaYear, manilaMonth] = manilaToday.split("-").map(Number);
  const yearOptions = Array.from({ length: 5 }, (_, i) => manilaYear - 2 + i);
  const [guideTarget, setGuideTarget] = useState<string | null>(null);
  const [selectedGrade, setSelectedGrade] = useState<GradeLevel | null>(null);
  const [selectedSection, setSelectedSection] = useState<Section | null>(null);
  const [showExport, setShowExport] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState(MONTHS[manilaMonth - 1]);
  const [selectedYear, setSelectedYear] = useState(manilaYear);

  // ── new ──────────────────────────────────────────────────────────
  const [gradeData, setGradeData] = useState<GradeLevel[]>([]);
  const [schoolDayDates, setSchoolDayDates] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const monthIndex = MONTHS.indexOf(selectedMonth) + 1; // convert to 1-based number
    const controller = new AbortController();

    async function fetchSummary() {
      setSelectedGrade(null);
      setSelectedSection(null);
      setLoading(true);
      setFetchError(null);
      try {
        const res = await fetch(
          `/api/attendance/monthly-summary?year=${selectedYear}&month=${monthIndex}`,
          { signal: controller.signal, cache: "no-store" }
        );
        const json = await res.json().catch(() => null);
        if (!res.ok) throw new Error(json?.message ?? "Failed to load attendance data");
        if (!json.success) throw new Error(json.message ?? "Unknown error");
        if (controller.signal.aborted) return;
        setGradeData(json.gradeData ?? []);
        setSchoolDayDates(Array.isArray(json.schoolDays) ? json.schoolDays : []);
      } catch (err: unknown) {
        if (controller.signal.aborted) return;
        setFetchError(err instanceof Error ? err.message : "Failed to load attendance data");
        setGradeData([]);
        setSchoolDayDates([]);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    fetchSummary();
    return () => controller.abort();
  }, [selectedMonth, selectedYear, reloadKey]);
  // ─────────────────────────────────────────────────────────────────

  function handleSelectGrade(g: GradeLevel) { setSelectedGrade(g); setSelectedSection(null); }
  function handleSelectSection(s: Section) { setSelectedSection(s); }
  function handleBack() {
    if (selectedSection) setSelectedSection(null);
    else setSelectedGrade(null);
  }

  const totalSchoolPresent = gradeData.flatMap(g => g.sections).flatMap(s => s.students).reduce((a, r) => a + r.present, 0);
  const totalSchoolExcused = gradeData.flatMap(g => g.sections).flatMap(s => s.students).reduce((a, r) => a + r.excused, 0);
  const totalSchoolAbsent = gradeData.flatMap(g => g.sections).flatMap(s => s.students).reduce((a, r) => a + r.absent, 0);
  const totalSchoolLate = gradeData.flatMap(g => g.sections).flatMap(s => s.students).reduce((a, r) => a + r.late, 0);

  const crumbs: string[] = ["Grade Levels"];
  if (selectedGrade) crumbs.push(selectedGrade.label);
  if (selectedSection) crumbs.push(`Section ${selectedSection.name}`);
  const guideHighlight = (target: string) => guideTarget === target
    ? "relative z-[85] rounded-2xl ring-4 ring-violet-400 ring-offset-4 ring-offset-slate-50"
    : "";

  return (
    <div className="principal-attendance-page" style={{ fontFamily: "'Inter','Segoe UI',sans-serif", padding: 28, minWidth: 0, overflowX: "hidden" }}>
      <div className="principal-attendance-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800, color: GRAY_800 }}>Attendance Summary</h1>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: PRIMARY }}>Monthly attendance tally by grade level and section</p>
        </div>
        <div
          data-parent-guide="principal-attendance-period"
          className={`principal-attendance-pickers ${guideHighlight("principal-attendance-period")}`}
          style={{ display: "flex", gap: 8 }}
        >
          <select aria-label="Attendance month" value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)} style={{ minHeight: 44, padding: "8px 14px", borderRadius: 10, border: `1.5px solid ${GRAY_200}`, fontSize: 13, fontWeight: 600, color: GRAY_800, background: WHITE, cursor: "pointer", outline: "none" }}>
            {MONTHS.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
          <select aria-label="Attendance year" value={selectedYear} onChange={e => setSelectedYear(Number(e.target.value))} style={{ minHeight: 44, padding: "8px 14px", borderRadius: 10, border: `1.5px solid ${GRAY_200}`, fontSize: 13, fontWeight: 600, color: GRAY_800, background: WHITE, cursor: "pointer", outline: "none" }}>
            {yearOptions.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
      </div>

      <div
        data-parent-guide="principal-attendance-schoolwide"
        className={`principal-attendance-stats ${guideHighlight("principal-attendance-schoolwide")}`}
        style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 14, marginBottom: 24 }}
      >
        {[
          { label: "School-wide Present", value: totalSchoolPresent, color: SUCCESS_GREEN, bg: "#f0fdf4", border: "#bbf7d0" },
          { label: "School-wide Excused", value: totalSchoolExcused, color: "#0369a1", bg: "#e0f2fe", border: "#bae6fd" },
          { label: "School-wide Absent", value: totalSchoolAbsent, color: URGENT_RED, bg: "#fef2f2", border: "#fecaca" },
          { label: "School-wide Late", value: totalSchoolLate, color: WARNING_AMBER, bg: "#fffbeb", border: "#fde68a" },
        ].map(s => (
          <div className="principal-attendance-stat-card" key={s.label} style={{ background: s.bg, border: `1.5px solid ${s.border}`, borderRadius: 16, padding: "20px 22px" }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: s.color, opacity: 0.8, marginBottom: 8 }}>{s.label}</div>
            <div style={{ fontSize: 32, fontWeight: 800, color: s.color, lineHeight: 1 }}>{s.value}</div>
            <div style={{ fontSize: 11, color: s.color, opacity: 0.6, marginTop: 6 }}>{selectedMonth} {selectedYear}</div>
          </div>
        ))}
      </div>

      {selectedGrade && (
        <div className="principal-attendance-breadcrumb" style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 16 }}>
          <button onClick={handleBack} style={{ minHeight: 40, display: "flex", alignItems: "center", gap: 4, padding: "6px 12px", borderRadius: 8, border: `1px solid ${GRAY_200}`, background: WHITE, fontSize: 12, color: GRAY_600, cursor: "pointer", fontWeight: 600 }}>
            <ChevronLeft /> Back
          </button>
          {crumbs.map((c, i) => (
            <span key={i} style={{ display: "flex", alignItems: "center", gap: 6 }}>
              {i > 0 && <span style={{ color: GRAY_400 }}><ChevronRight /></span>}
              <span style={{ fontSize: 13, fontWeight: i === crumbs.length - 1 ? 700 : 500, color: i === crumbs.length - 1 ? PRIMARY : GRAY_400 }}>{c}</span>
            </span>
          ))}
        </div>
      )}

      {loading && (
        <div style={{ textAlign: "center", padding: "48px 0", color: GRAY_400, fontSize: 14 }}>
          Loading attendance data...
        </div>
      )}

      {fetchError && !loading && (
        <div style={{ textAlign: "center", padding: "32px", background: "#fef2f2", borderRadius: 14, border: "1.5px solid #fecaca", color: URGENT_RED, fontSize: 13, fontWeight: 600 }}>
          <p style={{ margin: 0 }}>{fetchError}</p>
          <button onClick={() => setReloadKey(value => value + 1)} style={{ marginTop: 14, minHeight: 40, padding: "8px 14px", borderRadius: 9, border: `1px solid ${URGENT_RED}`, background: WHITE, color: URGENT_RED, fontWeight: 700, cursor: "pointer" }}>Try again</button>
        </div>
      )}

      {!loading && !fetchError && !selectedGrade && (
        <div
          data-parent-guide="principal-attendance-grades"
          className={`principal-attendance-grade-grid ${guideHighlight("principal-attendance-grades")}`}
          style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 16 }}
        >
          {gradeData.map(grade => {
            const gPresent = grade.sections.flatMap(s => s.students).reduce((a, r) => a + r.present, 0);
            const gExcused = grade.sections.flatMap(s => s.students).reduce((a, r) => a + r.excused, 0);
            const gAbsent = grade.sections.flatMap(s => s.students).reduce((a, r) => a + r.absent, 0);
            const gLate = grade.sections.flatMap(s => s.students).reduce((a, r) => a + r.late, 0);
            const total = grade.sections.reduce((a, s) => a + s.students.length, 0);
            return (
              <button className="principal-attendance-grade-card" key={grade.grade} onClick={() => handleSelectGrade(grade)}
                style={{ background: WHITE, border: `1.5px solid ${GRAY_200}`, borderRadius: 18, padding: "24px 22px", cursor: "pointer", textAlign: "left", transition: "all 0.2s", boxShadow: "0 2px 8px rgba(0,0,0,0.04)" }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = PRIMARY; (e.currentTarget as HTMLButtonElement).style.boxShadow = `0 8px 28px rgba(82,32,129,0.18)`; (e.currentTarget as HTMLButtonElement).style.transform = "translateY(-2px)"; }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = GRAY_200; (e.currentTarget as HTMLButtonElement).style.boxShadow = "0 2px 8px rgba(0,0,0,0.04)"; (e.currentTarget as HTMLButtonElement).style.transform = "translateY(0)"; }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
                  <div style={{ width: 48, height: 48, borderRadius: 14, background: `linear-gradient(135deg, ${PRIMARY} 0%, ${PRIMARY_LIGHT} 100%)`, display: "flex", alignItems: "center", justifyContent: "center", color: WHITE, fontWeight: 800, fontSize: 22, boxShadow: "0 4px 14px rgba(82,32,129,0.28)" }}>{grade.grade.replace("Grade ", "")}</div>
                  <div style={{ color: GRAY_400 }}><ChevronRight /></div>
                </div>
                <div style={{ fontWeight: 800, fontSize: 18, color: GRAY_800, marginBottom: 4 }}>{grade.label}</div>
                <div style={{ fontSize: 12, color: GRAY_400, marginBottom: 16 }}>{grade.sections.length} sections · {total} students</div>
                <div className="principal-attendance-mini-stats" style={{ display: "flex", gap: 8 }}>
                  {[{ label: "Present", val: gPresent, color: SUCCESS_GREEN, bg: "#f0fdf4" }, { label: "Excused", val: gExcused, color: "#0369a1", bg: "#e0f2fe" }, { label: "Absent", val: gAbsent, color: URGENT_RED, bg: "#fef2f2" }, { label: "Late", val: gLate, color: WARNING_AMBER, bg: "#fffbeb" }].map(s => (
                    <div key={s.label} style={{ flex: 1, background: s.bg, borderRadius: 10, padding: "8px 6px", textAlign: "center" }}>
                      <div style={{ fontSize: 16, fontWeight: 800, color: s.color }}>{s.val}</div>
                      <div style={{ fontSize: 10, color: s.color, opacity: 0.7, fontWeight: 600 }}>{s.label}</div>
                    </div>
                  ))}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {!loading && !fetchError && !selectedGrade && gradeData.length === 0 && (
        <div style={{ textAlign: "center", padding: "48px 24px", background: WHITE, border: `1.5px solid ${GRAY_200}`, borderRadius: 16, color: GRAY_400, fontSize: 14 }}>
          No grade or attendance records are available for {selectedMonth} {selectedYear}.
        </div>
      )}

      {selectedGrade && !selectedSection && (
        <div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, padding: "14px 20px", background: WHITE, borderRadius: 16, border: `1.5px solid ${GRAY_200}`, boxShadow: "0 2px 8px rgba(0,0,0,0.04)", gap: 12, flexWrap: "wrap" }}>
            <div>
              <div style={{ fontWeight: 800, fontSize: 15, color: GRAY_800 }}>{selectedGrade.label} — All Sections</div>
              <div style={{ fontSize: 12, color: GRAY_400, marginTop: 2 }}>{selectedGrade.sections.length} sections · {selectedGrade.sections.reduce((a, s) => a + s.students.length, 0)} students</div>
            </div>
            {/* Export button for the whole grade — now shows the attendance tally modal which has holiday-picker SF2 export */}
          </div>
          <div className="principal-attendance-section-grid" style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 16 }}>
            {selectedGrade.sections.map(section => {
              const sPresent = section.students.reduce((a, r) => a + r.present, 0);
              const sExcused = section.students.reduce((a, r) => a + r.excused, 0);
              const sAbsent = section.students.reduce((a, r) => a + r.absent, 0);
              const sLate = section.students.reduce((a, r) => a + r.late, 0);
              const mCount = section.students.filter(s => s.gender === "M").length;
              const fCount = section.students.filter(s => s.gender === "F").length;
              return (
                <button className="principal-attendance-section-card" key={section.id} onClick={() => handleSelectSection(section)}
                  style={{ background: WHITE, border: `1.5px solid ${GRAY_200}`, borderRadius: 18, padding: "22px 20px", cursor: "pointer", textAlign: "left", transition: "all 0.2s", boxShadow: "0 2px 8px rgba(0,0,0,0.04)" }}
                  onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = ACCENT; (e.currentTarget as HTMLButtonElement).style.boxShadow = `0 8px 28px rgba(139,92,246,0.18)`; (e.currentTarget as HTMLButtonElement).style.transform = "translateY(-2px)"; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = GRAY_200; (e.currentTarget as HTMLButtonElement).style.boxShadow = "0 2px 8px rgba(0,0,0,0.04)"; (e.currentTarget as HTMLButtonElement).style.transform = "translateY(0)"; }}
                >
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 14 }}>
                    <div>
                      <div style={{ fontWeight: 800, fontSize: 16, color: GRAY_800 }}>Section {section.name}</div>
                      <div style={{ fontSize: 12, color: GRAY_400, marginTop: 2 }}>{selectedGrade.label} · {mCount}M {fCount}F · {section.students.length} total</div>
                      <div style={{ fontSize: 12, color: PRIMARY, fontWeight: 600, marginTop: 4 }}>{section.adviser}</div>
                    </div>
                    <div style={{ width: 36, height: 36, borderRadius: 10, background: `${ACCENT}18`, display: "flex", alignItems: "center", justifyContent: "center", color: ACCENT }}><Users /></div>
                  </div>
                  <div className="principal-attendance-mini-stats" style={{ display: "flex", gap: 8 }}>
                  {[{ label: "Present", val: sPresent, color: SUCCESS_GREEN, bg: "#f0fdf4", border: "#bbf7d0" }, { label: "Excused", val: sExcused, color: "#0369a1", bg: "#e0f2fe", border: "#bae6fd" }, { label: "Absent", val: sAbsent, color: URGENT_RED, bg: "#fef2f2", border: "#fecaca" }, { label: "Late", val: sLate, color: WARNING_AMBER, bg: "#fffbeb", border: "#fde68a" }].map(s => (
                      <div key={s.label} style={{ flex: 1, background: s.bg, borderRadius: 10, padding: "10px 8px", textAlign: "center", border: `1px solid ${s.border}` }}>
                        <div style={{ fontSize: 18, fontWeight: 800, color: s.color }}>{s.val}</div>
                        <div style={{ fontSize: 10, color: s.color, opacity: 0.7, fontWeight: 600, marginTop: 2 }}>{s.label}</div>
                      </div>
                    ))}
                  </div>
                  <div style={{ marginTop: 14, padding: "8px 12px", background: GRAY_50, borderRadius: 10, border: `1px solid ${GRAY_100}`, display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: PRIMARY, fontWeight: 600 }}>
                    <Download /> View & Export SF2
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {selectedSection && (
        <div className="principal-attendance-table-card" style={{ background: WHITE, borderRadius: 18, border: `1.5px solid ${GRAY_200}`, overflow: "hidden" }}>
          <div className="principal-attendance-detail-header" style={{ padding: "20px 24px", borderBottom: `1px solid ${GRAY_100}`, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <div>
              <div style={{ fontWeight: 800, fontSize: 16, color: GRAY_800 }}>Section {selectedSection.name} — Student Attendance</div>
              <div style={{ fontSize: 12, color: GRAY_400, marginTop: 3 }}>{selectedGrade?.label} · {selectedSection.adviser} · {selectedSection.students.filter(s => s.gender === "M").length}M {selectedSection.students.filter(s => s.gender === "F").length}F · {selectedSection.students.length} total</div>
            </div>
            <button onClick={() => setShowExport(true)} style={{ minHeight: 44, display: "flex", alignItems: "center", gap: 7, padding: "10px 18px", borderRadius: 11, border: "none", background: `linear-gradient(135deg, ${PRIMARY} 0%, ${PRIMARY_LIGHT} 100%)`, color: WHITE, fontWeight: 700, fontSize: 13, cursor: "pointer", boxShadow: "0 4px 14px rgba(82,32,129,0.3)" }}>
              <Download /> Export / Print SF2
            </button>
          </div>
          {(() => {
            const sPresent = selectedSection.students.reduce((a, r) => a + r.present, 0);
            const sAbsent = selectedSection.students.reduce((a, r) => a + r.absent, 0);
            const sLate = selectedSection.students.reduce((a, r) => a + r.late, 0);
            const sExcused = selectedSection.students.reduce((a, r) => a + (r.excused ?? 0), 0);
            return (
              <div className="principal-attendance-detail-stats" style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12, padding: "16px 24px", background: GRAY_50, borderBottom: `1px solid ${GRAY_100}` }}>
                {[{ label: "Total Present", val: sPresent, color: SUCCESS_GREEN, bg: "#f0fdf4", border: "#bbf7d0" }, { label: "Total Excused", val: sExcused, color: "#0369a1", bg: "#e0f2fe", border: "#bae6fd" }, { label: "Total Absent", val: sAbsent, color: URGENT_RED, bg: "#fef2f2", border: "#fecaca" }, { label: "Total Late", val: sLate, color: WARNING_AMBER, bg: "#fffbeb", border: "#fde68a" }].map(s => (
                  <div key={s.label} style={{ background: s.bg, border: `1.5px solid ${s.border}`, borderRadius: 12, padding: "12px 16px", display: "flex", alignItems: "center", gap: 12 }}>
                    <div style={{ fontSize: 26, fontWeight: 800, color: s.color }}>{s.val}</div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: s.color, opacity: 0.75 }}>{s.label}</div>
                  </div>
                ))}
              </div>
            );
          })()}
          <div style={{ padding: "10px 24px 4px", background: "#eff6ff", borderBottom: `1px solid #dbeafe` }}>
            <span style={{ fontWeight: 700, fontSize: 12, color: "#1d4ed8" }}>MALE — {selectedSection.students.filter(s => s.gender === "M").length} students</span>
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead><tr style={{ background: GRAY_50 }}>
              <th style={{ padding: "11px 24px", textAlign: "left", color: GRAY_600, fontWeight: 700, fontSize: 12, borderBottom: `1px solid ${GRAY_200}` }}>#</th>
              <th style={{ padding: "11px 8px", textAlign: "left", color: GRAY_600, fontWeight: 700, fontSize: 12, borderBottom: `1px solid ${GRAY_200}` }}>Student Name</th>
              <th style={{ padding: "11px 16px", textAlign: "center", color: SUCCESS_GREEN, fontWeight: 700, fontSize: 12, borderBottom: `1px solid ${GRAY_200}` }}>Present</th>
              <th style={{ padding: "11px 16px", textAlign: "center", color: "#0369a1", fontWeight: 700, fontSize: 12, borderBottom: `1px solid ${GRAY_200}` }}>Excused</th>
              <th style={{ padding: "11px 16px", textAlign: "center", color: URGENT_RED, fontWeight: 700, fontSize: 12, borderBottom: `1px solid ${GRAY_200}` }}>Absent</th>
              <th style={{ padding: "11px 16px", textAlign: "center", color: WARNING_AMBER, fontWeight: 700, fontSize: 12, borderBottom: `1px solid ${GRAY_200}` }}>Late</th>
            </tr></thead>
            <tbody>
              {selectedSection.students.filter(s => s.gender === "M").map((student, idx) => (
                <tr key={student.id} style={{ background: idx % 2 === 0 ? WHITE : GRAY_50 }}>
                  <td style={{ padding: "10px 24px", color: GRAY_400, fontSize: 12 }}>{idx + 1}</td>
                  <td style={{ padding: "10px 8px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <div style={{ width: 32, height: 32, borderRadius: "50%", background: `${PRIMARY}18`, display: "flex", alignItems: "center", justifyContent: "center", color: PRIMARY, fontWeight: 700, fontSize: 11, flexShrink: 0 }}>{student.name.split(",")[0]?.slice(0, 2).toUpperCase() || "ST"}</div>
                      <span style={{ fontWeight: 600, color: GRAY_800 }}>{student.name}</span>
                    </div>
                  </td>
                  <td style={{ padding: "10px 16px", textAlign: "center" }}><span style={{ background: "#f0fdf4", color: SUCCESS_GREEN, border: "1px solid #bbf7d0", borderRadius: 8, padding: "4px 12px", fontWeight: 700, fontSize: 12 }}>{student.present}</span></td>
                  <td style={{ padding: "10px 16px", textAlign: "center" }}><span style={{ background: (student.excused ?? 0) > 0 ? "#e0f2fe" : GRAY_50, color: (student.excused ?? 0) > 0 ? "#0369a1" : GRAY_400, border: `1px solid ${(student.excused ?? 0) > 0 ? "#bae6fd" : GRAY_200}`, borderRadius: 8, padding: "4px 12px", fontWeight: 700, fontSize: 12 }}>{student.excused ?? 0}</span></td>
                  <td style={{ padding: "10px 16px", textAlign: "center" }}><span style={{ background: student.absent > 0 ? "#fef2f2" : GRAY_50, color: student.absent > 0 ? URGENT_RED : GRAY_400, border: `1px solid ${student.absent > 0 ? "#fecaca" : GRAY_200}`, borderRadius: 8, padding: "4px 12px", fontWeight: 700, fontSize: 12 }}>{student.absent}</span></td>
                  <td style={{ padding: "10px 16px", textAlign: "center" }}><span style={{ background: student.late > 0 ? "#fffbeb" : GRAY_50, color: student.late > 0 ? WARNING_AMBER : GRAY_400, border: `1px solid ${student.late > 0 ? "#fde68a" : GRAY_200}`, borderRadius: 8, padding: "4px 12px", fontWeight: 700, fontSize: 12 }}>{student.late}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ padding: "10px 24px 4px", background: "#fdf2f8", borderTop: `2px solid ${GRAY_100}`, borderBottom: `1px solid #fbcfe8` }}>
            <span style={{ fontWeight: 700, fontSize: 12, color: "#9d174d" }}>FEMALE — {selectedSection.students.filter(s => s.gender === "F").length} students</span>
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead><tr style={{ background: GRAY_50 }}>
              <th style={{ padding: "11px 24px", textAlign: "left", color: GRAY_600, fontWeight: 700, fontSize: 12, borderBottom: `1px solid ${GRAY_200}` }}>#</th>
              <th style={{ padding: "11px 8px", textAlign: "left", color: GRAY_600, fontWeight: 700, fontSize: 12, borderBottom: `1px solid ${GRAY_200}` }}>Student Name</th>
              <th style={{ padding: "11px 16px", textAlign: "center", color: SUCCESS_GREEN, fontWeight: 700, fontSize: 12, borderBottom: `1px solid ${GRAY_200}` }}>Present</th>
              <th style={{ padding: "11px 16px", textAlign: "center", color: "#0369a1", fontWeight: 700, fontSize: 12, borderBottom: `1px solid ${GRAY_200}` }}>Excused</th>
              <th style={{ padding: "11px 16px", textAlign: "center", color: URGENT_RED, fontWeight: 700, fontSize: 12, borderBottom: `1px solid ${GRAY_200}` }}>Absent</th>
              <th style={{ padding: "11px 16px", textAlign: "center", color: WARNING_AMBER, fontWeight: 700, fontSize: 12, borderBottom: `1px solid ${GRAY_200}` }}>Late</th>
            </tr></thead>
            <tbody>
              {selectedSection.students.filter(s => s.gender === "F").map((student, idx) => (
                <tr key={student.id} style={{ background: idx % 2 === 0 ? WHITE : GRAY_50 }}>
                  <td style={{ padding: "10px 24px", color: GRAY_400, fontSize: 12 }}>{idx + 1}</td>
                  <td style={{ padding: "10px 8px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <div style={{ width: 32, height: 32, borderRadius: "50%", background: "#fdf2f8", display: "flex", alignItems: "center", justifyContent: "center", color: "#9d174d", fontWeight: 700, fontSize: 11, flexShrink: 0 }}>{student.name.split(",")[0]?.slice(0, 2).toUpperCase() || "ST"}</div>
                      <span style={{ fontWeight: 600, color: GRAY_800 }}>{student.name}</span>
                    </div>
                  </td>
                  <td style={{ padding: "10px 16px", textAlign: "center" }}><span style={{ background: "#f0fdf4", color: SUCCESS_GREEN, border: "1px solid #bbf7d0", borderRadius: 8, padding: "4px 12px", fontWeight: 700, fontSize: 12 }}>{student.present}</span></td>
                  <td style={{ padding: "10px 16px", textAlign: "center" }}><span style={{ background: (student.excused ?? 0) > 0 ? "#e0f2fe" : GRAY_50, color: (student.excused ?? 0) > 0 ? "#0369a1" : GRAY_400, border: `1px solid ${(student.excused ?? 0) > 0 ? "#bae6fd" : GRAY_200}`, borderRadius: 8, padding: "4px 12px", fontWeight: 700, fontSize: 12 }}>{student.excused ?? 0}</span></td>
                  <td style={{ padding: "10px 16px", textAlign: "center" }}><span style={{ background: student.absent > 0 ? "#fef2f2" : GRAY_50, color: student.absent > 0 ? URGENT_RED : GRAY_400, border: `1px solid ${student.absent > 0 ? "#fecaca" : GRAY_200}`, borderRadius: 8, padding: "4px 12px", fontWeight: 700, fontSize: 12 }}>{student.absent}</span></td>
                  <td style={{ padding: "10px 16px", textAlign: "center" }}><span style={{ background: student.late > 0 ? "#fffbeb" : GRAY_50, color: student.late > 0 ? WARNING_AMBER : GRAY_400, border: `1px solid ${student.late > 0 ? "#fde68a" : GRAY_200}`, borderRadius: 8, padding: "4px 12px", fontWeight: 700, fontSize: 12 }}>{student.late}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
          {(() => {
            const sPresent = selectedSection.students.reduce((a, r) => a + r.present, 0);
            const sAbsent = selectedSection.students.reduce((a, r) => a + r.absent, 0);
            const sLate = selectedSection.students.reduce((a, r) => a + r.late, 0);
            const sExcused = selectedSection.students.reduce((a, r) => a + (r.excused ?? 0), 0);
            return (
              <div style={{ display: "grid", gridTemplateColumns: "1fr repeat(4,80px)", padding: "13px 24px", background: `${PRIMARY}08`, borderTop: `2px solid ${GRAY_200}`, alignItems: "center" }}>
                <span style={{ fontWeight: 800, fontSize: 13, color: GRAY_800 }}>OVERALL TOTAL</span>
                <span style={{ textAlign: "center", fontWeight: 800, fontSize: 15, color: SUCCESS_GREEN }}>{sPresent}</span>
                <span style={{ textAlign: "center", fontWeight: 800, fontSize: 15, color: "#0369a1" }}>{sExcused}</span>
                <span style={{ textAlign: "center", fontWeight: 800, fontSize: 15, color: URGENT_RED }}>{sAbsent}</span>
                <span style={{ textAlign: "center", fontWeight: 800, fontSize: 15, color: WARNING_AMBER }}>{sLate}</span>
              </div>
            );
          })()}
        </div>
      )}

      {/* Export modals */}
      {showExport && selectedSection && (
        <ExportModal
          section={selectedSection}
          gradeLabel={selectedGrade?.label ?? ""}
          month={selectedMonth}
          year={selectedYear}
          schoolDayDates={schoolDayDates}
          onClose={() => setShowExport(false)}
        />
      )}

      {showExport && !selectedSection && selectedGrade && (
        <GradeExportModal
          grade={selectedGrade}
          month={selectedMonth}
          year={selectedYear}
          schoolDayDates={schoolDayDates}
          onClose={() => setShowExport(false)}
        />
      )}

      <style>{`
        @media (max-width: 1024px) {
          .principal-attendance-grade-grid { grid-template-columns: repeat(2,1fr) !important; }
          .principal-attendance-stats { grid-template-columns: repeat(2,1fr) !important; }
          .principal-attendance-table-card { overflow-x: auto !important; -webkit-overflow-scrolling: touch; }
        }
        @media (max-width: 640px) {
          .principal-attendance-page { padding: 16px !important; overflow-x: hidden !important; }
          .principal-attendance-header { flex-direction: column; gap: 12px; }
          .principal-attendance-header h1 { font-size: 24px !important; }
          .principal-attendance-pickers { width: 100%; }
          .principal-attendance-pickers select:first-child { flex: 1 1 0; min-width: 0; }
          .principal-attendance-pickers select:last-child { width: 104px; flex: 0 0 104px; }
          .principal-attendance-stats { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; gap: 10px !important; }
          .principal-attendance-stat-card { min-width: 0; padding: 16px !important; }
          .principal-attendance-grade-grid,
          .principal-attendance-section-grid { grid-template-columns: 1fr !important; }
          .principal-attendance-grade-card,
          .principal-attendance-section-card { min-width: 0; padding: 18px 16px !important; }
          .principal-attendance-mini-stats { display: grid !important; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px !important; }
          .principal-attendance-detail-header { padding: 16px !important; align-items: stretch !important; }
          .principal-attendance-detail-header > button { width: 100%; justify-content: center; }
          .principal-attendance-detail-stats { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; padding: 12px 16px !important; gap: 8px !important; }
          .principal-attendance-detail-stats > div { min-width: 0; padding: 10px !important; gap: 8px !important; }
          .principal-attendance-breadcrumb { flex-wrap: wrap; row-gap: 8px; }
          .principal-attendance-breadcrumb > span { min-width: 0; overflow-wrap: anywhere; }
          .principal-attendance-table-card { overflow-x: auto !important; -webkit-overflow-scrolling: touch; }
          .principal-attendance-modal-overlay { align-items: flex-end !important; padding: 8px !important; }
          .principal-attendance-modal { width: 100% !important; max-height: calc(100dvh - 16px) !important; border-radius: 18px !important; }
          .principal-attendance-modal [style*="padding: 20px 24px"] { padding-left: 16px !important; padding-right: 16px !important; }
          .principal-attendance-modal [style*="margin: 12px 24px"] { margin-left: 16px !important; margin-right: 16px !important; }
          .principal-attendance-modal table { display: block; max-width: 100%; overflow-x: auto; -webkit-overflow-scrolling: touch; }
        }
      `}</style>
      <PrincipalAttendanceSummaryGuide onStepChange={setGuideTarget} />
    </div>
  );
}
