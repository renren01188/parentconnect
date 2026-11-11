/* eslint-disable @typescript-eslint/no-require-imports */

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

const migration = read("supabase/legacy-migrations/20261021110000_add_grade_to_class_sessions.sql");
const classSessionApi = read("src/app/api/attendance/class-session/route.ts");
const ictProfiles = read("src/app/dashboard/ict/StudentProfiles/page.tsx");
const adviserAttendance = read("src/app/dashboard/adviser/attendance/page.tsx");
const scanApi = read("src/app/api/attendance/scan/route.ts");
const manualApi = read("src/app/api/attendance/manual/route.ts");
const autoAbsence = read("src/lib/automaticAttendanceAbsence.ts");

// Grade is part of the durable daily snapshot key, so one grade's save cannot
// overwrite another grade's Morning/Afternoon window. Existing rows remain.
assert.match(migration, /ADD COLUMN IF NOT EXISTS grade text/);
assert.match(migration, /ADD COLUMN IF NOT EXISTS class_session_id integer/);
assert.match(migration, /DROP CONSTRAINT IF EXISTS attendance_logs_class_session_fk/);
assert.match(migration, /FOREIGN KEY \(class_session_id\)/);
assert.match(migration, /assign_attendance_class_session_trigger/);
assert.match(migration, /DROP INDEX IF EXISTS public\.class_sessions_date_type_idx/);
assert.match(migration, /session_date, session_type, grade/);
assert.match(migration, /class_sessions_grade_date_type_idx/);
assert.doesNotMatch(migration, /DELETE FROM public\.class_sessions/);
assert.doesNotMatch(migration, /UPDATE public\.class_sessions\s+SET grade/);

// ICT manages whichever grade it explicitly selects, even if a stale Adviser
// cookie is present in the same browser. The Adviser scanner has no grade
// query parameter and must keep using the Adviser's own grade. Reads and
// writes continue to use only the selected grade's snapshots.
assert.match(classSessionApi, /function requestedGrade/);
assert.match(classSessionApi, /Promise\.all\(\[getAdviserFromToken\(\), getIctFromToken\(\)\]\)/);
assert.match(classSessionApi, /if \(!requested\) \{[\s\S]*?grade = adviserGrade/);
assert.match(classSessionApi, /else if \(ict\) \{[\s\S]*?grade = requested/);
assert.match(classSessionApi, /requested !== adviserGrade[\s\S]*?You can view only the schedule for your assigned grade level/);
assert.match(classSessionApi, /You can view only the schedule for your assigned grade level/);
assert.match(classSessionApi, /Choose a grade level to view its class schedule/);
assert.match(classSessionApi, /\.eq\("grade", grade\)/);
assert.match(classSessionApi, /onConflict: "session_date,session_type,grade"/);
assert.match(classSessionApi, /legacy rows/);
assert.doesNotMatch(classSessionApi, /timeToMinutes\("12:00"/);
assert.doesNotMatch(classSessionApi, /Late cutoff must be within the session/);
assert.match(classSessionApi, /Late and absent are independent ICT-configured attendance cutoffs/);
assert.match(classSessionApi, /late_after: lateAfter/);
assert.match(classSessionApi, /absent_after: absentAfter/);

// The Adviser Class Session card reads the selected section's authoritative
// assignment, then matches only that session's saved schedule. It never uses
// the first returned session or another session that happens to be active.
assert.match(classSessionApi, /function requestedSection/);
assert.match(classSessionApi, /const selectedSection = requestedSection\(req\)/);
assert.match(classSessionApi, /adviserSections\.includes\(selectedSection\)/);
assert.match(classSessionApi, /\.from\("sections"\)[\s\S]*?\.select\("class_session"\)[\s\S]*?\.eq\("grade", grade\)[\s\S]*?\.eq\("name", selectedSection\)/);
assert.match(classSessionApi, /section_session_type: selectedSectionSessionType/);
assert.match(adviserAttendance, /const sectionParam = activeSection \? `\?section=\$\{encodeURIComponent\(activeSection\)\}` : ""/);
assert.match(adviserAttendance, /data\.section_session_type === "Morning" \|\| data\.section_session_type === "Afternoon"/);
assert.match(adviserAttendance, /const requestId = \+\+classSessionRequestRef\.current/);
assert.match(adviserAttendance, /requestId !== classSessionRequestRef\.current/);
const adviserCardScheduleLookup = adviserAttendance.slice(
  adviserAttendance.indexOf("const selectedSectionScheduleType"),
  adviserAttendance.indexOf("const timeOutWindowStartsAt"),
);
assert.match(adviserCardScheduleLookup, /scheduleSection === activeSection/);
assert.match(adviserCardScheduleLookup, /classSessions\.find\(\(session\) => session\.session_type === selectedSectionScheduleType\)/);
assert.doesNotMatch(adviserCardScheduleLookup, /session\.status === "Active"|classSessions\[0\]/);
assert.match(adviserAttendance, /classSessionCardSchedule\.session_type/);
assert.match(adviserAttendance, /classSessionCardSchedule\.scheduled_start/);
assert.match(adviserAttendance, /classSessionCardSchedule\.scheduled_end/);
assert.match(adviserAttendance, /classSessionCardSchedule\.late_after/);
assert.match(adviserAttendance, /classSessionCardSchedule\.absent_after/);

// ICT selects a grade and includes it on every save/load request. Adviser
// refresh already consumes the dashboard invalidation without page reload.
assert.match(ictProfiles, /htmlFor="class-control-grade"/);
assert.match(ictProfiles, /Grade Level/);
assert.match(ictProfiles, /class-session\?grade=\$\{encodeURIComponent\(selectedGrade\)\}/);
assert.match(ictProfiles, /grade: selectedGrade/);
assert.match(adviserAttendance, /event\.scope === "dashboard"\) void loadClassSession\(\)/);
assert.match(adviserAttendance, /window\.setInterval\(refreshWhenVisible, 300_000\)/);

// Server-side attendance checks use the student's/adviser's grade as well,
// so browser state cannot apply another grade's class window.
assert.match(scanApi, /getScheduledSessionStatus\(today, schoolClock\.minutes, adviser\?\.grade/);
assert.match(scanApi, /ensureGradeSessionSnapshot/);
assert.match(scanApi, /class_session_id: classSessionId/);
assert.match(scanApi, /\.eq\("grade", grade\)/);
assert.match(manualApi, /\.eq\("grade", student\.grade\)/);
assert.match(manualApi, /class_session_id: session\.id/);
assert.match(autoAbsence, /getOrCreateSessionSnapshot\(sessionDate, input\.sessionType, grade\)/);
assert.match(autoAbsence, /class_session_id: session\.id/);
assert.match(autoAbsence, /session\.absent_after \?\? session\.scheduled_end/);
assert.match(autoAbsence, /for \(const \[grade, sections\] of sectionsByGrade\)/);
assert.match(autoAbsence, /scope: \{ grade, sections: \[\.\.\.sections\] \}/);

console.log("Grade-level class session schedule checks passed.");
