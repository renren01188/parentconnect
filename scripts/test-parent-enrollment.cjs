/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const jiti = require("jiti")(__filename);
const { sameFamilyName, sameFamilySuffix, sameParentEnrollmentName } = jiti("../src/lib/familyName.ts");
const { isPreSignupParentRecord } = jiti("../src/lib/parentRegistrationState.ts");
const {
  createTemporaryPassword,
  isTemporaryPasswordExpired,
  PARENT_TEMPORARY_PASSWORD_TTL_SECONDS,
  temporaryPasswordExpiryEpochSeconds,
} = jiti("../src/lib/parentTemporaryPassword.ts");
const {
  guardianRelationshipForStorage,
  isMissingOtherGuardianRelationship,
  sameGuardianRelationship,
  splitGuardianRelationship,
} = jiti("../src/lib/guardianRelationship.ts");

// ICT can correct a pre-sign-up registration without inventing account data;
// a real parent account keeps the existing account-validation path.
assert.equal(isPreSignupParentRecord([]), true);
assert.equal(isPreSignupParentRecord(undefined), true);
assert.equal(isPreSignupParentRecord([60]), false);
// A legacy manual-registration placeholder has an ID but no completed
// password setup, so ICT must still edit it as a pre-sign-up SF1 record.
assert.equal(isPreSignupParentRecord([60], false), true);
assert.equal(isPreSignupParentRecord([60], 0), true);
assert.equal(isPreSignupParentRecord([60], true), false);
assert.equal(isPreSignupParentRecord([60], 1), false);
// A family row or imported school email is not a real Parent-account link.
assert.equal(isPreSignupParentRecord(["family-record"]), true);

// Parent enrolment intentionally treats whitespace/case variants as the same
// adult while rejecting partial or different-name matches.
assert.equal(
  sameFamilyName(
    { firstName: "  maria   luisa ", middleName: " Dela   Cruz ", lastName: " SANTOS " },
    { firstName: "MARIA LUiSA", middleName: "dela cruz", lastName: "santos" },
  ),
  true,
);
assert.equal(
  sameFamilyName(
    { firstName: "Maria", middleName: "Luisa", lastName: "Santos" },
    { firstName: "Maria", middleName: "", lastName: "Santos" },
  ),
  false,
);
assert.equal(sameFamilySuffix("Jr.", " jr "), true);
assert.equal(sameFamilySuffix("", null), true);
assert.equal(sameFamilySuffix("Jr.", "Sr."), false);

// Regression for LRN 107966200218: the stored Father record is ALVIN
// PANGANIBAN OBAR. Parent enrollment deliberately ignores the optional
// middle name and suffix, while still requiring the complete first and last
// name after case/space normalization.
assert.equal(
  sameParentEnrollmentName(
    { firstName: "ALVIN", middleName: "", lastName: "OBAR" },
    { firstName: " alvin ", middleName: " panganiban ", lastName: " obar " },
  ),
  true,
);
assert.equal(
  sameParentEnrollmentName(
    { firstName: "ALVIN", middleName: "PANGINIBAN", lastName: "OBAR" },
    { firstName: "ALVIN", middleName: "PANGANIBAN", lastName: "OBAR" },
  ),
  true,
);
assert.equal(
  sameParentEnrollmentName(
    { firstName: "ALVIN", middleName: "", lastName: "OBARR" },
    { firstName: "ALVIN", middleName: "PANGANIBAN", lastName: "OBAR" },
  ),
  false,
);

// A custom guardian type stays in the existing SF1 relationship column. It
// reopens as Others + its detail, and is compared without case/space noise.
assert.deepEqual(splitGuardianRelationship("  Aunt  "), { selection: "Other", other: "Aunt" });
assert.equal(guardianRelationshipForStorage("Other", "  Foster   parent "), "Foster parent");
assert.equal(guardianRelationshipForStorage("Grandparent", "ignored"), "Grandparent");
assert.equal(isMissingOtherGuardianRelationship("Other", ""), true);
assert.equal(isMissingOtherGuardianRelationship("Guardian", ""), false);
assert.equal(sameGuardianRelationship("Foster   Parent", " foster parent "), true);
assert.equal(sameGuardianRelationship("Aunt", "Uncle"), false);
assert.equal(
  sameFamilyName(
    { firstName: "Maria", middleName: "Luisa", lastName: "Santos" },
    { firstName: "Maria", middleName: "Luisa", lastName: "Santoso" },
  ),
  false,
);

// Temporary Parent credentials have a server-verifiable, ten-minute expiry.
// Invalid/legacy formats must never become a permanent-password session.
const pendingCredential = createTemporaryPassword(0);
assert.equal(temporaryPasswordExpiryEpochSeconds(pendingCredential.password), PARENT_TEMPORARY_PASSWORD_TTL_SECONDS);
assert.equal(isTemporaryPasswordExpired(pendingCredential.password, (PARENT_TEMPORARY_PASSWORD_TTL_SECONDS * 1_000) - 1), false);
assert.equal(isTemporaryPasswordExpired(pendingCredential.password, PARENT_TEMPORARY_PASSWORD_TTL_SECONDS * 1_000), true);
assert.equal(isTemporaryPasswordExpired("PC-12345678", 0), true);

// This is the sibling-link rule used after a successful sign-up: role and
// normalized first/last name must both match. Section/adviser are deliberately
// not part of the comparison, optional middle names are ignored, while a
// different role or first/last name is never linked.
const importedFamilyRecords = [
  { lrn: "108432210217", role: "Mother", firstName: "GRENETH", middleName: "MANUEL", lastName: "BERNARDO" },
  { lrn: "107966200047", role: "Mother", firstName: " greneth ", middleName: "", lastName: "bernardo" },
  { lrn: "107966200047", role: "Father", firstName: "JEFFREY YBANEZ", middleName: "", lastName: "CAMOGAO" },
  { lrn: "999999999999", role: "Mother", firstName: "GRENETH", middleName: "MANUEL", lastName: "BERNARDO-SANTOS" },
];
const mother = { firstName: "Greneth", middleName: "", lastName: "Bernardo" };
const linkedLrns = importedFamilyRecords
  .filter((record) => record.role === "Mother")
  .filter((record) => sameParentEnrollmentName(mother, record))
  .map((record) => record.lrn)
  .sort();

assert.deepEqual(linkedLrns, ["107966200047", "108432210217"]);

console.log("parent enrollment name, temporary-password expiry, pending-registration, and sibling-link checks passed.");
