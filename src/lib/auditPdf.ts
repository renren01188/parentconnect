import { displayGuidanceLabel, normalizeAuditRole } from "@/lib/audit-filter-options";
import { formatAuditTimestamp } from "@/lib/auditPresentation";

export type AuditPdfRow = {
  action: string | null;
  details: string | null;
  target_user: string | null;
  target_role: string | null;
  target_email: string | null;
  performed_by: string | null;
  performed_by_role: string | null;
  module: string | null;
  ip_address: string | null;
  browser: string | null;
  previous_status: string | null;
  new_status: string | null;
  created_at: string;
};

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const LEFT = 42;
const RIGHT = PAGE_WIDTH - LEFT;
const BOTTOM = 58;

function pdfSafe(value: string | null | undefined) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\\()]/g, "\\$&")
    .replace(/[^\x20-\x7E]/g, " ");
}

function pdfText(text: string, x: number, y: number, size = 9, bold = false) {
  return `BT /${bold ? "F2" : "F1"} ${size} Tf ${x} ${y} Td (${pdfSafe(text)}) Tj ET`;
}

function pdfLine(x1: number, y1: number, x2: number, y2: number, gray = 0.84) {
  return `q ${gray} G ${x1} ${y1} m ${x2} ${y2} l S Q`;
}

function pdfRect(x: number, y: number, width: number, height: number, gray = 0.96) {
  return `q ${gray} g ${x} ${y} ${width} ${height} re f Q`;
}

function wrapPdfText(value: string | null | undefined, maxLength: number) {
  const normalized = String(value ?? "").replace(/\s+/g, " ").trim();
  if (!normalized) return [""];

  const lines: string[] = [];
  let line = "";
  for (const originalWord of normalized.split(" ")) {
    let word = originalWord;
    while (word.length > maxLength) {
      if (line) {
        lines.push(line);
        line = "";
      }
      lines.push(word.slice(0, maxLength));
      word = word.slice(maxLength);
    }
    const candidate = line ? `${line} ${word}` : word;
    if (candidate.length > maxLength && line) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function buildPdf(pages: string[][]) {
  const objects: string[] = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    `<< /Type /Pages /Kids [${pages.map((_, index) => `${3 + index * 2} 0 R`).join(" ")}] /Count ${pages.length} >>`,
  ];

  pages.forEach((page, index) => {
    const pageObject = 3 + index * 2;
    const contentObject = pageObject + 1;
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Resources << /Font << /F1 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> /F2 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >> >> >> /Contents ${contentObject} 0 R >>`);
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
  return new TextEncoder().encode(pdf);
}

/** Creates the authorized, one-day Audit Trail export as a PDF document. */
export function auditLogRowsToPdf(rows: AuditPdfRow[], date: string) {
  const pages: string[][] = [];
  let commands: string[] = [];
  let y = 0;

  const startPage = () => {
    commands = [];
    pages.push(commands);
    commands.push(pdfRect(0, PAGE_HEIGHT - 78, PAGE_WIDTH, 78, 0.94));
    commands.push(pdfText("ParentConnect", LEFT, 758, 9, true));
    commands.push(pdfText("Audit Trail", LEFT, 738, 18, true));
    commands.push(pdfText(`Manila calendar date: ${date}`, LEFT, 723, 9));
    commands.push(pdfText(`Included events: ${rows.length}`, 410, 744, 9, true));
    y = 696;
  };

  const finishPages = () => {
    pages.forEach((page, index) => {
      page.push(pdfLine(LEFT, 42, RIGHT, 42));
      page.push(pdfText("Authorized Audit Trail export", LEFT, 27, 8));
      page.push(pdfText(`Page ${index + 1} of ${pages.length}`, 488, 27, 8));
    });
  };

  const ensureSpace = (height: number) => {
    if (y - height < BOTTOM) startPage();
  };

  startPage();
  if (!rows.length) {
    commands.push(pdfText("No audit events were recorded on this Manila calendar date.", LEFT, y, 10));
  }

  rows.forEach((row, index) => {
    const action = displayGuidanceLabel(row.action) || "System event";
    const performedBy = displayGuidanceLabel(row.performed_by) || "Unknown";
    const performedRole = normalizeAuditRole(row.performed_by_role) || "Unknown";
    const target = [
      displayGuidanceLabel(row.target_user),
      normalizeAuditRole(row.target_role),
      row.target_email,
    ].filter(Boolean).join(" · ");
    const status = [row.previous_status, row.new_status].filter(Boolean).join(" → ");
    const detailLines = wrapPdfText(`Details: ${displayGuidanceLabel(row.details) || "Not recorded"}`, 92);
    const securityLines = [
      row.ip_address ? `IP address: ${row.ip_address}` : "",
      row.browser ? `Device / browser: ${row.browser}` : "",
    ].filter(Boolean).flatMap((value) => wrapPdfText(value, 88));
    const metadataLines = [
      `Performed by: ${performedBy} (${performedRole})${row.module ? ` · Module: ${row.module}` : ""}`,
      target ? `Target: ${target}` : "",
      status ? `Status: ${status}` : "",
    ].filter(Boolean);
    const rowHeight = 26 + (metadataLines.length + detailLines.length + securityLines.length) * 11 + 12;

    ensureSpace(rowHeight);
    commands.push(pdfRect(LEFT, y - rowHeight + 5, RIGHT - LEFT, rowHeight, index % 2 ? 0.99 : 0.97));
    commands.push(pdfText(`${index + 1}. ${formatAuditTimestamp(row.created_at)} · ${action}`, LEFT + 8, y - 11, 9, true));
    y -= 25;
    [...metadataLines, ...detailLines, ...securityLines].forEach((line) => {
      commands.push(pdfText(line, LEFT + 10, y, 8));
      y -= 11;
    });
    y -= 12;
  });

  finishPages();
  return buildPdf(pages);
}
