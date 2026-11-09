/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");

const userManagement = read("src/app/dashboard/ict/user-management/page.tsx");
const approvalsRoute = read("src/app/api/ict/approvals/route.ts");

// Adviser and Guidance request tables have independent identity sequences. A
// numeric ID alone is not a unique client-side approval identifier.
assert.match(userManagement, /function approvalKey\(request: Pick<ApprovalRequest, "id" \| "role">\)/);
assert.match(userManagement, /return `\$\{request\.role \?\? "adviser"\}:\$\{request\.id\}`/);
assert.match(userManagement, /requests\.find\(r => approvalKey\(r\) === selectedKey\)/);
assert.match(userManagement, /const requestKey = approvalKey\(req\);[\s\S]*?key=\{requestKey\}/);
assert.match(userManagement, /onApprove: \(request: ApprovalRequest\) => Promise<boolean>/);
assert.match(userManagement, /body: JSON\.stringify\(\{ id: req\.id, action: "approve", role: req\.role \?\? "adviser" \}\)/);
assert.match(userManagement, /setApprovals\(prev => prev\.map\(a => approvalKey\(a\) === approvalKey\(req\)/);
assert.match(userManagement, /if \(!response\.ok \|\| !result\?\.success\)[\s\S]*?return false/);
assert.match(userManagement, /The request was not updated\. It remains pending\./);

// The route must require an explicit role and update only the request in that
// role's table. Both update paths also verify an affected pending row.
assert.match(approvalsRoute, /const requestId = Number\(id\)/);
assert.match(approvalsRoute, /!\["adviser", "guidance"\]\.includes\(role\)/);
assert.match(approvalsRoute, /from\("guidance_change_requests"\)[\s\S]*?\.eq\("id", requestId\)/);
assert.match(approvalsRoute, /from\("adviser_change_requests"\)[\s\S]*?\.eq\("id", requestId\)/);
assert.equal((approvalsRoute.match(/\.select\("id"\)/g) || []).length >= 2, true);
assert.equal((approvalsRoute.match(/This request has already been reviewed\./g) || []).length >= 3, true);

console.log("ICT approval selection checks passed");
