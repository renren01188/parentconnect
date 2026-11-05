const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const OUT = __dirname;
const ROLE_DBML = path.resolve(OUT, '..', '..', 'Supabase-ERD-2026-10-27', 'Role-Views', 'DBML');
const WIDTH = 9550;
const INK = '#183f6d';
const REL = '#c56d22';
const esc = (value) => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const extraTables = {
  contact_us_messages: [
    ['id', 'int8', 'pk, not null'], ['idempotency_key', 'uuid', 'unique, not null'],
    ['sender_name', 'text', 'not null'], ['sender_email', 'text', 'not null'], ['sender_phone', 'text', ''],
    ['subject', 'text', 'not null'], ['message', 'text', 'not null'], ['notification_status', 'text', 'not null'],
    ['notification_error', 'text', ''], ['notified_at', 'timestamptz', ''], ['created_at', 'timestamptz', 'not null'],
  ],
  public_api_rate_limits: [
    ['scope', 'text', 'pk, not null'], ['subject_hash', 'text', 'pk, not null'],
    ['window_started_at', 'timestamptz', 'not null'], ['request_count', 'int4', 'not null'], ['updated_at', 'timestamptz', 'not null'],
  ],
  subject_teacher_report_otps: [
    ['email', 'text', 'pk, not null'], ['otp_hash', 'text', 'not null'], ['expires_at', 'timestamptz', 'not null'],
    ['attempts', 'int2', 'not null'], ['requested_at', 'timestamptz', 'not null'],
  ],
};

const categoryOrder = [
  ['Core people and school records', ['students', 'parents', 'advisers', 'guidance_counselors', 'ict_admins', 'principals', 'sections', 'class_sessions', 'school_year_config', 'staff_employee_ids']],
  ['Student and parent support', ['parent_student_links', 'student_family_members', 'student_remarks', 'student_reports', 'excuse_letters']],
  ['Attendance and delivery', ['attendance_logs', 'attendance_email_jobs', 'attendance_sms_jobs', 'attendance_sms_provider_events', 'attendance_sms_dispatch_leases', 'attendance_notification_settings', 'parent_attendance_notification_reads']],
  ['Reports and guidance cases', ['parent_adviser_reports', 'parent_adviser_report_messages', 'parent_report_guidance_tickets', 'guidance_report_favorites', 'guidance_ticket_reads', 'subject_teacher_report_otps']],
  ['Announcements, messages, and read state', ['adviser_announcements', 'ict_announcements', 'guidance_announcements', 'principal_announcements', 'parent_announcement_notifications', 'adviser_notification_reads', 'guidance_notification_reads', 'ict_notification_reads', 'principal_notification_reads', 'staff_messages', 'adviser_principal_messages', 'principal_staff_messages']],
  ['Administration and deletion workflow', ['audit_log', 'scheduled_deletions', 'scheduled_deletion_requesters', 'scheduled_deletion_targets', 'parent_deletion_notifications', 'deletion_email_jobs', 'deletion_email_job_items', 'adviser_assignment_history', 'adviser_change_requests', 'guidance_change_requests', 'scheduled_adviser_transfers']],
  ['Security and public-support controls', ['login_attempt_guards', 'parent_verification_otps', 'parent_password_reset_otps', 'parent_password_reset_rate_limits', 'public_api_rate_limits', 'contact_us_messages']],
];

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const item = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(item) : entry.name.endsWith('.dbml') ? [item] : [];
  });
}

function parseDbmlTables() {
  const chosen = new Map();
  for (const file of walk(ROLE_DBML)) {
    const source = fs.readFileSync(file, 'utf8');
    for (const match of source.matchAll(/Table\s+([A-Za-z0-9_]+)\s*\{([\s\S]*?)\n\}/g)) {
      const fields = match[2].split(/\r?\n/).map((raw) => {
        const line = raw.trim();
        const item = line.match(/^([A-Za-z0-9_]+)\s+([^\s\[]+)(?:\s+\[([^\]]+)\])?/);
        return item ? { name: item[1], type: item[2], flags: item[3] || '' } : null;
      }).filter(Boolean);
      if (!chosen.has(match[1]) || chosen.get(match[1]).fields.length < fields.length) chosen.set(match[1], { name: match[1], fields });
    }
  }
  for (const [name, fields] of Object.entries(extraTables)) {
    chosen.set(name, { name, fields: fields.map(([field, type, flags]) => ({ name: field, type, flags })) });
  }
  return chosen;
}

function readForeignKeys() {
  const snapshot = JSON.parse(fs.readFileSync(path.join(OUT, 'live-foreign-keys.json'), 'utf8'));
  const byConstraint = new Map();
  for (const fk of snapshot.foreign_keys) {
    if (!byConstraint.has(fk.constraint_name)) byConstraint.set(fk.constraint_name, []);
    byConstraint.get(fk.constraint_name).push(fk);
  }
  return [...byConstraint.entries()].map(([constraint, rows]) => {
    rows.sort((a, b) => a.position - b.position);
    return { constraint, source: rows[0].source_table, target: rows[0].target_table, sourceColumns: rows.map((r) => r.source_column), targetColumns: rows.map((r) => r.target_column) };
  });
}

function prepare() {
  const tables = parseDbmlTables();
  const relations = readForeignKeys();
  const expected = 57;
  if (tables.size !== expected) throw new Error(`Expected ${expected} public base tables; found ${tables.size}.`);
  for (const rel of relations) {
    if (!tables.has(rel.source) || !tables.has(rel.target)) throw new Error(`Relationship target missing: ${rel.constraint}`);
  }
  const placed = new Set(categoryOrder.flatMap(([, names]) => names));
  const remaining = [...tables.keys()].filter((name) => !placed.has(name));
  if (remaining.length) categoryOrder.push(['Other public tables', remaining]);
  return { tables, relations };
}

function tableHeight(table) { return 39 + table.fields.length * 17 + 8; }

function layout(tables) {
  const placements = new Map();
  const groups = [];
  const tableWidth = 550;
  let maxBottom = 0;
  categoryOrder.forEach(([title, names], index) => {
    const x = 170 + index * 1335;
    let y = 365;
    const firstY = y;
    for (const name of names) {
      const table = tables.get(name);
      if (!table) continue;
      const h = tableHeight(table);
      placements.set(name, { x, y, w: tableWidth, h, table });
      y += h + 55;
    }
    maxBottom = Math.max(maxBottom, y);
    groups.push({ title, x: x - 35, y: 285, w: 620, h: y - 235 });
  });
  return { placements, groups, height: Math.max(6100, maxBottom + 190) };
}

function keyFlags(table, field, fkFields) {
  const parts = [];
  if (/\bpk\b/i.test(field.flags)) parts.push('PK');
  if (fkFields.has(`${table.name}.${field.name}`)) parts.push('FK');
  return parts.join(' ');
}

function fieldY(box, column) {
  const index = box.table.fields.findIndex((field) => field.name === column);
  return box.y + 39 + Math.max(0, index) * 17 + 12;
}

function relationPath(rel, placements) {
  const source = placements.get(rel.source);
  const target = placements.get(rel.target);
  const sy = fieldY(source, rel.sourceColumns[0]);
  const ty = fieldY(target, rel.targetColumns[0]);
  if (source.x + source.w < target.x) {
    const sx = source.x + source.w; const tx = target.x; const bend = Math.max(140, (tx - sx) * 0.45);
    return `M${sx},${sy} C${sx + bend},${sy} ${tx - bend},${ty} ${tx},${ty}`;
  }
  if (target.x + target.w < source.x) {
    const sx = source.x; const tx = target.x + target.w; const bend = Math.max(140, (sx - tx) * 0.45);
    return `M${sx},${sy} C${sx - bend},${sy} ${tx + bend},${ty} ${tx},${ty}`;
  }
  const toRight = source.x <= target.x;
  const sx = toRight ? source.x + source.w : source.x;
  const tx = toRight ? target.x + target.w : target.x;
  const loopX = toRight ? Math.max(source.x + source.w, target.x + target.w) + 110 : Math.min(source.x, target.x) - 110;
  return `M${sx},${sy} C${loopX},${sy} ${loopX},${ty} ${tx},${ty}`;
}

function tableSvg(box, fkFields) {
  const { table, x, y, w, h } = box;
  const rows = table.fields.map((field, index) => {
    const ry = y + 39 + index * 17;
    const flags = keyFlags(table, field, fkFields);
    const flagColor = flags.includes('FK') ? REL : INK;
    return `<line x1="${x}" y1="${ry}" x2="${x + w}" y2="${ry}" stroke="#e2e8f0" stroke-width="1"/><text x="${x + 10}" y="${ry + 12}" font-family="Arial, Helvetica, sans-serif" font-size="10" font-weight="700" fill="${flagColor}">${flags}</text><text x="${x + 48}" y="${ry + 12}" font-family="Arial, Helvetica, sans-serif" font-size="11" fill="#182a40">${esc(field.name)}</text><text x="${x + w - 10}" y="${ry + 12}" text-anchor="end" font-family="Arial, Helvetica, sans-serif" font-size="10" fill="#60738a">${esc(field.type)}</text>`;
  }).join('');
  return `<g><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="7" fill="#ffffff" stroke="${INK}" stroke-width="1.5"/><rect x="${x}" y="${y}" width="${w}" height="39" rx="7" fill="#e8f1fb" stroke="${INK}" stroke-width="1.5"/><path d="M${x},${y + 39} H${x + w}" stroke="${INK}" stroke-width="1.5"/><text x="${x + w / 2}" y="${y + 25}" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="13" font-weight="700" fill="#173d6a">${esc(table.name)}</text>${rows}</g>`;
}

function fullDbml(tables, relations) {
  const orderedNames = categoryOrder.flatMap(([, names]) => names).filter((name, index, all) => tables.has(name) && all.indexOf(name) === index);
  const project = `// ParentConnect — complete public schema\n// Generated from the live Supabase foreign-key catalog on 2026-10-28.\n// This source is intentionally not limited to dbdiagram's free-plan table cap.\n\nProject parentconnect_full_schema {\n  database_type: 'PostgreSQL'\n  Note: '57 public tables and 66 live foreign-key constraints.'\n}\n\n`;
  const body = orderedNames.map((name) => {
    const table = tables.get(name);
    const fields = table.fields.map((f) => `  ${f.name} ${f.type}${f.flags ? ` [${f.flags}]` : ''}`).join('\n');
    return `Table ${name} {\n${fields}\n}`;
  }).join('\n\n');
  const refs = relations.map((rel) => {
    const left = rel.sourceColumns.length === 1 ? `${rel.source}.${rel.sourceColumns[0]}` : `${rel.source}.(${rel.sourceColumns.join(', ')})`;
    const right = rel.targetColumns.length === 1 ? `${rel.target}.${rel.targetColumns[0]}` : `${rel.target}.(${rel.targetColumns.join(', ')})`;
    return `Ref: ${left} > ${right}`;
  }).join('\n');
  return `${project}${body}\n\n// Live Supabase foreign-key constraints.\n${refs}\n`;
}

function svg(tables, relations) {
  const { placements, groups, height } = layout(tables);
  const fkFields = new Set(relations.flatMap((rel) => rel.sourceColumns.map((column) => `${rel.source}.${column}`)));
  const groupSvg = groups.map((g) => `<g><rect x="${g.x}" y="${g.y}" width="${g.w}" height="${g.h}" rx="12" fill="#f8fafc" fill-opacity="0.55" stroke="#9eb2c9" stroke-width="1.2" stroke-dasharray="8 6"/><text x="${g.x + 16}" y="${g.y + 25}" font-family="Arial, Helvetica, sans-serif" font-size="15" font-weight="700" fill="#274c77">${esc(g.title)}</text></g>`).join('');
  const relSvg = relations.map((rel) => `<path d="${relationPath(rel, placements)}" fill="none" stroke="${REL}" stroke-width="1.35" stroke-opacity="0.72" marker-start="url(#crow)" marker-end="url(#one)"/>`).join('');
  const tableSvgAll = [...placements.values()].map((box) => tableSvg(box, fkFields)).join('');
  return `<?xml version="1.0" encoding="UTF-8"?><svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${height}" viewBox="0 0 ${WIDTH} ${height}"><defs><marker id="one" markerWidth="10" markerHeight="10" refX="9" refY="5" orient="auto"><path d="M7,0 V10" stroke="${REL}" stroke-width="1.8" fill="none"/></marker><marker id="crow" markerWidth="13" markerHeight="13" refX="2" refY="6" orient="auto"><path d="M12,0 L2,6 L12,12 M2,6 H0" stroke="${REL}" stroke-width="1.8" fill="none"/></marker></defs><rect width="100%" height="100%" fill="#ffffff"/><text x="${WIDTH / 2}" y="72" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="32" font-weight="700" fill="#173d6a">PARENTCONNECT — COMPLETE DATABASE ENTITY RELATIONSHIP DIAGRAM</text><text x="${WIDTH / 2}" y="104" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="16" fill="#415a77">Live Supabase public schema · 57 tables · 66 enforced foreign-key constraints · generated 2026-10-28</text><g transform="translate(3050 150)"><rect x="0" y="0" width="28" height="18" fill="#e8f1fb" stroke="${INK}"/><text x="38" y="14" font-family="Arial, Helvetica, sans-serif" font-size="13" fill="#182a40">table / field</text><path d="M210,9 H270" stroke="${REL}" stroke-width="1.5" marker-start="url(#crow)" marker-end="url(#one)"/><text x="282" y="14" font-family="Arial, Helvetica, sans-serif" font-size="13" fill="#182a40">enforced FK (many → one)</text><text x="590" y="14" font-family="Arial, Helvetica, sans-serif" font-size="13" fill="${REL}">FK</text><text x="614" y="14" font-family="Arial, Helvetica, sans-serif" font-size="13" fill="#182a40">marked at source field</text></g>${groupSvg}<g>${relSvg}</g>${tableSvgAll}<text x="${WIDTH / 2}" y="${height - 40}" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="12" fill="#60738a">Source: ParentConnect Supabase public schema. Orange connectors are live database foreign-key constraints; all fields are shown in the table cards.</text></svg>`;
}

(async () => {
  const { tables, relations } = prepare();
  const base = '00-parentconnect-complete-database-erd';
  fs.writeFileSync(path.join(OUT, `${base}.dbml`), fullDbml(tables, relations));
  const source = svg(tables, relations);
  fs.writeFileSync(path.join(OUT, `${base}.svg`), source);
  await sharp(Buffer.from(source)).png().toFile(path.join(OUT, `${base}.png`));
  console.log(`Rendered ${base}: ${tables.size} tables, ${relations.length} relationships.`);
})().catch((error) => { console.error(error); process.exitCode = 1; });
