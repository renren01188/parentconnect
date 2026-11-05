const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const outDir = __dirname;
const W = 2480;
const H = 3508;
const CARD_W = 450;
const HEADER_H = 52;
const ROW_H = 20;
const FOOTER_H = 15;

const blue = '#18579b';
const blueDark = '#153766';
const blueSoft = '#e7f0fb';
const orange = '#d97716';
const line = '#dbe6f3';
const text = '#1f3e67';

function field(spec) {
  const [flags, name, type] = spec.split('|');
  return {
    name,
    type,
    pk: flags.includes('P'),
    unique: flags.includes('U'),
    nullable: flags.includes('N'),
  };
}

function table(name, fields) {
  return { name, fields: fields.map(field) };
}

// Snapshot source: live public schema, checked 2026-10-27.
// P = primary key, U = unique, N = nullable.
const tables = {
  parents: table('parents', [
    'P|id|int4', 'N|student_id|text', '|parent_first_name|text', 'N|parent_middle_name|text',
    '|parent_last_name|text', 'N|parent_suffix|text', 'N|relationship|text', 'N|contact_number|text',
    'N|email|text', 'N|temp_password|text', '|password|text', 'N|password_set|int4',
    'N|status|text', 'N|reset_token|text', 'N|reset_token_expiry|timestamptz', 'N|address|text',
    'N|archived_at|timestamptz', 'N|archived_by|text', 'N|archive_reason|text', '|archive_status|text',
    'N|archive_previous_status|text', 'N|parent_dashboard_guide_completed_at|timestamptz',
    'N|parent_attendance_guide_completed_at|timestamptz', 'N|parent_reports_guide_completed_at|timestamptz',
    'N|temporary_password_expires_at|timestamptz', '|attendance_email_notifications|bool',
    '|attendance_sms_notifications|bool', 'N|report_submission_cooldown_until|timestamptz',
    'N|attendance_notification_preference|text', 'N|login_contact_number|text', 'N|parent_remarks|text',
  ]),
  students: table('students', [
    'P|id|int4', 'U|student_id|text', '|first_name|text', 'N|middle_name|text', '|last_name|text',
    'N|suffix|text', '|gender|text', 'N|grade|text', 'N|section|text', 'UN|rfid_card|text',
    'N|created_at|timestamptz', 'N|transfer_status|text', 'N|target_grade|text', 'N|target_section|text',
    'N|class_session|text', 'N|birth_date|date', 'N|mother_tongue|text', 'N|ip_ethnic_group|text',
    'N|religion|text', 'N|house_street_sitio_purok|text', 'N|barangay|text', 'N|municipality_city|text',
    'N|province|text', 'N|learning_modality|text', 'N|age|int4', 'N|archived_at|timestamptz',
    'N|archived_by|text', 'N|archive_reason|text', '|archive_status|text', 'N|archive_previous_status|text',
  ]),
  parent_student_links: table('parent_student_links', [
    'P|id|int8', '|parent_id|int8', '|student_id|text', 'N|relationship|text', '|created_at|timestamptz',
  ]),
  student_family_members: table('student_family_members', [
    'P|id|int8', '|student_db_id|int4', '|role|text', 'N|first_name|text', 'N|middle_name|text',
    'N|last_name|text', 'N|relationship|text', 'N|contact_number|text', '|created_at|timestamptz', 'N|suffix|text',
  ]),
  sections: table('sections', ['P|id|int4', 'U|name|text', 'U|grade|text', 'N|class_session|text']),
  attendance_logs: table('attendance_logs', [
    'P|id|int4', 'N|student_db_id|int4', 'N|student_id|text', '|attendance_date|date', '|time_logged|time',
    'N|type|text', 'N|status|text', 'N|via|text', 'N|remark|text', '|session_type|text',
    'N|class_session_id|int4', 'N|scan_request_id|text', 'N|student_grade_snapshot|text',
    'N|student_section_snapshot|text', 'N|parent_recording_source|text',
  ]),
  parent_attendance_notification_reads: table('parent_attendance_notification_reads', [
    'P|parent_id|int4', 'P|attendance_log_id|int8', '|read_at|timestamptz',
  ]),
  class_sessions: table('class_sessions', [
    'P|id|int4', '|session_date|date', '|session_type|text', '|scheduled_start|time', '|scheduled_end|time',
    '|status|text', 'N|actual_start|timestamptz', 'N|actual_end|timestamptz', '|created_at|timestamptz',
    '|updated_at|timestamptz', 'N|late_after|time', 'N|absent_after|time', 'N|grade|text',
  ]),
  school_year_config: table('school_year_config', [
    'P|id|int4', '|school_year_label|varchar(20)', '|start_date|date', '|end_date|date',
    'N|is_active|bool', 'N|created_at|timestamptz', 'N|updated_at|timestamptz', '|attendance_weekdays|text[]',
  ]),
  attendance_email_jobs: table('attendance_email_jobs', [
    'P|id|uuid', '|attendance_log_id|int8', 'N|parent_id|int4', 'N|recipient_email|text', '|recipient_key|text',
    '|subject|text', '|message|text', '|status|text', '|attempts|int4', '|available_at|timestamptz',
    'N|locked_at|timestamptz', 'N|sent_at|timestamptz', 'N|provider|text', 'N|provider_message_id|text',
    'N|last_error|text', '|created_at|timestamptz', '|updated_at|timestamptz',
  ]),
  attendance_sms_jobs: table('attendance_sms_jobs', [
    'P|id|uuid', '|attendance_log_id|int8', 'N|parent_id|int4', 'N|recipient_phone|text', '|recipient_key|text',
    '|message|text', '|status|text', '|attempts|int4', '|available_at|timestamptz', 'N|locked_at|timestamptz',
    'N|sent_at|timestamptz', 'N|delivered_at|timestamptz', 'N|provider|text', 'N|provider_message_id|text',
    'N|provider_status|text', 'N|provider_response|jsonb', 'N|last_error|text', '|created_at|timestamptz',
    '|updated_at|timestamptz', 'N|provider_requested_at|timestamptz', 'N|provider_accepted_at|timestamptz',
    '|idempotency_key|text', 'N|reconciliation_required_at|timestamptz', 'N|reconciled_at|timestamptz',
    'N|retry_eligible_at|timestamptz', '|reconciliation_attempts|int4',
  ]),
  parent_adviser_reports: table('parent_adviser_reports', [
    'P|id|int8', 'N|parent_id|int8', '|parent_email|text', '|parent_name|text', 'N|adviser_id|int8',
    '|adviser_name|text', '|student_id|text', '|student_name|text', 'N|grade|text', 'N|section|text',
    '|subject|text', '|categories|text[]', '|concern_level|int4', '|status|text', '|escalated_to_guidance|bool',
    '|created_at|timestamptz', '|updated_at|timestamptz', '|last_message_at|timestamptz',
    'N|parent_seen_at|timestamptz', '|status_updated_at|timestamptz', '|escalated_to_principal|bool',
    'N|guidance_seen_at|timestamptz', 'N|allow_history_access|bool', 'N|subject_teacher_email|text',
    'N|subject_teacher_report_date_manila|date', 'N|cancelled_at|timestamptz', 'N|cancelled_by_parent_id|int8',
    'N|subject_teacher_submission_key|uuid',
  ]),
  parent_adviser_report_messages: table('parent_adviser_report_messages', [
    'P|id|int8', '|report_id|int8', '|sender_role|text', '|sender_name|text', '|body|text', '|created_at|timestamptz',
    '|read_by_parent|bool', '|read_by_adviser|bool', '|attachments|jsonb', '|thread_type|text', 'N|idempotency_key|uuid',
  ]),
  parent_report_guidance_tickets: table('parent_report_guidance_tickets', [
    'P|id|int8', 'U|report_id|int8', '|parent_id|int8', '|student_id|text', 'N|adviser_id|int8',
    '|concern|text', '|message|text', '|attachments|jsonb', '|status|text', 'N|rejection_reason|text',
    'N|assigned_guidance_id|int8', '|created_at|timestamptz', 'N|decided_at|timestamptz', '|updated_at|timestamptz',
  ]),
  advisers: table('advisers', [
    'P|id|int4', 'UN|employee_id|text', '|first_name|text', '|last_name|text', 'U|email|text', 'N|phone|text',
    'N|grade|text', 'N|section|text', 'N|status|text', '|password_hash|text', 'N|created_at|timestamptz',
    'N|updated_at|timestamptz', '|sections|text[]', 'N|middle_name|text', 'N|password_set|bool', 'N|suffix|text',
    'N|class_session|text', 'N|archived_at|timestamptz', 'N|archived_by|text', 'N|archive_reason|text',
    '|archive_status|text', 'N|archive_previous_status|text', 'N|notifications_last_seen_at|timestamptz',
    'N|adviser_attendance_guide_completed_at|timestamptz', 'N|adviser_reports_guide_completed_at|timestamptz',
    'N|adviser_dashboard_guide_completed_at|timestamptz',
  ]),
  guidance_counselors: table('guidance_counselors', [
    'P|id|int8', 'U|employee_id|text', '|first_name|text', 'N|middle_name|text', '|last_name|text', 'N|suffix|text',
    'U|email|text', '|phone|text', '|status|text', '|password_hash|text', '|password_set|bool', '|created_at|timestamptz',
    '|updated_at|timestamptz', 'N|archived_at|timestamptz', 'N|archived_by|text', 'N|archive_reason|text',
    '|archive_status|text', 'N|archive_previous_status|text', 'N|guidance_reports_guide_completed_at|timestamptz',
    'N|guidance_dashboard_guide_completed_at|timestamptz',
  ]),
  staff_messages: table('staff_messages', [
    'P|id|int8', '|sender_type|text', '|sender_id|int8', '|sender_name|text', 'N|sender_email|text',
    '|recipient_type|text', '|recipient_id|int8', '|recipient_name|text', 'N|recipient_email|text', '|subject|text',
    '|categories|text[]', '|body|text', '|attachments|jsonb', '|status|text', 'N|source_message_id|int8',
    '|created_at|timestamptz', '|updated_at|timestamptz', 'N|idempotency_key|uuid',
  ]),
  parent_announcement_notifications: table('parent_announcement_notifications', [
    'P|id|int8', '|announcement_id|int8', '|parent_id|int8', 'N|student_id|text', 'N|grade|text', 'N|section|text',
    'N|read_at|timestamptz', '|created_at|timestamptz', 'N|source|text', 'N|title|text', 'N|message|text',
    'N|sender_name|text', '|unread|bool', '|tab|text',
  ]),
  adviser_announcements: table('adviser_announcements', [
    'P|id|int8', '|adviser_id|int8', '|adviser_name|text', 'N|grade|text', '|sections|text[]', '|title|text', '|message|text', '|created_at|timestamptz',
  ]),
  guidance_announcements: table('guidance_announcements', [
    'P|id|int8', '|guidance_id|int8', '|guidance_name|text', '|title|text', '|message|text', '|audience|text', '|status|text',
    'N|scheduled_at|timestamptz', '|created_at|timestamptz', '|updated_at|timestamptz', 'N|emails_sent|bool',
  ]),
  principal_announcements: table('principal_announcements', [
    'P|id|int8', '|sender_id|int8', '|title|text', '|message|text', '|audience|text', '|status|text',
    'N|scheduled_at|timestamptz', 'N|created_at|timestamptz', 'N|emails_sent|bool',
  ]),
  ict_announcements: table('ict_announcements', [
    'P|id|int8', '|sender_id|int8', 'N|sender_name|text', '|title|text', '|message|text', '|audience|text[]',
    '|status|text', 'N|scheduled_at|timestamptz', 'N|created_at|timestamptz', 'N|emails_sent|bool',
  ]),
  parent_deletion_notifications: table('parent_deletion_notifications', [
    'P|id|int8', '|parent_id|int4', '|scheduled_deletion_id|int8', 'N|read_at|timestamptz', '|created_at|timestamptz',
  ]),
  scheduled_deletions: table('scheduled_deletions', [
    'P|id|int8', '|target_type|text', '|target_id|text', '|target_name|text', 'N|target_email|text',
    '|requested_by_role|text', '|requested_by_id|int8', '|reason|text', '|status|text', '|requested_at|timestamptz',
    'N|approved_at|timestamptz', 'N|approved_by_ict_id|int8', 'N|delete_after|timestamptz', 'N|restored_at|timestamptz',
    'N|notice_sent_at|timestamptz', 'N|archived_at|timestamptz', 'N|archived_by|text', 'N|archive_reason|text',
  ]),
  ict_admins: table('ict_admins', [
    'P|id|int8', 'U|employee_id|text', '|first_name|text', 'N|middle_name|text', '|last_name|text', 'N|suffix|text',
    'U|email|text', '|phone|text', '|status|text', '|password_hash|text', '|password_set|bool', '|created_at|timestamptz',
    '|updated_at|timestamptz', 'N|archived_at|timestamptz', 'N|archived_by|text', 'N|archive_reason|text',
    '|archive_status|text', 'N|archive_previous_status|text', 'N|ict_dashboard_guide_completed_at|timestamptz',
  ]),
  parent_verification_otps: table('parent_verification_otps', [
    'P|challenge_id|uuid', 'N|parent_id|int4', '|purpose|text', '|channel|text', '|otp_hash|text', '|expires_at|timestamptz',
    '|resend_available_at|timestamptz', '|attempts|int2', 'N|locked_until|timestamptz', 'N|used_at|timestamptz',
    '|requested_at|timestamptz', '|updated_at|timestamptz',
  ]),
  parent_password_reset_otps: table('parent_password_reset_otps', [
    'P|parent_id|int4', '|otp_hash|text', '|expires_at|timestamptz', '|attempts|int2', '|requested_at|timestamptz',
  ]),
  parent_password_reset_rate_limits: table('parent_password_reset_rate_limits', [
    'P|subject_hash|text', '|window_started_at|timestamptz', '|request_count|int4',
  ]),
  login_attempt_guards: table('login_attempt_guards', [
    'P|role|text', 'P|subject_hash|text', '|failed_attempts|int4', 'N|locked_until|timestamptz',
    '|created_at|timestamptz', '|updated_at|timestamptz', 'P|scope|text', '|lockout_level|int4', 'N|last_failed_at|timestamptz',
  ]),
};

function cardHeight(t) { return HEADER_H + t.fields.length * ROW_H + FOOTER_H; }
function esc(v) { return String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function typeShort(type) {
  return ({ 'timestamp with time zone': 'timestamptz', 'time without time zone': 'time', integer: 'int4', bigint: 'int8', boolean: 'bool' })[type] || type;
}
function card(t, x, y) {
  const h = cardHeight(t);
  const rows = t.fields.map((f, i) => {
    const ry = y + HEADER_H + i * ROW_H;
    const badges = `${f.pk ? '<tspan fill="#155cad" font-weight="700">PK</tspan> ' : ''}${!f.pk && f.unique ? '<tspan fill="#773ca8" font-weight="700">UQ</tspan> ' : ''}`;
    const bullet = f.nullable ? '○' : '●';
    return `<line x1="${x + 1}" y1="${ry + ROW_H}" x2="${x + CARD_W - 1}" y2="${ry + ROW_H}" stroke="${line}" stroke-width="1"/>` +
      `<text x="${x + 15}" y="${ry + 14}" font-size="12" fill="#617791">${bullet}</text>` +
      `<text x="${x + 31}" y="${ry + 14}" font-size="12.5" fill="${text}">${badges}${esc(f.name)}</text>` +
      `<text x="${x + CARD_W - 15}" y="${ry + 14}" text-anchor="end" font-size="11.5" fill="#617791">${esc(typeShort(f.type))}</text>`;
  }).join('');
  return `<g class="card"><rect x="${x}" y="${y}" width="${CARD_W}" height="${h}" rx="10" fill="#fff" stroke="${blueDark}" stroke-width="2.2"/>` +
    `<path d="M${x + 10},${y}H${x + CARD_W - 10}Q${x + CARD_W},${y} ${x + CARD_W},${y + 10}V${y + HEADER_H}H${x}V${y + 10}Q${x},${y} ${x + 10},${y}Z" fill="${blueSoft}"/>` +
    `<text x="${x + CARD_W / 2}" y="${y + 33}" text-anchor="middle" font-size="17" font-weight="700" fill="${blueDark}">${esc(t.name)}</text>${rows}</g>`;
}
function fieldPoint(placed, fieldName, side, offset = 0) {
  const t = placed.table;
  let i = t.fields.findIndex(f => f.name === fieldName);
  if (i < 0) i = Math.floor(t.fields.length / 2);
  const y = placed.y + HEADER_H + i * ROW_H + ROW_H / 2;
  const h = cardHeight(t);
  if (side === 'left') return { x: placed.x, y: y + offset };
  if (side === 'right') return { x: placed.x + CARD_W, y: y + offset };
  if (side === 'top') return { x: placed.x + CARD_W / 2 + offset, y: placed.y };
  return { x: placed.x + CARD_W / 2 + offset, y: placed.y + h };
}
function vec(side) { return side === 'left' ? [-1, 0] : side === 'right' ? [1, 0] : side === 'top' ? [0, -1] : [0, 1]; }
function endpoint(p, side, many, color) {
  const [dx, dy] = vec(side); const px = -dy; const py = dx;
  const bars = [6, 12].map(n => `<line x1="${p.x + dx * n + px * 10}" y1="${p.y + dy * n + py * 10}" x2="${p.x + dx * n - px * 10}" y2="${p.y + dy * n - py * 10}"/>`).join('');
  if (!many) return `<g stroke="${color}" stroke-width="2.8" fill="none">${bars}</g>`;
  const bx = p.x + dx * 18; const by = p.y + dy * 18;
  return `<g stroke="${color}" stroke-width="2.8" fill="none"><line x1="${bx}" y1="${by}" x2="${p.x + dx * 5}" y2="${p.y + dy * 5}"/><line x1="${bx}" y1="${by}" x2="${p.x + dx * 5 + px * 11}" y2="${p.y + dy * 5 + py * 11}"/><line x1="${bx}" y1="${by}" x2="${p.x + dx * 5 - px * 11}" y2="${p.y + dy * 5 - py * 11}"/></g>`;
}
function routePoints(a, b, via) {
  if (!via) {
    const mx = Math.round((a.x + b.x) / 2);
    return [a, { x: mx, y: a.y }, { x: mx, y: b.y }, b];
  }
  if (via.axis === 'x') return [a, { x: via.lane, y: a.y }, { x: via.lane, y: b.y }, b];
  return [a, { x: a.x, y: via.lane }, { x: b.x, y: via.lane }, b];
}
function polyline(points, color, dashed) {
  return `<polyline points="${points.map(p => `${p.x},${p.y}`).join(' ')}" fill="none" stroke="${color}" stroke-width="2.5" ${dashed ? 'stroke-dasharray="10 8"' : ''} stroke-linejoin="round" stroke-linecap="square"/>`;
}
function drawEdge(placed, e) {
  const sourcePort = fieldPoint(placed[e.from], e.fromField, e.fromSide || 'right', e.fromOffset || 0);
  const targetPort = fieldPoint(placed[e.to], e.toField, e.toSide || 'left', e.toOffset || 0);
  const [sdx, sdy] = vec(e.fromSide || 'right');
  const [tdx, tdy] = vec(e.toSide || 'left');
  // The route ends at the outside vertex of each notation. This keeps the
  // connector aligned with the card boundary instead of running through a crow's foot.
  const a = { x: sourcePort.x + sdx * 18, y: sourcePort.y + sdy * 18 };
  const b = { x: targetPort.x + tdx * 18, y: targetPort.y + tdy * 18 };
  const logical = e.kind === 'logical';
  const color = logical ? orange : blue;
  const parts = [polyline(routePoints(a, b, e.via), color, logical)];
  if (!logical) {
    parts.push(endpoint(sourcePort, e.fromSide || 'right', e.fromMany !== false, color));
    parts.push(endpoint(targetPort, e.toSide || 'left', false, color));
  }
  return parts.join('');
}
function edge(from, fromField, to, toField, fromSide, toSide, via, fromMany = true) {
  return { from, fromField, to, toField, fromSide, toSide, via, fromMany };
}
function logical(from, fromField, to, toField, fromSide, toSide, via) {
  return { from, fromField, to, toField, fromSide, toSide, via, kind: 'logical' };
}
function banner(title, subtitle) {
  return `<text x="${W / 2}" y="72" text-anchor="middle" font-size="42" font-family="Georgia, serif" font-weight="700" fill="${blueDark}">PARENTCONNECT — Parent ERD: ${esc(title)}</text>` +
    `<text x="${W / 2}" y="112" text-anchor="middle" font-size="21" fill="#516a8a">${esc(subtitle)}</text><line x1="120" y1="138" x2="2360" y2="138" stroke="#b9c8db" stroke-width="2"/>` +
    `<rect x="160" y="170" width="2160" height="130" rx="12" fill="#fff" stroke="#c3d1e3" stroke-width="2"/>` +
    `<text x="200" y="216" font-size="16" fill="#4c6688"><tspan fill="#155cad" font-weight="700">PK</tspan> primary key   <tspan fill="#773ca8" font-weight="700">UQ</tspan> unique field   ● required   ○ nullable</text>` +
    `<g transform="translate(1200 208)">${endpoint({x:0,y:0}, 'right', true, blue)}</g><text x="1300" y="216" font-size="16" fill="#4c6688">solid blue = declared foreign key</text>` +
    `<line x1="1880" y1="208" x2="1940" y2="208" stroke="${orange}" stroke-width="2.5" stroke-dasharray="10 8"/><text x="1980" y="216" font-size="16" fill="#4c6688">orange = application-level reference</text>`;
}
function footer(note) {
  return `<rect x="160" y="3330" width="2160" height="118" rx="12" fill="#fff" stroke="#c3d1e3" stroke-width="2"/>` +
    `<text x="200" y="3375" font-size="16" fill="#4c6688">${esc(note)}</text>` +
    `<text x="200" y="3410" font-size="16" fill="#4c6688">Every connector uses a private route and endpoint; no shared segments or T-junctions are used.</text>`;
}

const pages = [
  {
    file: '04a-parent-identity-and-linked-learners-full-schema', title: 'Identity and Linked Learners',
    subtitle: 'Guardian account, linked learner records, household contacts, and class placement',
    note: 'The direct parents.student_id and the parent_student_links bridge are both current declared database relationships.',
    cards: { students:[160,420], parents:[930,420], sections:[1860,550], parent_student_links:[720,1320], student_family_members:[1420,1320] },
    edges: [
      edge('parents','student_id','students','student_id','left','right',{axis:'y',lane:1100}),
      edge('students','section','sections','name','right','left',{axis:'y',lane:390}),
      edge('parent_student_links','parent_id','parents','id','top','bottom',{axis:'x',lane:760}),
      {...edge('parent_student_links','student_id','students','student_id','top','bottom',{axis:'x',lane:660}), toOffset:-95},
      {...edge('student_family_members','student_db_id','students','id','top','bottom',{axis:'x',lane:520}), toOffset:95},
    ],
  },
  {
    file: '04b-parent-attendance-history-and-read-state-full-schema', title: 'Attendance History and Read State',
    subtitle: 'Linked learner attendance, session context, guardian read receipts, and active school-year settings',
    note: 'The parent dashboard reads attendance through linked learners; school-year configuration is an independent settings record.',
    cards: { students:[130,420], parents:[680,420], attendance_logs:[1230,620], class_sessions:[1790,620], parent_student_links:[500,1370], parent_attendance_notification_reads:[1080,1510], school_year_config:[1680,1510] },
    edges: [
      {...edge('parent_student_links','parent_id','parents','id','top','bottom',{axis:'x',lane:700}), toOffset:-85},
      edge('parent_student_links','student_id','students','student_id','top','bottom',{axis:'x',lane:430}),
      edge('attendance_logs','student_db_id','students','id','left','right',{axis:'y',lane:1180}),
      edge('attendance_logs','class_session_id','class_sessions','id','right','left',{axis:'y',lane:590}),
      {...edge('parent_attendance_notification_reads','parent_id','parents','id','top','bottom',{axis:'x',lane:1070}), toOffset:85},
      edge('parent_attendance_notification_reads','attendance_log_id','attendance_logs','id','top','bottom',{axis:'x',lane:1190}),
    ],
  },
  {
    file: '04c-parent-attendance-alert-delivery-full-schema', title: 'Attendance Alert Delivery',
    subtitle: 'Email and SMS delivery jobs generated from learner attendance events and guardian notification preferences',
    note: 'Email and SMS jobs are delivery records; parent opt-in preferences remain on the parents account row.',
    cards: { parents:[230,450], attendance_logs:[1050,650], attendance_email_jobs:[280,1510], attendance_sms_jobs:[1480,1510] },
    edges: [
      {...edge('attendance_email_jobs','parent_id','parents','id','top','bottom',{axis:'x',lane:420}), toOffset:-100},
      {...edge('attendance_email_jobs','attendance_log_id','attendance_logs','id','top','bottom',{axis:'x',lane:960}), toOffset:-100},
      {...edge('attendance_sms_jobs','parent_id','parents','id','top','bottom',{axis:'y',lane:2240}), toOffset:100},
      {...edge('attendance_sms_jobs','attendance_log_id','attendance_logs','id','top','bottom',{axis:'x',lane:1440}), toOffset:100},
    ],
  },
  {
    file: '04d-parent-reports-conversations-and-guidance-full-schema', title: 'Reports, Conversations, and Guidance',
    subtitle: 'Parent-submitted concerns, adviser conversation threads, and the guidance escalation workflow',
    note: 'Orange connectors are intentional application-level identities in parent_adviser_reports; ticket and message links are declared FKs.',
    cards: { parents:[100,420], parent_adviser_reports:[620,420], advisers:[1140,420], students:[1660,420], parent_adviser_report_messages:[420,1310], parent_report_guidance_tickets:[980,1310], guidance_counselors:[1540,1310] },
    edges: [
      logical('parent_adviser_reports','parent_id','parents','id','left','right',{axis:'y',lane:1120}),
      logical('parent_adviser_reports','adviser_id','advisers','id','right','left',{axis:'y',lane:1160}),
      logical('parent_adviser_reports','student_id','students','student_id','bottom','bottom',{axis:'y',lane:1130}),
      {...edge('parent_adviser_report_messages','report_id','parent_adviser_reports','id','top','bottom',{axis:'x',lane:780}), toOffset:-100},
      {...edge('parent_report_guidance_tickets','report_id','parent_adviser_reports','id','top','bottom',{axis:'x',lane:1030},false), toOffset:100},
      edge('parent_report_guidance_tickets','parent_id','parents','id','left','bottom',{axis:'y',lane:1240}),
      edge('parent_report_guidance_tickets','adviser_id','advisers','id','top','bottom',{axis:'x',lane:1330}),
      edge('parent_report_guidance_tickets','assigned_guidance_id','guidance_counselors','id','right','left',{axis:'y',lane:1500}),
    ],
  },
  {
    file: '04e-parent-notifications-and-announcement-delivery-full-schema', title: 'Notifications and Announcement Delivery',
    subtitle: 'Guardian notification inbox, targeted announcements, and staff-originated direct messages',
    note: 'Announcement source and announcement_id form a polymorphic application reference, so the four orange routes are deliberately not database FKs.',
    cards: { parents:[100,420], parent_announcement_notifications:[620,550], students:[1140,420], staff_messages:[1660,550], adviser_announcements:[100,1420], guidance_announcements:[640,1420], principal_announcements:[1180,1420], ict_announcements:[1720,1420] },
    edges: [
      edge('parent_announcement_notifications','parent_id','parents','id','left','right',{axis:'y',lane:1220}),
      edge('parent_announcement_notifications','student_id','students','student_id','right','left',{axis:'y',lane:1180}),
      logical('staff_messages','recipient_id','parents','id','top','top',{axis:'y',lane:350}),
      {...logical('adviser_announcements','id','parent_announcement_notifications','announcement_id','top','bottom',{axis:'x',lane:690}), toOffset:-135},
      {...logical('guidance_announcements','id','parent_announcement_notifications','announcement_id','top','bottom',{axis:'x',lane:770}), toOffset:-45},
      {...logical('principal_announcements','id','parent_announcement_notifications','announcement_id','top','bottom',{axis:'x',lane:850}), toOffset:45},
      {...logical('ict_announcements','id','parent_announcement_notifications','announcement_id','top','bottom',{axis:'x',lane:930}), toOffset:135},
    ],
  },
  {
    file: '04f-parent-deletion-notices-and-account-state-full-schema', title: 'Deletion Notices and Account State',
    subtitle: 'Parent-facing scheduled-deletion notices and the ICT approval record that controls the lifecycle',
    note: 'Only parent_deletion_notifications directly belongs to the Parent experience; the ICT account is shown to complete the declared approval FK.',
    cards: { parents:[130,450], scheduled_deletions:[980,600], ict_admins:[1750,520], parent_deletion_notifications:[880,1390] },
    edges: [
      edge('parent_deletion_notifications','parent_id','parents','id','left','bottom',{axis:'y',lane:1260}),
      edge('parent_deletion_notifications','scheduled_deletion_id','scheduled_deletions','id','top','bottom',{axis:'x',lane:1110}),
      edge('scheduled_deletions','approved_by_ict_id','ict_admins','id','right','left',{axis:'y',lane:570}),
    ],
  },
  {
    file: '04g-parent-verification-recovery-and-login-protection-full-schema', title: 'Verification, Recovery, and Login Protection',
    subtitle: 'Guardian sign-up verification, password reset OTPs, and hashed rate-limit and lockout guards',
    note: 'Rate-limit and lockout rows store one-way subject hashes, not parent IDs, so they intentionally have no relationship connector. Reset and verification OTPs use declared FKs.',
    cards: { parents:[130,450], parent_verification_otps:[760,670], parent_password_reset_otps:[1390,670], parent_password_reset_rate_limits:[1950,820], login_attempt_guards:[1020,1450] },
    edges: [
      {...edge('parent_verification_otps','parent_id','parents','id','left','right',{axis:'y',lane:1260}), toOffset:-35},
      {...edge('parent_password_reset_otps','parent_id','parents','id','left','right',{axis:'y',lane:1360},false), toOffset:35},
    ],
  },
];

async function render(page) {
  const placed = Object.fromEntries(Object.entries(page.cards).map(([name, [x, y]]) => [name, { table: tables[name], x, y }]));
  const svg = `<?xml version="1.0" encoding="UTF-8"?><svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><rect width="100%" height="100%" fill="#fff"/><style>text{font-family:Arial,Helvetica,sans-serif}.card{filter:none}</style>${banner(page.title, page.subtitle)}<g class="edges">${page.edges.map(e => drawEdge(placed, e)).join('')}</g><g class="cards">${Object.values(placed).map(p => card(p.table, p.x, p.y)).join('')}</g>${footer(page.note)}</svg>`;
  const svgPath = path.join(outDir, `${page.file}.svg`);
  const pngPath = path.join(outDir, `${page.file}.png`);
  fs.writeFileSync(svgPath, svg);
  await sharp(Buffer.from(svg)).png().toFile(pngPath);
  console.log(`Rendered ${path.basename(pngPath)}`);
}

if (require.main === module) {
  (async () => { for (const page of pages) await render(page); })().catch(error => { console.error(error); process.exitCode = 1; });
}

module.exports = { tables };
