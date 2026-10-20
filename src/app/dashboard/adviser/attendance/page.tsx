"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import type ExcelJS from "exceljs";
import { resolveRfidScanValue } from "@/lib/rfid";
import {
    getAttendanceDetailStatus,
    getSf2StatusCode,
    isAttendedExportStatus,
    toAttendanceExportStatus,
} from "@/lib/attendanceExportStatus";
import { weekdayExportDatesForMonth } from "@/lib/attendanceExportCalendar";
import { useSessionInvalidation } from "@/hooks/useSessionInvalidation";
import { useDebouncedRealtimeRefresh } from "@/hooks/useDebouncedRealtimeRefresh";
import AdviserAttendanceGuide from "../components/AdviserAttendanceGuide";
import {
    CreditCard, UserPlus, History, Check,
    ChevronDown, IdCard, ChevronLeft, ChevronRight,
    Calendar, AlertCircle, X, Printer, FileText,
    CalendarDays, Paperclip, PlayCircle, Pencil,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────────
type ScanMode = "Time In" | "Time Out";
type AttendanceStatus = "Present" | "On Time" | "Late" | "Absent" | "Excused";
type ManualAttendanceStatus = "On Time" | "Absent" | "Excused" | "Present";
type AttendanceVia = "RFID" | "Manual" | "Auto";

type ClassSessionStatus = "Active" | "Ended" | "Not Started";
type ClassSessionInfo = {
    session_type: "Morning" | "Afternoon";
    status: ClassSessionStatus;
    scheduled_start: string;
    scheduled_end: string;
    late_after?: string | null;
    absent_after?: string | null;
    actual_start: string | null;
};

type AttendanceLog = {
    id: number;
    student_id: string;
    full_name: string;
    attendance_date?: string;
    time_logged: string;
    type: ScanMode;
    status: AttendanceStatus;
    via: AttendanceVia;
};

type Student = {
    id: number;
    student_id: string;
    first_name: string;
    middle_name?: string | null;
    last_name: string;
    suffix?: string | null;
    gender?: string;
    grade?: string;
    section?: string;
    class_session?: "Morning" | "Afternoon" | null;
    rfid_card?: string | null;
};

function formatGradeLabel(grade?: string | null) {
    if (!grade) return "";
    return grade.trim().replace(/^Grade\s+/i, "Grade ");
}

type HistorySummaryRow = {
    student_id: string;
    full_name: string;
    grade: string;
    section: string;
    time_in: string | null;
    time_out: string | null;
    time_in_status: AttendanceStatus | null;
    time_out_status: AttendanceStatus | null;
    via: AttendanceVia | null;
    remark: string | null;
    is_absent: boolean;
};

type EditableAttendanceRecord = {
    student_id: string;
    full_name: string;
    attendance_log_id: number | null;
    time_logged: string | null;
    status: AttendanceStatus | null;
    via: AttendanceVia | null;
    remark: string | null;
    editable: boolean;
    read_only_reason: string | null;
};


// Monthly export row — one row per student per day
type MonthlyAttendanceRow = {
    student_id: string;
    full_name: string;
    gender?: string | null;
    grade: string;
    section: string;
    date: string;          // YYYY-MM-DD
    time_in: string | null;
    time_out: string | null;
    time_in_status: AttendanceStatus | null;
    time_out_status: AttendanceStatus | null;
    via: AttendanceVia | null;
    remark: string | null;
    is_absent: boolean;
    is_excused: boolean;
    active_from: string;
};

type MonthlyAttendanceData = {
    rows: MonthlyAttendanceRow[];
    schoolDays: string[];
    holidayDates: string[];
    studentCount: number;
    schoolYearLabel: string | null;
};

type HistoryStats = { total: number; present: number; late: number; absent: number; excused?: number };

type ExcuseRequestStatus = "Pending" | "Approved" | "Declined";

type ExcuseRequest = {
    id: number;
    studentName: string;
    studentId: string;
    parentName: string;
    relationship: string;
    message: string;
    dateFrom: string;
    dateTo: string;
    submittedAt: string;
    attachments: string[];
    status: ExcuseRequestStatus;
    declineReason?: string;
};

interface AdviserInfo {
    section: string | null;
    sections: string[];
    grade: string | null;
    full_name: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────────
function formatTime(value: string | null) {
    if (!value) return "—";
    const parts = value.split(":");
    if (parts.length < 2) return value;
    let hour = Number(parts[0]);
    const minute = parts[1];
    const suffix = hour >= 12 ? "PM" : "AM";
    hour = hour % 12;
    if (hour === 0) hour = 12;
    return `${hour.toString().padStart(2, "0")}:${minute} ${suffix}`;
}

function formatDateLabel(dateStr: string) {
    const [y, m, d] = dateStr.split("-").map(Number);
    return new Date(y, m - 1, d).toLocaleDateString("en-US", {
        month: "long", day: "numeric", year: "numeric",
    });
}

function getStatusClass(status: AttendanceStatus | null) {
    if (status === "On Time") return "bg-emerald-100 text-emerald-700";
    if (status === "Late") return "bg-amber-100 text-amber-700";
    if (status === "Absent") return "bg-red-100 text-red-600";
    if (status === "Excused") return "bg-sky-100 text-sky-700";
    return "bg-slate-100 text-slate-400";
}

function getInitials(name: string) {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return "?";
    return parts[0][0]?.toUpperCase() || "?";
}

function buildFullName(student: Student) {
    return [student.first_name, student.middle_name, student.last_name, student.suffix]
        .filter(Boolean).join(" ");
}

function toLocalDateString(date: Date) {
    const parts = new Intl.DateTimeFormat("en-US", {
        timeZone: "Asia/Manila",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    }).formatToParts(date);
    const year = parts.find((part) => part.type === "year")?.value;
    const month = parts.find((part) => part.type === "month")?.value;
    const day = parts.find((part) => part.type === "day")?.value;
    return `${year}-${month}-${day}`;
}

const MONTH_NAMES = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
];


// ── Daily Export Helpers ───────────────────────────────────────────────────────
function exportToCSV(rows: HistorySummaryRow[], dateStr: string, sectionLabel: string) {
    const headers = ["Student ID", "Full Name", "Grade", "Section", "Time In", "Time In Status", "Time Out", "Time Out Status", "Via", "Remark"];
    const csvRows = rows.map(row => [
        row.student_id,
        `"${row.full_name}"`,
        row.grade,
        row.section,
        formatTime(row.time_in),
        row.time_in_status ?? "No Record",
        formatTime(row.time_out),
        row.time_out_status ?? "No Record",
        row.via ?? "—",
        `"${row.remark ?? ""}"`,
    ]);
    const csvContent = [headers.join(","), ...csvRows.map(r => r.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `attendance_${sectionLabel.replace(/[^a-z0-9]/gi, "_")}_${dateStr}.csv`;
    a.click();
    URL.revokeObjectURL(url);
}

function printAttendance(rows: HistorySummaryRow[], dateStr: string, sectionLabel: string, stats: HistoryStats | null, adviserName: string) {
    const dateLabel = formatDateLabel(dateStr);
    const tableRows = rows.map((row, i) => `
        <tr style="border-bottom:1px solid #e2e8f0;${row.is_absent ? "background:#fff5f5;" : i % 2 === 0 ? "background:#f8fafc;" : ""}">
            <td style="padding:8px 10px;font-size:12px;color:#374151;">${i + 1}</td>
            <td style="padding:8px 10px;font-size:12px;color:#374151;">${escapePrintHtml(row.student_id)}</td>
            <td style="padding:8px 10px;font-size:12px;font-weight:600;color:#111827;">${escapePrintHtml(row.full_name)}</td>
            <td style="padding:8px 10px;font-size:12px;color:#374151;text-align:center;">${escapePrintHtml(formatTime(row.time_in))}</td>
            <td style="padding:8px 10px;font-size:12px;text-align:center;">
                <span style="padding:2px 8px;border-radius:20px;font-size:11px;font-weight:600;
                    ${row.time_in_status === "On Time" ? "background:#d1fae5;color:#065f46;" :
            row.time_in_status === "Late" ? "background:#fef3c7;color:#92400e;" :
                row.time_in_status === "Excused" ? "background:#e0f2fe;color:#0369a1;" :
                    row.is_absent ? "background:#fee2e2;color:#991b1b;" :
                        "background:#f1f5f9;color:#64748b;"}">
                    ${escapePrintHtml(row.time_in_status ?? "No Record")}
                </span>
            </td>
            <td style="padding:8px 10px;font-size:12px;color:#374151;text-align:center;">${escapePrintHtml(formatTime(row.time_out))}</td>
            <td style="padding:8px 10px;font-size:12px;color:#374151;text-align:center;">${escapePrintHtml(row.via ?? "—")}</td>
            <td style="padding:8px 10px;font-size:12px;color:#6b7280;font-style:italic;">${escapePrintHtml(row.remark ?? "")}</td>
        </tr>`).join("");

    const html = `<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8" />
    <title>Attendance Record – ${sectionLabel} – ${dateLabel}</title>
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: 'Arial', sans-serif; color: #111827; padding: 32px 40px; }
        @media print { body { padding: 16px 20px; } .no-print { display: none !important; } }
        .header { border-bottom: 2px solid #10b981; padding-bottom: 16px; margin-bottom: 20px; }
        .school-name { font-size: 18px; font-weight: 800; color: #065f46; }
        .doc-title { font-size: 14px; font-weight: 600; color: #374151; margin-top: 2px; }
        .meta { display: flex; gap: 32px; margin-top: 12px; flex-wrap: wrap; }
        .meta-item { font-size: 12px; color: #6b7280; }
        .meta-item strong { color: #111827; font-weight: 700; }
        .stats { display: flex; gap: 12px; margin-bottom: 18px; flex-wrap: wrap; }
        .stat-box { padding: 8px 16px; border-radius: 8px; font-size: 12px; font-weight: 700; }
        table { width: 100%; border-collapse: collapse; }
        thead tr { background: #065f46; color: white; }
        thead th { padding: 10px 10px; font-size: 11px; font-weight: 700; text-align: left; text-transform: uppercase; letter-spacing: 0.05em; }
        .signature-section { margin-top: 48px; display: flex; justify-content: space-between; gap: 40px; }
        .signature-box { flex: 1; text-align: center; }
        .signature-line { border-top: 1px solid #374151; margin-top: 40px; padding-top: 6px; font-size: 11px; color: #6b7280; }
        .signature-name { font-weight: 700; font-size: 13px; color: #111827; }
        .print-btn { display: inline-flex; align-items: center; gap: 8px; margin-top: 20px; padding: 10px 20px;
            background: #10b981; color: white; border: none; border-radius: 8px; font-size: 13px; font-weight: 700; cursor: pointer; }
    </style>
</head>
<body>
    <div class="header">
        <div class="school-name">School Attendance Record</div>
        <div class="doc-title">Daily Attendance Sheet</div>
        <div class="meta">
            <div class="meta-item">Date: <strong>${escapePrintHtml(dateLabel)}</strong></div>
            <div class="meta-item">Section: <strong>${escapePrintHtml(sectionLabel)}</strong></div>
            <div class="meta-item">Adviser: <strong>${escapePrintHtml(adviserName)}</strong></div>
            <div class="meta-item">Printed: <strong>${new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}</strong></div>
        </div>
    </div>
    ${stats ? `
    <div class="stats">
        <div class="stat-box" style="background:#d1fae5;color:#065f46;">✓ Present: ${stats.present}</div>
        <div class="stat-box" style="background:#fef3c7;color:#92400e;">⏰ Late: ${stats.late}</div>
        <div class="stat-box" style="background:#fee2e2;color:#991b1b;">✗ Absent: ${stats.absent}</div>
        <div class="stat-box" style="background:#f1f5f9;color:#374151;">Total: ${stats.total}</div>
    </div>` : ""}
    <table>
        <thead>
            <tr>
                <th style="width:36px;">#</th>
                <th style="width:100px;">Student ID</th>
                <th>Full Name</th>
                <th style="width:80px;text-align:center;">Time In</th>
                <th style="width:90px;text-align:center;">Status</th>
                <th style="width:80px;text-align:center;">Time Out</th>
                <th style="width:60px;text-align:center;">Via</th>
                <th>Remark</th>
            </tr>
        </thead>
        <tbody>${tableRows}</tbody>
    </table>
    <div class="signature-section">
        <div class="signature-box">
            <div class="signature-name">${escapePrintHtml(adviserName)}</div>
            <div class="signature-line">Class Adviser's Signature over Printed Name</div>
        </div>
        <div class="signature-box">
            <div class="signature-name">&nbsp;</div>
            <div class="signature-line">Principal's Signature over Printed Name</div>
        </div>
    </div>
    <div class="no-print" style="margin-top:24px;">
        <button class="print-btn" onclick="window.print()">🖨 Print / Save as PDF</button>
    </div>
</body>
</html>`;

    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(html);
    win.document.close();
}

// ── Monthly SF2 Export Helpers ─────────────────────────────────────────────────
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

function col0ToRef(col0: number, row: number): string {
    const colLetter = (c: number): string => {
        if (c < 26) return String.fromCharCode(65 + c);
        return String.fromCharCode(64 + Math.floor(c / 26)) + String.fromCharCode(65 + (c % 26));
    };
    return colLetter(col0) + row;
}

function escapePrintHtml(value: unknown): string {
    return String(value ?? "").replace(/[&<>"']/g, (character) => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    })[character]!);
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
    const maleRowDelta = maleStudentCount - MAX_MALE_ROWS;
    const femaleRowDelta = femaleStudentCount - MAX_FEMALE_ROWS;
    if (maleRowDelta === 0 && femaleRowDelta === 0) return templateWs;

    const maleTotalRow = MALE_START_ROW + maleStudentCount;
    const femaleStartRow = maleTotalRow + 1;
    const femaleTotalRow = femaleStartRow + femaleStudentCount;
    const combinedRow = femaleTotalRow + 1;
    const totalRowDelta = maleRowDelta + femaleRowDelta;

    const expandedWs = workbook.addWorksheet("SF2 Expanded");
    expandedWs.properties = { ...templateWs.properties };
    expandedWs.pageSetup = { ...templateWs.pageSetup };
    expandedWs.views = templateWs.views.map((view) => ({ ...view }));

    for (let col = 1; col <= templateWs.columnCount; col++) {
        const sourceColumn = templateWs.getColumn(col);
        const targetColumn = expandedWs.getColumn(col);
        targetColumn.width = sourceColumn.width;
        targetColumn.hidden = sourceColumn.hidden;
        targetColumn.outlineLevel = sourceColumn.outlineLevel;
        targetColumn.style = sourceColumn.style;
    }

    const mapTemplateRow = (row: number): number | null => {
        if (row < MALE_START_ROW) return row;

        if (row < MALE_TOTAL_ROW) {
            const studentIndex = row - MALE_START_ROW;
            return studentIndex < maleStudentCount ? MALE_START_ROW + studentIndex : null;
        }

        if (row === MALE_TOTAL_ROW) return maleTotalRow;

        if (row < FEMALE_TOTAL_ROW) {
            const studentIndex = row - FEMALE_START_ROW;
            return studentIndex < femaleStudentCount ? femaleStartRow + studentIndex : null;
        }

        if (row === FEMALE_TOTAL_ROW) return femaleTotalRow;
        if (row === COMBINED_ROW) return combinedRow;

        return row + totalRowDelta;
    };

    for (let row = 1; row <= templateWs.rowCount; row++) {
        const sourceRow = templateWs.getRow(row);
        const targetRowNumber = mapTemplateRow(row);
        if (targetRowNumber === null) continue;
        const targetRow = expandedWs.getRow(targetRowNumber);
        targetRow.height = sourceRow.height;
        targetRow.hidden = sourceRow.hidden;
        targetRow.outlineLevel = sourceRow.outlineLevel;

        for (let col = 1; col <= templateWs.columnCount; col++) {
            const sourceCell = sourceRow.getCell(col);
            const targetCell = targetRow.getCell(col);
            targetCell.value = sourceCell.value;
            targetCell.style = sourceCell.style;
        }
    }

    const copyStudentRowFormat = (sourceRowNumber: number, firstTargetRow: number, count: number) => {
        const sourceRow = templateWs.getRow(sourceRowNumber);
        for (let index = 0; index < count; index++) {
            const targetRow = expandedWs.getRow(firstTargetRow + index);
            targetRow.height = sourceRow.height;
            targetRow.hidden = sourceRow.hidden;
            targetRow.outlineLevel = sourceRow.outlineLevel;
            for (let col = 1; col <= templateWs.columnCount; col++) {
                const sourceCell = sourceRow.getCell(col);
                const targetCell = targetRow.getCell(col);
                targetCell.value = null;
                targetCell.style = sourceCell.style;
            }
        }
    };

    copyStudentRowFormat(
        MALE_TOTAL_ROW - 1,
        MALE_START_ROW + MAX_MALE_ROWS,
        Math.max(0, maleRowDelta),
    );
    copyStudentRowFormat(
        FEMALE_TOTAL_ROW - 1,
        femaleStartRow + MAX_FEMALE_ROWS,
        Math.max(0, femaleRowDelta),
    );

    const templateMerges = getMergeRanges(templateWs);
    const mergeWithTemplateBorder = (merge: MergeRange, targetTop: number, targetBottom: number) => {
        expandedWs.mergeCells(targetTop, merge.left, targetBottom, merge.right);

        // ExcelJS takes the top-left cell's style when it creates a merged
        // range. Restore the source range's right and bottom edges so outer
        // lines (notably the month and section header) stay visible.
        const sourceTopLeft = templateWs.getCell(merge.top, merge.left);
        const sourceBottomRight = templateWs.getCell(merge.bottom, merge.right);
        const targetTopLeft = expandedWs.getCell(targetTop, merge.left);
        targetTopLeft.border = {
            ...sourceTopLeft.border,
            right: sourceBottomRight.border.right ?? sourceTopLeft.border.right,
            bottom: sourceBottomRight.border.bottom ?? sourceTopLeft.border.bottom,
        };
    };

    for (const merge of templateMerges) {
        const targetTop = mapTemplateRow(merge.top);
        const targetBottom = mapTemplateRow(merge.bottom);
        if (targetTop !== null && targetBottom !== null) {
            mergeWithTemplateBorder(merge, targetTop, targetBottom);
        }
    }

    const copyStudentRowMerges = (sourceRow: number, firstTargetRow: number, count: number) => {
        const rowMerges = templateMerges.filter((merge) => merge.top === sourceRow && merge.bottom === sourceRow);
        for (let index = 0; index < count; index++) {
            const targetRow = firstTargetRow + index;
            for (const merge of rowMerges) {
                mergeWithTemplateBorder(merge, targetRow, targetRow);
            }
        }
    };

    copyStudentRowMerges(
        MALE_TOTAL_ROW - 1,
        MALE_START_ROW + MAX_MALE_ROWS,
        Math.max(0, maleRowDelta),
    );
    copyStudentRowMerges(
        FEMALE_TOTAL_ROW - 1,
        femaleStartRow + MAX_FEMALE_ROWS,
        Math.max(0, femaleRowDelta),
    );

    workbook.removeWorksheet(templateWs.id);
    expandedWs.name = "SF2";
    return expandedWs;
}

function clearCellPreserveFormat(ws: ExcelJS.Worksheet, ref: string) {
    ws.getCell(ref).value = null;
}

function setCellValue(ws: ExcelJS.Worksheet, ref: string, value: string | number | null) {
    ws.getCell(ref).value = value;
}

function setSf2DateHeader(ws: ExcelJS.Worksheet, col0: number, day: number) {
    const cell = ws.getCell(col0ToRef(col0, 6));
    // Excel renders narrow numeric cells as ###. The template has a few
    // intentionally narrow day columns, so store the day as text and let it
    // shrink inside the existing cell instead of changing the report layout.
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

function getSchoolDayPlacementsForMonth(month: number, year: number) {
    const dates = weekdayExportDatesForMonth(year, month);
    if (dates.length > SF2_DAY_SLOTS.length) {
        throw new Error(`The SF2 template has ${SF2_DAY_SLOTS.length} daily slots, but ${dates.length} weekdays were selected. Use a template that supports all weekdays.`);
    }
    return dates.map(({ date, day, weekdayLabel }, slotIdx) => {
        return {
            date,
            day,
            slotIdx,
            dowLabel: weekdayLabel,
        };
    });
}

function downloadWorkbook(buffer: ArrayBuffer, filename: string) {
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

async function exportMonthlySF2(
    rows: MonthlyAttendanceRow[],
    year: number,
    month: number,
    sectionLabel: string,
    holidayDates: string[] = [],
    schoolDayDates: string[] = [],
    schoolYearLabel: string | null = null,
) {
    // Keep the large spreadsheet library out of the normal attendance page.
    // It is loaded only after the user explicitly requests an SF2 export.
    const { default: ExcelJS } = await import("exceljs");
    const res = await fetch("/SF2_2025_newtemplate.xlsx");
    if (!res.ok) throw new Error("Failed to load SF2 template.");

    const templateBuf = await res.arrayBuffer();
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(templateBuf);

    let ws = workbook.worksheets[0];
    if (!ws) throw new Error("Template worksheet not found.");

    const monthName = MONTH_NAMES[month - 1];
    const placements = getSchoolDayPlacementsForMonth(month, year);
    const holidaySet = new Set(holidayDates);
    const schoolDaySet = new Set(schoolDayDates);
    const classPlacements = placements.filter(({ date }) => schoolDaySet.has(date) && !holidaySet.has(date));

    const [gradePart, sectionPartRaw] = sectionLabel.split("·").map(s => s.trim());
    const gradeLabel = gradePart || "";
    const sectionName = sectionPartRaw || sectionLabel;

    setCellValue(ws, "F3", 107966);
    setCellValue(ws, "M3", schoolYearLabel ?? `${year} - ${year + 1}`);
    setCellValue(ws, "AA3", monthName.toUpperCase());
    setCellValue(ws, "F4", "Santiago Elementary School");
    setCellValue(ws, "AA4", gradeLabel);
    setCellValue(ws, "AM4", sectionName.toUpperCase());

    for (const [col0, mergePartner] of SF2_DAY_SLOTS) {
        clearCellPreserveFormat(ws, col0ToRef(col0, 6));
        clearCellPreserveFormat(ws, col0ToRef(col0, 7));
        if (mergePartner !== null) {
            clearCellPreserveFormat(ws, col0ToRef(mergePartner, 6));
            clearCellPreserveFormat(ws, col0ToRef(mergePartner, 7));
        }
    }

    placements.forEach(({ day, date, slotIdx, dowLabel }) => {
        const [col0] = SF2_DAY_SLOTS[slotIdx];
        setSf2DateHeader(ws, col0, day);
        setCellValue(ws, col0ToRef(col0, 7), holidaySet.has(date) ? "H" : dowLabel);
    });

    const grouped = new Map<string, MonthlyAttendanceRow[]>();
    rows.forEach((row) => {
        if (!grouped.has(row.student_id)) grouped.set(row.student_id, []);
        grouped.get(row.student_id)!.push(row);
    });

    const students = Array.from(grouped.values()).map((days) => {
        const sample = days[0];
        const normalizedGender = String(sample.gender || "").toUpperCase();
        const inferredGender = normalizedGender === "M" || normalizedGender === "MALE"
            ? "M"
            : normalizedGender === "F" || normalizedGender === "FEMALE"
                ? "F"
                : "F";
        return {
            student_id: sample.student_id,
            name: sample.full_name,
            gender: inferredGender as "M" | "F",
            activeFrom: sample.active_from,
            days,
        };
    }).sort((a, b) => a.name.localeCompare(b.name));

    const maleStudents = students.filter(s => s.gender === "M");
    const femaleStudents = students.filter(s => s.gender === "F");
    const maleRowDelta = maleStudents.length - MAX_MALE_ROWS;
    const femaleRowDelta = femaleStudents.length - MAX_FEMALE_ROWS;
    ws = copyWorksheetWithDynamicAttendanceRows(
        workbook,
        ws,
        maleStudents.length,
        femaleStudents.length,
    );

    const maleTotalRow = MALE_START_ROW + maleStudents.length;
    const femaleStartRow = maleTotalRow + 1;
    const femaleTotalRow = femaleStartRow + femaleStudents.length;
    const combinedRow = femaleTotalRow + 1;
    const summaryStartRow = combinedRow + 1;

    function fillRows(
        studentList: typeof students,
        startRow: number,
        totalRow: number
    ) {
        studentList.forEach((student, idx) => {
            const row = startRow + idx;
            setCellValue(ws, `A${row}`, idx + 1);
            setCellValue(ws, `C${row}`, student.name);

            for (const [col0, mergePartner] of SF2_DAY_SLOTS) {
                clearCellPreserveFormat(ws, col0ToRef(col0, row));
                if (mergePartner !== null) clearCellPreserveFormat(ws, col0ToRef(mergePartner, row));
            }

            const dayMap = new Map<number, MonthlyAttendanceRow>();
            student.days.forEach((d) => {
                const dayNum = Number(d.date.split("-")[2]);
                dayMap.set(dayNum, d);
            });

            let absenceCount = 0;
            let attendedCount = 0;
            placements.forEach(({ day, date: iso, slotIdx }) => {
                const [col0] = SF2_DAY_SLOTS[slotIdx];

                if (iso < student.activeFrom) return;
                if (holidaySet.has(iso)) {
                    setCellValue(ws, col0ToRef(col0, row), getSf2StatusCode(null, true));
                    return;
                }

                if (!schoolDaySet.has(iso)) return;

                const rec = dayMap.get(day);

                // Future dates — leave blank, no record possible yet
                const today = toLocalDateString(new Date());
                if (iso > today) return;

                // Time In is the daily attendance event. Do not treat a
                // missing Time In record—or a Time Out status—as evidence of
                // presence. This preserves the saved Present/Late/Absent value.
                const savedStatus = toAttendanceExportStatus(rec?.time_in_status);
                const code = getSf2StatusCode(savedStatus);
                if (code) setCellValue(ws, col0ToRef(col0, row), code);
                if (savedStatus === "Absent" || savedStatus === "Excused") absenceCount += 1;
                if (isAttendedExportStatus(savedStatus)) attendedCount += 1;
            });

            setCellValue(ws, `AM${row}`, absenceCount);
            // Late is attended. Excused stays visible in Attendance Detail,
            // but its official SF2 mark and total are absent.
            setCellValue(ws, `AO${row}`, attendedCount);
        });

        setCellValue(ws, `A${totalRow}`, studentList.length);
        setCellFormula(
            ws,
            `AM${totalRow}`,
            studentList.length ? `SUM(AM${startRow}:AM${totalRow - 1})` : "0",
        );
        setCellFormula(
            ws,
            `AO${totalRow}`,
            studentList.length ? `SUM(AO${startRow}:AO${totalRow - 1})` : "0",
        );

        for (const [col0, mergePartner] of SF2_DAY_SLOTS) {
            clearCellPreserveFormat(ws, col0ToRef(col0, totalRow));
            if (mergePartner !== null) clearCellPreserveFormat(ws, col0ToRef(mergePartner, totalRow));
        }

        classPlacements.forEach(({ slotIdx }) => {
            const [col0] = SF2_DAY_SLOTS[slotIdx];
            const formula = studentList.length
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

    setCellFormula(ws, `A${combinedRow}`, `A${maleTotalRow}+A${femaleTotalRow}`);
    setCellFormula(ws, `AM${combinedRow}`, `AM${maleTotalRow}+AM${femaleTotalRow}`);
    setCellFormula(ws, `AO${combinedRow}`, `AO${maleTotalRow}+AO${femaleTotalRow}`);

    classPlacements.forEach(({ slotIdx }) => {
        const [col0] = SF2_DAY_SLOTS[slotIdx];
        setCellFormula(ws, col0ToRef(col0, combinedRow), `${col0ToRef(col0, maleTotalRow)}+${col0ToRef(col0, femaleTotalRow)}`);
    });

    setCellValue(ws, `AM${summaryStartRow}`, `Month : ${monthName.toUpperCase()} ${year}`);
    const todayIso = toLocalDateString(new Date());
    const pastClassDaysCount = classPlacements.filter(({ date }) => date <= todayIso).length;
    setCellValue(ws, `AP${summaryStartRow}`, `No. of Days of Classes: ${pastClassDaysCount}`);
    const enrollmentRow = summaryStartRow + 2;
    const attendanceRow = summaryStartRow + 8;
    const enrollmentPercentageRow = summaryStartRow + 10;
    const totalPresentRow = summaryStartRow + 12;
    const attendanceRateRow = summaryStartRow + 14;
    setCellValue(ws, `AR${enrollmentRow}`, maleStudents.length);
    setCellValue(ws, `AS${enrollmentRow}`, femaleStudents.length);
    setCellValue(ws, `AT${enrollmentRow}`, students.length);
    setCellValue(ws, `AR${attendanceRow}`, maleStudents.length);
    setCellValue(ws, `AS${attendanceRow}`, femaleStudents.length);
    setCellFormula(ws, `AT${attendanceRow}`, `AR${attendanceRow}+AS${attendanceRow}`);
    setCellFormula(ws, `AR${enrollmentPercentageRow}`, `IF(AR${enrollmentRow}=0,0,AR${attendanceRow}/AR${enrollmentRow})`);
    setCellFormula(ws, `AS${enrollmentPercentageRow}`, `IF(AS${enrollmentRow}=0,0,AS${attendanceRow}/AS${enrollmentRow})`);
    setCellFormula(ws, `AT${enrollmentPercentageRow}`, `IF(AT${enrollmentRow}=0,0,AT${attendanceRow}/AT${enrollmentRow})`);
    setCellFormula(ws, `AR${totalPresentRow}`, `AO${maleTotalRow}/${pastClassDaysCount || 1}`);
    setCellFormula(ws, `AS${totalPresentRow}`, `AO${femaleTotalRow}/${pastClassDaysCount || 1}`);
    setCellFormula(ws, `AT${totalPresentRow}`, `AO${combinedRow}/${pastClassDaysCount || 1}`);
    setCellFormula(ws, `AR${attendanceRateRow}`, `IF(AR${attendanceRow}=0,0,AR${totalPresentRow}/AR${attendanceRow})`);
    setCellFormula(ws, `AS${attendanceRateRow}`, `IF(AS${attendanceRow}=0,0,AS${totalPresentRow}/AS${attendanceRow})`);
    setCellFormula(ws, `AT${attendanceRateRow}`, `IF(AT${attendanceRow}=0,0,AT${totalPresentRow}/AT${attendanceRow})`);

    [74, 80].forEach((templateRow) => {
        const expandedRow = templateRow + maleRowDelta + femaleRowDelta;
        clearCellPreserveFormat(ws, `AN${expandedRow}`);
        if (templateRow === 80) clearCellPreserveFormat(ws, `Z${expandedRow}`);
    });

    const detailWs = workbook.addWorksheet("Attendance Detail");
    detailWs.addRow([`Attendance detail — ${sectionLabel} — ${monthName} ${year}`]);
    detailWs.addRow(["SF2 marks: ✓ = Present or Late, X = Absent, H = Holiday, E = approved excuse. No Record means no saved Time In status."]);
    detailWs.addRow([]);
    detailWs.addRow(["Student ID", "Student", "Grade", "Section", "Date", "Saved Status", "Time In", "Time Out", "Via", "Remark"]);
    const detailHeader = detailWs.getRow(4);
    detailHeader.font = { bold: true, color: { argb: "FFFFFFFF" } };
    detailHeader.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF047857" } };
    for (const student of students) {
        const recordsByDate = new Map(student.days.map((record) => [record.date, record]));
        for (const { date } of placements) {
            if (date < student.activeFrom) continue;
            const detailRow = recordsByDate.get(date);
            detailWs.addRow([
                student.student_id,
                student.name,
                detailRow?.grade ?? "",
                detailRow?.section ?? "",
                date,
                holidaySet.has(date)
                    ? "Holiday"
                    : getAttendanceDetailStatus(toAttendanceExportStatus(detailRow?.time_in_status)),
                detailRow?.time_in ?? "",
                detailRow?.time_out ?? "",
                detailRow?.via ?? "",
                detailRow?.remark ?? "",
            ]);
        }
    }
    detailWs.columns = [
        { width: 16 }, { width: 32 }, { width: 14 }, { width: 18 }, { width: 14 },
        { width: 16 }, { width: 14 }, { width: 14 }, { width: 12 }, { width: 42 },
    ];
    detailWs.views = [{ state: "frozen", ySplit: 4 }];

    const out = await workbook.xlsx.writeBuffer();
    const safeSection = sectionName.replace(/[^a-z0-9]+/gi, "_");
    downloadWorkbook(out as ArrayBuffer, `SF2_${safeSection}_${monthName}_${year}.xlsx`);
}

// ── Monthly Export Modal ───────────────────────────────────────────────────────

function printMonthlyAttendance(
    rows: MonthlyAttendanceRow[],
    year: number,
    month: number,
    sectionLabel: string,
    adviserName: string,
) {
    const monthLabel = `${MONTH_NAMES[month - 1]} ${year}`;

    const studentMap = new Map<string, { name: string; grade: string; section: string; days: MonthlyAttendanceRow[] }>();
    for (const row of rows) {
        if (!studentMap.has(row.student_id)) {
            studentMap.set(row.student_id, { name: row.full_name, grade: row.grade, section: row.section, days: [] });
        }
        studentMap.get(row.student_id)!.days.push(row);
    }

    let sectionPresent = 0;
    let sectionLate = 0;
    let sectionAbsent = 0;

    const studentRows = Array.from(studentMap.entries()).map(([sid, info], idx) => {
        const present = info.days.filter(d => d.time_in_status === "On Time").length;
        const late = info.days.filter(d => d.time_in_status === "Late").length;
        const absent = info.days.filter(d => d.is_absent).length;

        sectionPresent += present;
        sectionLate += late;
        sectionAbsent += absent;

        return `
        <tr style="border-bottom:1px solid #e2e8f0;${idx % 2 === 0 ? "background:#f8fafc;" : "background:#ffffff;"}">
            <td style="padding:9px 12px;font-size:12px;color:#374151;text-align:center;">${idx + 1}</td>
            <td style="padding:9px 12px;font-size:12px;color:#374151;">${escapePrintHtml(sid)}</td>
            <td style="padding:9px 12px;font-size:12px;font-weight:600;color:#111827;">${escapePrintHtml(info.name)}</td>
            <td style="padding:9px 12px;font-size:12px;color:#374151;text-align:center;">${escapePrintHtml(info.grade)}</td>
            <td style="padding:9px 12px;font-size:12px;color:#374151;text-align:center;">${escapePrintHtml(info.section)}</td>
            <td style="padding:9px 12px;font-size:12px;color:#065f46;font-weight:700;text-align:center;">${present}</td>
            <td style="padding:9px 12px;font-size:12px;color:#92400e;font-weight:700;text-align:center;">${late}</td>
            <td style="padding:9px 12px;font-size:12px;color:#991b1b;font-weight:700;text-align:center;">${absent}</td>
        </tr>`;
    }).join("");

    const totalStudents = studentMap.size;

    const html = `<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8" />
    <title>Monthly Attendance – ${sectionLabel} – ${monthLabel}</title>
    <style>
        * { box-sizing:border-box; margin:0; padding:0; }
        body { font-family:'Arial',sans-serif; color:#111827; padding:32px 40px; }
        @media print { body { padding:16px 20px; } .no-print { display:none !important; } }
        .print-btn { display:inline-flex;align-items:center;gap:8px;margin-top:24px;padding:10px 20px;
            background:#10b981;color:white;border:none;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer; }
    </style>
</head>
<body>
    <div style="border-bottom:2px solid #10b981;padding-bottom:16px;margin-bottom:24px;">
        <div style="font-size:20px;font-weight:800;color:#065f46;">School Attendance Record</div>
        <div style="font-size:13px;font-weight:600;color:#374151;margin-top:3px;">Monthly Attendance Summary Report</div>
        <div style="display:flex;gap:32px;margin-top:12px;flex-wrap:wrap;">
            <div style="font-size:12px;color:#6b7280;">Month: <strong style="color:#111827;">${escapePrintHtml(monthLabel)}</strong></div>
            <div style="font-size:12px;color:#6b7280;">Section: <strong style="color:#111827;">${escapePrintHtml(sectionLabel)}</strong></div>
            <div style="font-size:12px;color:#6b7280;">Adviser: <strong style="color:#111827;">${escapePrintHtml(adviserName)}</strong></div>
            <div style="font-size:12px;color:#6b7280;">Printed: <strong style="color:#111827;">${new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}</strong></div>
            <div style="font-size:12px;color:#6b7280;">Total Students: <strong style="color:#111827;">${totalStudents}</strong></div>
        </div>
    </div>

    <div style="margin-bottom:24px;">
        <div style="font-size:13px;font-weight:700;color:#111827;margin-bottom:10px;text-transform:uppercase;letter-spacing:0.05em;">Section Overall Summary</div>
        <table style="width:100%;border-collapse:collapse;border:1px solid #d1fae5;">
            <thead>
                <tr style="background:#065f46;color:white;">
                    <th style="padding:10px 16px;font-size:11px;font-weight:700;text-align:center;text-transform:uppercase;letter-spacing:.05em;">Total Present</th>
                    <th style="padding:10px 16px;font-size:11px;font-weight:700;text-align:center;text-transform:uppercase;letter-spacing:.05em;">Total Late</th>
                    <th style="padding:10px 16px;font-size:11px;font-weight:700;text-align:center;text-transform:uppercase;letter-spacing:.05em;">Total Absent</th>
                    <th style="padding:10px 16px;font-size:11px;font-weight:700;text-align:center;text-transform:uppercase;letter-spacing:.05em;">Total Students</th>
                </tr>
            </thead>
            <tbody>
                <tr style="background:#f0fdf4;">
                    <td style="padding:14px 16px;font-size:18px;font-weight:800;color:#065f46;text-align:center;">${sectionPresent}</td>
                    <td style="padding:14px 16px;font-size:18px;font-weight:800;color:#92400e;text-align:center;">${sectionLate}</td>
                    <td style="padding:14px 16px;font-size:18px;font-weight:800;color:#991b1b;text-align:center;">${sectionAbsent}</td>
                    <td style="padding:14px 16px;font-size:18px;font-weight:800;color:#374151;text-align:center;">${totalStudents}</td>
                </tr>
            </tbody>
        </table>
    </div>

    <div style="margin-bottom:32px;">
        <div style="font-size:13px;font-weight:700;color:#111827;margin-bottom:10px;text-transform:uppercase;letter-spacing:0.05em;">Per-Student Attendance Summary</div>
        <table style="width:100%;border-collapse:collapse;">
            <thead>
                <tr style="background:#065f46;color:white;">
                    <th style="padding:10px 12px;font-size:11px;font-weight:700;text-align:center;text-transform:uppercase;letter-spacing:.05em;width:40px;">#</th>
                    <th style="padding:10px 12px;font-size:11px;font-weight:700;text-align:left;text-transform:uppercase;letter-spacing:.05em;width:110px;">Student ID</th>
                    <th style="padding:10px 12px;font-size:11px;font-weight:700;text-align:left;text-transform:uppercase;letter-spacing:.05em;">Full Name</th>
                    <th style="padding:10px 12px;font-size:11px;font-weight:700;text-align:center;text-transform:uppercase;letter-spacing:.05em;width:60px;">Grade</th>
                    <th style="padding:10px 12px;font-size:11px;font-weight:700;text-align:center;text-transform:uppercase;letter-spacing:.05em;width:90px;">Section</th>
                    <th style="padding:10px 12px;font-size:11px;font-weight:700;text-align:center;text-transform:uppercase;letter-spacing:.05em;width:80px;">Present</th>
                    <th style="padding:10px 12px;font-size:11px;font-weight:700;text-align:center;text-transform:uppercase;letter-spacing:.05em;width:70px;">Late</th>
                    <th style="padding:10px 12px;font-size:11px;font-weight:700;text-align:center;text-transform:uppercase;letter-spacing:.05em;width:70px;">Absent</th>
                </tr>
            </thead>
            <tbody>
                ${studentRows}
                <tr style="background:#f1f5f9;border-top:2px solid #cbd5e1;">
                    <td colspan="5" style="padding:10px 12px;font-size:12px;font-weight:700;color:#374151;text-align:right;">Section Total</td>
                    <td style="padding:10px 12px;font-size:12px;font-weight:800;color:#065f46;text-align:center;">${sectionPresent}</td>
                    <td style="padding:10px 12px;font-size:12px;font-weight:800;color:#92400e;text-align:center;">${sectionLate}</td>
                    <td style="padding:10px 12px;font-size:12px;font-weight:800;color:#991b1b;text-align:center;">${sectionAbsent}</td>
                </tr>
            </tbody>
        </table>
    </div>

    <div style="margin-top:48px;display:flex;justify-content:space-between;gap:40px;">
        <div style="flex:1;text-align:center;">
            <div style="font-weight:700;font-size:13px;color:#111827;">${escapePrintHtml(adviserName)}</div>
            <div style="border-top:1px solid #374151;margin-top:40px;padding-top:6px;font-size:11px;color:#6b7280;">Class Adviser's Signature over Printed Name</div>
        </div>
        <div style="flex:1;text-align:center;">
            <div style="font-weight:700;font-size:13px;color:#111827;">&nbsp;</div>
            <div style="border-top:1px solid #374151;margin-top:40px;padding-top:6px;font-size:11px;color:#6b7280;">Principal's Signature over Printed Name</div>
        </div>
    </div>

    <div class="no-print" style="margin-top:24px;">
        <button class="print-btn" onclick="window.print()">Print / Save as PDF</button>
    </div>
</body>
</html>`;

    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(html);
    win.document.close();
}


function MonthlyExportModal({ onClose, sectionLabel, adviserName, activeSection }: {
    onClose: () => void;
    sectionLabel: string;
    adviserName: string;
    activeSection: string;
}) {
    const now = new Date();
    const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1);   // 1–12
    const [selectedYear, setSelectedYear] = useState(now.getFullYear());
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState("");
    const [preview, setPreview] = useState<{ totalDays: number; totalStudents: number; presentPct: number } | null>(null);
    const [holidayDates, setHolidayDates] = useState<string[]>([]);
    const [configuredHolidayDates, setConfiguredHolidayDates] = useState<string[]>([]);
    const [availableHolidayDates, setAvailableHolidayDates] = useState<string[]>([]);

    // Build selectable years (current year and 2 previous)
    const years = [now.getFullYear(), now.getFullYear() - 1, now.getFullYear() - 2];
    async function fetchMonthlyData(): Promise<MonthlyAttendanceData | null> {
        setIsLoading(true); setError("");
        try {
            const sectionParam = activeSection ? `&section=${encodeURIComponent(activeSection)}` : "";
            const res = await fetch(`/api/attendance/monthly?year=${selectedYear}&month=${selectedMonth}${sectionParam}`, { cache: "no-store" });
            const data = await res.json();
            if (data.success) {
                const monthlyData = {
                    rows: data.rows as MonthlyAttendanceRow[],
                    schoolDays: Array.isArray(data.schoolDays) ? data.schoolDays as string[] : [],
                    holidayDates: Array.isArray(data.holidayDates) ? data.holidayDates as string[] : [],
                    studentCount: Number(data.studentCount ?? 0),
                    schoolYearLabel: typeof data.schoolYearLabel === "string" ? data.schoolYearLabel : null,
                };
                setAvailableHolidayDates(monthlyData.schoolDays);
                return monthlyData;
            }
            setError(data.message || "Failed to fetch monthly data");
            return null;
        } catch {
            setError("Failed to connect to server");
            return null;
        } finally {
            setIsLoading(false);
        }
    }

    // The API decides which dates are valid class days from the configured
    // school year. This includes configured weekends and excludes dates
    // outside the school year, rather than assuming Monday through Friday.
    useEffect(() => {
        let cancelled = false;
        const sectionParam = activeSection ? `&section=${encodeURIComponent(activeSection)}` : "";
        void fetch(`/api/attendance/monthly?year=${selectedYear}&month=${selectedMonth}${sectionParam}`, { cache: "no-store" })
            .then((res) => res.json())
            .then((data) => {
                if (!cancelled && data.success && Array.isArray(data.schoolDays)) {
                    const dates = data.schoolDays as string[];
                    const configuredDates = Array.isArray(data.holidayDates)
                        ? (data.holidayDates as string[]).filter((date) => dates.includes(date))
                        : [];
                    setAvailableHolidayDates(dates);
                    setHolidayDates((previous) => previous.filter((date) => dates.includes(date)));
                    setConfiguredHolidayDates([...new Set(configuredDates)].sort());
                }
            })
            .catch(() => {
                if (!cancelled) {
                    setAvailableHolidayDates([]);
                    setConfiguredHolidayDates([]);
                }
            });
        return () => { cancelled = true; };
    }, [activeSection, selectedMonth, selectedYear]);

    async function handlePreview() {
        const monthlyData = await fetchMonthlyData();
        if (!monthlyData) return;

        const holidaySet = new Set([...configuredHolidayDates, ...holidayDates, ...monthlyData.holidayDates]);
        const countableRows = monthlyData.rows.filter((row) => !holidaySet.has(row.date));
        const present = countableRows.filter((row) =>
            isAttendedExportStatus(toAttendanceExportStatus(row.time_in_status))
        ).length;
        const pct = countableRows.length > 0 ? Math.round((present / countableRows.length) * 100) : 0;
        setPreview({
            totalDays: monthlyData.schoolDays.filter((date) => !holidaySet.has(date)).length,
            totalStudents: monthlyData.studentCount,
            presentPct: pct,
        });
    }

    async function handleExportSF2() {
        const monthlyData = await fetchMonthlyData();
        if (!monthlyData || monthlyData.rows.length === 0) {
            setError("No records found for this month.");
            return;
        }
        await exportMonthlySF2(
            monthlyData.rows,
            selectedYear,
            selectedMonth,
            sectionLabel,
            Array.from(new Set([...configuredHolidayDates, ...holidayDates, ...monthlyData.holidayDates])).sort(),
            monthlyData.schoolDays,
            monthlyData.schoolYearLabel,
        );
    }

    async function handlePrintPDF() {
        const monthlyData = await fetchMonthlyData();
        if (!monthlyData || monthlyData.rows.length === 0) {
            setError("No records found for this month.");
            return;
        }
        printMonthlyAttendance(monthlyData.rows, selectedYear, selectedMonth, sectionLabel, adviserName);
    }

    const isFuture = selectedYear > now.getFullYear() ||
        (selectedYear === now.getFullYear() && selectedMonth > now.getMonth() + 1);

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/40 p-3 sm:p-4">
            <div className="my-auto flex max-h-[calc(100dvh-1.5rem)] w-full max-w-md flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
                {/* Header */}
                <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4 bg-gradient-to-r from-emerald-50 to-white">
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-emerald-500 flex items-center justify-center">
                            <CalendarDays className="w-5 h-5 text-white" />
                        </div>
                        <div>
                            <h3 className="text-base font-bold text-slate-800">Monthly Export</h3>
                            <p className="text-xs text-slate-400 mt-0.5">Export full month attendance records</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 transition-colors">
                        <X className="h-4 w-4" />
                    </button>
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
                    {/* Section info pill */}
                    <div className="mb-5 flex items-center gap-2 rounded-xl bg-slate-50 border border-slate-100 px-4 py-3">
                        <IdCard className="w-4 h-4 text-emerald-500 shrink-0" />
                        <span className="text-xs font-semibold text-slate-600">{sectionLabel}</span>
                        <span className="mx-1 text-slate-300">·</span>
                        <span className="text-xs text-slate-400">{adviserName}</span>
                    </div>

                    {/* Month & Year selectors */}
                    <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <div>
                            <label className="mb-1.5 block text-xs font-semibold text-slate-600">Month</label>
                            <div className="relative">
                                <select
                                    value={selectedMonth}
                                    onChange={e => { setSelectedMonth(Number(e.target.value)); setPreview(null); setError(""); setHolidayDates([]); }}
                                    className="h-11 w-full appearance-none rounded-xl border border-slate-200 bg-white px-4 pr-10 text-sm text-slate-700 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 transition">
                                    {MONTH_NAMES.map((name, i) => (
                                        <option key={i + 1} value={i + 1}>{name}</option>
                                    ))}
                                </select>
                                <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                            </div>
                        </div>
                        <div>
                            <label className="mb-1.5 block text-xs font-semibold text-slate-600">Year</label>
                            <div className="relative">
                                <select
                                    value={selectedYear}
                                    onChange={e => { setSelectedYear(Number(e.target.value)); setPreview(null); setError(""); setHolidayDates([]); }}
                                    className="h-11 w-full appearance-none rounded-xl border border-slate-200 bg-white px-4 pr-10 text-sm text-slate-700 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 transition">
                                    {years.map(y => <option key={y} value={y}>{y}</option>)}
                                </select>
                                <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                            </div>
                        </div>
                    </div>

                    {/* Selected month display */}
                    <div className="mb-5 rounded-xl bg-emerald-50 border border-emerald-100 px-4 py-3 text-center">
                        <p className="text-xs text-emerald-600 font-medium">Selected Period</p>
                        <p className="text-lg font-extrabold text-emerald-800 mt-0.5">{MONTH_NAMES[selectedMonth - 1]} {selectedYear}</p>
                        {isFuture && (
                            <p className="text-[11px] text-amber-600 mt-1 flex items-center justify-center gap-1">
                                <AlertCircle className="w-3 h-3" /> This month is in the future
                            </p>
                        )}
                    </div>

                    {/* Preview stats (shown after clicking preview) */}
                    {preview && (
                        <div className="mb-5 grid grid-cols-3 gap-2">
                            <div className="rounded-xl bg-slate-50 border border-slate-100 px-3 py-3 text-center">
                                <p className="text-[10px] text-slate-400 font-medium uppercase tracking-wide">School Days</p>
                                <p className="text-xl font-extrabold text-slate-800 mt-0.5">{preview.totalDays}</p>
                            </div>
                            <div className="rounded-xl bg-slate-50 border border-slate-100 px-3 py-3 text-center">
                                <p className="text-[10px] text-slate-400 font-medium uppercase tracking-wide">Students</p>
                                <p className="text-xl font-extrabold text-slate-800 mt-0.5">{preview.totalStudents}</p>
                            </div>
                            <div className="rounded-xl bg-emerald-50 border border-emerald-100 px-3 py-3 text-center">
                                <p className="text-[10px] text-emerald-600 font-medium uppercase tracking-wide">Avg Present</p>
                                <p className="text-xl font-extrabold text-emerald-700 mt-0.5">{preview.presentPct}%</p>
                            </div>
                        </div>
                    )}

                    {/* Holiday selector */}
                    <div className="mb-5 rounded-xl border border-slate-200 bg-white p-4">
                        <div className="mb-2 flex items-center justify-between gap-3">
                            <div>
                                <p className="text-xs font-semibold text-slate-600">Holiday Dates</p>
                                <p className="text-[11px] text-slate-400">Selected dates will be marked as <strong>H</strong> in SF2 and excluded from class days.</p>
                            </div>
                            {holidayDates.length > 0 && (
                                <button
                                    onClick={() => { setHolidayDates([]); setPreview(null); }}
                                    type="button"
                                    className="text-[11px] font-semibold text-emerald-600 hover:text-emerald-700"
                                >
                                    Clear all
                                </button>
                            )}
                        </div>
                        <div className="max-h-32 overflow-y-auto rounded-lg border border-slate-100 bg-slate-50 p-2">
                            <div className="grid grid-cols-2 gap-2">
                                {availableHolidayDates.map((dateStr) => {
                                    const isConfiguredHoliday = configuredHolidayDates.includes(dateStr);
                                    const checked = isConfiguredHoliday || holidayDates.includes(dateStr);
                                    return (
                                        <label key={dateStr} className={`flex cursor-pointer items-center gap-2 rounded-lg border px-2 py-2 text-xs transition-colors ${checked ? "border-emerald-300 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-white text-slate-600"}`}>
                                            <input
                                                type="checkbox"
                                                checked={checked}
                                                disabled={isConfiguredHoliday}
                                                onChange={(e) => {
                                                    setPreview(null);
                                                    setHolidayDates((prev) =>
                                                        e.target.checked
                                                            ? [...prev, dateStr].sort()
                                                            : prev.filter((d) => d !== dateStr)
                                                    );
                                                }}
                                                className="h-3.5 w-3.5 rounded border-slate-300 text-emerald-500 focus:ring-emerald-400"
                                            />
                                            <span>{formatDateLabel(dateStr)}{isConfiguredHoliday ? " (configured)" : ""}</span>
                                        </label>
                                    );
                                })}
                            </div>
                        </div>
                    </div>

                    {/* Error */}
                    {error && (
                        <div className="mb-4 flex items-center gap-2 rounded-xl bg-red-50 border border-red-100 px-4 py-3 text-sm text-red-600">
                            <AlertCircle className="w-4 h-4 shrink-0" />{error}
                        </div>
                    )}

                    {/* Action buttons */}
                    <div className="flex flex-col gap-2.5">
                        {/* Preview button */}
                        {!preview && (
                            <button
                                onClick={handlePreview}
                                disabled={isLoading || isFuture}
                                className="flex h-11 w-full items-center justify-center gap-2 rounded-xl border-2 border-emerald-200 bg-emerald-50 hover:bg-emerald-100 text-sm font-bold text-emerald-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                                {isLoading ? (
                                    <><svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" /></svg>Loading…</>
                                ) : (
                                    <><Calendar className="w-4 h-4" />Preview Month Data</>
                                )}
                            </button>
                        )}

                        {/* Export row (visible after preview or immediately on second visit) */}
                        <div className="grid grid-cols-2 gap-2.5">
                            <button
                                onClick={handleExportSF2}
                                disabled={isLoading || isFuture}
                                className="flex h-11 items-center justify-center gap-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-xs font-bold text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                                {isLoading ? <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" /></svg> : <Printer className="w-3.5 h-3.5" />}
                                Export SF2
                            </button>
                            <button
                                onClick={handlePrintPDF}
                                disabled={isLoading || isFuture}
                                className="flex h-11 items-center justify-center gap-2 rounded-xl bg-slate-800 hover:bg-slate-900 text-xs font-bold text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                                {isLoading ? <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" /></svg> : <FileText className="w-3.5 h-3.5" />}
                                Print PDF
                            </button>
                        </div>
                    </div>

                    <p className="mt-3 text-center text-[10px] text-slate-400">
                        Choose whether to export the monthly attendance as SF2 Excel or print it as PDF. Selected holidays will be marked as H and excluded from totals.
                    </p>
                </div>
            </div>
        </div>
    );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
function ExcuseApprovalModal({ onClose, adviserGrade }: {
    onClose: () => void;
    adviserGrade: string;
}) {
    const [requests, setRequests] = useState<ExcuseRequest[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [fetchError, setFetchError] = useState("");
    const [declineReasons, setDeclineReasons] = useState<Record<number, string>>({});
    const [declineErrors, setDeclineErrors] = useState<Record<number, string>>({});
    const [actionLoading, setActionLoading] = useState<Record<number, boolean>>({});
    const actionInFlightRef = useRef(new Set<number>());

    const fetchRequests = useCallback(async () => {
        try {
            setIsLoading(true);
            setFetchError("");
            const params = new URLSearchParams();
            if (adviserGrade) params.set("grade", adviserGrade);

            const res = await fetch(`/api/excuse-letters/adviser?${params.toString()}`, {
                cache: "no-store",
                credentials: "same-origin",
            });
            const data = await res.json();

            if (!data.success) {
                setFetchError(data.message || "Failed to load excuse letters.");
                return;
            }

            const mapped: ExcuseRequest[] = (data.letters || []).map((l: {
                id: number;
                student_id: string;
                studentName: string;
                parentName: string;
                relationship: string;
                message: string;
                date_from: string;
                date_to: string;
                submitted_at: string;
                status: ExcuseRequestStatus;
                decline_reason?: string;
                attachment?: { file_name: string; file_type: string; file_data: string } | null;
            }) => ({
                id: l.id,
                studentName: l.studentName,
                studentId: l.student_id,
                parentName: l.parentName,
                relationship: l.relationship,
                message: l.message,
                dateFrom: l.date_from,
                dateTo: l.date_to,
                submittedAt: new Date(l.submitted_at).toLocaleDateString("en-US", {
                    month: "long", day: "numeric", year: "numeric",
                    hour: "2-digit", minute: "2-digit",
                }),
                attachments: l.attachment ? [l.attachment.file_name] : [],
                attachmentData: l.attachment ? [{
                    file_name: l.attachment.file_name,
                    file_type: l.attachment.file_type,
                    file_data: l.attachment.file_data,
                }] : [],
                status: l.status,
                declineReason: l.decline_reason ?? undefined,
            }));

            setRequests(mapped);
            setDeclineReasons(
                mapped.reduce<Record<number, string>>((acc, r) => {
                    acc[r.id] = r.declineReason ?? "";
                    return acc;
                }, {})
            );
        } catch {
            setFetchError("Failed to connect to server.");
        } finally {
            setIsLoading(false);
        }
    }, [adviserGrade]);

    useEffect(() => { fetchRequests(); }, [fetchRequests]);
    useSessionInvalidation((event) => {
        if (!event.scope || event.scope === "attendance") return fetchRequests();
    });

    async function handleApprove(id: number) {
        if (actionInFlightRef.current.has(id)) return;
        actionInFlightRef.current.add(id);
        setActionLoading(prev => ({ ...prev, [id]: true }));
        try {
            const res = await fetch(`/api/excuse-letters/${id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                credentials: "same-origin",
                body: JSON.stringify({ status: "Approved" }),
            });
            const data = await res.json();
            if (!data.success) {
                setDeclineErrors(prev => ({ ...prev, [id]: data.message || "Failed to approve." }));
                if (res.status === 409) void fetchRequests();
                return;
            }
            setRequests(prev => prev.map(r => r.id === id ? { ...r, status: "Approved", declineReason: undefined } : r));
        } catch {
            setDeclineErrors(prev => ({ ...prev, [id]: "Failed to connect to server." }));
        } finally {
            actionInFlightRef.current.delete(id);
            setActionLoading(prev => ({ ...prev, [id]: false }));
        }
    }

    async function handleDecline(id: number) {
        const reason = declineReasons[id]?.trim() ?? "";
        if (!reason) {
            setDeclineErrors(prev => ({ ...prev, [id]: "Enter a reason before declining this request." }));
            return;
        }
        if (actionInFlightRef.current.has(id)) return;
        actionInFlightRef.current.add(id);
        setActionLoading(prev => ({ ...prev, [id]: true }));
        try {
            const res = await fetch(`/api/excuse-letters/${id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                credentials: "same-origin",
                body: JSON.stringify({ status: "Declined", decline_reason: reason }),
            });
            const data = await res.json();
            if (!data.success) {
                setDeclineErrors(prev => ({ ...prev, [id]: data.message || "Failed to decline." }));
                if (res.status === 409) void fetchRequests();
                return;
            }
            setRequests(prev => prev.map(r => r.id === id ? { ...r, status: "Declined", declineReason: reason } : r));
            setDeclineErrors(prev => ({ ...prev, [id]: "" }));
        } catch {
            setDeclineErrors(prev => ({ ...prev, [id]: "Failed to connect to server." }));
        } finally {
            actionInFlightRef.current.delete(id);
            setActionLoading(prev => ({ ...prev, [id]: false }));
        }
    }

    function handleDownloadAttachment(file: { file_name: string; file_type: string; file_data: string }) {
        const byteChars = atob(file.file_data);
        const byteArrays = [];
        for (let i = 0; i < byteChars.length; i += 512) {
            const slice = byteChars.slice(i, i + 512);
            const bytes = new Uint8Array(slice.length);
            for (let j = 0; j < slice.length; j++) bytes[j] = slice.charCodeAt(j);
            byteArrays.push(bytes);
        }
        const blob = new Blob(byteArrays, { type: file.file_type });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = file.file_name;
        a.click();
        URL.revokeObjectURL(url);
    }

    function inclusiveDays(from: string, to: string) {
        const start = new Date(`${from}T00:00:00`);
        const end = new Date(`${to}T00:00:00`);
        if (isNaN(start.getTime()) || isNaN(end.getTime()) || end < start) return 0;
        return Math.floor((end.getTime() - start.getTime()) / 86400000) + 1;
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-900/40 p-3 backdrop-blur-sm sm:p-5">
            <div className="my-auto flex max-h-[calc(100dvh-1.5rem)] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-2xl">

                {/* Header */}
                <div className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-100 px-4 py-4 sm:px-6 sm:py-5">
                    <div className="min-w-0">
                        <h3 className="text-base font-bold text-slate-800">Excuse Letter Approval</h3>
                        <p className="text-xs text-slate-400 mt-0.5">Review parent-submitted excuse letters and mark each request.</p>
                    </div>
                    <div className="flex items-center gap-2">
                        <button onClick={fetchRequests}
                            className="rounded-lg px-3 py-2 text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-600 transition-colors">
                            Refresh
                        </button>
                        <button onClick={onClose} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 transition-colors">
                            <X className="w-4 h-4" />
                        </button>
                    </div>
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">

                    {/* Loading */}
                    {isLoading && (
                        <div className="flex items-center justify-center gap-2 py-16 text-slate-400 text-sm">
                            <svg className="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                            </svg>
                            Loading excuse letters...
                        </div>
                    )}

                    {/* Fetch error */}
                    {!isLoading && fetchError && (
                        <div className="flex items-center gap-2 rounded-xl bg-red-50 border border-red-100 px-4 py-4 text-sm text-red-600">
                            <AlertCircle className="w-4 h-4 shrink-0" />{fetchError}
                        </div>
                    )}

                    {/* Empty */}
                    {!isLoading && !fetchError && requests.length === 0 && (
                        <div className="flex flex-col items-center justify-center py-16 text-slate-400">
                            <FileText className="w-10 h-10 mb-3 opacity-30" />
                            <p className="text-sm">No excuse letters submitted yet.</p>
                        </div>
                    )}

                    {/* Requests */}
                    {!isLoading && !fetchError && requests.length > 0 && (
                        <div className="grid gap-4">
                            {requests.map(req => {
                                const days = inclusiveDays(req.dateFrom, req.dateTo);
                                const loading = actionLoading[req.id] ?? false;
                                const reqWithData = req as ExcuseRequest & {
                                    attachmentData?: { file_name: string; file_type: string; file_data: string }[];
                                };

                                return (
                                    <article key={req.id} className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                                        <div className="flex flex-wrap items-start justify-between gap-3 bg-slate-50 px-5 py-4 border-b border-slate-100">
                                            <div>
                                                <div className="flex flex-wrap items-center gap-2">
                                                    <h4 className="text-sm font-extrabold text-slate-800">{req.studentName}</h4>
                                                    <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${req.status === "Approved" ? "bg-emerald-100 text-emerald-700" :
                                                        req.status === "Declined" ? "bg-red-100 text-red-600" :
                                                            "bg-amber-100 text-amber-700"
                                                        }`}>{req.status}</span>
                                                </div>
                                                <p className="text-xs text-slate-400 mt-1">LRN: {req.studentId} · Submitted {req.submittedAt}</p>
                                            </div>
                                            <div className="text-right">
                                                <p className="text-xs font-bold text-slate-600">
                                                    {formatDateLabel(req.dateFrom)} – {formatDateLabel(req.dateTo)}
                                                </p>
                                                <p className="text-[11px] text-slate-400 mt-1">{days} excused day{days === 1 ? "" : "s"}</p>
                                            </div>
                                        </div>

                                        <div className="grid gap-4 p-5 lg:grid-cols-[1fr_240px]">
                                            <div className="space-y-4">
                                                <div className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-3">
                                                    <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">Parent / Guardian</p>
                                                    <p className="text-sm font-bold text-slate-800">{req.parentName}</p>
                                                    <p className="text-xs text-slate-500">{req.relationship}</p>
                                                </div>
                                                <div>
                                                    <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">Message / Reason</p>
                                                    <p className="text-sm leading-relaxed text-slate-600">{req.message}</p>
                                                </div>
                                                <div>
                                                    <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2">Attachments</p>
                                                    {req.attachments.length === 0 ? (
                                                        <p className="text-xs text-slate-400">No attachments.</p>
                                                    ) : (
                                                        <div className="flex flex-wrap gap-2">
                                                            {req.attachments.map((fileName, idx) => {
                                                                const fileData = reqWithData.attachmentData?.[idx];
                                                                return (
                                                                    <button
                                                                        key={fileName}
                                                                        type="button"
                                                                        onClick={() => fileData && handleDownloadAttachment(fileData)}
                                                                        className="inline-flex items-center gap-1.5 rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-xs font-bold text-blue-700 hover:bg-blue-100 transition-colors">
                                                                        <Paperclip className="w-3.5 h-3.5" />
                                                                        {fileName}
                                                                    </button>
                                                                );
                                                            })}
                                                        </div>
                                                    )}
                                                </div>

                                                {/* Decline reason shown if declined */}
                                                {req.status === "Declined" && req.declineReason && (
                                                    <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3">
                                                        <p className="text-[11px] font-bold uppercase tracking-wider text-red-500 mb-1">Decline Reason</p>
                                                        <p className="text-xs leading-relaxed text-red-700">{req.declineReason}</p>
                                                    </div>
                                                )}
                                            </div>

                                            {/* Action panel */}
                                            <div className="flex flex-col justify-end gap-2">
                                                <div className="mb-1">
                                                    <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-slate-400">
                                                        Reason for Declining
                                                    </label>
                                                    <textarea
                                                        value={declineReasons[req.id] ?? ""}
                                                        onChange={(e) => {
                                                            const value = e.target.value;
                                                            setDeclineReasons(prev => ({ ...prev, [req.id]: value }));
                                                            if (value.trim()) setDeclineErrors(prev => ({ ...prev, [req.id]: "" }));
                                                        }}
                                                        rows={4}
                                                        placeholder="Required when declining..."
                                                        disabled={req.status !== "Pending" || loading}
                                                        className={`w-full resize-none rounded-xl border bg-white px-3 py-2 text-xs leading-relaxed text-slate-700 outline-none transition focus:ring-2 disabled:opacity-50 disabled:cursor-not-allowed ${declineErrors[req.id]
                                                            ? "border-red-200 focus:border-red-300 focus:ring-red-100"
                                                            : "border-slate-200 focus:border-red-300 focus:ring-red-100"
                                                            }`}
                                                    />
                                                    {declineErrors[req.id] && (
                                                        <p className="mt-1.5 text-[11px] font-semibold text-red-500">{declineErrors[req.id]}</p>
                                                    )}
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={() => handleApprove(req.id)}
                                                    disabled={req.status !== "Pending" || loading}
                                                    className="flex h-11 items-center justify-center gap-2 rounded-xl bg-emerald-500 text-sm font-bold text-white hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
                                                    {loading
                                                        ? <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" /></svg>
                                                        : <Check className="w-4 h-4" />}
                                                    Approve
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => handleDecline(req.id)}
                                                    disabled={req.status !== "Pending" || loading}
                                                    className="flex h-11 items-center justify-center gap-2 rounded-xl bg-red-500 text-sm font-bold text-white hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
                                                    {loading
                                                        ? <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" /></svg>
                                                        : <X className="w-4 h-4" />}
                                                    Decline
                                                </button>
                                            </div>
                                        </div>
                                    </article>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

export default function AdviserAttendancePage() {
    const [scanValue, setScanValue] = useState("");
    const [activeTopAction, setActiveTopAction] = useState<"history" | null>(null);
    const [scanMessage, setScanMessage] = useState("Waiting for RFID card tap...");
    const [logs, setLogs] = useState<AttendanceLog[]>([]);
    const [lastScanned, setLastScanned] = useState<AttendanceLog | null>(null);
    const [isLoadingLogs, setIsLoadingLogs] = useState(false);
    const [adviser, setAdviser] = useState<AdviserInfo | null>(null);
    const [students, setStudents] = useState<Student[]>([]);
    const [isLoadingStudents, setIsLoadingStudents] = useState(false);

    const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);
    const [manualType, setManualType] = useState<ScanMode>("Time In");
    const [manualStatus, setManualStatus] = useState<ManualAttendanceStatus>("On Time");
    const [manualRemark, setManualRemark] = useState("");
    const [manualExcuseStartDate, setManualExcuseStartDate] = useState(toLocalDateString(new Date()));
    const [manualExcuseEndDate, setManualExcuseEndDate] = useState(toLocalDateString(new Date()));
    const [manualStudentSearch, setManualStudentSearch] = useState("");
    const [isManualStudentPickerOpen, setIsManualStudentPickerOpen] = useState(false);
    const [manualMessage, setManualMessage] = useState("");
    const [isSavingManual, setIsSavingManual] = useState(false);
    const [showEditAttendance, setShowEditAttendance] = useState(false);
    const [editAttendanceDate, setEditAttendanceDate] = useState(toLocalDateString(new Date()));
    const [editableAttendanceRecords, setEditableAttendanceRecords] = useState<EditableAttendanceRecord[]>([]);
    const [selectedEditLogIds, setSelectedEditLogIds] = useState<number[]>([]);
    const [editAttendanceStatus, setEditAttendanceStatus] = useState<"Present" | "Absent">("Present");
    const [isLoadingEditableAttendance, setIsLoadingEditableAttendance] = useState(false);
    const [isSavingEditedAttendance, setIsSavingEditedAttendance] = useState(false);
    const [editAttendanceMessage, setEditAttendanceMessage] = useState("");

    const [todayLogSearch, setTodayLogSearch] = useState("");
    const [todayLogPage, setTodayLogPage] = useState(1);

    const [showRegisterRfid, setShowRegisterRfid] = useState(false);
    const [rfidStudentId, setRfidStudentId] = useState("");
    const [newRfidValue, setNewRfidValue] = useState("");
    const [rfidMessage, setRfidMessage] = useState("Waiting for new RFID card tap...");
    const [isSavingRfid, setIsSavingRfid] = useState(false);

    const [showHistory, setShowHistory] = useState(false);
    const [historyDate, setHistoryDate] = useState(toLocalDateString(new Date()));
    const [historySummary, setHistorySummary] = useState<HistorySummaryRow[]>([]);
    const [historyStats, setHistoryStats] = useState<HistoryStats | null>(null);
    const [isLoadingHistory, setIsLoadingHistory] = useState(false);
    const [historyError, setHistoryError] = useState("");
    const [historyIsHoliday, setHistoryIsHoliday] = useState(false);
    const [historySearch, setHistorySearch] = useState("");
    const [historyFilter, setHistoryFilter] = useState<"All" | "Present" | "Absent" | "Late" | "Excused">("All");
    const [historyPage, setHistoryPage] = useState(1);

    // ── Monthly export modal ──
    const [showMonthlyExport, setShowMonthlyExport] = useState(false);
    const [showExcuseApproval, setShowExcuseApproval] = useState(false);

    // ── Class session ──
    const [classSession, setClassSession] = useState<ClassSessionInfo | null>(null);
    const [classSessions, setClassSessions] = useState<ClassSessionInfo[]>([]);
    const [sessionLoading, setSessionLoading] = useState(false);

    // ── Multi-section support ──
    const [activeSection, setActiveSection] = useState<string>("");
    const [guideTarget, setGuideTarget] = useState<string | null>(null);

    const inputRef = useRef<HTMLInputElement | null>(null);
    const newRfidInputRef = useRef<HTMLInputElement | null>(null);
    const scanValueRef = useRef("");
    const scanInFlightRef = useRef(false);

    // A school-wide session can be active while this adviser's section belongs
    // to the other session. Scanning must be enabled only for matching sections.
    const selectedSectionSession = students.find((student) => student.class_session)?.class_session ?? null;
    const editableAttendanceLogIds = editableAttendanceRecords.flatMap((record) =>
        record.editable && record.attendance_log_id !== null ? [record.attendance_log_id] : [],
    );
    const allEditableAttendanceSelected = editableAttendanceLogIds.length > 0
        && editableAttendanceLogIds.every((id) => selectedEditLogIds.includes(id));
    const isScanningOpen = Boolean(
        classSession && selectedSectionSession === classSession.session_type
    );

    function focusScanner() { inputRef.current?.focus(); }
    function focusNewRfidScanner() { newRfidInputRef.current?.focus(); }

    const loadStudents = useCallback(async (section?: string) => {
        try {
            setIsLoadingStudents(true);
            const sec = section !== undefined ? section : activeSection;
            const qs = sec ? `?limit=200&section=${encodeURIComponent(sec)}` : "?limit=200";
            const res = await fetch(`/api/students${qs}`, { cache: "no-store" });
            const data = await res.json();
            if (data.success) {
                setStudents(data.data || []);
                if (data.adviser) {
                    setAdviser(data.adviser);
                    if (!activeSection && data.adviser.sections?.length) {
                        setActiveSection(data.adviser.sections[0]);
                    }
                }
            }
        } catch (error) { console.error("Failed to load students:", error); }
        finally { setIsLoadingStudents(false); }
    }, [activeSection]);

    const loadTodayLogs = useCallback(async (section?: string) => {
        try {
            setIsLoadingLogs(true);
            const sec = section !== undefined ? section : activeSection;
            const secParam = sec ? `?section=${encodeURIComponent(sec)}` : "";
            const res = await fetch(`/api/attendance/today${secParam}`, { cache: "no-store" });
            const data = await res.json();
            if (data.success) {
                const newestFirst = [...(data.logs || [])].sort((a, b) =>
                    String(b.time_logged || "").localeCompare(String(a.time_logged || ""))
                );
                setLogs(newestFirst);
                setTodayLogPage(1);
                if (newestFirst.length > 0) setLastScanned(newestFirst[0]);
            } else {
                setScanMessage(data.message || "Failed to load attendance logs");
            }
        } catch (error) { console.error("Failed to load logs:", error); }
        finally { setIsLoadingLogs(false); }
    }, [activeSection]);

    async function loadHistory(date: string, section?: string) {
        setIsLoadingHistory(true); setHistoryError(""); setHistoryIsHoliday(false); setHistoryPage(1);
        try {
            const sec = section !== undefined ? section : activeSection;
            const secParam = sec ? `&section=${encodeURIComponent(sec)}` : "";
            const res = await fetch(`/api/attendance/history?date=${date}${secParam}`, { cache: "no-store" });
            const data = await res.json();
            if (data.success) {
                setHistorySummary(data.summary || []);
                setHistoryStats(data.stats || null);
                setHistoryIsHoliday(data.isHoliday ?? false);
            } else {
                setHistoryError(data.message || "Failed to load history");
            }
        } catch { setHistoryError("Failed to connect to server"); }
        finally { setIsLoadingHistory(false); }
    }

    const loadClassSession = useCallback(async (background = false) => {
        try {
            if (!background) setSessionLoading(true);
            const res = await fetch("/api/attendance/class-session", { cache: "no-store" });
            const data = await res.json();
            if (data.success) {
                const sessions = (data.sessions || []) as ClassSessionInfo[];
                setClassSessions(sessions);
                const active = sessions.find((session) => session.status === "Active");
                const upcoming = sessions.find((session) => session.status === "Not Started");
                setClassSession(active || null);
                if (active) {
                    setScanMessage(`${active.session_type} class is active under ICT's saved schedule. Waiting for RFID card tap...`);
                } else if (upcoming) {
                    setScanMessage(`Not started. Scanning opens at ${formatTime(upcoming.scheduled_start)} under ICT's saved schedule.`);
                } else if (sessions.length === 0) {
                    setScanMessage(data.availability?.message || "Scanning is unavailable today because there is no school session.");
                } else {
                    setScanMessage("Ended. Scanning is unavailable outside ICT's saved class schedule.");
                }
            } else {
                setScanMessage(data.message || "Failed to load class session");
            }
        } catch (error) {
            console.error("Failed to load class session:", error);
            setScanMessage("Failed to load class session");
        } finally {
            if (!background) setSessionLoading(false);
        }
    }, []);

    function changeHistoryDate(offset: number) {
        const [y, m, d] = historyDate.split("-").map(Number);
        const next = new Date(y, m - 1, d + offset);
        const nextStr = toLocalDateString(next);
        setHistoryDate(nextStr);
        loadHistory(nextStr);
    }

    async function handleScan(inputValue?: string) {
        // Do not rely solely on scanValue here. Hardware readers can send the
        // final UID character and Enter before React commits onChange, which
        // made the first tap submit a truncated, "not registered" card value.
        const value = resolveRfidScanValue(inputValue, scanValueRef.current);
        if (!value || scanInFlightRef.current) return;
        scanInFlightRef.current = true;
        if (!isScanningOpen) {
            scanValueRef.current = "";
            setScanValue("");
            await loadClassSession();
            scanInFlightRef.current = false;
            inputRef.current?.focus();
            return;
        }
        try {
            setScanMessage("Processing RFID scan...");
            const section = activeSection || adviser?.sections?.[0] || adviser?.section || "";
            const res = await fetch("/api/attendance/scan", {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ rfid_card: value, section }),
            });
            const data = await res.json();
            if (data.success) {
                const newLog: AttendanceLog = data.log;
                setLastScanned(newLog);
                setLogs(prev => [newLog, ...prev]);
                setTodayLogPage(1);
                setScanMessage(`✓ ${newLog.full_name} recorded as ${newLog.status}`);
            } else {
                setScanMessage(`⚠ ${data.message || "Scan failed"}`);
            }
        } catch (error) {
            console.error("Scan failed:", error);
            setScanMessage("Failed to connect to server");
        } finally {
            scanValueRef.current = "";
            setScanValue("");
            scanInFlightRef.current = false;
            inputRef.current?.focus();
        }
    }

    async function handleManualSave() {
        if (selectedStudentIds.length === 0 || isSavingManual) return;
        if (manualStatus === "Excused") {
            if (!manualRemark.trim() || !manualExcuseStartDate || !manualExcuseEndDate) {
                setManualMessage("An excuse reason, start date, and end date are required.");
                return;
            }
            if (manualExcuseEndDate < manualExcuseStartDate) {
                setManualMessage("The excuse end date cannot be before the start date.");
                return;
            }
        }

        const studentIdsToSave = [...selectedStudentIds];
        const failedStudentIds: string[] = [];
        const failures: string[] = [];
        let savedCount = 0;
        let savedManualExcuse = false;

        try {
            setIsSavingManual(true);
            for (const [index, studentId] of studentIdsToSave.entries()) {
                setManualMessage(`Saving attendance ${index + 1} of ${studentIdsToSave.length}...`);
                try {
                    const res = await fetch("/api/attendance/manual", {
                        method: "POST", headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            student_id: studentId,
                            type: manualType,
                            status: manualStatus,
                            remark: manualRemark,
                            ...(manualStatus === "Excused" ? {
                                date_from: manualExcuseStartDate,
                                date_to: manualExcuseEndDate,
                            } : {}),
                        }),
                    });
                    const data = await res.json();
                    if (!data.success) {
                        failedStudentIds.push(studentId);
                        failures.push(data.message || "Failed to save attendance");
                        continue;
                    }

                    const newLog = data.log as AttendanceLog | undefined;
                    if (newLog) {
                        setLogs(prev => prev.some(log => log.id === newLog.id)
                            ? prev.map(log => log.id === newLog.id ? newLog : log)
                            : [newLog, ...prev]);
                        setLastScanned(newLog);
                    } else if (manualStatus === "Excused") {
                        savedManualExcuse = true;
                    }
                    savedCount += 1;
                } catch (error) {
                    console.error("Manual save failed:", error);
                    failedStudentIds.push(studentId);
                    failures.push("Failed to connect to server");
                }
            }

            setTodayLogPage(1);
            setSelectedStudentIds(failedStudentIds);
            if (failedStudentIds.length === 0) {
                setManualStudentSearch(""); setManualType("Time In");
                setManualStatus("On Time"); setManualRemark("");
                setManualExcuseStartDate(toLocalDateString(new Date()));
                setManualExcuseEndDate(toLocalDateString(new Date()));
                setManualMessage(`Manual attendance saved for ${savedCount} student${savedCount === 1 ? "" : "s"}.`);
            } else {
                setManualMessage(
                    `${savedCount} saved; ${failedStudentIds.length} still selected. ${failures[0] ?? "Review and try again."}`,
                );
            }
            if (savedManualExcuse) await loadTodayLogs();
        } finally { setIsSavingManual(false); }
    }

    async function loadEditableAttendance(date: string) {
        const section = activeSection || adviser?.sections?.[0] || adviser?.section || "";
        if (!date || !section) {
            setEditableAttendanceRecords([]);
            setEditAttendanceMessage("Choose a section and date to load attendance records.");
            return;
        }

        try {
            setIsLoadingEditableAttendance(true);
            setEditAttendanceMessage("");
            const params = new URLSearchParams({ date, section });
            const response = await fetch(`/api/attendance/edit?${params.toString()}`, {
                cache: "no-store",
                credentials: "same-origin",
            });
            const data = await response.json();
            if (!data.success) {
                setEditableAttendanceRecords([]);
                setEditAttendanceMessage(data.message || "Unable to load attendance records.");
                return;
            }
            setEditableAttendanceRecords(data.records || []);
        } catch (error) {
            console.error("Attendance edit list failed:", error);
            setEditableAttendanceRecords([]);
            setEditAttendanceMessage("Unable to load attendance records.");
        } finally {
            setIsLoadingEditableAttendance(false);
        }
    }

    function openEditAttendance() {
        const date = toLocalDateString(new Date());
        setEditAttendanceDate(date);
        setSelectedEditLogIds([]);
        setEditAttendanceStatus("Present");
        setEditAttendanceMessage("");
        setShowEditAttendance(true);
        void loadEditableAttendance(date);
    }

    async function handleEditedAttendanceSave() {
        if (selectedEditLogIds.length === 0 || isSavingEditedAttendance) return;
        const section = activeSection || adviser?.sections?.[0] || adviser?.section || "";
        if (!section) {
            setEditAttendanceMessage("Choose a section before editing attendance.");
            return;
        }

        try {
            setIsSavingEditedAttendance(true);
            setEditAttendanceMessage("Saving selected attendance records...");
            const response = await fetch("/api/attendance/edit", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                credentials: "same-origin",
                body: JSON.stringify({
                    date: editAttendanceDate,
                    section,
                    updates: selectedEditLogIds.map((attendance_log_id) => ({
                        attendance_log_id,
                        status: editAttendanceStatus,
                    })),
                }),
            });
            const data = await response.json();
            if (!data.success) {
                setEditAttendanceMessage(data.message || "Unable to update attendance records.");
                return;
            }

            setSelectedEditLogIds([]);
            if (editAttendanceDate === toLocalDateString(new Date())) await loadTodayLogs();
            if (showHistory && historyDate === editAttendanceDate) await loadHistory(historyDate);
            setShowEditAttendance(false);
        } catch (error) {
            console.error("Attendance edit save failed:", error);
            setEditAttendanceMessage("Unable to update attendance records.");
        } finally {
            setIsSavingEditedAttendance(false);
        }
    }

    async function handleRegisterNewRfid() {
        if (!rfidStudentId || !newRfidValue.trim() || isSavingRfid) return;
        try {
            setIsSavingRfid(true);
            setRfidMessage("Saving new RFID card...");
            const res = await fetch("/api/students/register-rfid", {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ student_id: rfidStudentId, rfid_card: newRfidValue.trim() }),
            });
            const data = await res.json();
            if (data.success) {
                setRfidMessage("New RFID successfully assigned");
                setRfidStudentId(""); setNewRfidValue("");
                await loadStudents();
            } else {
                setRfidMessage(data.message || "Failed to register RFID");
            }
        } catch (error) {
            console.error("RFID register failed:", error);
            setRfidMessage("Failed to connect to server");
        } finally {
            setIsSavingRfid(false);
        }
    }

    useEffect(() => {
        loadClassSession();
        loadTodayLogs();
        loadStudents();
    }, [loadClassSession, loadStudents, loadTodayLogs]);

    // Attendance and roster changes are fetched through the normal adviser
    // APIs after a targeted Broadcast. This preserves RLS/custom-session
    // authorization and does not reset an open attendance screen.
    const scheduleAttendanceRefresh = useDebouncedRealtimeRefresh(async () => {
        await loadTodayLogs();
        if (showHistory) await loadHistory(historyDate);
    });
    const scheduleStudentsRefresh = useDebouncedRealtimeRefresh(() => loadStudents());
    useSessionInvalidation((event) => {
        if (!event.scope) {
            scheduleStudentsRefresh();
            scheduleAttendanceRefresh();
            void loadClassSession();
            return;
        }
        if (event.scope === "attendance") {
            scheduleAttendanceRefresh();
        }
        if (event.scope === "students" || event.scope === "accounts") {
            scheduleStudentsRefresh();
            // Assignment and roster changes can alter which class's logs this
            // Adviser is authorized to see. Keep the visible tracker in sync
            // with the refreshed roster instead of waiting for another RFID
            // scan to arrive.
            scheduleAttendanceRefresh();
        }
        if (event.scope === "dashboard") void loadClassSession();
    });

    // Keep the screen aligned with ICT's configured start/end times even when
    // the Adviser leaves this page open while a session changes state.
    useEffect(() => {
        const refreshWhenVisible = () => {
            if (document.visibilityState === "visible") void loadClassSession(true);
        };
        const timer = window.setInterval(refreshWhenVisible, 15_000);
        document.addEventListener("visibilitychange", refreshWhenVisible);
        return () => {
            window.clearInterval(timer);
            document.removeEventListener("visibilitychange", refreshWhenVisible);
        };
    }, [loadClassSession]);

    useEffect(() => {
        if (isScanningOpen) {
            setTimeout(() => focusScanner(), 100);
        }
    }, [isScanningOpen]);

    const todayLabel = new Date().toLocaleDateString("en-US", {
        month: "long", day: "numeric", year: "numeric",
    });

    const selectedSection = activeSection || adviser?.sections?.[0] || adviser?.section || "";
    const sectionLabel = adviser?.grade && selectedSection
        ? `${formatGradeLabel(adviser.grade)} · ${selectedSection}`
        : selectedSection || "Your Section";

    const adviserName = adviser?.full_name || "Class Adviser";
    const todayStr = toLocalDateString(new Date());
    const scannerLabel = isScanningOpen && classSession ? `${classSession.session_type} Class` : "Outside Schedule";
    const selectedSchedule = classSessions.find((session) => session.session_type === selectedSectionSession)
        ?? classSessions.find((session) => session.status === "Active")
        ?? classSessions[0]
        ?? null;

    const filteredHistoryRows = historySummary.filter(row => {
        const matchSearch = historySearch === "" ||
            row.full_name.toLowerCase().includes(historySearch.toLowerCase()) ||
            row.student_id.toLowerCase().includes(historySearch.toLowerCase());
        const matchFilter =
            historyFilter === "All" ? true :
                historyFilter === "Present" ? row.time_in_status === "On Time" :
                    historyFilter === "Late" ? row.time_in_status === "Late" :
                        historyFilter === "Excused" ? row.time_in_status === "Excused" :
                            row.is_absent;
        return matchSearch && matchFilter;
    });
    const HISTORY_ROWS_PER_PAGE = 10;
    const historyPageCount = Math.max(1, Math.ceil(filteredHistoryRows.length / HISTORY_ROWS_PER_PAGE));
    const currentHistoryPage = Math.min(historyPage, historyPageCount);
    const paginatedHistoryRows = filteredHistoryRows.slice(
        (currentHistoryPage - 1) * HISTORY_ROWS_PER_PAGE,
        currentHistoryPage * HISTORY_ROWS_PER_PAGE,
    );
    const manualStudentOptions = students.filter(student => {
        const search = manualStudentSearch.trim().toLowerCase();
        return !search
            || buildFullName(student).toLowerCase().includes(search)
            || student.student_id.toLowerCase().includes(search);
    });
    const selectedManualStudent = selectedStudentIds.length === 1
        ? students.find(student => student.student_id === selectedStudentIds[0])
        : undefined;
    const selectedManualLateLog = selectedStudentIds.length === 1
        ? logs.find(log => log.student_id === selectedStudentIds[0] && log.type === manualType && log.status === "Late")
        : undefined;
    const selectedManualAutoAbsentLog = selectedStudentIds.length === 1 && manualType === "Time In"
        ? logs.find(log => log.student_id === selectedStudentIds[0] && log.type === "Time In" && log.status === "Absent" && log.via === "Auto")
        : undefined;
    const filteredTodayLogs = logs.filter(log => {
        const search = todayLogSearch.trim().toLowerCase();
        return !search || log.full_name.toLowerCase().includes(search) || log.student_id.toLowerCase().includes(search);
    });
    const TODAY_LOGS_PER_PAGE = 5;
    const todayLogPageCount = Math.max(1, Math.ceil(filteredTodayLogs.length / TODAY_LOGS_PER_PAGE));
    const currentTodayLogPage = Math.min(todayLogPage, todayLogPageCount);
    const paginatedTodayLogs = filteredTodayLogs.slice(
        (currentTodayLogPage - 1) * TODAY_LOGS_PER_PAGE,
        currentTodayLogPage * TODAY_LOGS_PER_PAGE
    );
    const guideHighlight = (target: string) => guideTarget === target
        ? "relative z-[85] pointer-events-none rounded-2xl ring-4 ring-emerald-400 ring-offset-4 ring-offset-slate-100"
        : "";

    return (
        <main className="min-w-0 flex-1 overflow-y-auto bg-slate-100 px-3 py-5 font-sans sm:px-4 md:px-6 md:py-6">

            {/* Header */}
            <div className="mb-5 flex flex-col gap-3 lg:mb-6 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                    <h1 className="text-xl font-extrabold tracking-tight text-slate-800 sm:text-2xl">RFID Attendance</h1>
                    <p className="text-slate-400 text-sm mt-0.5">{todayLabel} · {sectionLabel}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2.5">
                    {/* ── NEW: Monthly Export button ── */}
                    <button
                        onClick={() => setShowExcuseApproval(true)}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-bold transition-colors shadow-sm">
                        <FileText className="w-3.5 h-3.5 text-blue-500" />
                        Excuse Approval
                    </button>
                    <button
                        onClick={() => setShowMonthlyExport(true)}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-bold transition-colors shadow-sm">
                        <CalendarDays className="w-3.5 h-3.5 text-emerald-500" />
                        Monthly Export
                    </button>
                    <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 shadow-sm">
                        <span className={`h-2 w-2 rounded-full ${isScanningOpen ? "bg-emerald-500 animate-pulse" : "bg-slate-300"}`} />
                        <span className="text-sm font-medium text-slate-600">
                            {sessionLoading ? "Checking Schedule..." : isScanningOpen ? "Scanner Ready" : "Outside Schedule"}
                        </span>
                    </div>
                </div>
            </div>

            {/* Multi-section switcher */}
            {adviser && adviser.sections?.length > 1 && (
                <div data-parent-guide="section-switcher" className={`mb-5 flex items-center gap-2 overflow-x-auto overscroll-x-contain pb-1 ${guideHighlight("section-switcher")}`}>
                    <span className="mr-1 shrink-0 text-xs font-semibold text-slate-400">Section:</span>
                    {adviser.sections.map(sec => (
                        <button
                            key={sec}
                            onClick={() => {
                                setActiveSection(sec);
                                setSelectedStudentIds([]);
                                setManualStudentSearch("");
                                setIsManualStudentPickerOpen(false);
                                setManualStatus("On Time");
                                loadStudents(sec);
                                loadTodayLogs(sec);
                                if (showHistory) loadHistory(historyDate, sec);
                            }}
                            className={`inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold transition-all ${(activeSection || adviser.sections[0]) === sec
                                ? "bg-emerald-500 text-white shadow-sm shadow-emerald-200"
                                : "bg-white border border-slate-200 text-slate-500 hover:border-emerald-300 hover:text-emerald-700"
                                }`}
                        >
                            <span className={`h-2 w-2 rounded-full ${(activeSection || adviser.sections[0]) === sec ? "bg-white" : "bg-slate-300"
                                }`} />
                            {adviser.grade ? `${formatGradeLabel(adviser.grade)} – ${sec}` : sec}
                        </button>
                    ))}
                </div>
            )}

            {/* Action cards */}
            <div className="mb-5 grid grid-cols-1 gap-4 xl:grid-cols-3 xl:items-stretch">
                <div data-parent-guide="rfid-actions" className={`flex flex-col rounded-2xl border border-slate-100 bg-white p-4 shadow-sm sm:p-5 ${guideHighlight("rfid-actions")}`}>
                    <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50">
                        <UserPlus className="h-4 w-4 text-emerald-600" />
                    </div>
                    <h3 className="text-sm font-bold text-slate-800">Register RFID</h3>
                    <p className="mt-1 text-xs text-slate-400">Assign a new RFID card to a student</p>
                    <button
                        onClick={() => { setShowRegisterRfid(true); setRfidMessage("Waiting for new RFID card tap..."); setTimeout(() => focusNewRfidScanner(), 100); }}
                        className="mt-auto min-h-11 w-full rounded-xl bg-emerald-500 py-2.5 text-xs font-bold text-white transition-colors hover:bg-emerald-600">
                        Register Card
                    </button>
                </div>

                <div className={`flex flex-col rounded-2xl border p-4 shadow-sm transition-all duration-200 sm:p-5 ${isScanningOpen ? "border-emerald-500 bg-emerald-500 text-white ring-2 ring-emerald-200" : "border-slate-100 bg-white text-slate-800"}`}>
                    <div className={`mb-3 flex h-9 w-9 items-center justify-center rounded-xl ${isScanningOpen ? "bg-white/20" : "bg-slate-50"}`}>
                        <PlayCircle className={`h-4 w-4 ${isScanningOpen ? "text-white" : "text-slate-500"}`} />
                    </div>
                    <h3 className="text-sm font-bold">Class Session</h3>
                    <p className="mt-1 text-xs opacity-80">
                        {isScanningOpen && classSession
                            ? `${classSession.session_type} class is accepting RFID scans`
                            : scanMessage}
                    </p>
                    {selectedSchedule ? (
                        <p className="mt-3 rounded-lg bg-white/15 px-2.5 py-2 text-[11px] leading-5 opacity-95">
                            {selectedSchedule.session_type}: {formatTime(selectedSchedule.scheduled_start)} – {formatTime(selectedSchedule.scheduled_end)}<br />
                            Late after {formatTime(selectedSchedule.late_after ?? null)} · Absent after {formatTime(selectedSchedule.absent_after ?? null)}
                        </p>
                    ) : (
                        <p className="mt-3 text-[11px] opacity-80">ICT has not saved a schedule for this class yet.</p>
                    )}
                    <button
                        onClick={() => { setActiveTopAction(null); setShowHistory(false); loadClassSession(); focusScanner(); }}
                        className={`mt-auto min-h-11 w-full rounded-xl py-2.5 text-xs font-bold transition-colors ${isScanningOpen ? "bg-white text-emerald-600" : "bg-slate-800 hover:bg-slate-900 text-white"}`}>
                        {sessionLoading ? "Checking..." : isScanningOpen ? "Scanning Active" : "Check Schedule"}
                    </button>
                </div>

                <div className={`flex flex-col rounded-2xl border p-4 shadow-sm transition-all duration-200 sm:p-5 ${activeTopAction === "history" ? "border-emerald-500 bg-emerald-500 text-white ring-2 ring-emerald-200" : "border-slate-100 bg-white text-slate-800"}`}>
                    <div className={`mb-3 flex h-9 w-9 items-center justify-center rounded-xl ${activeTopAction === "history" ? "bg-white/20" : "bg-emerald-50"}`}>
                        <History className={`h-4 w-4 ${activeTopAction === "history" ? "text-white" : "text-emerald-600"}`} />
                    </div>
                    <h3 className="text-sm font-bold">History</h3>
                    <p className="mt-1 text-xs opacity-80">View past attendance records</p>
                    <button
                        onClick={() => { setActiveTopAction("history"); setShowHistory(true); loadHistory(historyDate); }}
                        className={`mt-auto min-h-11 w-full rounded-xl py-2.5 text-xs font-bold transition-colors ${activeTopAction === "history" ? "bg-white text-emerald-600" : "bg-emerald-500 hover:bg-emerald-600 text-white"}`}>
                        {activeTopAction === "history" ? "Viewing History" : "View History"}
                    </button>
                </div>
            </div>

            {/* History Panel */}
            {showHistory && (
                <div className="mb-5 bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                    <div className="flex flex-col gap-3 border-b border-slate-100 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
                        <div className="flex items-center gap-3">
                            <History className="w-5 h-5 text-emerald-500" />
                            <h3 className="text-base font-bold text-slate-800">Attendance History</h3>
                            <span className="text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded-lg">{sectionLabel}</span>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                            <button onClick={() => changeHistoryDate(-1)}
                                className="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-200 hover:bg-slate-50 transition-colors">
                                <ChevronLeft className="w-4 h-4 text-slate-500" />
                            </button>
                            <div className="relative flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
                                <Calendar className="w-4 h-4 text-emerald-500" />
                                <input type="date" value={historyDate} max={todayStr}
                                    onChange={e => { setHistoryDate(e.target.value); loadHistory(e.target.value); }}
                                    className="text-sm font-semibold text-slate-700 bg-transparent outline-none cursor-pointer" />
                            </div>
                            <button onClick={() => changeHistoryDate(1)} disabled={historyDate >= todayStr}
                                className="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-200 hover:bg-slate-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
                                <ChevronRight className="w-4 h-4 text-slate-500" />
                            </button>
                            <button onClick={() => loadHistory(historyDate)}
                                className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold transition-colors">
                                {isLoadingHistory ? "Loading…" : "Refresh"}
                            </button>
                        </div>
                    </div>

                    <div className={`flex flex-col gap-3 border-b px-4 py-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:px-5 ${historyIsHoliday ? "bg-amber-50 border-amber-100" : "bg-emerald-50 border-emerald-100"}`}>
                        <div className="flex items-center gap-2">
                            <p className={`text-sm font-bold ${historyIsHoliday ? "text-amber-700" : "text-emerald-700"}`}>
                                {formatDateLabel(historyDate)}
                            </p>
                            {historyIsHoliday && (
                                <span className="inline-flex items-center gap-1 text-xs font-bold bg-amber-100 text-amber-700 border border-amber-200 px-2.5 py-1 rounded-full">
                                    <AlertCircle className="w-3 h-3" /> Holiday — No absences recorded
                                </span>
                            )}
                        </div>
                        {historyStats && !historyIsHoliday && (
                            <div className="grid grid-cols-2 gap-2 text-xs font-semibold sm:flex sm:flex-wrap sm:items-center sm:gap-3">
                                <span className="flex min-h-10 items-center rounded-full bg-emerald-100 px-2.5 py-1 text-emerald-700">✓ Present: {historyStats.present}</span>
                                <span className="flex min-h-10 items-center rounded-full bg-amber-100 px-2.5 py-1 text-amber-700">⏰ Late: {historyStats.late}</span>
                                <span className="flex min-h-10 items-center rounded-full bg-red-100 px-2.5 py-1 text-red-600">✗ Absent: {historyStats.absent}</span>
                                <span className="flex min-h-10 items-center rounded-full bg-sky-100 px-2.5 py-1 text-sky-700">Excused: {historyStats.excused ?? 0}</span>
                                <span className="flex min-h-10 items-center rounded-full bg-slate-100 px-2.5 py-1 text-slate-500">Total: {historyStats.total}</span>
                            </div>
                        )}
                    </div>

                    {!historyError && (
                        <div className="border-b border-slate-100 px-4 py-3 sm:px-5">
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                                <div className="relative flex-1">
                                    <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                        <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
                                    </svg>
                                    <input type="text" value={historySearch} onChange={e => { setHistorySearch(e.target.value); setHistoryPage(1); }}
                                        placeholder="Search by name or student ID..."
                                        className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-4 text-sm text-slate-700 outline-none placeholder:text-slate-400 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 transition" />
                                </div>
                                <div className="flex max-w-full items-center gap-2 overflow-x-auto overscroll-x-contain">
                                    {(["All", "Present", "Absent", "Late", "Excused"] as const).map(f => (
                                        <button key={f} onClick={() => { setHistoryFilter(f); setHistoryPage(1); }}
                                            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${historyFilter === f
                                                ? f === "Late" ? "bg-amber-400 text-white shadow-sm"
                                                    : f === "Absent" ? "bg-red-500 text-white shadow-sm"
                                                        : f === "Excused" ? "bg-sky-500 text-white shadow-sm"
                                                            : "bg-emerald-500 text-white shadow-sm"
                                                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                                                }`}>{f}</button>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}

                    {historyError && (
                        <div className="flex items-center gap-2 px-5 py-4 text-sm text-red-600">
                            <AlertCircle className="w-4 h-4 shrink-0" />{historyError}
                        </div>
                    )}

                    {isLoadingHistory && (
                        <div className="flex items-center justify-center py-12 text-slate-400 text-sm gap-2">
                            <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                            </svg>
                            Loading attendance history…
                        </div>
                    )}

                    {!isLoadingHistory && !historyError && (
                        <>
                        <div className="overflow-x-auto">
                            <table className="w-full min-w-[700px] text-sm">
                                <thead>
                                    <tr className="border-b border-slate-100">
                                        {["Student", "Time In", "Status", "Time Out", "Via"].map(h => (
                                            <th key={h} className="px-5 py-3 text-left text-xs font-semibold text-slate-400">{h}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredHistoryRows.length === 0 ? (
                                        <tr><td colSpan={5} className="px-5 py-10 text-center text-sm text-slate-400">
                                            {historySummary.length === 0 ? "No students found for this section." : "No results match your search or filter."}
                                        </td></tr>
                                    ) : (
                                        paginatedHistoryRows.map(row => (
                                            <tr key={row.student_id}
                                                className={`border-b border-slate-50 last:border-0 transition-colors ${row.is_absent ? "bg-red-50/40 hover:bg-red-50/60" : "hover:bg-slate-50/60"}`}>
                                                <td className="px-5 py-3">
                                                    <div className="flex items-center gap-3">
                                                        <div className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold shrink-0 ${row.is_absent ? "bg-red-100 text-red-600" : "bg-emerald-100 text-emerald-700"}`}>
                                                            {getInitials(row.full_name)}
                                                        </div>
                                                        <div>
                                                            <p className="font-semibold text-slate-800 text-sm">{row.full_name}</p>
                                                            <p className="text-[11px] text-slate-400">{row.student_id}</p>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="px-5 py-3 text-sm text-slate-600 font-medium">{formatTime(row.time_in)}</td>
                                                <td className="px-5 py-3">
                                                    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${getStatusClass(row.time_in_status)}`}>
                                                        {row.time_in_status ?? "No Record"}
                                                    </span>
                                                    {row.is_absent && row.via === "Auto" && (
                                                        <span className="ml-1.5 text-[10px] text-slate-400 italic">auto</span>
                                                    )}
                                                </td>
                                                <td className="px-5 py-3 text-sm text-slate-600 font-medium">{formatTime(row.time_out)}</td>
                                                <td className="px-5 py-3">
                                                    {row.via ? (
                                                        <span className="inline-flex items-center gap-1.5 text-xs text-slate-500">
                                                            <IdCard className="h-3.5 w-3.5" />{row.via}
                                                        </span>
                                                    ) : (
                                                        <span className="text-xs text-slate-300">—</span>
                                                    )}
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                        {filteredHistoryRows.length > HISTORY_ROWS_PER_PAGE && (
                            <div className="flex items-center justify-between border-t border-slate-100 px-5 py-3">
                                <p className="text-xs text-slate-400">
                                    Showing {(currentHistoryPage - 1) * HISTORY_ROWS_PER_PAGE + 1}-{Math.min(currentHistoryPage * HISTORY_ROWS_PER_PAGE, filteredHistoryRows.length)} of {filteredHistoryRows.length} students
                                </p>
                                <div className="flex items-center gap-2">
                                    <button type="button" disabled={currentHistoryPage === 1} onClick={() => setHistoryPage(page => Math.max(1, page - 1))}
                                        className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 disabled:cursor-not-allowed disabled:opacity-40">Previous</button>
                                    <span className="text-xs text-slate-500">{currentHistoryPage} / {historyPageCount}</span>
                                    <button type="button" disabled={currentHistoryPage === historyPageCount} onClick={() => setHistoryPage(page => Math.min(historyPageCount, page + 1))}
                                        className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 disabled:cursor-not-allowed disabled:opacity-40">Next</button>
                                </div>
                            </div>
                        )}
                        </>
                    )}
                </div>
            )}

            {/* Main grid */}
            <div className="grid grid-cols-1 gap-5 xl:grid-cols-12">
                <div className="xl:col-span-4">
                    <div data-parent-guide="live-scanner" className={`bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden ${guideHighlight("live-scanner")}`}>
                        <div className="flex flex-col gap-3 border-b border-slate-100 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
                            <h3 className="text-base font-bold text-slate-800">Live Scanner</h3>
                            <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${isScanningOpen ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>{scannerLabel}</span>
                        </div>
                        <div className="flex flex-col items-center p-4 sm:p-6">
                            <input ref={inputRef} value={scanValue}
                                onChange={e => { scanValueRef.current = e.currentTarget.value; setScanValue(e.currentTarget.value); }}
                                onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); void handleScan(e.currentTarget.value); } }}
                                className="absolute opacity-0 pointer-events-none" autoFocus />
                            <button onClick={() => { loadClassSession(); if (isScanningOpen) focusScanner(); }} disabled={!isScanningOpen}
                                className={`flex h-44 w-44 flex-col items-center justify-center rounded-full border-[3px] border-dashed transition-colors sm:h-52 sm:w-52 ${isScanningOpen ? "border-emerald-300 text-emerald-600 hover:bg-emerald-50" : "border-slate-200 text-slate-400 cursor-not-allowed"}`}>
                                <CreditCard className="mb-2 h-10 w-10" />
                                <span className="text-xl font-bold">{isScanningOpen ? "Scan Now" : "Unavailable"}</span>
                            </button>
                            <p className="mt-4 text-center text-sm text-slate-400">{scanMessage}</p>
                            <div className="mt-4 w-full rounded-xl bg-emerald-50 px-4 py-4 text-center">
                                <p className="text-xs text-slate-400 font-medium">Last Scanned</p>
                                {lastScanned ? (
                                    <>
                                        <p className="mt-1 text-lg font-extrabold text-emerald-700">{lastScanned.full_name}</p>
                                        <p className="mt-0.5 text-sm text-slate-500">{formatTime(lastScanned.time_logged)} — {lastScanned.status}</p>
                                    </>
                                ) : (
                                    <p className="mt-2 text-sm text-slate-400">No scan yet.</p>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                <div className="flex flex-col gap-5 xl:col-span-8">
                    <div data-parent-guide="manual-attendance" className={`bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden ${guideHighlight("manual-attendance")}`}>
                        <div className="flex flex-col gap-2 border-b border-slate-100 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
                            <h3 className="text-base font-bold text-slate-800">Manual Attendance</h3>
                            <div className="flex flex-wrap items-center gap-2">
                                <button type="button" onClick={openEditAttendance}
                                    className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold text-slate-600 transition-colors hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-700">
                                    <Pencil className="h-3.5 w-3.5" />
                                    Edit Attendance
                                </button>
                                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-400">ICT schedule rules apply</span>
                            </div>
                        </div>
                        <div className="p-4 sm:p-5">
                            <div className="grid grid-cols-1 gap-4 md:grid-cols-12">
                                <div className="md:col-span-8">
                                    <label className="mb-1.5 block text-xs font-semibold text-slate-600">Student ({sectionLabel})</label>
                                    <div className="relative">
                                        <button type="button" onClick={() => setIsManualStudentPickerOpen(open => !open)}
                                            className="flex h-11 w-full items-center justify-between rounded-xl border border-slate-200 bg-white px-4 text-left text-sm text-slate-700 outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100">
                                            <span className={selectedStudentIds.length > 0 ? "" : "text-slate-400"}>
                                                {isLoadingStudents
                                                    ? "Loading students..."
                                                    : selectedManualStudent
                                                        ? buildFullName(selectedManualStudent)
                                                        : selectedStudentIds.length > 0
                                                            ? `${selectedStudentIds.length} students selected`
                                                            : "Select student(s)..."}
                                            </span>
                                            <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" />
                                        </button>
                                        {isManualStudentPickerOpen && (
                                            <div className="absolute z-30 mt-2 w-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
                                                <div className="border-b border-slate-100 p-2">
                                                    <input autoFocus value={manualStudentSearch}
                                                        onChange={e => setManualStudentSearch(e.target.value)}
                                                        placeholder="Search student by name..."
                                                        className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm text-slate-700 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100" />
                                                    <div className="mt-2 flex items-center justify-between gap-2">
                                                        <button type="button"
                                                            onClick={() => {
                                                                setSelectedStudentIds(current => [...new Set([
                                                                    ...current,
                                                                    ...manualStudentOptions.map(student => student.student_id),
                                                                ])]);
                                                                setManualStatus("On Time");
                                                                setManualMessage("");
                                                            }}
                                                            disabled={manualStudentOptions.length === 0}
                                                            className="min-h-9 rounded-lg px-2.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:text-slate-400">
                                                            Select all
                                                        </button>
                                                        <button type="button"
                                                            onClick={() => { setSelectedStudentIds([]); setManualStatus("On Time"); setManualMessage(""); }}
                                                            disabled={selectedStudentIds.length === 0}
                                                            className="min-h-9 rounded-lg px-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 disabled:cursor-not-allowed disabled:text-slate-400">
                                                            Unselect all
                                                        </button>
                                                    </div>
                                                </div>
                                                <div className="max-h-56 overflow-y-auto py-1">
                                                    {manualStudentOptions.length === 0 ? (
                                                        <p className="px-3 py-3 text-sm text-slate-400">No students found.</p>
                                                    ) : manualStudentOptions.map(student => (
                                                        <label key={student.student_id}
                                                            className={`flex min-h-11 cursor-pointer items-center gap-3 px-3 py-2 text-sm text-slate-700 hover:bg-emerald-50 hover:text-emerald-800 ${selectedStudentIds.includes(student.student_id) ? "bg-emerald-50" : ""}`}>
                                                            <input type="checkbox"
                                                                checked={selectedStudentIds.includes(student.student_id)}
                                                                onChange={() => {
                                                                    setSelectedStudentIds(current => current.includes(student.student_id)
                                                                        ? current.filter(id => id !== student.student_id)
                                                                        : [...current, student.student_id]);
                                                                    setManualStatus("On Time");
                                                                    setManualMessage("");
                                                                }}
                                                                className="h-4 w-4 shrink-0 rounded border-slate-300 text-emerald-500 focus:ring-emerald-400" />
                                                            <span className="min-w-0">
                                                                <span className="block truncate">{buildFullName(student)}</span>
                                                                <span className="block text-xs text-slate-400">{student.student_id}</span>
                                                            </span>
                                                        </label>
                                                    ))}
                                                </div>
                                                <div className="flex items-center justify-between border-t border-slate-100 px-3 py-2">
                                                    <span className="text-xs text-slate-400">{selectedStudentIds.length} selected</span>
                                                    <button type="button" onClick={() => setIsManualStudentPickerOpen(false)}
                                                        className="min-h-9 rounded-lg bg-emerald-500 px-3 text-xs font-semibold text-white hover:bg-emerald-600">
                                                        Done
                                                    </button>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                                <div className="md:col-span-4">
                                    <label className="mb-1.5 block text-xs font-semibold text-slate-600">Type</label>
                                    <div className="relative">
                                        <select value={manualType} onChange={e => { setManualType(e.target.value as ScanMode); setManualStatus("On Time"); }}
                                            className="h-11 w-full appearance-none rounded-xl border border-slate-200 bg-white px-4 pr-10 text-sm text-slate-700 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 transition">
                                            <option value="Time In">Time In</option>
                                            <option value="Time Out">Time Out</option>
                                        </select>
                                        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                                    </div>
                                </div>
                            </div>
                            <div className="mt-4">
                                <label className="mb-1.5 block text-xs font-semibold text-slate-600">Status</label>
                                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                                    {(["On Time", "Late", "Absent", "Excused"] as const).map(status => {
                                        const disabled = status === "Late" || (status === "Excused" && manualType === "Time Out");
                                        return (
                                            <button key={status} type="button" onClick={() => { if (status !== "Late") setManualStatus(status); }} disabled={disabled}
                                                className={`h-10 rounded-xl border text-xs font-bold transition-all ${disabled
                                                    ? "border-slate-200 bg-slate-50 text-slate-500 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-70"
                                                    : manualStatus === status
                                                        ? status === "On Time" ? "border-emerald-500 bg-emerald-500 text-white shadow-sm"
                                                            : status === "Excused" ? "border-sky-500 bg-sky-500 text-white shadow-sm"
                                                                : "border-red-500 bg-red-500 text-white shadow-sm"
                                                        : "border-slate-200 bg-slate-50 text-slate-500 hover:bg-slate-100"
                                                    }`}>{status}</button>
                                        );
                                    })}
                                    {(selectedManualLateLog || selectedManualAutoAbsentLog) && (
                                        <button type="button" onClick={() => setManualStatus("Present")}
                                            className={`h-10 rounded-xl border text-xs font-bold transition-all ${manualStatus === "Present"
                                                ? "border-emerald-500 bg-emerald-500 text-white shadow-sm"
                                                : "border-slate-200 bg-slate-50 text-slate-500 hover:bg-slate-100"
                                                }`}>Present</button>
                                    )}
                                </div>
                                <p className="mt-2 text-xs text-slate-400">On Time or Late is calculated from ICT&apos;s saved Late After time. Select Absent only to record a known absence. Excused requires a reason and date range; it is immediately approved and recorded as Time In only on scheduled class days.{selectedManualLateLog ? " Select Present to correct this Late record without changing its recorded time." : selectedManualAutoAbsentLog ? " Select Present with a remark to correct this system-created absence after the session." : ""}</p>
                            </div>
                            <div className="mt-4">
                                <div className="mb-1.5 flex items-center justify-between">
                                    <label className="text-xs font-semibold text-slate-600">{manualStatus === "Excused" ? "Reason for Excused" : "Remark"}</label>
                                    <span className="text-xs text-slate-400">{manualStatus === "Excused" ? "Required" : "Optional"}</span>
                                </div>
                                <input value={manualRemark} onChange={e => setManualRemark(e.target.value)}
                                placeholder={manualStatus === "Excused" ? "Required: reason for excusing this student" : selectedManualAutoAbsentLog && manualStatus === "Present" ? "Required: reason for correcting the automatic absence" : "e.g. Excuse letter submitted"}
                                    className="h-11 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm text-slate-700 outline-none placeholder:text-slate-400 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 transition" />
                            </div>
                            {manualStatus === "Excused" && (
                                <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                                    <div>
                                        <label htmlFor="manual-excuse-start" className="mb-1.5 block text-xs font-semibold text-slate-600">Excuse start date <span className="text-red-500">*</span></label>
                                        <input id="manual-excuse-start" type="date" value={manualExcuseStartDate}
                                            onChange={(event) => {
                                                const date = event.target.value;
                                                setManualExcuseStartDate(date);
                                                if (manualExcuseEndDate && date > manualExcuseEndDate) setManualExcuseEndDate(date);
                                            }}
                                            className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100" />
                                    </div>
                                    <div>
                                        <label htmlFor="manual-excuse-end" className="mb-1.5 block text-xs font-semibold text-slate-600">Excuse end date <span className="text-red-500">*</span></label>
                                        <input id="manual-excuse-end" type="date" value={manualExcuseEndDate} min={manualExcuseStartDate}
                                            onChange={(event) => setManualExcuseEndDate(event.target.value)}
                                            className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100" />
                                    </div>
                                    <p className="sm:col-span-2 text-xs text-slate-400">The excuse is immediately approved and applied only to scheduled class days in this range. Existing Present or Late records stay unchanged.</p>
                                </div>
                            )}
                            <button onClick={handleManualSave} disabled={isSavingManual || selectedStudentIds.length === 0 || (manualStatus === "Excused" && (!manualRemark.trim() || !manualExcuseStartDate || !manualExcuseEndDate || manualExcuseEndDate < manualExcuseStartDate))}
                                className="mt-4 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-sm font-bold text-white transition-colors disabled:opacity-60">
                                <Check className="h-4 w-4" />
                                {isSavingManual ? "Saving..." : selectedStudentIds.length > 1 ? `Save Attendance for ${selectedStudentIds.length} Students` : "Save Attendance"}
                            </button>
                            {manualMessage && <p className="mt-2.5 text-sm text-slate-500">{manualMessage}</p>}
                        </div>
                    </div>

                    <div data-parent-guide="today-log" className={`bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden ${guideHighlight("today-log")}`}>
                        <div className="flex flex-col gap-3 border-b border-slate-100 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
                            <h3 className="text-base font-bold text-slate-800">Today&apos;s Log · {sectionLabel}</h3>
                            <div className="flex items-center gap-3">
                                <span className="text-xs text-slate-400">{filteredTodayLogs.length} records</span>
                                <button onClick={() => loadTodayLogs()}
                                    className="rounded-lg bg-slate-800 hover:bg-slate-900 px-3 py-1.5 text-xs font-bold text-white transition-colors">
                                    {isLoadingLogs ? "Refreshing..." : "Refresh"}
                                </button>
                            </div>
                        </div>
                        <div className="border-b border-slate-100 px-4 py-3 sm:px-5">
                            <input value={todayLogSearch}
                                onChange={e => { setTodayLogSearch(e.target.value); setTodayLogPage(1); }}
                                placeholder="Search today's log by student name or LRN..."
                                className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm text-slate-700 outline-none placeholder:text-slate-400 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100" />
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full min-w-[600px] text-sm">
                                <thead>
                                    <tr className="border-b border-slate-100">
                                        {["Student", "Time", "Type", "Status", "Via"].map(h => (
                                            <th key={h} className="px-5 py-3 text-left text-xs font-semibold text-slate-400">{h}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredTodayLogs.length === 0 ? (
                                        <tr><td colSpan={5} className="px-5 py-10 text-center text-sm text-slate-400">
                                            {isLoadingLogs ? "Loading attendance logs..." : todayLogSearch ? "No matching attendance records." : "No attendance records for today yet."}
                                        </td></tr>
                                    ) : (
                                        paginatedTodayLogs.map(log => (
                                            <tr key={log.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/60 transition-colors">
                                                <td className="px-5 py-3">
                                                    <div className="flex items-center gap-3">
                                                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-100 text-xs font-bold text-emerald-700 shrink-0">
                                                            {getInitials(log.full_name)}
                                                        </div>
                                                        <div>
                                                            <p className="font-semibold text-slate-800 text-sm">{log.full_name}</p>
                                                            <p className="text-[11px] text-slate-400">{log.student_id}</p>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="px-5 py-3 text-sm text-slate-500">{log.status === "Absent" ? "-" : formatTime(log.time_logged)}</td>
                                                <td className="px-5 py-3 text-sm text-slate-500">{log.type}</td>
                                                <td className="px-5 py-3">
                                                    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${getStatusClass(log.status)}`}>
                                                        {log.status}
                                                    </span>
                                                </td>
                                                <td className="px-5 py-3">
                                                    <span className="inline-flex items-center gap-1.5 text-sm text-slate-500">
                                                        <IdCard className="h-3.5 w-3.5" />{log.via}
                                                    </span>
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                        {filteredTodayLogs.length > TODAY_LOGS_PER_PAGE && (
                            <div className="flex items-center justify-between px-5 py-3">
                                <p className="text-xs text-slate-400">Showing {(currentTodayLogPage - 1) * TODAY_LOGS_PER_PAGE + 1}-{Math.min(currentTodayLogPage * TODAY_LOGS_PER_PAGE, filteredTodayLogs.length)} of {filteredTodayLogs.length}</p>
                                <div className="flex items-center gap-2">
                                    <button type="button" disabled={currentTodayLogPage === 1} onClick={() => setTodayLogPage(page => Math.max(1, page - 1))}
                                        className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 disabled:cursor-not-allowed disabled:opacity-40">Previous</button>
                                    <span className="text-xs text-slate-500">{currentTodayLogPage} / {todayLogPageCount}</span>
                                    <button type="button" disabled={currentTodayLogPage === todayLogPageCount} onClick={() => setTodayLogPage(page => Math.min(todayLogPageCount, page + 1))}
                                        className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 disabled:cursor-not-allowed disabled:opacity-40">Next</button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Register RFID Modal */}
            {showRegisterRfid && (
                <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/40 p-3 sm:p-4">
                    <div className="my-auto max-h-[calc(100dvh-1.5rem)] w-full max-w-lg overflow-y-auto rounded-2xl bg-white shadow-2xl">
                        <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-4 sm:px-6">
                            <div className="min-w-0">
                                <h3 className="text-base font-bold text-slate-800">Register RFID</h3>
                                <p className="mt-0.5 text-xs text-slate-400">Assign a new RFID card to a student in {sectionLabel}</p>
                            </div>
                            <button onClick={() => setShowRegisterRfid(false)} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100">
                                <X className="h-4 w-4" />
                            </button>
                        </div>
                        <div className="p-4 sm:p-6">
                            <label className="mb-1.5 block text-xs font-semibold text-slate-600">Student</label>
                            <div className="relative">
                                <select value={rfidStudentId} onChange={e => setRfidStudentId(e.target.value)}
                                    className="h-11 w-full appearance-none rounded-xl border border-slate-200 bg-white px-4 pr-10 text-sm text-slate-700 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 transition">
                                    <option value="">{isLoadingStudents ? "Loading students..." : "Select student..."}</option>
                                    {students.map(s => <option key={s.student_id} value={s.student_id}>{buildFullName(s)}</option>)}
                                </select>
                                <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                            </div>
                            <div className="mt-5">
                                <label className="mb-1.5 block text-xs font-semibold text-slate-600">New RFID Card</label>
                                <input ref={newRfidInputRef} value={newRfidValue}
                                    onChange={e => {
                                        const cleaned = e.target.value.replace(/\r|\n/g, "").trim();
                                        setNewRfidValue(cleaned);
                                        setRfidMessage(cleaned ? "RFID captured. Review the UID, then click Save New RFID." : "Waiting for new RFID card tap...");
                                    }}
                                    onKeyDown={e => { if (e.key === "Enter") e.preventDefault(); }}
                                    className="absolute opacity-0 pointer-events-none" />
                                <button onClick={focusNewRfidScanner}
                                    className="flex h-36 w-full flex-col items-center justify-center rounded-2xl border-2 border-dashed border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-colors">
                                    <CreditCard className="mb-2 h-8 w-8" />
                                    <span className="text-sm font-bold">Tap New RFID Card</span>
                                    <span className="mt-1 text-xs text-emerald-500">Click here, then scan the replacement card</span>
                                </button>
                                <p className="mt-2.5 text-xs text-slate-500">{rfidMessage}</p>
                                {newRfidValue && (
                                    <div className="mt-2.5 rounded-xl bg-slate-50 px-4 py-3 text-xs text-slate-600">
                                        New RFID UID: <span className="font-bold text-slate-800">{newRfidValue}</span>
                                    </div>
                                )}
                            </div>
                            <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                                <button onClick={() => setShowRegisterRfid(false)}
                                    className="min-h-11 w-full rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-bold text-slate-600 transition-colors hover:bg-slate-50 sm:w-auto">
                                    Cancel
                                </button>
                                <button onClick={handleRegisterNewRfid} disabled={!rfidStudentId || !newRfidValue.trim() || isSavingRfid}
                                    className="min-h-11 w-full rounded-xl bg-emerald-500 px-4 py-2.5 text-xs font-bold text-white transition-colors hover:bg-emerald-600 disabled:opacity-60 sm:w-auto">
                                    {isSavingRfid ? "Saving..." : "Save New RFID"}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Monthly Export Modal */}
            {showMonthlyExport && (
                <MonthlyExportModal
                    onClose={() => setShowMonthlyExport(false)}
                    sectionLabel={sectionLabel}
                    adviserName={adviserName}
                    activeSection={activeSection || adviser?.sections?.[0] || adviser?.section || ""}
                />
            )}
            {showExcuseApproval && (
                <ExcuseApprovalModal
                    onClose={() => setShowExcuseApproval(false)}
                    adviserGrade={adviser?.grade || ""}
                />
            )}
            {showEditAttendance && (
                <div className="fixed inset-0 z-[100] flex items-end justify-center bg-slate-950/45 p-0 backdrop-blur-sm sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby="edit-attendance-title">
                    <div className="flex max-h-[92dvh] w-full max-w-4xl flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:max-h-[88vh] sm:rounded-2xl">
                        <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-4 py-4 sm:px-6">
                            <div>
                                <h2 id="edit-attendance-title" className="text-lg font-extrabold text-slate-800">Edit Attendance</h2>
                                <p className="mt-0.5 text-sm text-slate-400">Update existing Time In records for {sectionLabel}. Unchecked students are not changed.</p>
                            </div>
                            <button type="button" onClick={() => setShowEditAttendance(false)} aria-label="Close edit attendance"
                                className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700">
                                <X className="h-5 w-5" />
                            </button>
                        </div>
                        <div className="min-h-0 overflow-y-auto p-4 sm:p-6">
                            <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
                                <div>
                                    <label htmlFor="edit-attendance-date" className="mb-1.5 block text-xs font-semibold text-slate-600">Attendance date</label>
                                    <input id="edit-attendance-date" type="date" value={editAttendanceDate} max={todayStr}
                                        onChange={(event) => {
                                            const date = event.target.value;
                                            setEditAttendanceDate(date);
                                            setSelectedEditLogIds([]);
                                            if (date) void loadEditableAttendance(date);
                                        }}
                                        className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100" />
                                </div>
                                <button type="button" onClick={() => { setSelectedEditLogIds([]); void loadEditableAttendance(editAttendanceDate); }} disabled={isLoadingEditableAttendance}
                                    className="inline-flex h-11 items-center justify-center rounded-xl border border-slate-200 px-4 text-sm font-bold text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60">
                                    {isLoadingEditableAttendance ? "Loading..." : "Refresh records"}
                                </button>
                            </div>

                            <div className="mt-5 overflow-hidden rounded-xl border border-slate-200">
                                <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] gap-3 border-b border-slate-100 bg-slate-50 px-3 py-2.5 text-xs font-semibold text-slate-500 sm:grid-cols-[auto_minmax(0,1fr)_auto_auto]">
                                    <span aria-hidden="true" />
                                    <span>Student</span>
                                    <span>Status</span>
                                    <span className="hidden sm:block">Recorded time</span>
                                </div>
                                {isLoadingEditableAttendance ? (
                                    <p className="px-4 py-8 text-center text-sm text-slate-400">Loading attendance records...</p>
                                ) : editableAttendanceRecords.length === 0 ? (
                                    <p className="px-4 py-8 text-center text-sm text-slate-400">{editAttendanceMessage || "No students or attendance records found for this date."}</p>
                                ) : editableAttendanceRecords.map((record) => {
                                    const logId = record.attendance_log_id;
                                    const selected = logId !== null && selectedEditLogIds.includes(logId);
                                    return (
                                        <label key={record.student_id} className={`grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 border-b border-slate-100 px-3 py-3 last:border-b-0 sm:grid-cols-[auto_minmax(0,1fr)_auto_auto] ${record.editable ? "cursor-pointer hover:bg-emerald-50/50" : "bg-slate-50/60"}`}>
                                            <input type="checkbox" disabled={!record.editable || logId === null} checked={selected}
                                                onChange={() => {
                                                    if (logId === null || !record.editable) return;
                                                    setSelectedEditLogIds((current) => current.includes(logId)
                                                        ? current.filter((id) => id !== logId)
                                                        : [...current, logId]);
                                                }}
                                                className="h-4 w-4 rounded border-slate-300 text-emerald-500 focus:ring-emerald-400 disabled:cursor-not-allowed" />
                                            <span className="min-w-0">
                                                <span className="block truncate text-sm font-semibold text-slate-700">{record.full_name}</span>
                                                <span className="block text-xs text-slate-400">{record.student_id}{record.read_only_reason ? ` · ${record.read_only_reason}` : ""}</span>
                                            </span>
                                            <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${getStatusClass(record.status)}`}>{record.status || "No record"}</span>
                                            <span className="hidden text-xs text-slate-500 sm:block">{formatTime(record.time_logged)}</span>
                                        </label>
                                    );
                                })}
                            </div>
                            {editableAttendanceRecords.length > 0 && (
                                <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                                    <span className="text-xs text-slate-500">
                                        {editableAttendanceLogIds.length} editable record{editableAttendanceLogIds.length === 1 ? "" : "s"}
                                    </span>
                                    <div className="flex items-center gap-2">
                                        <button type="button"
                                            onClick={() => setSelectedEditLogIds(editableAttendanceLogIds)}
                                            disabled={isLoadingEditableAttendance || editableAttendanceLogIds.length === 0 || allEditableAttendanceSelected}
                                            className="min-h-9 rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold text-slate-600 transition-colors hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-700 disabled:cursor-not-allowed disabled:opacity-50">
                                            Check all
                                        </button>
                                        <button type="button"
                                            onClick={() => setSelectedEditLogIds([])}
                                            disabled={isLoadingEditableAttendance || selectedEditLogIds.length === 0}
                                            className="min-h-9 rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold text-slate-600 transition-colors hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50">
                                            Uncheck all
                                        </button>
                                    </div>
                                </div>
                            )}
                            {editAttendanceMessage && editableAttendanceRecords.length > 0 && (
                                <p className="mt-3 text-sm text-red-600">{editAttendanceMessage}</p>
                            )}

                            <div className="mt-5 rounded-xl border border-emerald-100 bg-emerald-50/60 p-4">
                                <p className="text-sm font-bold text-slate-700">Apply to selected students ({selectedEditLogIds.length})</p>
                                <div className="mt-3 grid grid-cols-2 gap-3">
                                    {(["Present", "Absent"] as const).map((status) => (
                                        <button key={status} type="button" onClick={() => setEditAttendanceStatus(status)}
                                            className={`h-10 rounded-xl border text-sm font-bold transition-all ${editAttendanceStatus === status
                                                ? status === "Present" ? "border-emerald-500 bg-emerald-500 text-white" : "border-red-500 bg-red-500 text-white"
                                                : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}>
                                            {status}
                                        </button>
                                    ))}
                                </div>
                                <p className="mt-2 text-xs text-slate-500">Present is saved as On Time. This editor updates only existing Time In records and keeps Excused records protected.</p>
                            </div>
                        </div>
                        <div className="flex flex-col-reverse gap-3 border-t border-slate-100 px-4 py-4 sm:flex-row sm:justify-end sm:px-6">
                            <button type="button" onClick={() => setShowEditAttendance(false)} disabled={isSavingEditedAttendance}
                                className="min-h-11 rounded-xl border border-slate-200 px-5 text-sm font-bold text-slate-600 transition-colors hover:bg-slate-50 disabled:opacity-60">
                                Cancel
                            </button>
                            <button type="button" onClick={handleEditedAttendanceSave} disabled={isSavingEditedAttendance || selectedEditLogIds.length === 0}
                                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-emerald-500 px-5 text-sm font-bold text-white transition-colors hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-60">
                                <Check className="h-4 w-4" />
                                {isSavingEditedAttendance ? "Saving..." : `Save ${selectedEditLogIds.length || ""} Selected`.trim()}
                            </button>
                        </div>
                    </div>
                </div>
            )}
            <AdviserAttendanceGuide onStepChange={setGuideTarget} />
        </main>
    );
}
