/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");

const contactPage = read("src/app/contact-us/page.tsx");
const contactRoute = read("src/app/api/contact-us/route.ts");

// The public form clearly communicates that the two identity fields are
// required, while native validation prevents an empty submission.
assert.match(contactPage, /Name <span aria-hidden="true" className="text-red-500">\*<\/span><span className="sr-only"> \(required\)<\/span>/);
assert.match(contactPage, /Email <span aria-hidden="true" className="text-red-500">\*<\/span><span className="sr-only"> \(required\)<\/span>/);
assert.match(contactPage, /name="name"[\s\S]*?required/);
assert.match(contactPage, /name="email"[\s\S]*?required/);

// The route remains the authorization boundary if a client bypasses the form.
assert.match(contactRoute, /if \(!submission\.name \|\| !submission\.email \|\| !submission\.subject \|\| !submission\.message\) return null;/);

console.log("contact-us required-field checks passed");
