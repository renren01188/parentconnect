/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");

const route = read("src/app/api/principal/me/route.ts");
const profilePage = read("src/app/dashboard/principal/profile/page.tsx");
const patchRoute = route.match(/export async function PATCH[\s\S]*?(?=export async function PUT)/)?.[0] || "";

assert.ok(patchRoute, "Principal profile PATCH route should exist.");

// Profile saves verify with the same production-only secret as sign-in, and
// only a genuinely stale session returns 401. A wrong current password stays
// in the settings modal instead of being interpreted as a dashboard logout.
assert.match(route, /import \{ getJwtSecret \} from "@\/lib\/authSecret";/);
assert.match(route, /const SECRET = getJwtSecret\(\);/);
assert.match(
  patchRoute,
  /message: "Current password is incorrect\."[\s\S]*?\{ status: 400 \}/,
);
assert.match(
  patchRoute,
  /message: "Session expired\. Please log in again\."[\s\S]*?\{ status: 401 \}/,
);

// Editing contact information must not rotate auth_version: the browser's
// active token remains valid while refreshed identity claims are sent back.
assert.doesNotMatch(patchRoute, /auth_version:\s*authVersion/);
assert.match(patchRoute, /authVersion: session\.payload\.authVersion/);
assert.match(
  patchRoute,
  /response\.cookies\.set\("principal_token", newToken, dashboardSessionCookieOptions\);/,
);

// The modal immediately renders the saved principal returned by the API and
// displays a save failure inline, preserving the account page and session.
assert.match(profilePage, /const res = await fetch\("\/api\/principal\/me", \{[\s\S]*?method: "PATCH"/);
assert.match(profilePage, /setProfile\(\(prev\) => \(\{[\s\S]*?firstName: data\.principal\.firstName/);
assert.match(profilePage, /if \(tab === "profile"\) setPAuthErr\(message\);/);
assert.match(profilePage, /if \(res\.status === 401\) \{[\s\S]*?router\.push\("\/login\/principal"\);/);

// Reloads fetch the stored account fields from the same endpoint rather than
// relying on stale modal state.
assert.match(profilePage, /async function loadProfile\(\)[\s\S]*?fetch\("\/api\/principal\/me", \{ cache: "no-store" \}\)/);
assert.match(route, /principal:\s*\{[\s\S]*?firstName: data\.first_name[\s\S]*?email: data\.email[\s\S]*?phone: data\.phone/);

console.log("principal profile update checks passed");
