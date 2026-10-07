const assert = require("node:assert/strict");
const jiti = require("jiti")(__filename);
const { normalizeMiddleName, parseSf1Name } = jiti("../src/lib/sf1Name.ts");

const cases = [
  ["SALAZAR, ARLENE, FERANIL,", { lastName: "SALAZAR", firstName: "ARLENE", middleName: "FERANIL", suffix: null }],
  ["DELA CRUZ, ANA-MARIE, O'CONNOR", { lastName: "DELA CRUZ", firstName: "ANA-MARIE", middleName: "O'CONNOR", suffix: null }],
  ["SANTOS, JUAN,", { lastName: "SANTOS", firstName: "JUAN", middleName: null, suffix: null }],
  ["REYES, JOHN, PAUL, JR.", { lastName: "REYES", firstName: "JOHN", middleName: "PAUL", suffix: "JR." }],
];

for (const [input, expected] of cases) {
  assert.deepEqual(parseSf1Name(input), expected, input);
}
assert.equal(normalizeMiddleName("  D'ANGELO-MAE,  "), "D'ANGELO-MAE");

console.log(`SF1 name parsing cases passed: ${cases.length + 1}`);
