const fs = require('fs');
const path = require('path');
const { tables: sharedTables } = require('../../Images/Parent/render-parent-erd');

// Guidance-only tables read from the live Supabase schema on 2026-10-28.
const extraBlocks = {
  guidance_announcements: `Table guidance_announcements {
  id int8 [pk, not null]
  guidance_id int8 [not null]
  guidance_name text [not null]
  title text [not null]
  message text [not null]
  audience text [not null]
  status text [not null]
  scheduled_at timestamptz
  created_at timestamptz [not null]
  updated_at timestamptz [not null]
  emails_sent bool
}`,
  guidance_change_requests: `Table guidance_change_requests {
  id int8 [pk, not null]
  guidance_id int8 [not null]
  guidance_name text [not null]
  guidance_email text [not null]
  guidance_initials text [not null]
  changes jsonb [not null]
  note text
  status text [not null]
  created_at timestamptz [not null]
  reviewed_at timestamptz
  reviewed_by_ict_id int8
  review_note text
}`,
  guidance_counselors: `Table guidance_counselors {
  id int8 [pk, not null]
  employee_id text [unique, not null]
  first_name text [not null]
  middle_name text
  last_name text [not null]
  suffix text
  email text [unique, not null]
  phone text [not null]
  status text [not null]
  password_hash text [not null]
  password_set bool [not null]
  created_at timestamptz [not null]
  updated_at timestamptz [not null]
  archived_at timestamptz
  archived_by text
  archive_reason text
  archive_status text [not null]
  archive_previous_status text
  guidance_reports_guide_completed_at timestamptz
  guidance_dashboard_guide_completed_at timestamptz
}`,
  guidance_notification_reads: `Table guidance_notification_reads {
  id int4 [pk, not null]
  guidance_id int4 [not null]
  notif_key text [not null]
  created_at timestamptz
}`,
  guidance_report_favorites: `Table guidance_report_favorites {
  guidance_id int8 [pk, not null]
  report_id int8 [pk, not null]
  created_at timestamptz [not null]
}`,
  guidance_ticket_reads: `Table guidance_ticket_reads {
  guidance_id int8 [pk, not null]
  ticket_id int8 [pk, not null]
  read_at timestamptz [not null]
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
};

const pages = [
  {
    file: '05-guidance-operations-full-schema.dbml',
    slug: 'guidance_operations',
    title: 'Guidance Operations',
    scope: 'Core Guidance workflow: case reports, tickets, favorites, read state, profile changes, ICT messages, and Parent announcement delivery. Incoming Principal and ICT announcements are in the separate 05b diagram to keep this master within dbdiagram free-plan limits.',
    tables: ['guidance_counselors', 'parent_adviser_reports', 'parent_adviser_report_messages', 'parent_report_guidance_tickets', 'guidance_report_favorites', 'guidance_ticket_reads', 'parents', 'advisers', 'students', 'guidance_change_requests', 'guidance_notification_reads', 'staff_messages', 'ict_admins', 'guidance_announcements', 'parent_announcement_notifications'],
    refs: [
      'Ref: parent_adviser_report_messages.report_id > parent_adviser_reports.id',
      'Ref: parent_report_guidance_tickets.report_id > parent_adviser_reports.id',
      'Ref: parent_report_guidance_tickets.parent_id > parents.id',
      'Ref: parent_report_guidance_tickets.adviser_id > advisers.id',
      'Ref: parent_report_guidance_tickets.assigned_guidance_id > guidance_counselors.id',
      'Ref: guidance_report_favorites.guidance_id > guidance_counselors.id',
      'Ref: guidance_report_favorites.report_id > parent_adviser_reports.id',
      'Ref: guidance_ticket_reads.guidance_id > guidance_counselors.id',
      'Ref: guidance_ticket_reads.ticket_id > parent_report_guidance_tickets.id',
      'Ref: guidance_change_requests.guidance_id > guidance_counselors.id',
      'Ref: guidance_change_requests.reviewed_by_ict_id > ict_admins.id',
      'Ref: guidance_notification_reads.guidance_id > guidance_counselors.id',
      'Ref: staff_messages.source_message_id > staff_messages.id',
      'Ref: guidance_announcements.guidance_id > guidance_counselors.id',
      'Ref: parent_announcement_notifications.parent_id > parents.id',
      'Ref: parent_announcement_notifications.student_id > students.student_id',
    ],
    logicalRefs: [
      'Ref: parent_adviser_reports.parent_id > parents.id',
      'Ref: parent_adviser_reports.adviser_id > advisers.id',
      'Ref: parent_adviser_reports.student_id > students.student_id',
      'Ref: parent_report_guidance_tickets.student_id > students.student_id',
      'Ref: staff_messages.sender_id > guidance_counselors.id',
      'Ref: staff_messages.recipient_id > guidance_counselors.id',
      'Ref: parent_announcement_notifications.announcement_id > guidance_announcements.id',
    ],
    note: 'staff_messages and parent_announcement_notifications are polymorphic: their type/source columns determine the related role or announcement table.',
  },
  {
    file: '05a-guidance-reports-tickets-and-read-state-full-schema.dbml',
    slug: 'guidance_reports_tickets_and_read_state',
    title: 'Reports, Tickets, and Read State',
    scope: 'Guidance report queue, parent-adviser conversations, ticket decisions, saved reports, and per-counselor read state.',
    tables: ['guidance_counselors', 'parent_adviser_reports', 'parent_adviser_report_messages', 'parent_report_guidance_tickets', 'guidance_report_favorites', 'guidance_ticket_reads', 'parents', 'advisers', 'students'],
    refs: [
      'Ref: parent_adviser_report_messages.report_id > parent_adviser_reports.id',
      'Ref: parent_report_guidance_tickets.report_id > parent_adviser_reports.id',
      'Ref: parent_report_guidance_tickets.parent_id > parents.id',
      'Ref: parent_report_guidance_tickets.adviser_id > advisers.id',
      'Ref: parent_report_guidance_tickets.assigned_guidance_id > guidance_counselors.id',
      'Ref: guidance_report_favorites.guidance_id > guidance_counselors.id',
      'Ref: guidance_report_favorites.report_id > parent_adviser_reports.id',
      'Ref: guidance_ticket_reads.guidance_id > guidance_counselors.id',
      'Ref: guidance_ticket_reads.ticket_id > parent_report_guidance_tickets.id',
    ],
    logicalRefs: [
      'Ref: parent_adviser_reports.parent_id > parents.id',
      'Ref: parent_adviser_reports.adviser_id > advisers.id',
      'Ref: parent_adviser_reports.student_id > students.student_id',
      'Ref: parent_report_guidance_tickets.student_id > students.student_id',
    ],
  },
  {
    file: '05b-guidance-profile-messages-and-incoming-announcements-full-schema.dbml',
    slug: 'guidance_profile_messages_and_incoming_announcements',
    title: 'Profile, Messages, and Incoming Announcements',
    scope: 'Guidance account updates, ICT conversations, notification read records, and incoming Principal/ICT announcements.',
    tables: ['guidance_counselors', 'guidance_change_requests', 'guidance_notification_reads', 'staff_messages', 'ict_admins', 'principals', 'principal_announcements', 'ict_announcements'],
    refs: [
      'Ref: guidance_change_requests.guidance_id > guidance_counselors.id',
      'Ref: guidance_change_requests.reviewed_by_ict_id > ict_admins.id',
      'Ref: guidance_notification_reads.guidance_id > guidance_counselors.id',
      'Ref: staff_messages.source_message_id > staff_messages.id',
    ],
    logicalRefs: [
      'Ref: staff_messages.sender_id > guidance_counselors.id',
      'Ref: staff_messages.recipient_id > guidance_counselors.id',
      'Ref: principal_announcements.sender_id > principals.id',
    ],
    note: 'staff_messages is polymorphic: sender_type and recipient_type determine whether an ID identifies Guidance or ICT.',
  },
  {
    file: '05c-guidance-announcements-and-parent-delivery-full-schema.dbml',
    slug: 'guidance_announcements_and_parent_delivery',
    title: 'Announcements and Parent Delivery',
    scope: 'Guidance-authored announcements and their parent-facing notification delivery records.',
    tables: ['guidance_counselors', 'guidance_announcements', 'parents', 'students', 'parent_student_links', 'parent_announcement_notifications'],
    refs: [
      'Ref: guidance_announcements.guidance_id > guidance_counselors.id',
      'Ref: parent_student_links.parent_id > parents.id',
      'Ref: parent_student_links.student_id > students.student_id',
      'Ref: parent_announcement_notifications.parent_id > parents.id',
      'Ref: parent_announcement_notifications.student_id > students.student_id',
    ],
    logicalRefs: [
      'Ref: parent_announcement_notifications.announcement_id > guidance_announcements.id',
    ],
    note: 'announcement_id is polymorphic; the source column identifies guidance as the originating announcement table.',
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
    `// ParentConnect — Guidance role — ${page.title}`,
    '// This is one focused DBML diagram. It is not the complete application schema.',
    '// Refs above the application-level heading are live Supabase foreign-key constraints.',
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
