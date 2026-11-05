const fs = require('fs');
const path = require('path');
const { tables: sharedTables } = require('../../Images/Parent/render-parent-erd');

const extraBlocks = {
  attendance_notification_settings: `Table attendance_notification_settings {
  id bool [pk, not null]
  sms_enabled bool [not null]
  email_enabled bool [not null]
  sms_low_credit_threshold int4 [not null]
  sms_credit_balance int4
  sms_credits_checked_at timestamptz
  sms_credits_check_error text
  updated_by_ict_id int8
  created_at timestamptz [not null]
  updated_at timestamptz [not null]
}`,
  attendance_sms_dispatch_leases: `Table attendance_sms_dispatch_leases {
  lease_name text [pk, not null]
  owner_token uuid
  locked_until timestamptz [not null]
  updated_at timestamptz [not null]
}`,
  attendance_sms_provider_events: `Table attendance_sms_provider_events {
  id uuid [pk, not null]
  attendance_sms_job_id uuid [not null]
  idempotency_key text [not null]
  event_type text [not null]
  provider text
  provider_message_id text
  provider_status text
  detail jsonb
  created_at timestamptz [not null]
}`,
  audit_log: `Table audit_log {
  id int8 [pk, not null]
  action text [not null]
  target_user text [not null]
  target_role text [not null]
  target_email text [not null]
  performed_by text [not null]
  details text
  changes jsonb
  created_at timestamptz [not null]
  ip_address text
  browser text
  module text
  performed_by_role text
  performed_by_id text
  performed_by_email text
  target_type text [not null]
  target_id text
  previous_status text
  new_status text
  related_report_id text
  related_ticket_id text
  related_student_id text
  related_user_id text
  metadata jsonb
}`,
  deletion_email_job_items: `Table deletion_email_job_items {
  deletion_email_job_id uuid [pk, not null]
  scheduled_deletion_id int8 [pk, not null]
  created_at timestamptz [not null]
}`,
  deletion_email_jobs: `Table deletion_email_jobs {
  id uuid [pk, not null]
  batch_id uuid [not null]
  recipient_email text [not null]
  recipient_email_normalized text
  recipient_name text [not null]
  target_names text[] [not null]
  scheduled_deletion_ids int8[] [not null]
  reason text [not null]
  delete_after timestamptz [not null]
  status text [not null]
  attempts int4 [not null]
  available_at timestamptz [not null]
  locked_at timestamptz
  sent_at timestamptz
  last_error text
  created_at timestamptz [not null]
  updated_at timestamptz [not null]
}`,
  ict_notification_reads: `Table ict_notification_reads {
  id int8 [pk, not null]
  ict_id int8 [not null]
  notif_key text [not null]
  created_at timestamptz
}`,
  scheduled_deletion_requesters: `Table scheduled_deletion_requesters {
  scheduled_deletion_id int8 [pk, not null]
  adviser_id int8
  ict_admin_id int8
  created_at timestamptz [not null]
}`,
  scheduled_deletion_targets: `Table scheduled_deletion_targets {
  scheduled_deletion_id int8 [pk, not null]
  student_id int8
  parent_id int8
  adviser_id int8
  ict_admin_id int8
  created_at timestamptz [not null]
}`,
  staff_employee_ids: `Table staff_employee_ids {
  employee_id_key text [pk, not null]
  employee_id text [not null]
  account_role text [not null]
  account_id int8 [not null]
  created_at timestamptz [not null]
  updated_at timestamptz [not null]
}`,
};

const names = ['ict_admins', 'ict_announcements', 'attendance_email_jobs', 'attendance_sms_jobs', 'attendance_notification_settings', 'attendance_sms_provider_events', 'attendance_sms_dispatch_leases', 'audit_log', 'deletion_email_jobs', 'deletion_email_job_items', 'ict_notification_reads', 'scheduled_deletions', 'scheduled_deletion_requesters', 'scheduled_deletion_targets', 'staff_employee_ids'];

function fieldLine(field) {
  const settings = [];
  if (field.pk) settings.push('pk');
  if (field.unique) settings.push('unique');
  if (!field.nullable) settings.push('not null');
  return `  ${field.name} ${field.type}${settings.length ? ` [${settings.join(', ')}]` : ''}`;
}
function block(name) {
  if (extraBlocks[name]) return extraBlocks[name];
  const table = sharedTables[name];
  if (!table) throw new Error(`Unknown table: ${name}`);
  return `Table ${name} {\n${table.fields.map(fieldLine).join('\n')}\n}`;
}
const refs = [
  'Ref: attendance_notification_settings.updated_by_ict_id > ict_admins.id',
  'Ref: attendance_sms_provider_events.attendance_sms_job_id > attendance_sms_jobs.id',
  'Ref: ict_notification_reads.ict_id > ict_admins.id',
  'Ref: scheduled_deletions.approved_by_ict_id > ict_admins.id',
  'Ref: scheduled_deletion_requesters.scheduled_deletion_id > scheduled_deletions.id',
  'Ref: scheduled_deletion_requesters.ict_admin_id > ict_admins.id',
  'Ref: scheduled_deletion_targets.scheduled_deletion_id > scheduled_deletions.id',
  'Ref: scheduled_deletion_targets.ict_admin_id > ict_admins.id',
  'Ref: deletion_email_job_items.deletion_email_job_id > deletion_email_jobs.id',
  'Ref: deletion_email_job_items.scheduled_deletion_id > scheduled_deletions.id',
];
const logicalRefs = [
  'Ref: ict_announcements.sender_id > ict_admins.id',
];
const dbml = [
  '// ParentConnect — ICT role — ICT Operations',
  '// dbdiagram free-plan master: 15 core ICT operations tables.',
  '// Refs above the application-level heading are live Supabase foreign-key constraints.',
  '',
  'Project ict_operations {',
  "  database_type: 'PostgreSQL'",
  "  Note: 'ICT account, audit trail, announcement delivery, attendance notification settings, SMS dispatch, deletion jobs, deletion targets, and staff employee-ID registry.'",
  '}', '',
  ...names.map(block), '',
  '// Live Supabase foreign-key constraints.', ...refs, '',
  '// Application-level logical references (not database constraints).', ...logicalRefs, '',
].join('\n\n');
fs.writeFileSync(path.join(__dirname, '06-ict-operations-full-schema.dbml'), dbml);
console.log('Generated 06-ict-operations-full-schema.dbml');
