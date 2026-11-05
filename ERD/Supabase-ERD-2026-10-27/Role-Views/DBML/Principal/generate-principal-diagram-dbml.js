const fs = require('fs');
const path = require('path');
const { tables: sharedTables } = require('../../Images/Parent/render-parent-erd');

const sourceFiles = [
  '../Adviser/03b-adviser-messages-announcements-and-profile-full-schema.dbml',
  '../Adviser/03c-adviser-reports-conversations-and-guidance-full-schema.dbml',
  '../Guidance/05b-guidance-profile-messages-and-incoming-announcements-full-schema.dbml',
];
const blocks = new Map([
  ['principal_notification_reads', `Table principal_notification_reads {
  id int8 [pk, not null]
  principal_id int8 [not null]
  notif_key text [not null]
  created_at timestamptz
}`],
]);
for (const file of sourceFiles) {
  const text = fs.readFileSync(path.resolve(__dirname, file), 'utf8');
  for (const match of text.matchAll(/^Table ([A-Za-z0-9_]+) \{[\s\S]*?^\}/gm)) blocks.set(match[1], match[0]);
}

const pages = [
  {
    file: '07-principal-operations-full-schema.dbml', slug: 'principal_operations', title: 'Principal Operations',
    scope: 'Principal account, reports and escalations, staff correspondence, announcements, notification read state, attendance context, and student reports.',
    tables: ['principals', 'principal_announcements', 'principal_notification_reads', 'principal_staff_messages', 'adviser_principal_messages', 'parent_adviser_reports', 'parent_adviser_report_messages', 'parent_report_guidance_tickets', 'guidance_counselors', 'advisers', 'parents', 'students', 'attendance_logs', 'class_sessions', 'student_reports'],
    refs: [
      'Ref: principal_announcements.sender_id > principals.id', 'Ref: principal_notification_reads.principal_id > principals.id',
      'Ref: principal_staff_messages.principal_id > principals.id', 'Ref: principal_staff_messages.source_adviser_message_id > adviser_principal_messages.id',
      'Ref: adviser_principal_messages.principal_id > principals.id', 'Ref: adviser_principal_messages.source_staff_message_id > principal_staff_messages.id',
      'Ref: parent_adviser_report_messages.report_id > parent_adviser_reports.id', 'Ref: parent_report_guidance_tickets.report_id > parent_adviser_reports.id',
      'Ref: parent_report_guidance_tickets.parent_id > parents.id', 'Ref: parent_report_guidance_tickets.adviser_id > advisers.id',
      'Ref: parent_report_guidance_tickets.assigned_guidance_id > guidance_counselors.id', 'Ref: attendance_logs.student_db_id > students.id',
      'Ref: attendance_logs.class_session_id > class_sessions.id', 'Ref: student_reports.adviser_id > advisers.id',
    ],
    logicalRefs: ['Ref: parent_adviser_reports.parent_id > parents.id', 'Ref: parent_adviser_reports.adviser_id > advisers.id', 'Ref: parent_adviser_reports.student_id > students.student_id', 'Ref: parent_report_guidance_tickets.student_id > students.student_id', 'Ref: student_reports.student_id > students.student_id'],
  },
  {
    file: '07a-principal-reports-guidance-and-resolution-full-schema.dbml', slug: 'principal_reports_guidance_and_resolution', title: 'Reports, Guidance, and Resolution',
    scope: 'Escalated Parent reports, adviser conversations, Guidance tickets, and Adviser-created student reports.',
    tables: ['principals', 'parent_adviser_reports', 'parent_adviser_report_messages', 'parent_report_guidance_tickets', 'guidance_counselors', 'advisers', 'parents', 'students', 'student_reports'],
    refs: ['Ref: parent_adviser_report_messages.report_id > parent_adviser_reports.id', 'Ref: parent_report_guidance_tickets.report_id > parent_adviser_reports.id', 'Ref: parent_report_guidance_tickets.parent_id > parents.id', 'Ref: parent_report_guidance_tickets.adviser_id > advisers.id', 'Ref: parent_report_guidance_tickets.assigned_guidance_id > guidance_counselors.id', 'Ref: student_reports.adviser_id > advisers.id'],
    logicalRefs: ['Ref: parent_adviser_reports.parent_id > parents.id', 'Ref: parent_adviser_reports.adviser_id > advisers.id', 'Ref: parent_adviser_reports.student_id > students.student_id', 'Ref: parent_report_guidance_tickets.student_id > students.student_id', 'Ref: student_reports.student_id > students.student_id'],
  },
  {
    file: '07b-principal-messages-announcements-and-notifications-full-schema.dbml', slug: 'principal_messages_announcements_and_notifications', title: 'Messages, Announcements, and Notifications',
    scope: 'Principal announcements, notification read state, and staff correspondence with Advisers.',
    tables: ['principals', 'principal_announcements', 'principal_notification_reads', 'principal_staff_messages', 'adviser_principal_messages', 'advisers'],
    refs: ['Ref: principal_announcements.sender_id > principals.id', 'Ref: principal_notification_reads.principal_id > principals.id', 'Ref: principal_staff_messages.principal_id > principals.id', 'Ref: principal_staff_messages.source_adviser_message_id > adviser_principal_messages.id', 'Ref: adviser_principal_messages.principal_id > principals.id', 'Ref: adviser_principal_messages.source_staff_message_id > principal_staff_messages.id'],
    logicalRefs: ['Ref: adviser_principal_messages.adviser_id > advisers.id'],
  },
  {
    file: '07c-principal-attendance-and-student-summary-full-schema.dbml', slug: 'principal_attendance_and_student_summary', title: 'Attendance and Student Summary',
    scope: 'Principal attendance context, scheduled class sessions, student profiles, linked parents, and school-year configuration.',
    tables: ['principals', 'students', 'parents', 'parent_student_links', 'sections', 'class_sessions', 'attendance_logs', 'school_year_config', 'student_reports'],
    refs: ['Ref: parents.student_id > students.student_id', 'Ref: parent_student_links.parent_id > parents.id', 'Ref: parent_student_links.student_id > students.student_id', 'Ref: attendance_logs.student_db_id > students.id', 'Ref: attendance_logs.class_session_id > class_sessions.id'],
    logicalRefs: ['Ref: student_reports.student_id > students.student_id'],
    note: 'The live students-to-sections key is composite and is intentionally omitted because dbdiagram does not import composite references.',
  },
];

function fieldLine(field) { const values=[]; if(field.pk)values.push('pk'); if(field.unique)values.push('unique'); if(!field.nullable)values.push('not null'); return `  ${field.name} ${field.type}${values.length?` [${values.join(', ')}]`:''}`; }
function tableBlock(name) { if(blocks.has(name))return blocks.get(name); const table=sharedTables[name]; if(!table)throw new Error(`Unknown table: ${name}`); return `Table ${name} {\n${table.fields.map(fieldLine).join('\n')}\n}`; }
function make(page) { const logical=page.logicalRefs?.length?`\n\n// Application-level logical references (not database constraints).\n${page.logicalRefs.join('\n')}`:''; return [`// ParentConnect — Principal role — ${page.title}`, '// Focused DBML diagram for dbdiagram.io.', '', `Project ${page.slug} {`, "  database_type: 'PostgreSQL'", `  Note: '${page.scope}${page.note?` ${page.note}`:''}'`, '}', '', ...page.tables.map(tableBlock), '', '// Live Supabase foreign-key constraints.', ...page.refs].join('\n\n')+logical+'\n'; }
for(const page of pages){fs.writeFileSync(path.join(__dirname,page.file),make(page));console.log(`Generated ${page.file}`);}
