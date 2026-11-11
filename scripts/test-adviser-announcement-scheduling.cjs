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
  formatManilaAnnouncementDate,
  formatManilaAnnouncementSchedule,
  isDueAnnouncementSchedule,
  normalizeOptionalAnnouncementSchedule,
} = loadTypeScriptModule("src/lib/announcementSchedule.ts");

const now = new Date("2026-11-08T12:00:00.000Z"); // 8:00 PM in Manila
assert.deepEqual(normalizeOptionalAnnouncementSchedule("", now), { ok: true, scheduledAt: null }, "A blank date must send immediately.");
assert.equal(normalizeOptionalAnnouncementSchedule("2026-11-08", now).ok, false, "Today cannot be scheduled.");
const scheduled = normalizeOptionalAnnouncementSchedule("2026-11-09", now);
assert.deepEqual(scheduled, { ok: true, scheduledAt: "2026-11-09T00:00:00+08:00" }, "A future Manila date must be stored at the start of that calendar day.");
assert.equal(isDueAnnouncementSchedule("2026-11-09T00:00:00+08:00", new Date("2026-11-08T15:59:59.000Z")), false, "Delivery must wait until the selected date begins in Manila.");
assert.equal(isDueAnnouncementSchedule("2026-11-09T00:00:00+08:00", new Date("2026-11-08T16:00:00.000Z")), true, "Delivery must begin when the selected date starts in Manila.");
assert.equal(formatManilaAnnouncementDate("2026-11-09T00:00:00+08:00"), "November 9, 2026", "The Adviser confirmation must display only the selected date.");
assert.match(formatManilaAnnouncementSchedule("2026-11-09T14:30:00+08:00"), /Asia\/Manila/, "Legacy scheduled announcements retain their original timestamp display.");

const page = read("src/app/dashboard/adviser/notifications/page.tsx");
const route = read("src/app/api/adviser/announcements/route.ts");
const deleteRoute = read("src/app/api/adviser/announcements/[id]/route.ts");
const processor = read("src/lib/processScheduledAnnouncements.ts");
const delivery = read("src/lib/deliverAdviserAnnouncement.ts");
const migration = read("supabase/legacy-migrations/20261108090000_add_adviser_announcement_scheduling.sql");

assert.match(page, /const CHAR_LIMIT = 1000/);
assert.match(page, /maxLength=\{CHAR_LIMIT\}/);
assert.match(page, /type="date" min=\{nextSchoolCalendarDay\(\)\}/);
assert.match(page, /Optional — leave this blank to publish an urgent announcement now, or choose a future date to schedule it\./);
assert.doesNotMatch(page, /scheduleTime|schedule_time|type="time"/);
assert.match(page, /This cancels its scheduled delivery/);
assert.match(route, /normalizeOptionalAnnouncementSchedule\(body\.schedule_date\)/);
assert.doesNotMatch(route, /schedule_time/);
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
