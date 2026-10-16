const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

const timeout = read("src/components/IdleSessionTimeout.tsx");
assert.match(timeout, /const IDLE_TIMEOUT_MS = 30 \* 60 \* 1000/);
assert.match(timeout, /"keydown"/);
assert.match(timeout, /"pointerdown"/);
assert.match(timeout, /"pointermove"/);
assert.match(timeout, /"scroll"/);
assert.match(timeout, /"touchstart"/);
assert.match(timeout, /BroadcastChannel/);
assert.match(timeout, /window\.location\.replace\(loginPath\)/);
assert.match(timeout, /method: "POST"/);
assert.match(timeout, /keepalive: true/);

const layouts = [
  ["src/app/dashboard/parent/layout.tsx", "parent", "/api/auth/logout", "/login/guardian"],
  ["src/app/dashboard/adviser/layout.tsx", "adviser", "/api/auth/adviser/logout", "/login/adviser"],
  ["src/app/dashboard/guidance/layout.tsx", "guidance", "/api/auth/guidance/logout", "/login/guidance"],
  ["src/app/dashboard/principal/layout.tsx", "principal", "/api/auth/principal/logout", "/login/principal"],
  ["src/app/dashboard/ict/layout.tsx", "ict", "/api/auth/ict/logout", "/login/ict"],
];

for (const [file, role, endpoint, loginPath] of layouts) {
  const source = read(file);
  assert.match(source, /IdleSessionTimeout/, `${role} layout must mount the shared inactivity guard.`);
  assert.match(
    source,
    new RegExp(`<IdleSessionTimeout role="${role}" logoutEndpoint="${endpoint.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}" loginPath="${loginPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`),
    `${role} must use its own existing logout endpoint and login route.`,
  );
}

console.log("Dashboard inactivity timeout checks passed.");
