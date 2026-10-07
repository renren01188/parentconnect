const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const migration = fs.readFileSync(
  path.join(root, "database", "20261005_login_attempt_lockout_cycles.sql"),
  "utf8",
);
const baseSchema = fs.readFileSync(
  path.join(root, "database", "login_attempt_protection.sql"),
  "utf8",
);
const hook = fs.readFileSync(path.join(root, "src", "hooks", "useLoginProtection.ts"), "utf8");

const ROLES = ["adviser", "guidance", "ict", "principal"];
const MINUTE = 60_000;

/**
 * Isolated model of the database-time portions of record/get/clear RPCs.
 * It intentionally takes only a server timestamp: browser timestamps never
 * participate in a lockout decision.
 */
class MockServerLoginGuard {
  constructor() {
    this.failedAttempts = 0;
    this.lockoutLevel = 0;
    this.lockedUntil = null;
  }

  normalizeExpiredLock(serverNow) {
    if (this.lockedUntil !== null && this.lockedUntil <= serverNow) {
      this.failedAttempts = 0;
      this.lockedUntil = null;
    }
  }

  status(serverNow) {
    this.normalizeExpiredLock(serverNow);
    return this.snapshot(serverNow);
  }

  fail(serverNow) {
    this.normalizeExpiredLock(serverNow);
    if (this.lockedUntil !== null && this.lockedUntil > serverNow) {
      return this.snapshot(serverNow);
    }

    this.failedAttempts += 1;
    if (this.failedAttempts >= 5) {
      this.lockoutLevel = this.lockoutLevel >= 1 ? 2 : 1;
      this.lockedUntil = serverNow + this.lockoutLevel * 10 * MINUTE;
    }
    return this.snapshot(serverNow);
  }

  success() {
    this.failedAttempts = 0;
    this.lockoutLevel = 0;
    this.lockedUntil = null;
    return this.snapshot(0);
  }

  snapshot(serverNow) {
    return {
      failedAttempts: this.failedAttempts,
      lockoutLevel: this.lockoutLevel,
      lockedUntil: this.lockedUntil,
      locked: this.lockedUntil !== null && this.lockedUntil > serverNow,
      captchaRequired: this.failedAttempts >= 3,
    };
  }
}

function failBatch(guard, firstServerTime) {
  let result;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    result = guard.fail(firstServerTime + attempt);
  }
  return { result, fifthFailureAt: firstServerTime + 4 };
}

for (const role of ROLES) {
  const guard = new MockServerLoginGuard();
  const start = Date.UTC(2026, 9, 5, 1, 0, 0);

  const initial = failBatch(guard, start);
  assert.equal(initial.result.failedAttempts, 5, `${role}: fifth initial failure must be counted`);
  assert.equal(initial.result.lockoutLevel, 1, `${role}: first lock must be level one`);
  assert.equal(
    initial.result.lockedUntil,
    initial.fifthFailureAt + 10 * MINUTE,
    `${role}: first lock must last exactly 10 minutes from the fifth failure`,
  );

  const whileInitiallyLocked = guard.fail(initial.result.lockedUntil - 1);
  assert.equal(whileInitiallyLocked.failedAttempts, 5, `${role}: failures during a lock must not increment its counter`);
  assert.equal(whileInitiallyLocked.lockedUntil, initial.result.lockedUntil, `${role}: failures during a lock must not extend it`);

  const afterInitial = guard.status(initial.result.lockedUntil);
  assert.deepEqual(
    afterInitial,
    { failedAttempts: 0, lockoutLevel: 1, lockedUntil: null, locked: false, captchaRequired: false },
    `${role}: the initial lock expiry must reset the batch counter and CAPTCHA threshold`,
  );

  const second = failBatch(guard, initial.result.lockedUntil + 1);
  assert.equal(second.result.failedAttempts, 5, `${role}: five fresh failures must be counted after the first lock`);
  assert.equal(second.result.lockoutLevel, 2, `${role}: the second batch must enter the recurring lockout level`);
  assert.equal(
    second.result.lockedUntil,
    second.fifthFailureAt + 20 * MINUTE,
    `${role}: second lock must be exactly 20 minutes from its fifth failure, not added to the first lock`,
  );

  const afterSecond = guard.status(second.result.lockedUntil);
  assert.deepEqual(
    afterSecond,
    { failedAttempts: 0, lockoutLevel: 2, lockedUntil: null, locked: false, captchaRequired: false },
    `${role}: every expired 20-minute lock must start another clean batch`,
  );

  const recurring = failBatch(guard, second.result.lockedUntil + 1);
  assert.equal(recurring.result.lockoutLevel, 2, `${role}: later lockouts must not escalate beyond 20 minutes`);
  assert.equal(
    recurring.result.lockedUntil,
    recurring.fifthFailureAt + 20 * MINUTE,
    `${role}: each later completed batch must lock for 20 minutes`,
  );

  guard.status(recurring.result.lockedUntil);
  guard.fail(recurring.result.lockedUntil + 1);
  guard.fail(recurring.result.lockedUntil + 2);
  assert.equal(guard.status(recurring.result.lockedUntil + 2).failedAttempts, 2, `${role}: pre-success failures must be retained`);
  assert.deepEqual(
    guard.success(),
    { failedAttempts: 0, lockoutLevel: 0, lockedUntil: null, locked: false, captchaRequired: false },
    `${role}: a verified successful login must clear all guard state`,
  );
  const afterSuccess = failBatch(guard, recurring.result.lockedUntil + 3);
  assert.equal(afterSuccess.result.lockoutLevel, 1, `${role}: a new threshold after success must restart at lockout level one`);
  assert.equal(
    afterSuccess.result.lockedUntil,
    afterSuccess.fifthFailureAt + 10 * MINUTE,
    `${role}: a new threshold after success must restart with the default 10-minute lock`,
  );
}

for (const role of ROLES) {
  const route = fs.readFileSync(path.join(root, "src", "app", "api", "auth", role, "login", "route.ts"), "utf8");
  assert.match(route, new RegExp(`checkLoginProtection\\("${role}", guardSubject, req, captchaToken\\)`), `${role}: route must run the shared pre-login protection check`);
  assert.match(route, new RegExp(`failedLoginResult\\("${role}", guardSubject, req\\)`), `${role}: invalid credentials must use the shared guarded counter`);
  assert.match(route, new RegExp(`clearLoginFailures\\("${role}", guardSubject, req\\)`), `${role}: verified logins must clear the shared guard`);
  assert.ok(route.indexOf("checkLoginProtection") < route.indexOf("bcrypt.compare"), `${role}: lock/CAPTCHA check must precede password verification`);
}

for (const sql of [baseSchema, migration]) {
  assert.match(sql, /account_guard\.failed_attempts := 0;[\s\S]*?account_guard\.locked_until := NULL;/, "account lock expiry must clear its attempt counter");
  assert.match(sql, /ip_guard\.failed_attempts := 0;[\s\S]*?ip_guard\.locked_until := NULL;/, "IP lock expiry must clear its attempt counter");
  assert.match(sql, /CASE WHEN COALESCE\(account_guard\.lockout_level, 0\) >= 1 THEN 2 ELSE 1 END/, "account cycles must cap recurring lockouts at 20 minutes");
  assert.match(sql, /CASE WHEN COALESCE\(ip_guard\.lockout_level, 0\) >= 1 THEN 2 ELSE 1 END/, "IP cycles must cap recurring lockouts at 20 minutes");
  assert.match(sql, /locked_until <= now\(\)/, "expiry must be evaluated with database time");
  assert.match(sql, /pg_advisory_xact_lock/, "counter updates must remain transactionally serialized");
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.clear_login_attempt_guard_v2/, "successful-login reset must be part of the shared RPC contract");
  assert.match(sql, /SET failed_attempts = 0,[\s\S]*?lockout_level = 0,[\s\S]*?locked_until = NULL,[\s\S]*?last_failed_at = NULL/, "successful login must clear attempts, lock, escalation, and failure timestamp");
}

assert.match(migration, /UPDATE public\.login_attempt_guards[\s\S]*?failed_attempts = 0/, "status checks must persist an expired-lock reset for refreshes");
assert.match(hook, /void loadStatus\(new AbortController\(\)\.signal\)/, "the login form must re-read server guard state when its presentation countdown ends");
assert.match(hook, /cache: "no-store"/, "login protection status must not use a cached client result");

console.log("Login lockout cycle checks passed for Adviser, Guidance, ICT, and Principal.");
