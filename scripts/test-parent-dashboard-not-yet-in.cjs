/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

const utilitySource = read("src/lib/parentNotYetIn.ts");
const utilityJs = ts.transpileModule(utilitySource, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2017 },
}).outputText;
const utilityModule = { exports: {} };
new Function("module", "exports", "require", utilityJs)(utilityModule, utilityModule.exports, require);
const { manilaClockMinutes, shouldShowParentNotYetIn } = utilityModule.exports;

// This UTC timestamp is 07:30 in Manila, proving the warning does not depend
// on the browser or Node process timezone.
assert.equal(manilaClockMinutes(new Date("2026-11-12T23:30:00.000Z")), 450);

const scheduledNoArrival = {
  hasClassToday: true,
  scheduledStart: "06:00:00",
  todayStatus: null,
  hasValidTimeIn: false,
};

// One minute before, and exactly at, the 60-minute Manila threshold.
assert.equal(shouldShowParentNotYetIn(scheduledNoArrival, 419), false);
assert.equal(shouldShowParentNotYetIn(scheduledNoArrival, 420), true);

// A valid arrival, approved excuse, and finalized absence always win over the
// visual reminder. A non-school day or absent ICT schedule cannot show it.
assert.equal(shouldShowParentNotYetIn({ ...scheduledNoArrival, hasValidTimeIn: true }, 420), false);
assert.equal(shouldShowParentNotYetIn({ ...scheduledNoArrival, todayStatus: "Excused" }, 420), false);
assert.equal(shouldShowParentNotYetIn({ ...scheduledNoArrival, todayStatus: "Absent" }, 420), false);
assert.equal(shouldShowParentNotYetIn({ ...scheduledNoArrival, hasClassToday: false }, 420), false);
assert.equal(shouldShowParentNotYetIn({ ...scheduledNoArrival, scheduledStart: null }, 420), false);

// Children can use different Morning/Afternoon ICT schedules; switching the
// selected child must use that child's own snapshot rather than a global time.
assert.equal(shouldShowParentNotYetIn({ ...scheduledNoArrival, scheduledStart: "12:30" }, 420), false);
assert.equal(shouldShowParentNotYetIn({ ...scheduledNoArrival, scheduledStart: "12:30" }, 810), true);

const parentHistory = read("src/app/api/attendance/parent-history/route.ts");
const dashboard = read("src/app/dashboard/parent/page.tsx");

assert.match(parentHistory, /getTodayClassSchedule/);
assert.match(parentHistory, /select\("scheduled_start"\)/);
assert.match(parentHistory, /section\?\.class_session === "Morning" \|\| section\?\.class_session === "Afternoon"/);
assert.match(parentHistory, /todaySchedule: \{/);
assert.match(parentHistory, /scheduledStart: todayClassSchedule\.scheduledStart/);
assert.match(parentHistory, /school_holidays/);

assert.match(dashboard, /shouldShowParentNotYetIn\(student, currentManilaMinutes\)/);
assert.match(dashboard, /showNotYetIn \? \(/);
assert.match(dashboard, /Not Yet In/);
assert.match(dashboard, /bg-red-500/);
assert.match(dashboard, /\["attendance", "reports", "notifications", "announcements", "staff-messages"\]\.includes\(event\.scope \?\? ""\)[\s\S]*?scheduleDashboardRefresh\(\)/);
assert.match(dashboard, /setSelectedId\(id\)/);

console.log("Parent Dashboard Not Yet In threshold, exclusions, refresh, and child-schedule checks passed.");
