const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const sidebars = {
  Parent: "src/app/dashboard/parent/components/Sidebar.tsx",
  Adviser: "src/app/dashboard/adviser/components/Sidebar.tsx",
  Guidance: "src/app/dashboard/guidance/components/Sidebar.tsx",
  ICT: "src/app/dashboard/ict/components/Sidebar.tsx",
  Principal: "src/app/dashboard/principal/components/Sidebar.tsx",
};

for (const [role, file] of Object.entries(sidebars)) {
  const sidebar = fs.readFileSync(path.join(root, file), "utf8");

  // Phone and tablet sidebars must use the dynamic visual viewport, scroll
  // when space is short, and keep their footer next to the navigation rather
  // than stretching a large empty region between the two.
  assert.match(sidebar, /h-dvh max-h-dvh min-h-0/, `${role} uses the dynamic viewport`);
  assert.doesNotMatch(sidebar, /h-svh|max-h-svh/, `${role} has no static viewport height`);
  assert.match(sidebar, /touch-pan-y flex-col overflow-y-auto overscroll-contain/, `${role} remains touch-scrollable`);
  assert.match(sidebar, /pt-\[max\(1rem,env\(safe-area-inset-top\)\)\]/, `${role} protects the top safe area`);
  assert.match(sidebar, /mt-3 flex shrink-0 flex-col[\s\S]*?safe-area-inset-bottom[\s\S]*?xl:mt-auto/, `${role} removes the mobile/tablet spacer`);

  // Wide desktop keeps the existing footer-at-bottom layout.
  assert.match(sidebar, /xl:mt-auto xl:pb-4/, `${role} preserves desktop footer placement`);
}

console.log("Parent, Adviser, Guidance, ICT, and Principal sidebar layout checks passed.");
