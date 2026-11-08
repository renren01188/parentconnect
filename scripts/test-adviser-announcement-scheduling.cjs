const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

const root = path.resolve(__dirname, "..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");

function loadTypeScriptModule(relative) {
  const output = ts.transpileModule(read(relative), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const loaded = { exports: {} };
  new Function("exports", "require", "module", output)(loaded.exports, require, loaded);
  return loaded.exports;
}

const {
  formatManilaAnnouncementSchedule,
  isDueAnnouncementSchedule,
  normalizeOptionalAnnouncementScheduleDateTime,
} = loadTypeScriptModule("src/lib/announcementSchedule.ts");

const now = new Date("2026-11-08T12:00:00.000Z"); // 8:00 PM in Manila
assert.deepEqual(normalizeOptionalAnnouncementScheduleDateTime("", "", now), { ok: true, scheduledAt: null }, "Blank date and time must send immediately.");
assert.equal(normalizeOptionalAnnouncementScheduleDateTime("2026-11-09", "", now).ok, false, "Scheduling requires both date and time.");
assert.equal(normalizeOptionalAnnouncementScheduleDateTime("2026-11-08", "09:00", now).ok, false, "Today cannot be scheduled.");
assert.equal(normalizeOptionalAnnouncementScheduleDateTime("2026-11-09", "25:00", now).ok, false, "Invalid typed times must be rejected.");
const scheduled = normalizeOptionalAnnouncementScheduleDateTime("2026-11-09", "14:30", now);
assert.deepEqual(scheduled, { ok: true, scheduledAt: "2026-11-09T14:30:00+08:00" }, "A valid future Manila date and time must be retained exactly.");
assert.equal(isDueAnnouncementSchedule("2026-11-09T14:30:00+08:00", new Date("2026-11-09T06:29:59.000Z")), false, "Delivery must wait until the selected time.");
assert.equal(isDueAnnouncementSchedule("2026-11-09T14:30:00+08:00", new Date("2026-11-09T06:30:00.000Z")), true, "Delivery must begin at the selected time.");
assert.match(formatManilaAnnouncementSchedule("2026-11-09T14:30:00+08:00"), /Asia\/Manila/, "Confirmation must identify Manila time.");

const page = read("src/app/dashboard/adviser/notifications/page.tsx");
const route = read("src/app/api/adviser/announcements/route.ts");
const deleteRoute = read("src/app/api/adviser/announcements/[id]/route.ts");
const processor = read("src/lib/processScheduledAnnouncements.ts");
const delivery = read("src/lib/deliverAdviserAnnouncement.ts");
const migration = read("supabase/migrations/20261108090000_add_adviser_announcement_scheduling.sql");

assert.match(page, /const CHAR_LIMIT = 1000/);
assert.match(page, /maxLength=\{CHAR_LIMIT\}/);
assert.match(page, /type="date" min=\{nextSchoolCalendarDay\(\)\}/);
assert.match(page, /type="time"/);
assert.match(page, /formatManilaAnnouncementSchedule/);
assert.match(page, /This cancels its scheduled delivery/);
assert.match(route, /normalizeOptionalAnnouncementScheduleDateTime/);
assert.match(route, /message\.length > 1000/);
assert.match(route, /status = schedule\.scheduledAt \? "Scheduled" : "Published"/);
assert.match(route, /deliverAdviserAnnouncement/);
assert.match(deleteRoute, /status: "Cancelled"/);
assert.match(deleteRoute, /\.eq\("status", "Scheduled"\)/);
assert.match(deleteRoute, /parent_announcement_notifications/);
assert.match(deleteRoute, /publishRealtimeInvalidation/);
assert.match(processor, /processAdviserAnnouncements/);
assert.match(processor, /claimScheduledAnnouncement\("adviser_announcements", item\.id\)/);
assert.match(delivery, /parent_student_links/);
assert.match(delivery, /parent_announcement_notifications/);
assert.match(migration, /status IN \('Published', 'Scheduled', 'Cancelled'\)/);
assert.match(migration, /adviser_announcements_scheduled_delivery_idx/);

console.log("Adviser announcement scheduling, delivery, deletion, and Realtime checks passed.");
