const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

const root = path.resolve(__dirname, "..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");

function loadTypeScriptModule(relative) {
  const source = read(relative);
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const loaded = { exports: {} };
  new Function("exports", "require", "module", output)(loaded.exports, require, loaded);
  return loaded.exports;
}

const {
  isFutureSchoolCalendarDay,
  isFutureSchoolCalendarDateRange,
  nextSchoolCalendarDay,
  schoolCalendarDay,
} = loadTypeScriptModule("src/lib/announcementSchedule.ts");

// 8:00 PM in Manila on 8 November 2026. The result must not depend on the
// machine's timezone.
const manilaToday = new Date("2026-11-08T12:00:00.000Z");
assert.equal(schoolCalendarDay(manilaToday), "2026-11-08");
assert.equal(nextSchoolCalendarDay(manilaToday), "2026-11-09");

assert.equal(isFutureSchoolCalendarDay("2026-11-07", manilaToday), false, "Yesterday must be rejected.");
assert.equal(isFutureSchoolCalendarDay("2026-11-08", manilaToday), false, "Today must be rejected.");
assert.equal(isFutureSchoolCalendarDay("2026-11-09", manilaToday), true, "Tomorrow must be allowed.");
assert.equal(isFutureSchoolCalendarDateRange("2026-11-09", "2026-11-12", manilaToday), true, "A future date range must be allowed.");
assert.equal(isFutureSchoolCalendarDateRange("2026-11-12", "2026-11-09", manilaToday), false, "The end date cannot precede the start date.");
assert.equal(isFutureSchoolCalendarDateRange("2026-02-30", "2026-11-12", manilaToday), false, "Manually entered invalid dates must be rejected.");

const adviserPage = read("src/app/dashboard/adviser/attendance/page.tsx");
const manualRoute = read("src/app/api/attendance/manual/route.ts");

assert.match(adviserPage, /min=\{manualExcuseMinimumDate\}/, "The start date picker must disable today and past dates.");
assert.match(adviserPage, /handleManualExcuseStartDateChange/, "Typed or pasted start dates must be validated.");
assert.match(adviserPage, /handleManualExcuseEndDateChange/, "Typed or pasted end dates must be validated.");
assert.match(adviserPage, /setManualExcuseEndDate\(date\)/, "Changing the start date must keep the end date at or after it.");
assert.match(adviserPage, /!manualExcuseRangeIsValid/, "Save must be blocked for an invalid date range.");
assert.match(manualRoute, /isFutureSchoolCalendarDay\(dateFrom, dateValidationNow\)/, "The API must reject past and today start dates.");
assert.match(manualRoute, /isFutureSchoolCalendarDateRange\(dateFrom, dateTo, dateValidationNow\)/, "The API must reject an invalid range bypassing the form.");
assert.match(manualRoute, /record_manual_excuse/, "The established excuse workflow must remain in place.");

console.log("Adviser manual excuse future-date checks passed.");
