/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

const route = read("src/app/api/excuse-letters/route.ts");
const page = read("src/app/dashboard/parent/attendance/page.tsx");
const optionalAttachmentMigration = read("supabase/migrations/20261020120000_make_excuse_letter_attachment_optional.sql");

// No `attachments` property and an empty attachment list are both accepted.
// If a file is supplied, retain the one-file cap and payload validation.
assert.match(route, /function validateOptionalAttachment\(value: unknown\)/);
assert.match(route, /if \(value === undefined \|\| value === null\) return null/);
assert.match(route, /if \(!Array\.isArray\(value\) \|\| value\.length > 1\)/);
assert.match(route, /if \(value\.length === 0\) return null/);
assert.match(route, /validateExcuseLetterAttachmentPayload\(value\[0\]\)/);
assert.match(route, /attachment_uploaded_at: attachment \? new Date\(\)\.toISOString\(\) : null/);
assert.doesNotMatch(route, /Exactly one attachment is required/);
assert.match(optionalAttachmentMigration, /ALTER TABLE public\.excuse_letters ALTER COLUMN %I DROP NOT NULL/);
assert.match(optionalAttachmentMigration, /'file_name'/);
assert.match(optionalAttachmentMigration, /'file_data'/);
assert.match(optionalAttachmentMigration, /'file_type'/);

assert.match(page, /Attachment <span className="font-medium text-slate-400">\(optional\)<\/span>/);
assert.doesNotMatch(page, /checked=\{accepted\}/);
assert.doesNotMatch(page, /attachments\.length > 0 && !attachmentError/);
assert.match(page, /attachments: attachmentPayloads/);

console.log("Optional excuse-letter attachment checks passed.");
