import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

const userManagementRoute = read("src/app/api/ict/user-management/route.ts");
const userManagementPage = read("src/app/dashboard/ict/user-management/page.tsx");

assert.match(userManagementRoute, /if \(user\.role === "Adviser"\)/);
assert.match(userManagementRoute, /completedUpdateSteps\.push\("Adviser account details"\)/);
assert.match(userManagementRoute, /await publishAccountChange\(\[\{ role: "adviser", id: Number\(data\.id\) \}\]\)/);
assert.match(userManagementPage, /useSessionInvalidation\(\(event\) =>/);
assert.match(userManagementPage, /return loadData\(\{ background: true \}\)/);

console.log("ICT adviser direct-edit checks passed.");
