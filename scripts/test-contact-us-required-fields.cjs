/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");

const contactPage = read("src/app/contact-us/page.tsx");
const contactRoute = read("src/app/api/contact-us/route.ts");

// The public form clearly communicates its required fields, while native
// validation prevents an empty submission.
assert.match(contactPage, /Name <span aria-hidden="true" className="text-red-500">\*<\/span><span className="sr-only"> \(required\)<\/span>/);
assert.match(contactPage, /Email <span aria-hidden="true" className="text-red-500">\*<\/span><span className="sr-only"> \(required\)<\/span>/);
assert.match(contactPage, /Subject <span aria-hidden="true" className="text-red-500">\*<\/span><span className="sr-only"> \(required\)<\/span>/);
assert.match(contactPage, /Message <span aria-hidden="true" className="text-red-500">\*<\/span><span className="sr-only"> \(required\)<\/span>/);
assert.match(contactPage, /name="name"[\s\S]*?required/);
assert.match(contactPage, /name="email"[\s\S]*?required/);
assert.match(contactPage, /name="subject"[\s\S]*?required/);
assert.match(contactPage, /name="message"[\s\S]*?required/);

// A disabled Send action explains every outstanding client-side requirement
// on hover or keyboard focus, including the CAPTCHA gate.
assert.match(contactPage, /const missingContactRequirements = \[/);
assert.match(contactPage, /!form\.subject\.trim\(\) \? "Subject" : ""/);
assert.match(contactPage, /!form\.message\.trim\(\) \? "Message" : ""/);
assert.match(contactPage, /!captchaToken \? "CAPTCHA verification" : ""/);
assert.match(contactPage, /id="contact-send-requirements"/);
assert.match(contactPage, /Before sending, complete:/);
assert.match(contactPage, /group-hover:opacity-100 group-focus:opacity-100/);

// The route remains the authorization boundary if a client bypasses the form.
assert.match(contactRoute, /if \(!submission\.name \|\| !submission\.email \|\| !submission\.subject \|\| !submission\.message\) return null;/);

console.log("contact-us required-field checks passed");
