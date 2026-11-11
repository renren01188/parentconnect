/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");

const hero = read("src/components/HeroSection.tsx");
const loginHeader = read("src/components/LoginLandingHeader.tsx");
const publicHeader = read("src/components/PublicHeroHeader.tsx");
const aboutPage = read("src/app/about/page.tsx");
const contactPage = read("src/app/contact-us/page.tsx");
const publicReportShell = read("src/components/PublicReportPageShell.tsx");
const studentReportPage = read("src/app/report/page.tsx");
const subjectTeacherReportPage = read("src/app/report/subject-teacher/page.tsx");
const schoolBackground = read("src/components/SchoolBackground.tsx");

// The landing header retains only its left-side school-seal and name group.
assert.equal((hero.match(/santiago-elementary-logo\.png/g) ?? []).length, 1);
assert.equal((hero.match(/Santiago Elementary School seal/g) ?? []).length, 1);
assert.match(hero, /flex min-w-0 items-center gap-3 rounded-md/);
assert.match(hero, /Santiago Elementary School/);
assert.match(hero, /justify-between/);
assert.doesNotMatch(hero, /deped-logo\.png/);

// LoginLandingHeader is shared by every role's login pages. It uses the same
// left-side school-seal and name group as the landing header.
assert.match(loginHeader, /santiago-elementary-logo\.png/);
assert.match(loginHeader, /Santiago Elementary School seal/);
assert.match(loginHeader, /Santiago Elementary School/);
assert.match(loginHeader, /from "next\/image"/);
assert.match(loginHeader, /flex min-w-0 items-center gap-3 rounded-md/);
assert.match(loginHeader, /justify-between/);
assert.doesNotMatch(loginHeader, /LoginInstitutionLogos/);

// About reuses the browser-tab ParentConnect icon instead of a generic School
// glyph in the introductory ParentConnect card.
assert.match(aboutPage, /from "next\/image"/);
assert.match(aboutPage, /import ParentConnectLogo from "\.\.\/icon\.png"/);
assert.match(aboutPage, /src=\{ParentConnectLogo\}/);
assert.match(aboutPage, /alt="ParentConnect logo"/);
assert.match(aboutPage, /width=\{80\}/);
assert.match(aboutPage, /height=\{80\}/);
assert.doesNotMatch(aboutPage, /bg-\[#0d2d5e\] flex items-center justify-center shadow-lg/);
assert.doesNotMatch(aboutPage, /<School\b/);
assert.match(aboutPage, /src="\/santiago-elementary-logo\.png"/);
assert.match(aboutPage, /alt="Santiago Elementary School logo"/);
assert.doesNotMatch(aboutPage, /GraduationCap/);
assert.match(aboutPage, /showInstitutionLogos=\{false\}/);
assert.match(publicHeader, /showInstitutionLogos\?: boolean/);
assert.match(publicHeader, /showInstitutionLogos = true/);
assert.match(publicHeader, /\{showInstitutionLogos \? \(/);
assert.match(contactPage, /<PublicHeroHeader[\s\S]*?showInstitutionLogos=\{false\}/);

// Report journeys use their shared public shell. Like About and Contact, it
// has no lower-right DepEd or Santiago institutional-mark group.
assert.match(studentReportPage, /<PublicReportPageShell/);
assert.match(subjectTeacherReportPage, /<PublicReportPageShell/);
assert.doesNotMatch(publicReportShell, /LoginInstitutionLogos/);
assert.doesNotMatch(publicReportShell, /deped-logo\.png/);

// About and Contact use PublicHeroHeader with this local asset; the shared
// login background must use it as well.
assert.match(schoolBackground, /src="\/hero-school-4\.png"/);
assert.doesNotMatch(schoolBackground, /images\.unsplash\.com/);

console.log("public header branding checks passed");
