/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");
const renderer = read("src/components/MessageAttachments.tsx");

// Render only supported image attachment data inline. Other attachment types
// retain their download link and are never treated as image content.
assert.match(renderer, /\^image\\\/\[a-z0-9\.\+\-\]\+\$/i);
assert.match(renderer, /\^\(\?:data:image\\\/\|blob:\|https:\\\/\\\/\)/);
assert.match(renderer, /<img[\s\S]*?src=\{attachment\.dataUrl\}/);
assert.match(renderer, /download=\{attachment\.name\}/);

// The viewer is responsive, visibly closable, dismissible by backdrop tap,
// and supports Escape for keyboard users.
assert.match(renderer, /fixed inset-0 z-\[100\]/);
assert.match(renderer, /aria-label="Close image viewer"/);
assert.match(renderer, /event\.key === "Escape"/);
assert.match(renderer, /onClick=\{onClose\}/);
assert.match(renderer, /max-h-full max-w-full/);

// Every requested page shares the same inline image/viewer implementation.
for (const page of [
  "src/app/dashboard/ict/inbox/page.tsx",
  "src/app/dashboard/adviser/contact-ict/page.tsx",
  "src/app/dashboard/guidance/contact-ict/page.tsx",
  "src/app/dashboard/principal/contact-ict/page.tsx",
  "src/app/dashboard/parent/reports/page.tsx",
  "src/app/dashboard/adviser/reports/page.tsx",
  "src/app/dashboard/guidance/reports/page.tsx",
  "src/app/dashboard/principal/reports/page.tsx",
]) {
  const source = read(page);
  assert.match(source, /import \{ MessageAttachments \} from "@\/components\/MessageAttachments"/);
  assert.match(source, /<MessageAttachments/);
  assert.doesNotMatch(source, /href=\{attachment\.dataUrl\}/);
}

console.log("message image attachment checks passed");
