const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const { tables } = require('./render-parent-erd');

const W = 2480;
const H = 3508;
const CARD_W = 390;
const HEADER_H = 34;
const ROW_H = 12.5;
const CARD_PAD = 8;
const OUT = __dirname;

const C = {
  blue: '#175a9f', navy: '#143b6b', pale: '#e8f1fb', line: '#dbe6f3',
  text: '#20436f', muted: '#617791', orange: '#d97716', white: '#ffffff',
};

const appIdentityFields = {
  parents: new Set(['student_id']),
  parent_student_links: new Set(['parent_id', 'student_id']),
  students: new Set(['section']),
  student_family_members: new Set(['student_db_id']),
  parent_attendance_notification_reads: new Set(['parent_id', 'attendance_log_id']),
  attendance_email_jobs: new Set(['parent_id', 'attendance_log_id']),
  attendance_logs: new Set(['student_db_id', 'class_session_id']),
  attendance_sms_jobs: new Set(['parent_id', 'attendance_log_id']),
  parent_adviser_reports: new Set(['parent_id', 'adviser_id', 'student_id', 'cancelled_by_parent_id']),
  parent_adviser_report_messages: new Set(['report_id']),
  parent_report_guidance_tickets: new Set(['report_id', 'parent_id', 'advisor_id', 'assigned_guidance_id']),
  parent_announcement_notifications: new Set(['announcement_id', 'parent_id', 'student_id', 'source']),
  staff_messages: new Set(['sender_type', 'sender_id', 'recipient_type', 'recipient_id']),
  parent_deletion_notifications: new Set(['parent_id', 'scheduled_deletion_id']),
  scheduled_deletions: new Set(['approved_by_ict_id']),
  parent_verification_otps: new Set(['parent_id']),
  parent_password_reset_otps: new Set(['parent_id']),
};

const x = [100, 570, 1040, 1510, 1980];
const y = [390, 875, 1295, 1740, 2060, 2395];
const layout = {
  parents: [x[0], y[0]], parent_student_links: [x[1], y[0]], students: [x[2], y[0]], student_family_members: [x[3], y[0]], sections: [x[4], y[0]],
  parent_attendance_notification_reads: [x[0], y[1]], attendance_email_jobs: [x[1], y[1]], attendance_logs: [x[2], y[1]], attendance_sms_jobs: [x[3], y[1]], class_sessions: [x[4], y[1]],
  advisers: [x[0], y[2]], parent_report_guidance_tickets: [x[1], y[2]], guidance_counselors: [x[2], y[2]], parent_adviser_reports: [x[3], y[2]], parent_adviser_report_messages: [x[4], y[2]],
  adviser_announcements: [x[0], y[3]], parent_announcement_notifications: [x[1], y[3]], staff_messages: [x[2], y[3]], guidance_announcements: [x[3], y[3]], principal_announcements: [x[4], y[3]],
  ict_announcements: [x[0], y[4]], parent_deletion_notifications: [x[1], y[4]], scheduled_deletions: [x[2], y[4]], ict_admins: [x[3], y[4]], parent_verification_otps: [x[4], y[4]],
  parent_password_reset_otps: [x[0], y[5]], parent_password_reset_rate_limits: [x[1], y[5]], login_attempt_guards: [x[2], y[5]], school_year_config: [x[3], y[5]],
};

function h(t) { return HEADER_H + t.fields.length * ROW_H + CARD_PAD; }
function esc(v) { return String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function short(type) {
  return ({ 'timestamp with time zone': 'timestamptz', 'time without time zone': 'time', integer: 'int4', bigint: 'int8', boolean: 'bool' })[type] || type;
}
function card(name, p) {
  const t = tables[name];
  const height = h(t);
  const rows = t.fields.map((f, index) => {
    const ry = p.y + HEADER_H + index * ROW_H;
    const app = appIdentityFields[name]?.has(f.name);
    const meta = `${f.pk ? '<tspan fill="#155cad" font-weight="700">PK</tspan> ' : ''}${!f.pk && f.unique ? '<tspan fill="#773ca8" font-weight="700">UQ</tspan> ' : ''}`;
    return `<line x1="${p.x + 1}" y1="${ry + ROW_H}" x2="${p.x + CARD_W - 1}" y2="${ry + ROW_H}" stroke="${C.line}"/>` +
      `<text x="${p.x + 11}" y="${ry + 9.2}" font-size="9" fill="${C.muted}">${f.nullable ? '○' : '●'}</text>` +
      `<text x="${p.x + 25}" y="${ry + 9.2}" font-size="9.6" fill="${app ? C.orange : C.text}">${meta}${esc(f.name)}</text>` +
      `<text x="${p.x + CARD_W - 11}" y="${ry + 9.2}" text-anchor="end" font-size="8.6" fill="${C.muted}">${esc(short(f.type))}</text>`;
  }).join('');
  return `<g><rect x="${p.x}" y="${p.y}" width="${CARD_W}" height="${height}" rx="7" fill="${C.white}" stroke="${C.navy}" stroke-width="1.4"/>` +
    `<path d="M${p.x + 7},${p.y}H${p.x + CARD_W - 7}Q${p.x + CARD_W},${p.y} ${p.x + CARD_W},${p.y + 7}V${p.y + HEADER_H}H${p.x}V${p.y + 7}Q${p.x},${p.y} ${p.x + 7},${p.y}Z" fill="${C.pale}"/>` +
    `<text x="${p.x + CARD_W / 2}" y="${p.y + 22}" text-anchor="middle" font-size="13.5" font-weight="700" fill="${C.navy}">${esc(name)}</text>${rows}</g>`;
}
function position(name) { const [px, py] = layout[name]; return { name, table: tables[name], x: px, y: py }; }
function unit(side) { return side === 'left' ? [-1, 0] : side === 'right' ? [1, 0] : side === 'top' ? [0, -1] : [0, 1]; }
function port(item, side, offset = 0) {
  const height = h(item.table);
  if (side === 'left') return { x: item.x, y: item.y + height / 2 + offset };
  if (side === 'right') return { x: item.x + CARD_W, y: item.y + height / 2 + offset };
  if (side === 'top') return { x: item.x + CARD_W / 2 + offset, y: item.y };
  return { x: item.x + CARD_W / 2 + offset, y: item.y + height };
}
function outer(point, side) { const [dx, dy] = unit(side); return { x: point.x + dx * 17, y: point.y + dy * 17 }; }
function endpoint(point, side, many, color = C.orange) {
  const [dx, dy] = unit(side); const px = -dy; const py = dx; const q = outer(point, side);
  if (many) {
    return `<g fill="none" stroke="${color}" stroke-width="2.1" stroke-linecap="square"><line x1="${q.x}" y1="${q.y}" x2="${point.x}" y2="${point.y}"/><line x1="${q.x}" y1="${q.y}" x2="${point.x + px * 9}" y2="${point.y + py * 9}"/><line x1="${q.x}" y1="${q.y}" x2="${point.x - px * 9}" y2="${point.y - py * 9}"/></g>`;
  }
  const bars = [5, 10].map(n => `<line x1="${point.x + dx * n + px * 8}" y1="${point.y + dy * n + py * 8}" x2="${point.x + dx * n - px * 8}" y2="${point.y + dy * n - py * 8}"/>`).join('');
  return `<g fill="none" stroke="${color}" stroke-width="2.1" stroke-linecap="square"><line x1="${q.x}" y1="${q.y}" x2="${point.x}" y2="${point.y}"/>${bars}</g>`;
}
function points(a, b, via) {
  if (!via) return [a, { x: (a.x + b.x) / 2, y: a.y }, { x: (a.x + b.x) / 2, y: b.y }, b];
  return via.axis === 'x'
    ? [a, { x: via.lane, y: a.y }, { x: via.lane, y: b.y }, b]
    : [a, { x: a.x, y: via.lane }, { x: b.x, y: via.lane }, b];
}
function connector(from, fromSide, fromOffset, to, toSide, toOffset, via, fromMany = true) {
  const fp = port(placed[from], fromSide, fromOffset);
  const tp = port(placed[to], toSide, toOffset);
  const a = outer(fp, fromSide); const b = outer(tp, toSide);
  const d = points(a, b, via).map(p => `${p.x},${p.y}`).join(' ');
  return `<polyline points="${d}" fill="none" stroke="${C.orange}" stroke-width="1.8" stroke-dasharray="5 4" stroke-linejoin="round"/>${endpoint(fp, fromSide, fromMany)}${endpoint(tp, toSide, false)}`;
}

const placed = Object.fromEntries(Object.keys(layout).map(name => [name, position(name)]));

// Supabase currently has no declared foreign-key constraints for these tables.
// The short orange routes below are the unambiguous, application-level ID links.
// Cross-functional IDs are highlighted in orange inside their table rather than
// using page-spanning lines that would be misleading and hard to read.
const edges = [
  connector('parent_student_links', 'left', 0, 'parents', 'right', -150, null),
  connector('parent_student_links', 'right', 0, 'students', 'left', -145, null),
  connector('student_family_members', 'left', 0, 'students', 'right', -80, null),
  connector('parents', 'top', 130, 'students', 'top', -110, { axis: 'y', lane: 350 }),
  connector('students', 'top', 105, 'sections', 'top', -105, { axis: 'y', lane: 330 }),

  connector('parent_attendance_notification_reads', 'top', 0, 'attendance_logs', 'top', -120, { axis: 'y', lane: 858 }),
  connector('attendance_email_jobs', 'right', 0, 'attendance_logs', 'left', -35, null),
  connector('attendance_sms_jobs', 'left', 0, 'attendance_logs', 'right', 30, null),
  connector('attendance_logs', 'top', -105, 'students', 'bottom', 0, null),
  connector('attendance_logs', 'bottom', 115, 'class_sessions', 'bottom', -115, { axis: 'y', lane: 1268 }),

  connector('parent_report_guidance_tickets', 'left', 0, 'advisers', 'right', 80, null),
  connector('parent_report_guidance_tickets', 'right', 0, 'guidance_counselors', 'left', 0, null),
  connector('parent_adviser_reports', 'right', 0, 'parent_adviser_report_messages', 'left', 0, null),
  connector('parent_report_guidance_tickets', 'top', 90, 'parent_adviser_reports', 'top', -90, { axis: 'y', lane: 1274 }, false),

  connector('parent_deletion_notifications', 'right', 0, 'scheduled_deletions', 'left', 0, null),
  connector('scheduled_deletions', 'right', 0, 'ict_admins', 'left', 0, null),
];

function svg() {
  const header = `<text x="1240" y="68" text-anchor="middle" font-size="38" font-family="Georgia,serif" font-weight="700" fill="${C.navy}">PARENTCONNECT — Parent ERD: Full Schema</text>` +
    `<text x="1240" y="108" text-anchor="middle" font-size="19" fill="#516a8a">Current parent-facing database schema — compact A4 portrait master</text>` +
    `<line x1="100" y1="135" x2="2380" y2="135" stroke="#b9c8db" stroke-width="1.5"/>` +
    `<rect x="130" y="164" width="2220" height="108" rx="10" fill="#fff" stroke="#c3d1e3" stroke-width="1.5"/>` +
    `<text x="165" y="203" font-size="14" fill="#4c6688"><tspan fill="#155cad" font-weight="700">PK</tspan> primary key   <tspan fill="#773ca8" font-weight="700">UQ</tspan> unique field   ● required   ○ nullable</text>` +
    `<g transform="translate(1160 198)">${endpoint({ x: 0, y: 0 }, 'right', true)}</g><text x="1210" y="203" font-size="14" fill="#4c6688">crow’s foot = many; double bar = one; orange = documented application link</text>` +
    `<text x="165" y="237" font-size="13.2" fill="${C.orange}">Orange field names</text><text x="305" y="237" font-size="13.2" fill="#4c6688">are application-level IDs. Supabase currently declares no database foreign-key constraints for this scope.</text>`;
  const foot = `<rect x="130" y="3290" width="2220" height="135" rx="10" fill="#fff" stroke="#c3d1e3" stroke-width="1.5"/>` +
    `<text x="165" y="3330" font-size="14" fill="#4c6688">All 29 parent-scope tables and their live fields are shown. The short orange routes use isolated lanes and end exactly at their notation.</text>` +
    `<text x="165" y="3362" font-size="14" fill="#4c6688">Long, cross-functional application IDs are highlighted in orange but intentionally not routed across other tables. This keeps the full-schema master readable.</text>`;
  return `<?xml version="1.0" encoding="UTF-8"?><svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><rect width="100%" height="100%" fill="#fff"/><style>text{font-family:Arial,Helvetica,sans-serif}</style>${header}<g>${edges.join('')}</g><g>${Object.entries(placed).map(([name, p]) => card(name, p)).join('')}</g>${foot}</svg>`;
}

(async () => {
  const base = '04-parent-full-schema-a4-portrait';
  const source = svg();
  fs.writeFileSync(path.join(OUT, `${base}.svg`), source);
  await sharp(Buffer.from(source)).png().toFile(path.join(OUT, `${base}.png`));
  console.log(`Rendered ${base}.png`);
})().catch(error => { console.error(error); process.exitCode = 1; });
