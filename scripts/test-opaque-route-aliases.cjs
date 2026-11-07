const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const routeAliases = read("src/lib/routeAliases.ts");
const nextConfig = read("next.config.ts");
const middleware = read("src/proxy.ts");

const routeModule = { exports: {} };
vm.runInNewContext(
  ts.transpileModule(routeAliases, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText,
  { exports: routeModule.exports, module: routeModule },
);

const {
  PUBLIC_ROUTE_ALIASES,
  dashboardPath,
  internalPathnameForOpaqueRoute,
  OPAQUE_ROUTE_REWRITES,
  READABLE_ROUTE_REDIRECTS,
} = routeModule.exports;

const internalDashboards = {
  parent: "/dashboard/parent",
  adviser: "/dashboard/adviser",
  guidance: "/dashboard/guidance",
  ict: "/dashboard/ict",
  principal: "/dashboard/principal",
};

for (const [role, internalPath] of Object.entries(internalDashboards)) {
  const opaquePath = dashboardPath(role);
  assert.match(opaquePath, /^\/a\/[A-Za-z0-9]+$/, `${role} must have a stable opaque alias.`);
  assert.equal(internalPathnameForOpaqueRoute(opaquePath), internalPath, `${role} alias must serve its existing dashboard.`);
  assert.equal(
    internalPathnameForOpaqueRoute(`${opaquePath}/reports?tab=open`),
    `${internalPath}/reports?tab=open`,
    `${role} deep links must retain their suffix for refresh and browser navigation.`,
  );
  assert.ok(
    OPAQUE_ROUTE_REWRITES.some((entry) => entry.source === `${opaquePath}/:path*` && entry.destination === `${internalPath}/:path*`),
    `${role} dashboard must have an opaque rewrite.`,
  );
  assert.ok(
    READABLE_ROUTE_REDIRECTS.some((entry) => entry.source === `${internalPath}/:path*` && entry.destination === `${opaquePath}/:path*` && entry.permanent === false),
    `${role} readable dashboard path must redirect to its alias without a permanent cache.`,
  );
}

const recoveryInternalRoutes = {
  forgotPassword: "/login/guardian/forgot-password",
  verifyTemporaryPassword: "/login/guardian/verify-temp-password",
  signupOtp: "/login/guardian/send-otp",
  resetOtp: "/login/guardian/reset-password",
  resetNewPassword: "/login/guardian/reset-password/new-password",
};

for (const [key, internalPath] of Object.entries(recoveryInternalRoutes)) {
  const opaquePath = PUBLIC_ROUTE_ALIASES.parentRecovery[key];
  assert.match(opaquePath, /^\/a\/[A-Za-z0-9]+$/, `${key} must have a stable opaque alias.`);
  assert.equal(internalPathnameForOpaqueRoute(opaquePath), internalPath, `${key} alias must serve its existing recovery page.`);
  assert.ok(
    OPAQUE_ROUTE_REWRITES.some((entry) => entry.source === opaquePath && entry.destination === internalPath),
    `${key} must have an opaque rewrite.`,
  );
}

assert.doesNotMatch(routeAliases, /createHash|crypto|digest/, "Route aliases must not be irreversible hashes.");
assert.match(nextConfig, /async redirects\(\)/);
assert.match(nextConfig, /async rewrites\(\)/);
assert.match(nextConfig, /beforeFiles: OPAQUE_ROUTE_REWRITES/);
assert.match(middleware, /internalPathnameForOpaqueRoute\(req\.nextUrl\.pathname\)/);
assert.match(middleware, /dashboardPath\("parent"\)/);
assert.doesNotMatch(nextConfig, /source:\s*"\/login\/(adviser|guidance|ict|principal)"/, "Role login paths must remain readable.");

console.log("Opaque dashboard and parent recovery route alias checks passed.");
