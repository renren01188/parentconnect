const fs = require('fs');
const path = require('path');
const { tables: sharedTables } = require('../../Images/Parent/render-parent-erd');

const sources = [
  '06-ict-operations-full-schema.dbml',
  '../Adviser/03e-adviser-student-administration-and-deletion-requests-full-schema.dbml',
  '../Guidance/05b-guidance-profile-messages-and-incoming-announcements-full-schema.dbml',
];
const blocks = new Map();
for (const source of sources) {
  const text = fs.readFileSync(path.resolve(__dirname, source), 'utf8');
  for (const match of text.matchAll(/^Table ([A-Za-z0-9_]+) \{[\s\S]*?^\}/gm)) blocks.set(match[1], match[0]);
}

const pages = [
  {
    file: '06a-ict-user-management-and-approvals-full-schema.dbml',
    slug: 'ict_user_management_and_approvals',
    title: 'User Management and Approvals',
    scope: 'ICT-managed staff and account profiles, employee-ID registry, assignment changes, and adviser-transfer approvals.',
    tables: ['ict_admins', 'staff_employee_ids', 'advisers', 'guidance_counselors', 'principals', 'parents', 'students', 'adviser_change_requests', 'guidance_change_requests', 'adviser_assignment_history', 'scheduled_adviser_transfers', 'school_year_config'],
    refs: [
      'Ref: guidance_change_requests.guidance_id > guidance_counselors.id',
      'Ref: guidance_change_requests.reviewed_by_ict_id > ict_admins.id',
      'Ref: adviser_assignment_history.adviser_id > advisers.id',
      'Ref: adviser_assignment_history.request_id > adviser_change_requests.id',
      'Ref: scheduled_adviser_transfers.outgoing_adviser_id > advisers.id',
      'Ref: scheduled_adviser_transfers.incoming_adviser_id > advisers.id',
      'Ref: scheduled_adviser_transfers.requested_by_ict_id > ict_admins.id',
      'Ref: scheduled_adviser_transfers.cancelled_by_ict_id > ict_admins.id',
    ],
    logicalRefs: [
      'Ref: adviser_change_requests.adviser_id > advisers.id',
      'Ref: adviser_change_requests.reviewed_by_ict_id > ict_admins.id',
      'Ref: adviser_assignment_history.approved_by_ict_id > ict_admins.id',
    ],
  },
  {
    file: '06b-ict-deletion-workflow-full-schema.dbml',
    slug: 'ict_deletion_workflow',
    title: 'Deletion Workflow',
    scope: 'Scheduled deletion approvals, requested and targeted accounts, and deletion-notice email jobs.',
    tables: ['ict_admins', 'scheduled_deletions', 'scheduled_deletion_requesters', 'scheduled_deletion_targets', 'deletion_email_jobs', 'deletion_email_job_items', 'parents', 'students', 'advisers'],
    refs: [
      'Ref: scheduled_deletions.approved_by_ict_id > ict_admins.id',
      'Ref: scheduled_deletion_requesters.scheduled_deletion_id > scheduled_deletions.id',
      'Ref: scheduled_deletion_requesters.adviser_id > advisers.id',
      'Ref: scheduled_deletion_requesters.ict_admin_id > ict_admins.id',
      'Ref: scheduled_deletion_targets.scheduled_deletion_id > scheduled_deletions.id',
      'Ref: scheduled_deletion_targets.student_id > students.id',
      'Ref: scheduled_deletion_targets.parent_id > parents.id',
      'Ref: scheduled_deletion_targets.adviser_id > advisers.id',
      'Ref: scheduled_deletion_targets.ict_admin_id > ict_admins.id',
      'Ref: deletion_email_job_items.deletion_email_job_id > deletion_email_jobs.id',
      'Ref: deletion_email_job_items.scheduled_deletion_id > scheduled_deletions.id',
    ],
  },
  {
    file: '06c-ict-attendance-notifications-and-delivery-full-schema.dbml',
    slug: 'ict_attendance_notifications_and_delivery',
    title: 'Attendance Notifications and Delivery',
    scope: 'ICT attendance-notification configuration, attendance events, email/SMS jobs, and SMS provider events.',
    tables: ['ict_admins', 'attendance_notification_settings', 'attendance_logs', 'class_sessions', 'students', 'parents', 'attendance_email_jobs', 'attendance_sms_jobs', 'attendance_sms_provider_events', 'attendance_sms_dispatch_leases'],
    refs: [
      'Ref: attendance_notification_settings.updated_by_ict_id > ict_admins.id',
      'Ref: attendance_logs.student_db_id > students.id',
      'Ref: attendance_logs.class_session_id > class_sessions.id',
      'Ref: attendance_email_jobs.parent_id > parents.id',
      'Ref: attendance_email_jobs.attendance_log_id > attendance_logs.id',
      'Ref: attendance_sms_jobs.parent_id > parents.id',
      'Ref: attendance_sms_jobs.attendance_log_id > attendance_logs.id',
      'Ref: attendance_sms_provider_events.attendance_sms_job_id > attendance_sms_jobs.id',
    ],
  },
  {
    file: '06d-ict-announcements-notifications-and-audit-full-schema.dbml',
    slug: 'ict_announcements_notifications_and_audit',
    title: 'Announcements, Notifications, and Audit',
    scope: 'ICT announcements, staff-message threads, notification read state, Principal announcements, and audit records.',
    tables: ['ict_admins', 'ict_announcements', 'ict_notification_reads', 'staff_messages', 'audit_log', 'principals', 'principal_announcements'],
    refs: [
      'Ref: ict_notification_reads.ict_id > ict_admins.id',
      'Ref: staff_messages.source_message_id > staff_messages.id',
    ],
    logicalRefs: [
      'Ref: ict_announcements.sender_id > ict_admins.id',
      'Ref: staff_messages.sender_id > ict_admins.id',
      'Ref: staff_messages.recipient_id > ict_admins.id',
      'Ref: principal_announcements.sender_id > principals.id',
    ],
  },
];

function line(field) {
  const values = [];
  if (field.pk) values.push('pk');
  if (field.unique) values.push('unique');
  if (!field.nullable) values.push('not null');
  return `  ${field.name} ${field.type}${values.length ? ` [${values.join(', ')}]` : ''}`;
}
function block(name) {
  if (blocks.has(name)) return blocks.get(name);
  const table = sharedTables[name];
  if (!table) throw new Error(`Unknown table: ${name}`);
  return `Table ${name} {\n${table.fields.map(line).join('\n')}\n}`;
}
function make(page) {
  const logical = page.logicalRefs?.length ? `\n\n// Application-level logical references (not database constraints).\n${page.logicalRefs.join('\n')}` : '';
  return [`// ParentConnect — ICT role — ${page.title}`, '// Focused DBML diagram for dbdiagram.io.', '', `Project ${page.slug} {`, "  database_type: 'PostgreSQL'", `  Note: '${page.scope}'`, '}', '', ...page.tables.map(block), '', '// Live Supabase foreign-key constraints.', ...page.refs].join('\n\n') + logical + '\n';
}
for (const page of pages) {
  fs.writeFileSync(path.join(__dirname, page.file), make(page));
  console.log(`Generated ${page.file}`);
}
