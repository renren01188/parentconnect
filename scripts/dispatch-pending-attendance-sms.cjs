// Historical recovery script. It is intentionally read-only: direct provider
// dispatch cannot prove whether a previous request reached Semaphore.
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const attendanceLogArgument = process.argv.find((argument) => argument.startsWith("--attendance-log-id="));
const attendanceLogId = attendanceLogArgument?.slice("--attendance-log-id=".length);

function localEnvironment() {
  const values = {};
  for (const line of fs.readFileSync(path.join(root, ".env.local"), "utf8").split(/\r?\n/)) {
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (match) values[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
  }
  return values;
}

async function main() {
  if (process.argv.includes("--send")) {
    throw new Error("Direct SMS recovery dispatch is retired. Use the ICT Attendance Notifications queue so Semaphore is reconciled before any retry.");
  }

  const env = localEnvironment();
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("The local Supabase URL or service-role credential is not configured.");

  const filters = attendanceLogId ? `&attendance_log_id=eq.${encodeURIComponent(attendanceLogId)}` : "";
  const response = await fetch(
    `${url}/rest/v1/attendance_sms_jobs?select=attendance_log_id,status,attempts,provider,provider_message_id,provider_status,last_error,updated_at${filters}&order=updated_at.desc&limit=50`,
    { headers: { apikey: key, Authorization: `Bearer ${key}`, Accept: "application/json" } },
  );
  if (!response.ok) throw new Error(`Supabase read-only queue check failed (${response.status}).`);
  const jobs = await response.json();
  for (const job of jobs) {
    // Never print parent contact data or message content.
    console.log(JSON.stringify({
      attendanceLogId: job.attendance_log_id,
      status: job.status,
      attempts: job.attempts,
      provider: job.provider,
      providerMessageId: job.provider_message_id,
      providerStatus: job.provider_status,
      lastError: job.last_error,
      updatedAt: job.updated_at,
    }));
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "The attendance SMS queue check failed.");
  process.exitCode = 1;
});
