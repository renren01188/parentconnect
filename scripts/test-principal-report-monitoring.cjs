/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const page = fs.readFileSync(
  path.join(__dirname, "..", "src", "app", "dashboard", "principal", "reports", "page.tsx"),
  "utf8",
);
const parentReportApi = fs.readFileSync(
  path.join(__dirname, "..", "src", "app", "api", "reports", "parent-adviser", "_lib.ts"),
  "utf8",
);

// Filtering is derived once from immutable report timestamps. The same
// de-duplicated filtered list is used by totals, mobile cards, desktop rows,
// and every export format.
assert.match(page, /const filteredMonitoringEntries = useMemo/);
assert.match(parentReportApi, /createdAt: row\.created_at/);
assert.match(page, /dedupeMonitoringEntries\(\[/);
assert.match(page, /const occurredAt = report\.createdAt \|\| report\.submitted_at/);
assert.match(page, /const entryDate = manilaDateKey\(entry\.occurredAt\)/);
assert.match(page, /monitoringSourceFilter !== "All"/);
assert.match(page, /monitoringStatusFilter !== "All"/);
assert.match(page, /monitoringCategoryFilter !== "All"/);
assert.match(page, /monitoringStartDate/);
assert.match(page, /monitoringEndDate/);
assert.match(page, /type="date"/);
assert.match(page, /monitoringDateRangeLabel\(monitoringStartDate, monitoringEndDate\)/);
assert.match(page, /items=\{filteredMonitoringEntries\}/);
assert.match(page, /filterSummary=\{monitoringFilterSummary\}/);
assert.match(page, /filteredMonitoringEntries\.map\(\(entry\)/);

// Small screens receive readable cards; the full table is reserved for wider
// screens where all columns can remain visible.
assert.match(page, /space-y-3 md:hidden/);
assert.match(page, /hidden overflow-x-auto rounded-xl border border-slate-200 md:block/);
assert.match(page, /\["Date", "From → To", "Student", "Concern", "Category", "Priority", "Status"\]/);

// Excel and PDF include the exact active scope. Excel has read-friendly
// columns and a frozen/filterable header; PDF wraps cells and uses bounded
// multi-line rows instead of overlapping fixed-position text.
assert.match(page, /function exportMonitoringToExcel\(items: MonitoringEntry\[], filterSummary: string\)/);
assert.match(page, /function exportMonitoringToPdf\(items: MonitoringEntry\[], filterSummary: string\)/);
assert.match(page, /header: "Report ID"/);
assert.match(page, /header: "Submitted \(PHT\)"/);
assert.match(page, /sheet\.mergeCells\("A1:K1"\)/);
assert.match(page, /sheet\.autoFilter = \{ from: "A5", to: `K\$\{Math\.max\(5, items\.length \+ 5\)\}` \}/);
assert.match(page, /state: "frozen", ySplit: 5/);
assert.match(page, /wrapText: true/);
assert.match(page, /function createMonitoringPdf\(items: MonitoringEntry\[], filterSummary: string\)/);
assert.match(page, /function wrapPdfText\(value: string, maxLength: number, maxLines: number\)/);
assert.match(page, /const rowHeight = 54/);
assert.match(page, /const rowsPerPage = 7/);
assert.match(page, /label: "Source -> Recipient"/);
assert.match(page, /Page \$\{pageIndex \+ 1\} of \$\{pages\.length\}/);

console.log("principal report monitoring checks passed");
