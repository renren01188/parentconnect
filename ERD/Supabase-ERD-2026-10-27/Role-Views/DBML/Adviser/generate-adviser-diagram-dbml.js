const fs = require('fs');
const path = require('path');
const { tables: sharedTables } = require('../../Images/Parent/render-parent-erd');

// These Adviser-only table blocks were read from the live Supabase schema on 2026-10-28.
const extraBlocks = {
  adviser_assignment_history: `Table adviser_assignment_history {
  id int8 [pk, not null]
  adviser_id int4 [not null]
  request_id int8
  previous_grade text
  previous_sections text[] [not null]
  new_grade text
  new_sections text[] [not null]
  approved_by_ict_id int4
  effective_at timestamptz [not null]
}`,
  adviser_change_requests: `Table adviser_change_requests {
  id int8 [pk, not null]
  adviser_id int4 [not null]
  adviser_name text [not null]
  adviser_email text [not null]
  adviser_initials text [not null]
  class_grade text [not null]
  status text [not null]
  changes jsonb [not null]
  note text
  reviewed_at timestamptz
  review_note text
  created_at timestamptz [not null]
  reviewed_by_ict_id int4
}`,
  adviser_notification_reads: `Table adviser_notification_reads {
  id int8 [pk, not null]
  adviser_id int8 [not null]
  notif_key text [not null]
  read_at timestamptz
}`,
  adviser_principal_messages: `Table adviser_principal_messages {
  id int8 [pk, not null]
  adviser_id int8 [not null]
  adviser_name text [not null]
  adviser_email text
  principal_id int8 [not null]
  subject text [not null]
  categories text[] [not null]
  body text [not null]
  status text [not null]
  created_at timestamptz [not null]
  updated_at timestamptz [not null]
  source_staff_message_id int8
  attachments jsonb [not null]
}`,
  excuse_letters: `Table excuse_letters {
  id int4 [pk, not null]
  student_id text [not null]
  parent_id int4
  date_from date [not null]
  date_to date [not null]
  message text [not null]
  status text [not null]
  decline_reason text
  submitted_at timestamptz [not null]
  file_name text
  file_data text
  file_type text
  attachment_uploaded_at timestamptz
  submitted_by_role text [not null]
  submitted_by_id int8
}`,
  principal_staff_messages: `Table principal_staff_messages {
  id int8 [pk, not null]
  principal_id int8 [not null]
  principal_name text [not null]
  recipient_type text [not null]
  recipient_id int8 [not null]
  recipient_name text [not null]
  recipient_email text
  subject text [not null]
  categories text[] [not null]
  body text [not null]
  status text [not null]
  created_at timestamptz [not null]
  updated_at timestamptz [not null]
  attachments jsonb [not null]
  source_adviser_message_id int8
  idempotency_key uuid [unique]
}`,
  principals: `Table principals {
  id int8 [pk, not null]
  employee_id text [unique, not null]
  first_name text [not null]
  middle_name text
  last_name text [not null]
  suffix text
  email text [not null]
  phone text [not null]
  status text [not null]
  is_active bool [unique, not null]
  password_hash text [not null]
  password_set bool [not null]
  auth_version uuid [not null]
  effective_date date
  succession_reason text
  created_at timestamptz [not null]
  updated_at timestamptz [not null]
  archived_at timestamptz
  archived_by text
  archive_reason text
  archive_status text [not null]
  archive_previous_status text
  principal_attendance_summary_guide_completed_at timestamptz
  principal_reports_guide_completed_at timestamptz
}`,
  scheduled_adviser_transfers: `Table scheduled_adviser_transfers {
  id int8 [pk, not null]
  outgoing_adviser_id int4 [not null]
  incoming_adviser_id int4 [not null]
  grade text [not null]
  section text [not null]
  effective_at timestamptz [not null]
  note text
  status text [not null]
  failure_reason text
  requested_by_ict_id int4
  created_at timestamptz [not null]
  completed_at timestamptz
  cancelled_at timestamptz
  cancelled_by_ict_id int4
  release_incoming_assignment bool [not null]
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
  student_remarks: `Table student_remarks {
  id int8 [pk, not null]
  student_db_id int4 [not null]
  remark_type text [not null]
  effectivity_date date [not null]
  note text [not null]
  school_name text
  created_by_adviser_id int4
  created_at timestamptz [not null]
  updated_at timestamptz [not null]
}`,
  student_reports: `Table student_reports {
  id int8 [pk, not null]
  student_db_id int8
  student_id text [not null]
  student_name text [not null]
  grade text [not null]
  section text [not null]
  adviser_id int8 [not null]
  parent_email text
  parent_name text
  contact text
  category text [not null]
  title text [not null]
  description text [not null]
  status text [not null]
  notified_parent bool [not null]
  created_at timestamptz [not null]
  updated_at timestamptz [not null]
  report_date_manila date [not null]
}`,
};

const pages = [
  {
    file: '03a-adviser-operations-full-schema.dbml',
    slug: 'adviser_operations',
    title: 'Adviser Operations',
    scope: 'Assigned learners, class placement, attendance, absence requests, family context, student remarks, and school-year settings.',
    tables: ['advisers', 'students', 'parents', 'parent_student_links', 'student_family_members', 'sections', 'class_sessions', 'attendance_logs', 'excuse_letters', 'student_remarks', 'school_year_config'],
    refs: [
      'Ref: parents.student_id > students.student_id',
      'Ref: parent_student_links.parent_id > parents.id',
      'Ref: parent_student_links.student_id > students.student_id',
      'Ref: student_family_members.student_db_id > students.id',
      'Ref: attendance_logs.student_db_id > students.id',
      'Ref: attendance_logs.class_session_id > class_sessions.id',
      'Ref: excuse_letters.student_id > students.student_id',
      'Ref: student_remarks.student_db_id > students.id',
      'Ref: student_remarks.created_by_adviser_id > advisers.id',
    ],
    note: 'The live students-to-sections relationship uses the composite key (section, grade) → (name, grade). dbdiagram does not support importing composite references, so it is documented here rather than emitted as a Ref.',
  },
  {
    file: '03a2-adviser-attendance-delivery-jobs-full-schema.dbml',
    slug: 'adviser_attendance_delivery_jobs',
    title: 'Attendance Delivery Jobs',
    scope: 'Attendance events and the email/SMS notification jobs that deliver parent-facing alerts.',
    tables: ['attendance_logs', 'parents', 'attendance_email_jobs', 'attendance_sms_jobs'],
    refs: [
      'Ref: attendance_email_jobs.parent_id > parents.id',
      'Ref: attendance_email_jobs.attendance_log_id > attendance_logs.id',
      'Ref: attendance_sms_jobs.parent_id > parents.id',
      'Ref: attendance_sms_jobs.attendance_log_id > attendance_logs.id',
    ],
  },
  {
    file: '03b-adviser-messages-announcements-and-profile-full-schema.dbml',
    slug: 'adviser_messages_announcements_and_profile',
    title: 'Messages, Announcements, and Profile',
    scope: 'Adviser account, announcement reads, staff messages, and adviser-principal correspondence.',
    tables: ['advisers', 'adviser_notification_reads', 'staff_messages', 'adviser_announcements', 'adviser_principal_messages', 'principals', 'principal_staff_messages'],
    refs: [
      'Ref: adviser_notification_reads.adviser_id > advisers.id',
      'Ref: adviser_announcements.adviser_id > advisers.id',
      'Ref: staff_messages.source_message_id > staff_messages.id',
      'Ref: adviser_principal_messages.principal_id > principals.id',
      'Ref: adviser_principal_messages.source_staff_message_id > principal_staff_messages.id',
    ],
    logicalRefs: [
      'Ref: adviser_principal_messages.adviser_id > advisers.id',
      'Ref: principal_staff_messages.source_adviser_message_id > adviser_principal_messages.id',
    ],
  },
  {
    file: '03c-adviser-reports-conversations-and-guidance-full-schema.dbml',
    slug: 'adviser_reports_conversations_and_guidance',
    title: 'Reports, Conversations, and Guidance',
    scope: 'Parent reports, adviser conversations, guidance escalation, and adviser-created student reports.',
    tables: ['advisers', 'students', 'parents', 'parent_student_links', 'parent_adviser_reports', 'parent_adviser_report_messages', 'parent_report_guidance_tickets', 'guidance_counselors', 'student_reports'],
    refs: [
      'Ref: parent_adviser_report_messages.report_id > parent_adviser_reports.id',
      'Ref: parent_report_guidance_tickets.adviser_id > advisers.id',
      'Ref: student_reports.adviser_id > advisers.id',
    ],
    logicalRefs: [
      'Ref: parent_adviser_reports.parent_id > parents.id',
      'Ref: parent_adviser_reports.adviser_id > advisers.id',
      'Ref: parent_adviser_reports.student_id > students.student_id',
      'Ref: parent_report_guidance_tickets.report_id - parent_adviser_reports.id',
      'Ref: parent_report_guidance_tickets.parent_id > parents.id',
      'Ref: parent_report_guidance_tickets.student_id > students.student_id',
      'Ref: parent_report_guidance_tickets.assigned_guidance_id > guidance_counselors.id',
      'Ref: student_reports.student_id > students.student_id',
    ],
  },
  {
    file: '03d-adviser-announcements-and-parent-delivery-full-schema.dbml',
    slug: 'adviser_announcements_and_parent_delivery',
    title: 'Announcements and Parent Delivery',
    scope: 'Adviser-authored announcements and their delivery to linked parent and student notification records.',
    tables: ['advisers', 'adviser_announcements', 'parents', 'students', 'parent_student_links', 'parent_announcement_notifications'],
    refs: [
      'Ref: adviser_announcements.adviser_id > advisers.id',
      'Ref: parent_student_links.parent_id > parents.id',
      'Ref: parent_student_links.student_id > students.student_id',
      'Ref: parent_announcement_notifications.parent_id > parents.id',
      'Ref: parent_announcement_notifications.student_id > students.student_id',
    ],
    logicalRefs: [
      'Ref: parent_announcement_notifications.announcement_id > adviser_announcements.id',
    ],
    note: 'announcement_id is polymorphic; the source column determines the originating announcement table.',
  },
  {
    file: '03e-adviser-student-administration-and-deletion-requests-full-schema.dbml',
    slug: 'adviser_student_administration_and_deletion_requests',
    title: 'Student Administration and Deletion Requests',
    scope: 'Adviser assignment changes, scheduled adviser transfers, and requested deletion workflows.',
    tables: ['advisers', 'students', 'parents', 'adviser_change_requests', 'adviser_assignment_history', 'scheduled_adviser_transfers', 'scheduled_deletions', 'scheduled_deletion_requesters', 'scheduled_deletion_targets', 'ict_admins'],
    refs: [
      'Ref: adviser_assignment_history.adviser_id > advisers.id',
      'Ref: adviser_assignment_history.request_id > adviser_change_requests.id',
      'Ref: scheduled_adviser_transfers.outgoing_adviser_id > advisers.id',
      'Ref: scheduled_adviser_transfers.incoming_adviser_id > advisers.id',
      'Ref: scheduled_adviser_transfers.requested_by_ict_id > ict_admins.id',
      'Ref: scheduled_adviser_transfers.cancelled_by_ict_id > ict_admins.id',
      'Ref: scheduled_deletions.approved_by_ict_id > ict_admins.id',
      'Ref: scheduled_deletion_requesters.scheduled_deletion_id > scheduled_deletions.id',
      'Ref: scheduled_deletion_requesters.adviser_id > advisers.id',
      'Ref: scheduled_deletion_requesters.ict_admin_id > ict_admins.id',
      'Ref: scheduled_deletion_targets.scheduled_deletion_id > scheduled_deletions.id',
      'Ref: scheduled_deletion_targets.student_id > students.id',
      'Ref: scheduled_deletion_targets.parent_id > parents.id',
      'Ref: scheduled_deletion_targets.adviser_id > advisers.id',
      'Ref: scheduled_deletion_targets.ict_admin_id > ict_admins.id',
    ],
    logicalRefs: [
      'Ref: adviser_change_requests.adviser_id > advisers.id',
      'Ref: adviser_assignment_history.approved_by_ict_id > ict_admins.id',
    ],
  },
];

function fieldLine(field) {
  const settings = [];
  if (field.pk) settings.push('pk');
  if (field.unique) settings.push('unique');
  if (!field.nullable) settings.push('not null');
  return `  ${field.name} ${field.type}${settings.length ? ` [${settings.join(', ')}]` : ''}`;
}

function tableBlock(name) {
  if (extraBlocks[name]) return extraBlocks[name];
  const table = sharedTables[name];
  if (!table) throw new Error(`Unknown table: ${name}`);
  return `Table ${name} {\n${table.fields.map(fieldLine).join('\n')}\n}`;
}

function dbml(page) {
  const header = [
    `// ParentConnect — Adviser role — ${page.title}`,
    '// This is one focused DBML diagram. It is not the complete application schema.',
    '// Unlabelled Refs are live Supabase foreign-key constraints. Refs under the application-level heading are documented ID links without a database constraint.',
    '',
    `Project ${page.slug} {`,
    "  database_type: 'PostgreSQL'",
    `  Note: '${page.scope}${page.note ? ` ${page.note}` : ''}'`,
    '}',
    '',
  ].join('\n');
  const logical = page.logicalRefs?.length
    ? `\n\n// Application-level logical references (not database constraints).\n${page.logicalRefs.join('\n')}`
    : '';
  return `${header}${page.tables.map(tableBlock).join('\n\n')}\n\n// Live Supabase foreign-key constraints.\n${page.refs.join('\n')}${logical}\n`;
}

for (const page of pages) {
  fs.writeFileSync(path.join(__dirname, page.file), dbml(page));
  console.log(`Generated ${page.file}`);
}
