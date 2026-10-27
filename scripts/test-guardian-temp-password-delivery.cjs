const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

const brevo = read("src/lib/brevoApi.ts");
const temporaryPasswords = read("src/lib/parentTemporaryPassword.ts");
const signup = read("src/app/api/parents/signup/route.ts");
const resend = read("src/app/api/parents/resend-temp-password/route.ts");
const verify = read("src/app/api/parents/verify-temp-password/route.ts");
const page = read("src/app/login/guardian/verify-temp-password/page.tsx");

// Transient provider failures get bounded retries and cannot hold the browser
// signup request indefinitely. Permanent provider responses are not retried.
assert.match(brevo, /BREVO_REQUEST_TIMEOUT_MS = 5_000/);
assert.match(brevo, /BREVO_MAX_DELIVERY_ATTEMPTS = 3/);
assert.match(brevo, /new AbortController\(\)/);
assert.match(brevo, /isRetryableStatus\(response\.status\)/);
assert.match(brevo, /if \(!isRetryableStatus\(response\.status\)\) \{[\s\S]*?break;/);

// New signups persist only HMAC proofs in their signed cookie. A resend keeps
// the latest code plus one still-valid prior code, never raw passwords.
assert.match(temporaryPasswords, /PARENT_TEMPORARY_PASSWORD_MAX_ACTIVE_CODES = 2/);
assert.match(temporaryPasswords, /export function temporaryPasswordProofEntries/);
assert.match(temporaryPasswords, /export function matchingTemporaryPasswordProof/);
assert.match(signup, /temporaryPasswordProofEntries:[\s\S]*?\[\{/);
assert.match(signup, /parentEmail: email/);
assert.ok(
  signup.indexOf('cookieStore.set("parent_signup_token"') < signup.indexOf("await sendTempPasswordEmail"),
  "The pending signup cookie must be saved before delivery is attempted",
);
assert.match(signup, /deliveryPending: true/);
assert.match(signup, /status: 202/);
assert.match(resend, /temporaryPasswordProofEntries\(pending\.payload\)/);
assert.match(resend, /PARENT_TEMPORARY_PASSWORD_MAX_ACTIVE_CODES/);
assert.match(resend, /const recipientEmail = pending\.signup\.email\.trim\(\)\.toLowerCase\(\)/);
assert.match(resend, /parentEmail: recipientEmail/);
assert.match(resend, /recipientEmailMasked: maskRecipientEmail\(recipientEmail\)/);
assert.match(resend, /Earlier valid temporary passwords remain usable until they expire\./);

// Verification accepts only a matching unexpired proof and writes that
// specific expiry into the account setup flow.
assert.match(verify, /const matchingProof = signup/);
assert.match(verify, /matchingTemporaryPasswordProof\(password, proofEntries\)/);
assert.match(verify, /temporaryPasswordExpiresAt: matchingProof\.expiresAt/);
assert.match(verify, /if \(!matchingProof\) \{[\s\S]*?INCORRECT_PASSWORD_MESSAGE/);

// The page no longer tells the guardian that a delayed earlier email is invalid.
assert.match(page, /Delivery can take a few minutes/);
assert.match(page, /deliveryPending/);
assert.match(page, /recipientEmailMasked/);
assert.match(page, /earlier temporary password remains usable until its own expiry/i);
assert.doesNotMatch(page, /only the newest temporary password will work/i);

// The mail includes an HTML version and a plain-text fallback so a temporary
// password remains readable in mail clients that block HTML content.
const mailer = read("src/lib/mailer.ts");
assert.match(mailer, /export async function sendTempPasswordEmail/);
assert.match(mailer, /text: \[/);

console.log("guardian temporary-password delivery checks passed");
