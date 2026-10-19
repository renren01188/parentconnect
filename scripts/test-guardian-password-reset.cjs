const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

const forgot = read("src/app/api/auth/forgot-password/route.ts");
const reset = read("src/app/api/auth/reset-password/route.ts");
const resetPage = read("src/app/login/guardian/reset-password/page.tsx");
const requirements = read("src/lib/parentPasswordRequirements.ts");
const limiter = read("src/lib/parentPasswordResetRateLimit.ts");
const revocation = read("src/lib/passwordSessionRevocation.ts");
const revocationStore = read("src/lib/passwordSessionRevocationStore.ts");
const middleware = read("src/middleware.ts");
const migration = read("supabase/migrations/20261018120000_harden_parent_password_reset.sql");

assert.match(requirements, /parentPasswordMeetsRequirements/);
assert.match(requirements, /\[A-Z\]/);
assert.match(requirements, /\[a-z\]/);
assert.match(requirements, /\\d/);
assert.match(reset, /parentPasswordMeetsRequirements\(newPassword\)/, "The reset API must enforce the same password policy as the page.");
assert.match(resetPage, /parentPasswordMeetsRequirements\(newPassword\)/, "The reset page must show the same password policy before submit.");
assert.match(resetPage, /disabled=\{loading \|\| otp\.length !== 6 \|\| !passwordIsValid\}/);

assert.match(limiter, /consume_parent_password_reset_rate_limit/);
assert.match(limiter, /parent-password-reset/);
assert.match(forgot, /consumeParentPasswordResetRateLimit\(Number\(parent\.id\)\)/, "Forgot-password must throttle each server-matched Parent account.");
assert.match(forgot, /if \(!rateLimit\.allowed\) return NextResponse\.json\(genericResponse\)/, "Rate limiting must preserve the account-enumeration-safe response.");
assert.match(forgot, /status: isParentPasswordResetRateLimitUnavailableError\(error\) \? 503 : 500/);

assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.parent_password_reset_otps/);
assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.parent_password_reset_rate_limits/);
assert.match(migration, /CREATE OR REPLACE FUNCTION public\.consume_parent_password_reset_rate_limit/);
assert.match(migration, /FOR UPDATE/, "OTP and rate-limit rows must be locked before mutation.");
assert.match(migration, /CREATE OR REPLACE FUNCTION public\.reset_parent_password_with_otp/);
assert.match(migration, /'Password Session Revoked'/);
assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.reset_parent_password_with_otp[\s\S]*?TO service_role/);

assert.match(reset, /supabase\.rpc\("reset_parent_password_with_otp"/);
assert.match(reset, /response\.cookies\.delete\("parent_token"\)/, "The resetting browser must lose its current Parent cookie.");
assert.match(reset, /publishAccountRealtimeInvalidation\(\[\{ role: "parent", id: Number\(parent\.id\) \}\], \{ sessionRevoked: true \}\)/);
assert.match(revocation, /PASSWORD_SESSION_REVOCATION_ACTION/);
assert.match(revocation, /PASSWORD_SESSION_REVOCATION_ACTIONS/);
assert.match(revocationStore, /\.in\("action", \[\.\.\.PASSWORD_SESSION_REVOCATION_ACTIONS\]\)/);
assert.match(middleware, /in\.\(\$\{PASSWORD_SESSION_REVOCATION_ACTIONS\.join\(","\)\}\)/);
assert.match(middleware, /pathname === "\/api\/auth\/forgot-password"/);
assert.match(middleware, /pathname === "\/api\/auth\/reset-password"/);

console.log("Guardian password-reset hardening checks passed.");
