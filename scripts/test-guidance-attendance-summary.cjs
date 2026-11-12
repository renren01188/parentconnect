/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

const page = read("src/app/dashboard/guidance/AttendanceSummary/page.tsx");
const sidebar = read("src/app/dashboard/guidance/components/Sidebar.tsx");
const summaryRoute = read("src/app/api/attendance/monthly-summary/route.ts");
const invalidation = read("src/lib/realtimeInvalidation.ts");

assert.match(sidebar, /label: "Attendance Summary", href: dashboardPath\("guidance", "\/AttendanceSummary"\)/, "Guidance navigation must link to Attendance Summary.");
assert.match(page, /`\/api\/attendance\/monthly-summary\?year=\$\{selectedYear\}&month=\$\{month\}`/, "Guidance must use the Principal monthly-summary response.");
assert.match(summaryRoute, /getGuidanceSession\(\)/, "The shared summary route must authenticate Guidance.");
assert.match(summaryRoute, /!principal && !guidance/, "The shared summary route must reject unauthorised callers.");
assert.match(summaryRoute, /resolveFinalAttendanceExport\(/, "Guidance totals must retain the Principal final-status calculation.");
assert.match(summaryRoute, /if \(status === "Excused"\)[\s\S]*?excused\+\+;[\s\S]*?absent\+\+/, "Excused must retain the Principal absent-count rule.");

assert.match(page, /const sectionOptions = useMemo\(\(\) => selectedGrade\?\.sections \?\? \[\], \[selectedGrade\]\)/, "Section options must be scoped to the selected grade.");
assert.match(page, /const handleGradeChange[\s\S]*?setSelectedSectionId\(""\)/, "Changing grade must clear the selected section.");
assert.match(page, /selectedGrade && selectedSection && \(/, "Analytics and the table must wait for both grade and section selections.");
assert.match(page, /sumAttendance\(selectedSection\?\.students \?\? \[\]\)/, "Analytics and table totals must use the selected section rows.");
assert.match(page, /No attendance records for the selected section and date range\./, "Guidance must explain an empty selected range.");
assert.match(page, /\["attendance", "students", "dashboard"\]\.includes\(scope\)/, "Guidance must refresh both views for attendance changes.");
assert.match(invalidation, /guidance_counselors"\)\.select\("id"\)\.eq\("status", "active"\)/, "Attendance invalidations must include active Guidance accounts.");

console.log("Guidance attendance summary navigation, access, filter, and shared-total checks passed.");
