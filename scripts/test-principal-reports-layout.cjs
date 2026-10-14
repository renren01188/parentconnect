/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const page = fs.readFileSync(
  path.join(__dirname, "..", "src", "app", "dashboard", "principal", "reports", "page.tsx"),
  "utf8",
);

// Message Panel uses a bounded grid instead of a fixed, absolutely-positioned
// second pane. The detail column can shrink without pushing the page wider.
assert.match(page, /grid h-full min-w-0 grid-cols-1 md:grid-cols-\[minmax\(280px,420px\)_minmax\(0,1fr\)\]/);
assert.match(page, /\$\{mobileConversationOpen \? "hidden" : "flex"\} h-full min-w-0 flex-col/);
assert.match(page, /\$\{mobileConversationOpen \? "flex" : "hidden"\} h-full min-w-0 w-full flex-col/);
assert.match(page, /max-w-\[78%\] min-w-0 break-words/);
assert.match(page, /grid grid-cols-\[minmax\(0,1fr\)_auto\] items-end gap-3/);
assert.match(page, /flex h-\[52px\] w-\[52px\] shrink-0 items-center justify-center/);

// Monitoring follows the same bounded-column pattern. Its table stays inside
// an internal scroller while compact cards serve narrow screens.
assert.match(page, /grid h-full min-w-0 grid-cols-1 md:grid-cols-\[minmax\(220px,300px\)_minmax\(0,1fr\)\]/);
assert.match(page, /hidden min-w-0 flex-col overflow-hidden border-r border-slate-100 bg-white shadow-sm md:flex/);
assert.match(page, /min-w-0 overflow-y-auto bg-slate-50 p-3/);
assert.match(page, /mt-5 grid gap-3 border-y border-slate-100 py-4 sm:grid-cols-2 lg:grid-cols-3/);
assert.match(page, /hidden max-w-full overflow-x-auto rounded-xl border border-slate-200 md:block/);
assert.match(page, /space-y-3 md:hidden/);

console.log("principal reports layout checks passed");
