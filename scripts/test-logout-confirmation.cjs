const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const projectRoot = path.resolve(__dirname, "..");
const read = (...parts) => fs.readFileSync(path.join(projectRoot, ...parts), "utf8");

const logoutButton = read("src", "components", "LogoutButton.tsx");
const logoutModal = read("src", "components", "LogoutConfirmationModal.tsx");
const { performLogout } = require(path.join(projectRoot, "src", "lib", "logoutAction.js"));

// Opening the visible logout button only opens the modal. The sole logout
// operation lives in confirmLogout, which the modal's Confirm button receives.
assert.match(logoutButton, /const \[confirmOpen, setConfirmOpen\] = useState\(false\);/);
assert.match(logoutButton, /onClick=\{\(\) => setConfirmOpen\(true\)\}/);
assert.match(logoutButton, /onConfirm=\{confirmLogout\}/);
assert.match(logoutButton, /onCancel=\{\(\) => setConfirmOpen\(false\)\}/);
assert.match(logoutButton, /async function confirmLogout\(\)[\s\S]*?await performLogout\(\{ logoutEndpoint, redirectTo, redirectMethod, router \}\);/);
assert.doesNotMatch(logoutButton, /window\.confirm/);

// Cancel is deliberately local UI state, while the dialog retains the
// established application confirmation-modal design and accessible controls.
assert.match(logoutModal, /role="dialog"/);
assert.match(logoutModal, /aria-modal="true"/);
assert.match(logoutModal, />\s*Cancel\s*</);
assert.match(logoutModal, /onClick=\{onConfirm\}/);
assert.match(logoutModal, /saving \? "Logging out\.\.\." : "Confirm"/);
assert.doesNotMatch(logoutModal, /window\.confirm/);

const roles = [
  {
    name: "Parent",
    file: ["src", "app", "dashboard", "parent", "components", "Sidebar.tsx"],
    endpoint: "/api/auth/logout",
    redirect: "/login/guardian",
    extra: /redirectMethod="replace"/,
  },
  {
    name: "Adviser",
    file: ["src", "app", "dashboard", "adviser", "components", "Sidebar.tsx"],
    endpoint: "/api/auth/adviser/logout",
    redirect: "/login/adviser",
  },
  {
    name: "ICT",
    file: ["src", "app", "dashboard", "ict", "components", "Sidebar.tsx"],
    endpoint: "/api/auth/ict/logout",
    redirect: "/login/ict",
  },
  {
    name: "Guidance",
    file: ["src", "app", "dashboard", "guidance", "components", "Sidebar.tsx"],
    endpoint: "/api/auth/guidance/logout",
    redirect: "/",
  },
  {
    name: "Principal",
    file: ["src", "app", "dashboard", "principal", "components", "Sidebar.tsx"],
    endpoint: "/api/auth/principal/logout",
    redirect: "/login/principal",
  },
];

for (const role of roles) {
  const sidebar = read(...role.file);
  assert.match(sidebar, /import LogoutButton from "@\/components\/LogoutButton"/);
  assert.match(
    sidebar,
    new RegExp(`<LogoutButton\\s+logoutEndpoint="${role.endpoint.replaceAll("/", "\\/")}"\\s+redirectTo="${role.redirect.replaceAll("/", "\\/")}"`, "s"),
    `${role.name} should provide its existing logout endpoint and redirect`,
  );
  assert.doesNotMatch(sidebar, /window\.confirm/);
  assert.equal((sidebar.match(/fetch\(.*logout/g) ?? []).length, 0, `${role.name} delegates logout until confirmation`);
  if (role.extra) assert.match(sidebar, role.extra);
}

async function verifyLogoutOperation(role) {
  const fetchCalls = [];
  const navigation = [];
  const router = {
    push: (href) => navigation.push(["push", href]),
    refresh: () => navigation.push(["refresh"]),
  };

  await performLogout({
    logoutEndpoint: role.endpoint,
    redirectTo: role.redirect,
    redirectMethod: role.extra ? "replace" : "push",
    router,
    fetcher: async (endpoint, init) => fetchCalls.push([endpoint, init]),
    replace: (href) => navigation.push(["replace", href]),
  });

  assert.deepEqual(fetchCalls, [[role.endpoint, { method: "POST" }]], `${role.name} Confirm should call its logout endpoint`);
  assert.deepEqual(
    navigation,
    role.extra ? [["replace", role.redirect]] : [["push", role.redirect], ["refresh"]],
    `${role.name} Confirm should preserve its redirect flow`,
  );
}

Promise.all(roles.map(verifyLogoutOperation))
  .then(() => console.log("Logout confirmation behavior is wired for Parent, Adviser, ICT, Guidance, and Principal."))
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
