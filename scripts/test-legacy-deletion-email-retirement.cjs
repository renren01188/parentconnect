/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");
const legacyRoute = path.join(root, "src", "app", "api", "deletion-email-jobs", "route.ts");
const migration = read("supabase/migrations/20261110120000_remove_legacy_deletion_email_tables.sql");

// The retired status endpoint was the final application reader of the old
// queue. It must not be restored after the tables are removed.
assert.equal(fs.existsSync(legacyRoute), false, "Legacy deletion-email status route must be removed.");

// Drop the dependent join table first, and stop the migration if an older
// environment still contains unsent historical queue records.
assert.match(migration, /LOCK TABLE public\.deletion_email_jobs IN ACCESS EXCLUSIVE MODE[\s\S]*?LOCK TABLE public\.deletion_email_job_items IN ACCESS EXCLUSIVE MODE/);
assert.match(migration, /to_regclass\('public\.deletion_email_job_items'\)[\s\S]*?SELECT EXISTS \(SELECT 1 FROM public\.deletion_email_job_items\)/);
assert.match(migration, /to_regclass\('public\.deletion_email_jobs'\)[\s\S]*?SELECT EXISTS \(SELECT 1 FROM public\.deletion_email_jobs\)/);
assert.match(migration, /DROP TABLE IF EXISTS public\.deletion_email_job_items;[\s\S]*?DROP TABLE IF EXISTS public\.deletion_email_jobs;/);

console.log("Legacy deletion email retirement checks passed");
