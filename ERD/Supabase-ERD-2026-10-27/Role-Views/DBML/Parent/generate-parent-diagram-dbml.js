const fs = require('fs');
const path = require('path');
const { tables } = require('../../Images/Parent/render-parent-erd');

const extraBlocks = {
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
};

const pages = [
  {
    file: '04a-parent-operations-full-schema.dbml',
    slug: 'parent_operations',
    title: 'Parent Operations',
    scope: 'Parent account, linked learners, attendance history, absence requests, household contacts, notification read state, and school-year settings.',
    note: 'The live students-to-sections relationship uses the composite key (section, grade) to (name, grade). dbdiagram does not support importing composite references, so it is documented here rather than emitted as a Ref.',
    tables: ['parents', 'students', 'parent_student_links', 'student_family_members', 'sections', 'class_sessions', 'attendance_logs', 'excuse_letters', 'parent_attendance_notification_reads', 'school_year_config'],
    refs: [
      ['parents.student_id', '>', 'students.student_id'],
      ['parent_student_links.parent_id', '>', 'parents.id'],
      ['parent_student_links.student_id', '>', 'students.student_id'],
      ['student_family_members.student_db_id', '>', 'students.id'],
      ['attendance_logs.student_db_id', '>', 'students.id'],
      ['attendance_logs.class_session_id', '>', 'class_sessions.id'],
      ['excuse_letters.student_id', '>', 'students.student_id'],
      ['parent_attendance_notification_reads.parent_id', '>', 'parents.id'],
      ['parent_attendance_notification_reads.attendance_log_id', '>', 'attendance_logs.id'],
    ],
  },
  {
    file: '04a-parent-identity-and-linked-learners-full-schema.dbml',
    slug: 'parent_identity_and_linked_learners',
    title: 'Identity and Linked Learners',
    scope: 'Guardian account, linked learner records, household contacts, and class placement.',
    tables: ['students', 'parents', 'sections', 'parent_student_links', 'student_family_members'],
    refs: [
      ['parents.student_id', '>', 'students.student_id'],
      ['students.section', '>', 'sections.name'],
      ['parent_student_links.parent_id', '>', 'parents.id'],
      ['parent_student_links.student_id', '>', 'students.student_id'],
      ['student_family_members.student_db_id', '>', 'students.id'],
    ],
  },
  {
    file: '04b-parent-attendance-history-and-read-state-full-schema.dbml',
    slug: 'parent_attendance_history_and_read_state',
    title: 'Attendance History and Read State',
    scope: 'Linked learner attendance, session context, guardian read receipts, and active school-year settings.',
    tables: ['students', 'parents', 'attendance_logs', 'class_sessions', 'parent_student_links', 'parent_attendance_notification_reads', 'school_year_config'],
    refs: [
      ['parent_student_links.parent_id', '>', 'parents.id'],
      ['parent_student_links.student_id', '>', 'students.student_id'],
      ['attendance_logs.student_db_id', '>', 'students.id'],
      ['attendance_logs.class_session_id', '>', 'class_sessions.id'],
      ['parent_attendance_notification_reads.parent_id', '>', 'parents.id'],
      ['parent_attendance_notification_reads.attendance_log_id', '>', 'attendance_logs.id'],
    ],
  },
  {
    file: '04c-parent-attendance-alert-delivery-full-schema.dbml',
    slug: 'parent_attendance_alert_delivery',
    title: 'Attendance Alert Delivery',
    scope: 'Email and SMS delivery jobs generated from learner attendance events and guardian notification preferences.',
    tables: ['parents', 'attendance_logs', 'attendance_email_jobs', 'attendance_sms_jobs'],
    refs: [
      ['attendance_email_jobs.parent_id', '>', 'parents.id'],
      ['attendance_email_jobs.attendance_log_id', '>', 'attendance_logs.id'],
      ['attendance_sms_jobs.parent_id', '>', 'parents.id'],
      ['attendance_sms_jobs.attendance_log_id', '>', 'attendance_logs.id'],
    ],
  },
  {
    file: '04d-parent-reports-conversations-and-guidance-full-schema.dbml',
    slug: 'parent_reports_conversations_and_guidance',
    title: 'Reports, Conversations, and Guidance',
    scope: 'Parent-submitted concerns, adviser conversation threads, and the guidance escalation workflow.',
    tables: ['parents', 'parent_adviser_reports', 'advisers', 'students', 'parent_adviser_report_messages', 'parent_report_guidance_tickets', 'guidance_counselors'],
    refs: [
      ['parent_adviser_reports.parent_id', '>', 'parents.id'],
      ['parent_adviser_reports.adviser_id', '>', 'advisers.id'],
      ['parent_adviser_reports.student_id', '>', 'students.student_id'],
      ['parent_adviser_report_messages.report_id', '>', 'parent_adviser_reports.id'],
      ['parent_report_guidance_tickets.report_id', '-', 'parent_adviser_reports.id'],
      ['parent_report_guidance_tickets.parent_id', '>', 'parents.id'],
      ['parent_report_guidance_tickets.adviser_id', '>', 'advisers.id'],
      ['parent_report_guidance_tickets.assigned_guidance_id', '>', 'guidance_counselors.id'],
    ],
  },
  {
    file: '04e-parent-notifications-and-announcement-delivery-full-schema.dbml',
    slug: 'parent_notifications_and_announcement_delivery',
    title: 'Notifications and Announcement Delivery',
    scope: 'Guardian notification inbox, targeted announcements, and staff-originated direct messages.',
    tables: ['parents', 'parent_announcement_notifications', 'students', 'staff_messages', 'adviser_announcements', 'guidance_announcements', 'principal_announcements', 'ict_announcements'],
    refs: [
      ['parent_announcement_notifications.parent_id', '>', 'parents.id'],
      ['parent_announcement_notifications.student_id', '>', 'students.student_id'],
      ['staff_messages.recipient_id', '>', 'parents.id'],
      ['parent_announcement_notifications.announcement_id', '>', 'adviser_announcements.id'],
      ['parent_announcement_notifications.announcement_id', '>', 'guidance_announcements.id'],
      ['parent_announcement_notifications.announcement_id', '>', 'principal_announcements.id'],
      ['parent_announcement_notifications.announcement_id', '>', 'ict_announcements.id'],
    ],
    note: 'announcement_id is polymorphic: source determines which of the four announcement tables supplies the record.',
  },
  {
    file: '04f-parent-deletion-notices-and-account-state-full-schema.dbml',
    slug: 'parent_deletion_notices_and_account_state',
    title: 'Deletion Notices and Account State',
    scope: 'Parent-facing scheduled-deletion notices and the ICT approval record that controls the lifecycle.',
    tables: ['parents', 'scheduled_deletions', 'ict_admins', 'parent_deletion_notifications'],
    refs: [
      ['parent_deletion_notifications.parent_id', '>', 'parents.id'],
      ['parent_deletion_notifications.scheduled_deletion_id', '>', 'scheduled_deletions.id'],
      ['scheduled_deletions.approved_by_ict_id', '>', 'ict_admins.id'],
    ],
  },
  {
    file: '04g-parent-verification-recovery-and-login-protection-full-schema.dbml',
    slug: 'parent_verification_recovery_and_login_protection',
    title: 'Verification, Recovery, and Login Protection',
    scope: 'Guardian sign-up verification, password-reset OTPs, and hashed rate-limit and lockout guards.',
    tables: ['parents', 'parent_verification_otps', 'parent_password_reset_otps', 'parent_password_reset_rate_limits', 'login_attempt_guards'],
    refs: [
      ['parent_verification_otps.parent_id', '>', 'parents.id'],
      ['parent_password_reset_otps.parent_id', '-', 'parents.id'],
    ],
    note: 'Rate-limit and lockout tables retain one-way subject hashes, not parent IDs, so they intentionally have no Ref.',
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
  const table = tables[name];
  if (!table) throw new Error(`Unknown table: ${name}`);
  return `Table ${name} {\n${table.fields.map(fieldLine).join('\n')}\n}`;
}

function dbml(page) {
  const header = [
    `// ParentConnect — Parent role — ${page.title}`,
    '// This is one focused DBML diagram. It is not the complete application schema.',
    '// Refs describe the Parent workflow relationships. Polymorphic or cross-role identifiers are documented application-level links where the schema has no direct foreign key.',
    '',
    `Project ${page.slug} {`,
    "  database_type: 'PostgreSQL'",
    `  Note: '${page.scope}${page.note ? ` ${page.note}` : ''}'`,
    '}',
    '',
  ].join('\n');
  const refs = page.refs.map(([from, relation, to]) => `Ref: ${from} ${relation} ${to}`).join('\n');
  return `${header}${page.tables.map(tableBlock).join('\n\n')}\n\n// Parent workflow relationships.\n${refs}\n`;
}

for (const page of pages) {
  fs.writeFileSync(path.join(__dirname, page.file), dbml(page));
  console.log(`Generated ${page.file}`);
}

// Four consolidated diagrams intended for the thesis manuscript. The detailed
// role diagrams above remain available as supporting documentation.
const thesisPages = [
  {
    file: '04a-parent-identity-and-linked-learners-full-schema.dbml',
    slug: 'parent_identity_and_linked_learners',
    title: 'Identity and Linked Learners',
    scope: 'Guardian account, linked learner records, household contacts, and class placement.',
    tables: ['students', 'parents', 'sections', 'parent_student_links', 'student_family_members'],
    refs: [
      ['parents.student_id', '>', 'students.student_id'],
      ['students.section', '>', 'sections.name'],
      ['parent_student_links.parent_id', '>', 'parents.id'],
      ['parent_student_links.student_id', '>', 'students.student_id'],
      ['student_family_members.student_db_id', '>', 'students.id'],
    ],
  },
  {
    file: '04b-parent-attendance-and-notifications-full-schema.dbml',
    slug: 'parent_attendance_and_notifications',
    title: 'Attendance and Notifications',
    scope: 'Linked learner attendance, class-session context, parent read receipts, and email/SMS alert delivery jobs.',
    tables: ['parents', 'students', 'parent_student_links', 'class_sessions', 'attendance_logs', 'parent_attendance_notification_reads', 'attendance_email_jobs', 'attendance_sms_jobs'],
    refs: [
      ['parent_student_links.parent_id', '>', 'parents.id'],
      ['parent_student_links.student_id', '>', 'students.student_id'],
      ['attendance_logs.student_db_id', '>', 'students.id'],
      ['attendance_logs.class_session_id', '>', 'class_sessions.id'],
      ['parent_attendance_notification_reads.parent_id', '>', 'parents.id'],
      ['parent_attendance_notification_reads.attendance_log_id', '>', 'attendance_logs.id'],
      ['attendance_email_jobs.parent_id', '>', 'parents.id'],
      ['attendance_email_jobs.attendance_log_id', '>', 'attendance_logs.id'],
      ['attendance_sms_jobs.parent_id', '>', 'parents.id'],
      ['attendance_sms_jobs.attendance_log_id', '>', 'attendance_logs.id'],
    ],
  },
  {
    file: '04c-parent-reports-guidance-and-announcements-full-schema.dbml',
    slug: 'parent_reports_guidance_and_announcements',
    title: 'Reports, Guidance, and Announcements',
    scope: 'Parent reports and conversations, guidance escalation, and parent-facing announcements from authorised school roles.',
    note: 'announcement_id is polymorphic: source identifies the originating announcement table, so announcement references are documented application-level workflow links.',
    tables: ['parents', 'students', 'advisers', 'guidance_counselors', 'parent_adviser_reports', 'parent_adviser_report_messages', 'parent_report_guidance_tickets', 'parent_announcement_notifications', 'adviser_announcements', 'guidance_announcements', 'principal_announcements', 'ict_announcements'],
    refs: [
      ['parent_adviser_reports.parent_id', '>', 'parents.id'],
      ['parent_adviser_reports.adviser_id', '>', 'advisers.id'],
      ['parent_adviser_reports.student_id', '>', 'students.student_id'],
      ['parent_adviser_report_messages.report_id', '>', 'parent_adviser_reports.id'],
      ['parent_report_guidance_tickets.report_id', '-', 'parent_adviser_reports.id'],
      ['parent_report_guidance_tickets.parent_id', '>', 'parents.id'],
      ['parent_report_guidance_tickets.student_id', '>', 'students.student_id'],
      ['parent_report_guidance_tickets.adviser_id', '>', 'advisers.id'],
      ['parent_report_guidance_tickets.assigned_guidance_id', '>', 'guidance_counselors.id'],
      ['parent_announcement_notifications.parent_id', '>', 'parents.id'],
      ['parent_announcement_notifications.student_id', '>', 'students.student_id'],
      ['parent_announcement_notifications.announcement_id', '>', 'adviser_announcements.id'],
      ['parent_announcement_notifications.announcement_id', '>', 'guidance_announcements.id'],
      ['parent_announcement_notifications.announcement_id', '>', 'principal_announcements.id'],
      ['parent_announcement_notifications.announcement_id', '>', 'ict_announcements.id'],
    ],
  },
  {
    file: '04d-parent-account-security-and-deletion-notices-full-schema.dbml',
    slug: 'parent_account_security_and_deletion_notices',
    title: 'Account Security and Deletion Notices',
    scope: 'Guardian verification, password recovery, login protection, and parent-facing scheduled-deletion notices.',
    note: 'Rate-limit and login-guard tables contain one-way subject hashes rather than parent identifiers; consequently, they intentionally have no direct Ref to parents.',
    tables: ['parents', 'parent_verification_otps', 'parent_password_reset_otps', 'parent_password_reset_rate_limits', 'login_attempt_guards', 'scheduled_deletions', 'ict_admins', 'parent_deletion_notifications'],
    refs: [
      ['parent_verification_otps.parent_id', '>', 'parents.id'],
      ['parent_password_reset_otps.parent_id', '-', 'parents.id'],
      ['parent_deletion_notifications.parent_id', '>', 'parents.id'],
      ['parent_deletion_notifications.scheduled_deletion_id', '>', 'scheduled_deletions.id'],
      ['scheduled_deletions.approved_by_ict_id', '>', 'ict_admins.id'],
    ],
  },
];

const thesisDir = path.join(__dirname, 'Thesis-Set');
fs.mkdirSync(thesisDir, { recursive: true });
for (const page of thesisPages) {
  fs.writeFileSync(path.join(thesisDir, page.file), dbml(page));
  console.log(`Generated Thesis-Set/${page.file}`);
}

// Complete Parent-facing schema. This is a master DBML source rather than a
// thesis figure; the four Thesis-Set diagrams above are deliberately smaller.
const parentFullSchema = {
  slug: 'parent_full_schema',
  title: 'Parent Full Schema',
  scope: 'Complete Parent-facing schema: identity, linked learners, attendance, absence requests, reports, conversations, guidance escalation, announcements, notifications, account recovery, login protection, and deletion notices.',
  note: 'This master diagram includes related staff and announcement-source entities required to document Parent workflows. References identified by the application as polymorphic or cross-role are logical relationships and may not be enforced as PostgreSQL foreign keys.',
  tables: [
    'parents', 'students', 'parent_student_links', 'student_family_members', 'sections',
    'class_sessions', 'attendance_logs', 'excuse_letters', 'school_year_config',
    'parent_attendance_notification_reads', 'attendance_email_jobs', 'attendance_sms_jobs',
    'parent_adviser_reports', 'parent_adviser_report_messages', 'parent_report_guidance_tickets',
    'parent_announcement_notifications', 'staff_messages',
    'parent_deletion_notifications', 'scheduled_deletions',
    'parent_verification_otps', 'parent_password_reset_otps',
    'parent_password_reset_rate_limits', 'login_attempt_guards',
    'advisers', 'guidance_counselors', 'ict_admins',
    'adviser_announcements', 'guidance_announcements', 'principal_announcements', 'ict_announcements',
  ],
  refs: [
    ['parents.student_id', '>', 'students.student_id'],
    ['students.section', '>', 'sections.name'],
    ['parent_student_links.parent_id', '>', 'parents.id'],
    ['parent_student_links.student_id', '>', 'students.student_id'],
    ['student_family_members.student_db_id', '>', 'students.id'],
    ['attendance_logs.student_db_id', '>', 'students.id'],
    ['attendance_logs.class_session_id', '>', 'class_sessions.id'],
    ['excuse_letters.student_id', '>', 'students.student_id'],
    ['parent_attendance_notification_reads.parent_id', '>', 'parents.id'],
    ['parent_attendance_notification_reads.attendance_log_id', '>', 'attendance_logs.id'],
    ['attendance_email_jobs.parent_id', '>', 'parents.id'],
    ['attendance_email_jobs.attendance_log_id', '>', 'attendance_logs.id'],
    ['attendance_sms_jobs.parent_id', '>', 'parents.id'],
    ['attendance_sms_jobs.attendance_log_id', '>', 'attendance_logs.id'],
    ['parent_adviser_reports.parent_id', '>', 'parents.id'],
    ['parent_adviser_reports.adviser_id', '>', 'advisers.id'],
    ['parent_adviser_reports.student_id', '>', 'students.student_id'],
    ['parent_adviser_report_messages.report_id', '>', 'parent_adviser_reports.id'],
    ['parent_report_guidance_tickets.report_id', '-', 'parent_adviser_reports.id'],
    ['parent_report_guidance_tickets.parent_id', '>', 'parents.id'],
    ['parent_report_guidance_tickets.student_id', '>', 'students.student_id'],
    ['parent_report_guidance_tickets.adviser_id', '>', 'advisers.id'],
    ['parent_report_guidance_tickets.assigned_guidance_id', '>', 'guidance_counselors.id'],
    ['adviser_announcements.adviser_id', '>', 'advisers.id'],
    ['guidance_announcements.guidance_id', '>', 'guidance_counselors.id'],
    ['ict_announcements.sender_id', '>', 'ict_admins.id'],
    ['parent_announcement_notifications.parent_id', '>', 'parents.id'],
    ['parent_announcement_notifications.student_id', '>', 'students.student_id'],
    ['parent_announcement_notifications.announcement_id', '>', 'adviser_announcements.id'],
    ['parent_announcement_notifications.announcement_id', '>', 'guidance_announcements.id'],
    ['parent_announcement_notifications.announcement_id', '>', 'principal_announcements.id'],
    ['parent_announcement_notifications.announcement_id', '>', 'ict_announcements.id'],
    ['staff_messages.recipient_id', '>', 'parents.id'],
    ['parent_deletion_notifications.parent_id', '>', 'parents.id'],
    ['parent_deletion_notifications.scheduled_deletion_id', '>', 'scheduled_deletions.id'],
    ['scheduled_deletions.approved_by_ict_id', '>', 'ict_admins.id'],
    ['parent_verification_otps.parent_id', '>', 'parents.id'],
    ['parent_password_reset_otps.parent_id', '-', 'parents.id'],
  ],
};

const fullSchemaFile = path.join(__dirname, '04-parent-full-schema.dbml');
fs.writeFileSync(fullSchemaFile, dbml(parentFullSchema));
console.log('Generated 04-parent-full-schema.dbml');

// dbdiagram can render the master file, but cannot translate every logical or
// polymorphic relationship into exportable SQL. This companion preserves all
// Parent-facing tables and uses only the database-enforced relationships.
const parentFullSchemaDbdiagram = {
  ...parentFullSchema,
  slug: 'parent_full_schema_dbdiagram_compatible',
  title: 'Parent Full Schema (dbdiagram Compatible)',
  scope: 'Complete Parent-facing schema with database-enforced relationships only. Application-level report, message, composite-placement, and polymorphic-announcement links are documented in the master Parent Full Schema file.',
  note: 'Use this version when dbdiagram requires an SQL-exportable schema. Use 04-parent-full-schema.dbml as the complete relationship reference.',
  refs: [
    ['parents.student_id', '>', 'students.student_id'],
    ['parent_student_links.parent_id', '>', 'parents.id'],
    ['parent_student_links.student_id', '>', 'students.student_id'],
    ['student_family_members.student_db_id', '>', 'students.id'],
    ['attendance_logs.student_db_id', '>', 'students.id'],
    ['attendance_logs.class_session_id', '>', 'class_sessions.id'],
    ['excuse_letters.student_id', '>', 'students.student_id'],
    ['parent_attendance_notification_reads.parent_id', '>', 'parents.id'],
    ['parent_attendance_notification_reads.attendance_log_id', '>', 'attendance_logs.id'],
    ['attendance_email_jobs.parent_id', '>', 'parents.id'],
    ['attendance_email_jobs.attendance_log_id', '>', 'attendance_logs.id'],
    ['attendance_sms_jobs.parent_id', '>', 'parents.id'],
    ['attendance_sms_jobs.attendance_log_id', '>', 'attendance_logs.id'],
    ['parent_report_guidance_tickets.report_id', '-', 'parent_adviser_reports.id'],
    ['parent_report_guidance_tickets.parent_id', '>', 'parents.id'],
    ['parent_report_guidance_tickets.adviser_id', '>', 'advisers.id'],
    ['parent_report_guidance_tickets.assigned_guidance_id', '>', 'guidance_counselors.id'],
    ['adviser_announcements.adviser_id', '>', 'advisers.id'],
    ['guidance_announcements.guidance_id', '>', 'guidance_counselors.id'],
    ['ict_announcements.sender_id', '>', 'ict_admins.id'],
    ['parent_announcement_notifications.parent_id', '>', 'parents.id'],
    ['parent_announcement_notifications.student_id', '>', 'students.student_id'],
    ['parent_deletion_notifications.parent_id', '>', 'parents.id'],
    ['parent_deletion_notifications.scheduled_deletion_id', '>', 'scheduled_deletions.id'],
    ['scheduled_deletions.approved_by_ict_id', '>', 'ict_admins.id'],
    ['parent_verification_otps.parent_id', '>', 'parents.id'],
    ['parent_password_reset_otps.parent_id', '-', 'parents.id'],
  ],
};

const dbdiagramSchemaFile = path.join(__dirname, '04-parent-full-schema-dbdiagram-compatible.dbml');
fs.writeFileSync(dbdiagramSchemaFile, dbml(parentFullSchemaDbdiagram));
console.log('Generated 04-parent-full-schema-dbdiagram-compatible.dbml');
