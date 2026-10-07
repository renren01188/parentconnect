const assert = require("node:assert/strict");

function matchesSearchQuery(query, values) {
  const tokens = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return true;
  return values.some((value) => {
    const searchableValue = String(value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
    return tokens.every((token) => searchableValue.includes(token));
  });
}

const users = [
  { id: "adviser-1", role: "Adviser", name: "Adviser One", email: "adviser@example.test" },
  { id: "ict-1", role: "ICT", name: "ICT One", email: "ict@example.test" },
  { id: "parent-1", role: "Parent", name: "Parent One", email: "parent1@example.test", students: ["Student One"] },
  { id: "parent-2", role: "Parent", name: "Parent Two", email: "parent2@example.test", students: ["Student Two"] },
  { id: "parent-3", role: "Parent", name: "Parent Three", email: "parent3@example.test", students: ["Student Three"] },
  // This account would normally be on the second page with five rows/page.
  { id: "parent-4", role: "Parent", name: "Unrelated Parent", email: "parent4@example.test", students: ["Maria Louise Santos"] },
];

function searchParents(query) {
  return users.filter((user) => user.role === "Parent" && matchesSearchQuery(query, [
    user.name,
    user.email,
    ...(user.students ?? []),
  ]));
}

assert.deepEqual(searchParents("mArIa").map((user) => user.id), ["parent-4"]);
assert.deepEqual(searchParents("lou san").map((user) => user.id), ["parent-4"]);
assert.deepEqual(searchParents("santo").map((user) => user.id), ["parent-4"]);
assert.deepEqual(searchParents("student two").map((user) => user.id), ["parent-2"]);
assert.deepEqual(searchParents("adviser").map((user) => user.id), []);
assert.deepEqual(searchParents("maria").slice(0, 5).map((user) => user.id), ["parent-4"]);

console.log("ICT user search checks passed.");
