/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const source = fs.readFileSync(
  path.join(__dirname, "..", "src", "app", "dashboard", "adviser", "reports", "page.tsx"),
  "utf8",
);
const staffMessagesRoute = fs.readFileSync(
  path.join(__dirname, "..", "src", "app", "api", "reports", "staff-messages", "route.ts"),
  "utf8",
);

// The generic Messages panel contains both school-staff and Parent
// conversations. Parent metadata must render as a Parent and never reveal the
// Parent email in the adviser message detail header.
assert.match(source, /m\.sender === "Parent" \? <User className="w-3\.5 h-3\.5 text-white" \/> : <Shield/);
assert.match(source, /selectedAdminMsg\.sender === "Parent" \? <User className="w-5 h-5 text-white" \/> : <Shield/);
assert.match(source, /selectedAdminMsg\.sender !== "Parent" && selectedAdminMsg\.sender_email/);
assert.match(source, /const originalSenderIsParent = selectedAdminMsg\.message_sender === "Parent"/);
assert.match(source, /const replyIsParent = reply\.sender === "Parent"/);
assert.match(source, /replyIsParent \? <User className="w-4 h-4 text-white" \/> : <Shield/);

// API responses derive the other participant's role from the saved staff
// conversation rather than trusting a browser-provided role label.
assert.match(staffMessagesRoute, /if \(type === "parent"\) return "Parent"/);
assert.match(staffMessagesRoute, /sender: roleLabel\(String\(otherIsSender \? root\.sender_type : root\.recipient_type\)\)/);

console.log("adviser parent-message presentation checks passed");
