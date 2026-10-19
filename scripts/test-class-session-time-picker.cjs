/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const page = fs.readFileSync(path.join(root, "src/app/dashboard/ict/StudentProfiles/page.tsx"), "utf8");
const pickerStart = page.indexOf("function ScheduleTimePicker");
const pickerEnd = page.indexOf("function FSelect", pickerStart);
const picker = page.slice(pickerStart, pickerEnd);

assert.ok(pickerStart >= 0 && pickerEnd > pickerStart, "Schedule time picker must be present.");
assert.match(picker, /createPortal/);
assert.doesNotMatch(picker, /type="time"/);

// Internal list scrolling only updates position; it never dismisses the draft.
assert.match(picker, /window\.addEventListener\("scroll", updatePosition, true\)/);
assert.match(picker, /onWheel=\{\(event\) => event\.stopPropagation\(\)\}/);
assert.match(picker, /onClick=\{\(\) => setDraft\(\(current\) => \(\{ \.\.\.current, hour \}\)\)\}/);
assert.match(picker, /onClick=\{\(\) => setDraft\(\(current\) => \(\{ \.\.\.current, minute \}\)\)\}/);

// The source value changes only after an explicit completed selection. Cancel,
// Escape, and an outside click use dismiss without invoking onChange.
assert.match(picker, /onChange\(serializeScheduleTime\(draft\)\)/);
assert.match(picker, /onClick=\{dismiss\}/);
assert.match(picker, /event\.key === "Escape"\) dismiss\(\)/);
assert.match(picker, /document\.addEventListener\("click", onOutsideClick\)/);
assert.doesNotMatch(picker, /document\.addEventListener\("pointerdown"/);

assert.equal((page.match(/<ScheduleTimePicker/g) ?? []).length, 4);

console.log("class session time picker checks passed");
