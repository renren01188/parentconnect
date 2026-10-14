/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");

const parentRoute = read("src/app/api/parents/me/route.ts");
const parentProfile = read("src/app/dashboard/parent/profile/page.tsx");
const adviserProfile = read("src/app/dashboard/adviser/profile/page.tsx");
const guidanceProfile = read("src/app/dashboard/guidance/profile/page.tsx");
const ictRoute = read("src/app/api/ict/me/route.ts");

const parentPatch = parentRoute.match(/export async function PATCH[\s\S]*?(?=export async function PUT)/)?.[0] || "";
assert.ok(parentPatch, "Parent profile PATCH route should exist.");

// A wrong re-authentication password is an inline form error, not a signal to
// discard a healthy parent dashboard session. Successful saves return the
// renewed cookie explicitly with the stored profile data.
assert.match(parentPatch, /message: "Current password is incorrect\."[\s\S]*?\{ status: 400 \}/);
assert.match(parentPatch, /const response = NextResponse\.json\([\s\S]*?response\.cookies\.set\("parent_token", newToken, parentSessionCookie\);/);
assert.match(parentPatch, /await publishAccountRealtimeInvalidation\(\[\{ role: "parent", id: parentId \}\]\);/);
assert.match(parentProfile, /import \{ useParentSession \} from "\.\.\/ParentSessionGate";/);
assert.match(parentProfile, /const \{ refreshSession \} = useParentSession\(\);/);
assert.match(parentProfile, /await refreshSession\(\);/);
assert.match(parentProfile, /setStep\("edit"\);[\s\S]*?if \(tab === "profile"\) setAuthErr\(message\);/);
assert.match(parentProfile, /if \(!res\.ok \|\| !data\?\.success\)/);

// Guidance requests must render a server error (including password or pending
// request errors) instead of failing silently.
assert.match(guidanceProfile, /const \[approvalError, setApprovalError\] = useState\(""\);/);
assert.match(guidanceProfile, /const \[approvalSaving, setApprovalSaving\] = useState\(false\);/);
assert.match(guidanceProfile, /if \(!res\.ok \|\| !data\?\.success\)[\s\S]*?throw new Error/);
assert.match(guidanceProfile, /setApprovalError\(error instanceof Error \? error\.message/);
assert.match(guidanceProfile, /approvalError \? <div className="error-note" role="alert">/);

// An Adviser with an existing pending request receives a clear, non-error
// state rather than a misleading failure after the request was already saved.
assert.match(adviserProfile, /if \(res\.status === 409\) \{[\s\S]*?setApprovalSent\(true\);[\s\S]*?return;/);
assert.match(adviserProfile, /if \(!res\.ok \|\| !json\?\.success\)/);

// ICT follows the same explicit-cookie pattern so direct profile edits keep
// that staff dashboard authenticated as well.
const ictPatch = ictRoute.match(/export async function PATCH[\s\S]*?(?=\n}\n?$)/)?.[0] || ictRoute;
assert.match(ictRoute, /const ictSessionCookie = \{/);
assert.match(ictPatch, /const response = NextResponse\.json\([\s\S]*?response\.cookies\.set\("ict_token", newToken, ictSessionCookie\);/);

console.log("profile save flow checks passed");
