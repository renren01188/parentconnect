const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

const verifier = read("src/lib/googleRecaptcha.ts");
const signupRoute = read("src/app/api/parents/signup/route.ts");
const guardianPage = read("src/app/login/guardian/page.tsx");
const captchaWidget = read("src/components/ContactRecaptcha.tsx");

// Sign-up uses its own solved v2 widget token and verifies it once on the
// server before looking up school or parent records.
assert.match(guardianPage, /<ContactRecaptcha[\s\S]*?onTokenChange=\{setSignupCaptchaToken\}/);
assert.match(guardianPage, /recaptchaToken: signupCaptchaToken/);
assert.match(signupRoute, /await verifyGoogleRecaptcha\(body\?\.recaptchaToken\)/);
assert.ok(
  signupRoute.indexOf("await verifyGoogleRecaptcha(body?.recaptchaToken)") < signupRoute.indexOf('.from("students")'),
  "The CAPTCHA must be checked before enrollment data is read.",
);

// The verifier normalizes both configured hostnames and Google's hostname,
// protects against tokens for another domain, and never logs a token/secret.
assert.match(verifier, /function normalizeHostname/);
assert.match(verifier, /\.map\(normalizeHostname\)/);
assert.match(verifier, /allowedHostnames\.includes\(verifiedHostname\)/);
assert.match(verifier, /reCAPTCHA token rejected for unapproved hostname/);
assert.doesNotMatch(verifier, /console\.(?:log|warn|error)\([^\n]*(?:response:\s*token|secret\s*[})])/i);
assert.match(captchaWidget, /"expired-callback"/);
assert.match(captchaWidget, /notifyTokenChange\(""\)/);

console.log("Guardian signup CAPTCHA checks passed.");
