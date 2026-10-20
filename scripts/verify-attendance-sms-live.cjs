const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");

function localEnvironment() {
  const values = {};
  for (const line of fs.readFileSync(path.join(root, ".env.local"), "utf8").split(/\r?\n/)) {
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (match) values[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
  }
  return values;
}

function expectedMessageType(message, attendanceType) {
  if (typeof message !== "string") return "other";
  const isTimeIn = attendanceType === "Time In";
  const expected = isTimeIn
    ? /^PConnect: Good Morning! .+ scanned their RFID tag upon entering the classroom on .+, at .+\.$/
    : /^PConnect: Good Afternoon! .+ scanned their RFID tag upon leaving the classroom on .+, at .+\.$/;
  return expected.test(message) ? "current" : /^PConnect:\s*Your child,/i.test(message) ? "legacy" : "other";
}

async function query(url, key, resource, allowMissing = false) {
  const response = await fetch(`${url}/rest/v1/${resource}`, {
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      Accept: "application/json",
    },
  });
  if (allowMissing && response.status === 404) return null;
  if (!response.ok) throw new Error(`Supabase read-only queue check failed (${response.status}).`);
  return response.json();
}

async function main() {
  const env = localEnvironment();
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("The local Supabase URL or service-role credential is not configured.");

  // Select only operational fields. Message text is evaluated locally and is
  // never printed, avoiding exposure of family data in CI or terminal logs.
  const jobResource = "?select=attendance_log_id,status,message&order=created_at.desc&limit=50";
  const jobTable = "attendance_sms_jobs";
  const jobs = await query(
    url,
    key,
    `${jobTable}${jobResource}`,
    true,
  );
  if (!jobs) {
    throw new Error("The deployed Supabase API does not expose attendance_sms_jobs.");
  }
  const ids = [...new Set(jobs.map((job) => job.attendance_log_id).filter(Number.isFinite))];
  const logs = ids.length === 0
    ? []
    : await query(url, key, `attendance_logs?select=id,type&id=in.(${ids.join(",")})`);
  const types = new Map(logs.map((log) => [Number(log.id), log.type]));

  const totals = { current: 0, legacy: 0, other: 0, timeIn: 0, timeOut: 0, sent: 0, pending: 0 };
  for (const job of jobs) {
    const type = types.get(Number(job.attendance_log_id));
    if (type === "Time In") totals.timeIn += 1;
    if (type === "Time Out") totals.timeOut += 1;
    if (job.status === "sent") totals.sent += 1;
    if (job.status === "pending") totals.pending += 1;
    totals[expectedMessageType(job.message, type)] += 1;
  }

  console.log(`Checked ${jobs.length} recent attendance SMS jobs in ${jobTable}: ${totals.current} current, ${totals.legacy} legacy, ${totals.other} other; ${totals.timeIn} Time In, ${totals.timeOut} Time Out; ${totals.sent} sent, ${totals.pending} pending.`);
  if (totals.legacy > 0) process.exitCode = 2;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "The read-only attendance SMS queue check failed.");
  process.exitCode = 1;
});
