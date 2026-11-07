/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const page = fs.readFileSync(
  path.join(root, "src/app/dashboard/principal/AttendanceSummary/page.tsx"),
  "utf8",
);

assert.match(page, /aria-label="Export month"/, "Principal SF2 export must let the user select a month in the modal.");
assert.match(page, /aria-label="Export year"/, "Principal SF2 export must let the user select a year in the modal.");
assert.match(page, /\/api\/attendance\/monthly-summary\?year=\$\{exportYear\}&month=\$\{monthIndex\}/, "Changing the export period must load the matching Principal attendance summary.");
assert.match(page, /setExportSection\(matchingSection\)/, "The selected export period must use that period's section data.");
assert.match(page, /setExportSchoolDayDates\(Array\.isArray\(data\.schoolDays\)/, "The selected export period must use its own reporting calendar.");
assert.match(page, /await exportSF2\(exportSection, gradeLabel, exportMonth, exportYear, exportHolidayDates, exportSchoolDayDates, exportSchoolYearLabel\)/, "The SF2 download must use the period selected inside the modal.");
assert.match(page, /periodLoading \|\| Boolean\(periodError\)/, "Exports must wait until the selected period either loads or reports an error.");

console.log("Principal attendance export period picker checks passed.");
