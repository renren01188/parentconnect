const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

const migration = read("supabase/legacy-migrations/20261020200000_add_parent_verification_otp_challenges.sql");
const persistenceMigration = read("supabase/legacy-migrations/20261020210000_persist_parent_reset_otp_limits.sql");
const otpHelper = read("src/lib/parentVerificationOtp.ts");
const signup = read("src/app/api/parents/signup/route.ts");
const signupOtp = read("src/app/api/parents/signup-otp/route.ts");
const signupOtpPage = read("src/app/login/guardian/send-otp/page.tsx");
const forgot = read("src/app/api/auth/forgot-password/route.ts");
const forgotPage = read("src/app/login/guardian/forgot-password/page.tsx");
const resetStatus = read("src/app/api/auth/password-reset/status/route.ts");
const resetResend = read("src/app/api/auth/password-reset/resend/route.ts");
const resetVerify = read("src/app/api/auth/password-reset/verify/route.ts");
const resetComplete = read("src/app/api/auth/password-reset/complete/route.ts");
const resetPage = read("src/app/login/guardian/reset-password/page.tsx");
const newPasswordPage = read("src/app/login/guardian/reset-password/new-password/page.tsx");
const setPasswordPage = read("src/app/login/guardian/set-password/page.tsx");
const setPasswordRoute = read("src/app/api/auth/set-password/route.ts");
const passwordRequirements = read("src/lib/parentPasswordRequirements.ts");
const preferenceRoute = read("src/app/api/parents/attendance-notification-preferences/route.ts");
const profilePage = read("src/app/dashboard/parent/profile/page.tsx");
const middleware = read("src/proxy.ts");
const routeAliases = read("src/lib/routeAliases.ts");

assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.parent_verification_otps/);
assert.match(migration, /purpose IN \('signup', 'password_reset'\)/);
assert.match(migration, /expires_at timestamptz NOT NULL/);
assert.match(migration, /used_at timestamptz/);
assert.match(migration, /FOR UPDATE/, "OTP mutation must lock its database row.");
assert.match(migration, /WHEN v_attempts = 1 THEN interval '1 minute'/);
assert.match(migration, /WHEN v_attempts = 2 THEN interval '2 minutes'/);
assert.match(migration, /WHEN v_attempts = 3 THEN interval '3 minutes'/);
assert.match(migration, /ELSE interval '10 minutes'/);
assert.match(migration, /SET used_at = v_now/);
assert.match(migration, /SET challenge_id = p_challenge_id/, "A resent reset code must replace its challenge ID.");
assert.match(persistenceMigration, /v_existing\.locked_until IS NOT NULL AND v_existing\.locked_until > v_now/);
assert.match(persistenceMigration, /This survives refreshes, new browser sessions, and switches/);
assert.match(persistenceMigration, /'locked'::text/);
assert.match(otpHelper, /getParentOtpLimit/);
assert.match(otpHelper, /\.eq\("parent_id", parentId\)/);
assert.match(otpHelper, /\.eq\("purpose", purpose\)/);
assert.match(passwordRequirements, /password\.length >= 8/);
assert.match(passwordRequirements, /\[A-Z\]/);
assert.match(passwordRequirements, /\[a-z\]/);
assert.match(passwordRequirements, /\\d/);
const passwordRequirementsModule = { exports: {} };
vm.runInNewContext(
  ts.transpileModule(passwordRequirements, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText,
  { exports: passwordRequirementsModule.exports, module: passwordRequirementsModule },
);
const { parentPasswordMeetsRequirements } = passwordRequirementsModule.exports;
assert.equal(parentPasswordMeetsRequirements("SecurePass1"), true, "A valid Parent password must be accepted.");
assert.equal(parentPasswordMeetsRequirements("lowercase1"), false, "A lowercase-only password must be rejected.");
assert.equal(parentPasswordMeetsRequirements("UPPERCASE1"), false, "A password without a lowercase letter must be rejected.");
assert.equal(parentPasswordMeetsRequirements("SecurePass"), false, "A password without a number must be rejected.");
assert.equal(parentPasswordMeetsRequirements("Pass1"), false, "A password shorter than eight characters must be rejected.");

assert.match(signup, /const verificationMethod = email \? "email" : "sms"/);
assert.match(signup, /verificationMethod: "sms"/);
assert.match(routeAliases, /signupOtp: "\/a\/[A-Za-z0-9]+"/);
assert.match(routeAliases, /verifyTemporaryPassword: "\/a\/[A-Za-z0-9]+"/);
assert.match(signup, /redirectTo: PUBLIC_ROUTE_ALIASES\.parentRecovery\.signupOtp/);
assert.match(signup, /redirectTo: PUBLIC_ROUTE_ALIASES\.parentRecovery\.verifyTemporaryPassword/);
assert.match(signupOtp, /export async function GET\(\)/);
assert.match(signupOtp, /export async function POST\(request: NextRequest\)/);
assert.match(signupOtp, /issueParentOtp/);
assert.match(signupOtp, /semaphoreRoute: "otp"/);
assert.match(signupOtp, /semaphoreOtpCode: issued\.otp/);
assert.match(signupOtp, /\{otp\}/);
assert.match(signupOtpPage, /only after you select Send OTP/);
assert.match(signupOtpPage, /Resend OTP in/);

assert.match(forgotPage, /Email Address/);
assert.match(forgotPage, /Contact Number/);
assert.match(forgotPage, /Send OTP/);
assert.match(forgotPage, /Contact ICT for help/);
assert.match(forgot, /normalizeParentLoginContactNumber/);
assert.match(forgot, /normalizeParentLoginEmail/);
assert.match(forgot, /\.eq\("archive_status", "active"\)/);
assert.match(forgot, /issueParentOtp/);
assert.match(forgot, /semaphoreRoute: "otp"/);
assert.match(forgot, /semaphoreOtpCode: input\.otp/);
assert.match(forgot, /\{otp\}/);
assert.match(forgot, /consumeParentPasswordResetRateLimit/);
assert.match(forgot, /getParentOtpLimit\(Number\(parent\.id\), "password_reset"\)/);
assert.match(forgot, /Too many incorrect verification codes/);
assert.match(resetStatus, /resend_available_at/);
assert.match(resetStatus, /locked_until/);
assert.match(resetResend, /normalizeParentLoginContactNumber/);
assert.match(resetResend, /semaphoreRoute: "otp"/);
assert.match(resetResend, /semaphoreOtpCode: issued\.otp/);
assert.match(resetResend, /\{otp\}/);
assert.match(resetResend, /getParentOtpLimit\(flow\.parentId, "password_reset"\)/);
assert.match(resetVerify, /verifyParentOtp\(flow\.challengeId, "password_reset", otp\)/);
assert.match(resetComplete, /readVerifiedParentReset/);
assert.match(resetComplete, /parentPasswordMeetsRequirements\(newPassword\)/);
assert.ok(
  resetComplete.indexOf("parentPasswordMeetsRequirements(newPassword)") < resetComplete.indexOf("bcrypt.hash(newPassword"),
  "The reset API must reject weak passwords before hashing or saving them.",
);
assert.match(resetComplete, /redirectTo: dashboardPath\("parent"\)/);
assert.match(resetPage, /Six-digit verification code/);
assert.match(resetPage, /Enter the code sent to your email/);
assert.doesNotMatch(resetPage, /Email Address\*|Registered email address/);
assert.match(resetPage, /Resend OTP/);
assert.match(resetPage, /lockedUntil/);
assert.match(resetPage, /Too many incorrect codes/);
assert.match(newPasswordPage, /New Password/);
assert.match(newPasswordPage, /Confirm Password/);
assert.match(newPasswordPage, /EyeOff/);
assert.match(newPasswordPage, /\/api\/auth\/password-reset\/complete/);
assert.match(newPasswordPage, /const passwordMeetsRequirements = parentPasswordMeetsRequirements\(newPassword\)/);
assert.match(newPasswordPage, /const passwordsMatch = newPassword === confirmPassword && confirmPassword !== ""/);
assert.match(newPasswordPage, /disabled=\{loading \|\| !passwordMeetsRequirements \|\| !passwordsMatch\}/);
assert.match(setPasswordPage, /parentPasswordMeetsRequirements/);
assert.match(setPasswordPage, /canSubmit=\{!loading && passwordMeetsRequirements && passwordsMatch\}/);
assert.match(setPasswordRoute, /parentPasswordMeetsRequirements\(newPassword\)/);
assert.ok(
  setPasswordRoute.indexOf("parentPasswordMeetsRequirements(newPassword)") < setPasswordRoute.indexOf("bcrypt.hash(newPassword"),
  "The Set Password API must reject weak passwords before hashing or saving them.",
);

assert.match(preferenceRoute, /emailAvailable/);
assert.match(preferenceRoute, /Add an email address in Account Settings before choosing email notifications/);
assert.match(profilePage, /emailAvailable/);
assert.match(profilePage, /Add an email address in Settings to enable this option/);
assert.match(middleware, /pathname\.startsWith\("\/api\/auth\/password-reset\/"\)/);
assert.match(middleware, /pathname === "\/api\/parents\/signup-otp"/);

console.log("Guardian signup, OTP, reset, and notification-preference checks passed.");
