/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");

const signup = read("src/app/api/parents/signup/route.ts");
const signupOtp = read("src/app/api/parents/signup-otp/route.ts");
const verifyTemporaryPassword = read("src/app/api/parents/verify-temp-password/route.ts");
const archivedIdentifierMigration = read("supabase/migrations/20261106100000_allow_archived_parent_identifier_reuse.sql");
const otp = read("src/lib/parentVerificationOtp.ts");
const guardianPage = read("src/app/login/guardian/page.tsx");
const forgotPasswordPage = read("src/app/login/guardian/forgot-password/page.tsx");
const adviserStudentRoute = read("src/app/api/students/[id]/route.ts");
const adviserStudentPage = read("src/app/dashboard/adviser/students/[id]/page.tsx");
const setPassword = read("src/app/api/auth/set-password/route.ts");
const parentProfileRoute = read("src/app/api/parents/me/route.ts");

// Normal signup verifies the claimed family role and offers email or SMS
// verification without creating a direct-import-only Parent account.
assert.match(signup, /verifyGoogleRecaptcha/);
assert.match(signup, /\.in\("role", \["Father", "Mother", "Guardian"\]\)/);
assert.match(signup, /RECORDED_CONTACT_NUMBER_MISMATCH_MESSAGE/);
assert.match(signup, /The contact number does not match the number recorded by the Adviser\./);
assert.match(signup, /return !normalizedRecorded \|\| normalizedRecorded === claimed/);
assert.match(signup, /return recordedContactNumberMismatch\(req\)/);
assert.match(signup, /const verificationMethod = email \? "email" : "sms"/);
assert.match(signup, /verificationMethod: "sms"/);
assert.match(signup, /redirectTo: "\/login\/guardian\/send-otp"/);
assert.match(signup, /\.eq\("email", email\)[\s\S]*?\.eq\("archive_status", "active"\)/);
assert.match(signup, /\.eq\("login_contact_number", contactNumber\)[\s\S]*?\.eq\("archive_status", "active"\)/);
assert.match(guardianPage, /fetch\("\/api\/parents\/signup"/);
assert.match(guardianPage, /relationship: "Father"/);
assert.match(guardianPage, /GUARDIAN_RELATIONSHIP_OPTIONS/);
assert.match(guardianPage, /Use the 11-digit number recorded by the Adviser\./);
assert.match(guardianPage, /If no contact number is recorded in the school file/);

// An Adviser can correct the optional school verification contact before a
// Parent account exists. It is stored with every applicable family role and
// is therefore the exact number the normal guardian signup checks.
assert.match(adviserStudentRoute, /function normalizeRecordedContactNumber/);
assert.match(adviserStudentRoute, /recordedContactNumber/);
assert.match(adviserStudentRoute, /The recorded contact number must be exactly 11 digits\./);
assert.match(adviserStudentRoute, /normalizedRecordedContactNumber !== undefined/);
assert.match(adviserStudentPage, /Recorded Contact Number/);
assert.match(adviserStudentPage, /Leave blank when SF1 has no number/);
assert.match(adviserStudentPage, /const hasCompletedParentSignup = parentAccountLinked/);
assert.match(adviserStudentPage, /!hasCompletedParentSignup && \(/);
assert.match(adviserStudentPage, /!hasCompletedParentSignup && \(\s*<Field label="Recorded Contact Number"/);
assert.match(adviserStudentRoute, /login_contact_number: normalizedAccountContactNumber/);
assert.match(parentProfileRoute, /login_contact_number: normalizedPhone/);
assert.match(parentProfileRoute, /synchronizeParentContactForActiveStudents/);

// Phone signup uses the durable OTP table with bounded, one-time verification
// before the account receives its normal temporary-password session.
assert.match(signupOtp, /issueParentOtp\(/);
assert.match(signupOtp, /message: "ParentConnect verification code: \{otp\}/);
assert.match(signupOtp, /semaphoreRoute: "otp"/);
assert.match(signupOtp, /semaphoreOtpCode: issued\.otp/);
assert.match(otp, /from\("parent_verification_otps"\)/);
assert.match(verifyTemporaryPassword, /verifyParentOtp\(signup\.otpChallengeId, "signup", otp\)/);
assert.match(verifyTemporaryPassword, /redirectTo: "\/login\/guardian\/set-password"/);
assert.match(verifyTemporaryPassword, /matchesRecordedPhone\(familyMember\.contact_number, signup\.contactNumber\)/);
assert.match(verifyTemporaryPassword, /contact_number: signup\.contactNumber/);
assert.match(verifyTemporaryPassword, /login_contact_number: signup\.contactNumber/);
assert.match(verifyTemporaryPassword, /\.eq\("email", signup\.email\)[\s\S]*?\.eq\("archive_status", "active"\)/);
assert.match(verifyTemporaryPassword, /\.eq\("login_contact_number", signup\.contactNumber\)[\s\S]*?\.eq\("archive_status", "active"\)/);
assert.match(setPassword, /login_contact_number: loginContactNumber/);

// Archived accounts retain their history but no longer reserve an email or
// mobile identifier that a verified guardian needs for a new active student.
assert.match(archivedIdentifierMigration, /DROP INDEX IF EXISTS public\.parents_email_normalized_unique_idx/);
assert.match(archivedIdentifierMigration, /DROP INDEX IF EXISTS public\.parents_login_contact_number_unique/);
assert.match(archivedIdentifierMigration, /CREATE UNIQUE INDEX IF NOT EXISTS parents_active_email_normalized_unique_idx/);
assert.match(archivedIdentifierMigration, /CREATE UNIQUE INDEX IF NOT EXISTS parents_active_login_contact_number_unique_idx/);
assert.match(archivedIdentifierMigration, /archive_status = 'active'/);

// Password recovery remains available from the normal guardian entry point.
assert.match(forgotPasswordPage, /Forgot password\?/);

console.log("Normal Parent enrollment and SMS OTP checks passed.");
