/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");

const hero = read("src/components/HeroSection.tsx");
const loginHeader = read("src/components/LoginLandingHeader.tsx");
const schoolBackground = read("src/components/SchoolBackground.tsx");

// The landing header retains the lower institutional marks but no longer
// places the school seal and name in its top navigation bar.
assert.equal((hero.match(/santiago-elementary-logo\.png/g) ?? []).length, 1);
assert.equal((hero.match(/Santiago Elementary School seal/g) ?? []).length, 1);
assert.match(hero, /sm:justify-end/);

// LoginLandingHeader is shared by every role's login pages. It must not
// render or import the removed school header brand, while retaining its nav.
assert.doesNotMatch(loginHeader, /santiago-elementary-logo\.png/);
assert.doesNotMatch(loginHeader, /Santiago Elementary School/);
assert.doesNotMatch(loginHeader, /from "next\/image"/);
assert.match(loginHeader, /LoginInstitutionLogos/);
assert.match(loginHeader, /sm:justify-end/);

// About and Contact already use PublicHeroHeader with this local asset; the
// shared login background must use it as well.
assert.match(schoolBackground, /src="\/hero-school-4\.png"/);
assert.doesNotMatch(schoolBackground, /images\.unsplash\.com/);

console.log("public header branding checks passed");
