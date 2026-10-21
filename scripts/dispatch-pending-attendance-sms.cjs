const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const args = new Set(process.argv.slice(2));
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

function dateLabel(value) {
  const [year, month, day] = String(value).split("-").map(Number);
  const months = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];
  if (!year || !months[month - 1] || !day) throw new Error("The pending attendance job has an invalid date.");
  return `${months[month - 1]} ${day}, ${year}`;
}

function timeLabel(value) {
  const [hourText, minuteText] = String(value).split(":");
  const hour = Number(hourText);
  const minute = Number(minuteText);
  if (!Number.isInteger(hour) || hour < 0 || hour > 23 || !Number.isInteger(minute) || minute < 0 || minute > 59) {
    throw new Error("The pending attendance job has an invalid time.");
  }
  return `${hour % 12 || 12}:${String(minute).padStart(2, "0")} ${hour >= 12 ? "PM" : "AM"}`;
}

function messageFor({ type, date, time, student }) {
  const name = [student.first_name, student.middle_name, student.last_name, student.suffix]
    .map((part) => String(part ?? "").trim())
    .filter(Boolean)
    .join(" ");
  if (!name) throw new Error("The pending attendance job has no student name.");
  const on = dateLabel(date);
  const at = timeLabel(time);
  if (type === "Time In") {
    return `PConnect: Good Morning! ${name} scanned their RFID tag upon entering the classroom on ${on}, at ${at}.`;
  }
  if (type === "Time Out") {
    return `PConnect: Good Afternoon! ${name} scanned their RFID tag upon leaving the classroom on ${on}, at ${at}.`;
  }
  throw new Error("Only Time In and Time Out attendance jobs can be dispatched.");
}

async function request(url, key, resource, init = {}) {
  const response = await fetch(`${url}/rest/v1/${resource}`, {
    ...init,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      ...(init.headers ?? {}),
    },
  });
  if (!response.ok) throw new Error(`Supabase request failed (${response.status}).`);
  return response.status === 204 ? null : response.json();
}

async function failJob(url, key, jobId, reason) {
  await request(url, key, `attendance_sms_jobs?id=eq.${encodeURIComponent(jobId)}&status=eq.processing`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify({
      status: "failed",
      locked_at: null,
      last_error: reason,
    }),
  });
}

async function main() {
  if (!args.has("--send") || !attendanceLogId) {
    throw new Error("Refusing to send. Use --attendance-log-id=<id> and --send.");
  }

  const env = localEnvironment();
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
  const semaphoreKey = env.SEMAPHORE_API_KEY;
  if (!url || !serviceKey || !semaphoreKey) throw new Error("Required server configuration is unavailable.");
  if ((env.SMS_PROVIDER || "semaphore").trim().toLowerCase() !== "semaphore") {
    throw new Error("The configured SMS provider is not Semaphore.");
  }
  const semaphoreRoute = env.SEMAPHORE_ATTENDANCE_ROUTE?.trim().toLowerCase() === "priority"
    ? "priority"
    : "regular";

  const jobs = await request(
    url,
    serviceKey,
    `attendance_sms_jobs?select=id,attendance_log_id,recipient_phone,attempts&attendance_log_id=eq.${encodeURIComponent(attendanceLogId)}&status=eq.pending&limit=2`,
  );
  if (!Array.isArray(jobs) || jobs.length !== 1) {
    throw new Error("A single pending attendance SMS job was not found for that attendance log.");
  }
  const job = jobs[0];
  if (!job.recipient_phone) throw new Error("The pending attendance SMS job has no recipient phone number.");

  const logs = await request(
    url,
    serviceKey,
    `attendance_logs?select=type,attendance_date,time_logged,student_db_id&id=eq.${encodeURIComponent(job.attendance_log_id)}&limit=1`,
  );
  if (!Array.isArray(logs) || logs.length !== 1) throw new Error("The attendance record was not found.");
  const log = logs[0];
  const students = await request(
    url,
    serviceKey,
    `students?select=first_name,middle_name,last_name,suffix&id=eq.${encodeURIComponent(log.student_db_id)}&limit=1`,
  );
  if (!Array.isArray(students) || students.length !== 1) throw new Error("The student record was not found.");
  const message = messageFor({ type: log.type, date: log.attendance_date, time: log.time_logged, student: students[0] });

  const claimed = await request(
    url,
    serviceKey,
    `attendance_sms_jobs?id=eq.${encodeURIComponent(job.id)}&status=eq.pending&select=id`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Prefer: "return=representation" },
      body: JSON.stringify({
        message,
        status: "processing",
        locked_at: new Date().toISOString(),
        last_error: null,
      }),
    },
  );
  if (!Array.isArray(claimed) || claimed.length !== 1) throw new Error("The pending attendance SMS job could not be claimed.");

  let response;
  try {
    const form = new URLSearchParams({ apikey: semaphoreKey, number: String(job.recipient_phone), message });
    if (env.SEMAPHORE_SENDER_NAME) form.set("sendername", env.SEMAPHORE_SENDER_NAME);
    response = await fetch(`https://api.semaphore.co/api/v4/${semaphoreRoute === "priority" ? "priority" : "messages"}`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form,
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    await failJob(url, serviceKey, job.id, "SMS provider outcome is unknown after the recovery dispatch.");
    throw new Error("The provider request did not complete. The job was marked failed to prevent a duplicate SMS.");
  }

  const raw = await response.text();
  let providerBody = null;
  try { providerBody = raw ? JSON.parse(raw) : null; } catch { /* Do not log provider responses. */ }
  const first = Array.isArray(providerBody) ? providerBody[0] : providerBody;
  const providerStatus = String(first?.status ?? "accepted");
  if (!response.ok || /fail|reject|invalid|error/i.test(providerStatus)) {
    await failJob(url, serviceKey, job.id, "Semaphore rejected the recovery dispatch.");
    throw new Error(`Semaphore rejected the SMS request (${response.status}).`);
  }

  await request(url, serviceKey, `attendance_sms_jobs?id=eq.${encodeURIComponent(job.id)}&status=eq.processing`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify({
      status: "sent",
      attempts: Number(job.attempts || 0) + 1,
      provider: "semaphore",
      provider_message_id: String(first?.message_id ?? first?.id ?? "") || null,
      provider_status: providerStatus,
      provider_response: {
        provider_status: providerStatus,
        provider_message_id: String(first?.message_id ?? first?.id ?? "") || null,
        provider_route: semaphoreRoute,
      },
      sent_at: new Date().toISOString(),
      locked_at: null,
      last_error: null,
    }),
  });
  console.log("Semaphore accepted one pending attendance SMS and the queue status is now sent.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "The attendance SMS recovery dispatch failed.");
  process.exitCode = 1;
});
