export type GuidanceReportExportItem = {
  id: number;
  parent_name: string;
  student_name: string;
  grade?: string;
  section?: string;
  subject: string;
  categories: string[];
  concernLevel: number;
  status: string;
  submitted_at: string;
  attachment?: string;
  message: string;
};

export type GuidanceReportExportFormat = "excel" | "pdf";
export type GuidanceReportStatusFilter = "All" | "Escalated" | "Resolved";

export type GuidanceReportExportContext = {
  scopeLabel: string;
  filters: string[];
  generatedAt?: Date;
  schoolName?: string;
};

const SCHOOL_TIME_ZONE = "Asia/Manila";
const SHEET_NAME = "Guidance Reports";
const TABLE_HEADER_ROW = 7;
const EXCEL_COLUMNS = [
  { header: "Report #", key: "id", width: 11 },
  { header: "Parent / Guardian", key: "parent", width: 27 },
  { header: "Student", key: "student", width: 24 },
  { header: "Grade / Section", key: "classAssignment", width: 18 },
  { header: "Subject", key: "subject", width: 34 },
  { header: "Categories", key: "categories", width: 30 },
  { header: "Concern Level", key: "concernLevel", width: 15 },
  { header: "Status", key: "status", width: 16 },
  { header: "Submitted (Manila)", key: "submittedAt", width: 25 },
  { header: "Attachment", key: "attachment", width: 22 },
  { header: "Concern Details", key: "message", width: 62 },
] as const;

function reportRows(items: GuidanceReportExportItem[]) {
  return items.map((report) => ({
    id: report.id,
    parent: report.parent_name,
    student: report.student_name,
    classAssignment: [report.grade, report.section].filter(Boolean).join(" - ") || "Not provided",
    subject: report.subject,
    categories: report.categories.join(", ") || "Not specified",
    concernLevel: `${report.concernLevel}%`,
    status: report.status,
    submittedAt: report.submitted_at,
    attachment: report.attachment ?? "None",
    message: report.message,
  }));
}

export function filterGuidanceReports<T extends GuidanceReportExportItem>(
  reports: T[],
  statusFilter: GuidanceReportStatusFilter,
  categoryFilter: string,
) {
  return reports.filter((report) => {
    if (statusFilter !== "All" && report.status !== statusFilter) return false;
    if (categoryFilter !== "All" && !report.categories.includes(categoryFilter)) return false;
    return true;
  });
}

export function guidanceExportFilterLabels(
  statusFilter: GuidanceReportStatusFilter,
  categoryFilter: string,
) {
  return [
    `Status: ${statusFilter === "All" ? "All statuses" : statusFilter}`,
    `Category: ${categoryFilter === "All" ? "All categories" : categoryFilter}`,
  ];
}

export function formatGuidanceExportTimestamp(value: Date) {
  return value.toLocaleString("en-PH", {
    timeZone: SCHOOL_TIME_ZONE,
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function metadata(context: GuidanceReportExportContext) {
  return {
    filters: context.filters.length ? context.filters.join(" | ") : "No filters applied",
    generatedAt: formatGuidanceExportTimestamp(context.generatedAt ?? new Date()),
    schoolName: context.schoolName ?? "Santiago Elementary School - Guidance Office",
  };
}

export async function createGuidanceReportsExcel(
  items: GuidanceReportExportItem[],
  context: GuidanceReportExportContext,
) {
  const { default: ExcelJS } = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "ParentConnect";
  workbook.created = context.generatedAt ?? new Date();
  workbook.modified = context.generatedAt ?? new Date();

  const sheet = workbook.addWorksheet(SHEET_NAME, {
    views: [{ state: "frozen", ySplit: TABLE_HEADER_ROW }],
    pageSetup: {
      orientation: "landscape",
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      paperSize: 9,
      margins: { left: 0.25, right: 0.25, top: 0.4, bottom: 0.4, header: 0.2, footer: 0.2 },
    },
  });
  sheet.columns = EXCEL_COLUMNS.map((column) => ({ ...column }));
  const { filters, generatedAt, schoolName } = metadata(context);
  const lastColumn = String.fromCharCode(64 + EXCEL_COLUMNS.length);

  sheet.mergeCells(`A1:${lastColumn}1`);
  sheet.mergeCells(`A2:${lastColumn}2`);
  sheet.mergeCells(`A3:${lastColumn}3`);
  sheet.mergeCells(`A4:${lastColumn}4`);
  sheet.mergeCells(`A5:${lastColumn}5`);
  sheet.getCell("A1").value = "Guidance Reports";
  sheet.getCell("A2").value = schoolName;
  sheet.getCell("A3").value = `Included records: ${items.length} | Scope: ${context.scopeLabel}`;
  sheet.getCell("A4").value = `Active filters: ${filters}`;
  sheet.getCell("A5").value = `Generated: ${generatedAt} (Asia/Manila)`;

  sheet.getRow(1).height = 27;
  sheet.getRow(1).font = { name: "Calibri", size: 16, bold: true, color: { argb: "FFFFFFFF" } };
  sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F4C81" } };
  sheet.getRow(1).alignment = { vertical: "middle", horizontal: "left" };
  sheet.getRow(2).font = { name: "Calibri", size: 10, bold: true, color: { argb: "FF334155" } };
  sheet.getRow(3).font = { name: "Calibri", size: 10, bold: true, color: { argb: "FF334155" } };
  sheet.getRow(4).font = { name: "Calibri", size: 10, color: { argb: "FF475569" } };
  sheet.getRow(5).font = { name: "Calibri", size: 9, color: { argb: "FF64748B" } };

  sheet.addTable({
    name: "GuidanceReportsTable",
    ref: `A${TABLE_HEADER_ROW}`,
    headerRow: true,
    totalsRow: false,
    style: { theme: "TableStyleMedium2", showRowStripes: true, showFirstColumn: false, showLastColumn: false },
    columns: EXCEL_COLUMNS.map((column) => ({ name: column.header })),
    rows: reportRows(items).map((row) => EXCEL_COLUMNS.map((column) => row[column.key])),
  });

  const header = sheet.getRow(TABLE_HEADER_ROW);
  header.height = 28;
  header.font = { name: "Calibri", size: 10, bold: true, color: { argb: "FFFFFFFF" } };
  header.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
  for (let rowNumber = TABLE_HEADER_ROW + 1; rowNumber <= TABLE_HEADER_ROW + items.length; rowNumber += 1) {
    const row = sheet.getRow(rowNumber);
    row.height = 42;
    row.eachCell((cell) => {
      cell.font = { name: "Calibri", size: 10, color: { argb: "FF1E293B" } };
      cell.alignment = { vertical: "top", wrapText: true };
      cell.border = {
        top: { style: "thin", color: { argb: "FFE2E8F0" } },
        left: { style: "thin", color: { argb: "FFE2E8F0" } },
        bottom: { style: "thin", color: { argb: "FFE2E8F0" } },
        right: { style: "thin", color: { argb: "FFE2E8F0" } },
      };
    });
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}

function pdfSafe(value: string) {
  return value.replace(/[\\()]/g, "\\$&").replace(/[^\x20-\x7E]/g, " ");
}

function wrapPdfText(value: string, maxLength: number) {
  const words = value.replace(/\s+/g, " ").trim().split(" ");
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (next.length > maxLength && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [""];
}

function makePdfText(text: string, x: number, y: number, size = 10, bold = false) {
  return `BT /${bold ? "F2" : "F1"} ${size} Tf ${x} ${y} Td (${pdfSafe(text)}) Tj ET`;
}

function makePdfLine(x1: number, y1: number, x2: number, y2: number, gray = 0.82) {
  return `q ${gray} G ${x1} ${y1} m ${x2} ${y2} l S Q`;
}

function makePdfRect(x: number, y: number, width: number, height: number, gray = 0.96) {
  return `q ${gray} g ${x} ${y} ${width} ${height} re f Q`;
}

export function createGuidanceReportsPdf(
  items: GuidanceReportExportItem[],
  context: GuidanceReportExportContext,
) {
  const pageWidth = 612;
  const pageHeight = 792;
  const left = 38;
  const right = 574;
  const columns = [
    { label: "#", x: 42, width: 22, max: 3 },
    { label: "Parent / Student", x: 68, width: 112, max: 20 },
    { label: "Subject / Categories", x: 184, width: 166, max: 30 },
    { label: "Status", x: 354, width: 62, max: 11 },
    { label: "Submitted", x: 420, width: 96, max: 17 },
    { label: "Level", x: 520, width: 48, max: 7 },
  ];
  const { filters, generatedAt, schoolName } = metadata(context);
  const pages: string[][] = [];
  let commands: string[] = [];
  let y = 0;

  function startPage() {
    commands = [];
    pages.push(commands);
    commands.push(makePdfRect(0, pageHeight - 76, pageWidth, 76, 0.94));
    commands.push(makePdfText("ParentConnect", left, 762, 9, true));
    commands.push(makePdfText("Guidance Reports", left, 742, 17, true));
    commands.push(makePdfText(schoolName, left, 727, 9));
    commands.push(makePdfText(`Generated: ${generatedAt}`, 344, 752, 8));
    commands.push(makePdfText(`Scope: ${context.scopeLabel}`, 344, 738, 8));
    y = 700;
  }

  function drawTableHeader() {
    commands.push(makePdfRect(left, y - 20, right - left, 22, 0.89));
    columns.forEach((column) => commands.push(makePdfText(column.label, column.x + 3, y - 13, 8, true)));
    y -= 26;
  }

  function ensureSpace(height: number) {
    if (y - height < 74) {
      startPage();
      commands.push(makePdfText(`Active filters: ${filters}`, left, y, 8));
      y -= 18;
      drawTableHeader();
    }
  }

  function drawLines(lines: string[], x: number, top: number) {
    lines.forEach((line, index) => commands.push(makePdfText(line, x, top - index * 10, 8)));
  }

  startPage();
  commands.push(makePdfText(`Included records: ${items.length}`, left, y, 10, true));
  commands.push(makePdfText(`Active filters: ${filters}`, left + 140, y, 8));
  y -= 24;
  drawTableHeader();

  items.forEach((report, index) => {
    const parentStudent = [
      ...wrapPdfText(report.parent_name, columns[1].max),
      ...wrapPdfText(`Student: ${report.student_name}`, columns[1].max),
    ];
    const subjectCategories = [
      ...wrapPdfText(report.subject, columns[2].max),
      ...wrapPdfText(`Categories: ${report.categories.join(", ") || "Not specified"}`, columns[2].max),
    ];
    const status = wrapPdfText(report.status, columns[3].max);
    const submitted = wrapPdfText(report.submitted_at, columns[4].max);
    const rowHeight = Math.max(parentStudent.length, subjectCategories.length, status.length, submitted.length, 1) * 10 + 16;
    const messageLines = wrapPdfText(report.message, 89);
    const detailHeight = messageLines.length * 10 + 32;
    ensureSpace(rowHeight + detailHeight + 10);

    commands.push(makePdfRect(left, y - rowHeight + 5, right - left, rowHeight, index % 2 ? 0.99 : 0.97));
    [64, 180, 350, 416, 516].forEach((x) => commands.push(makePdfLine(x, y + 5, x, y - rowHeight + 5, 0.88)));
    drawLines([String(index + 1)], columns[0].x + 4, y - 8);
    drawLines(parentStudent, columns[1].x + 3, y - 8);
    drawLines(subjectCategories, columns[2].x + 3, y - 8);
    drawLines(status, columns[3].x + 3, y - 8);
    drawLines(submitted, columns[4].x + 3, y - 8);
    drawLines([`${report.concernLevel}%`], columns[5].x + 3, y - 8);
    y -= rowHeight + 8;

    commands.push(makePdfText("Concern details", left + 3, y, 8, true));
    commands.push(makePdfText(`Attachment: ${report.attachment ?? "None"}`, left + 110, y, 8));
    y -= 13;
    messageLines.forEach((line) => {
      commands.push(makePdfText(line, left + 3, y, 8));
      y -= 10;
    });
    y -= 8;
  });

  pages.forEach((page, index) => {
    page.push(makePdfLine(left, 44, right, 44, 0.82));
    page.push(makePdfText("Confidential - Guidance Office use only", left, 28, 8));
    page.push(makePdfText(`Page ${index + 1} of ${pages.length}`, 504, 28, 8));
  });

  const objects: string[] = [];
  objects.push("<< /Type /Catalog /Pages 2 0 R >>");
  const kids = pages.map((_, index) => `${3 + index * 2} 0 R`).join(" ");
  objects.push(`<< /Type /Pages /Kids [${kids}] /Count ${pages.length} >>`);
  pages.forEach((page, index) => {
    const pageObject = 3 + index * 2;
    const contentObject = pageObject + 1;
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> /F2 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >> >> >> /Contents ${contentObject} 0 R >>`);
    const body = page.join("\n");
    objects.push(`<< /Length ${body.length} >>\nstream\n${body}\nendstream`);
  });

  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [0];
  objects.forEach((object, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.slice(1).forEach((offset) => {
    pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  });
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return new Blob([pdf], { type: "application/pdf" });
}
