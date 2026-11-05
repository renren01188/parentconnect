const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const outDir = __dirname;
// A4 landscape proportion for a readable thesis figure.
const W = 2480;
const H = 1754;
const BLACK = '#000000';
const FONT = 'Arial, Helvetica, sans-serif';

const entities = [
  { id: 'parent', label: 'Parents / Guardians', x: 100, y: 360 },
  { id: 'adviser', label: 'Advisers', x: 100, y: 610 },
  { id: 'guidance', label: 'Guidance Counselors', x: 100, y: 860 },
  { id: 'ict', label: 'ICT Administrators', x: 100, y: 1110 },
  { id: 'principal', label: 'Principal', x: 2120, y: 360 },
  { id: 'rfid', label: 'RFID Scanner', x: 2120, y: 610 },
  { id: 'reporters', label: 'Students /\nSubject Teachers', x: 2120, y: 860 },
  { id: 'provider', label: 'Email / SMS\nProvider', x: 2120, y: 1110 },
];

// Every arrow is one-way. Separate inbound and outbound flows make the
// direction of each data exchange explicit, as required in a context DFD.
const flows = [
  { id: 'parentIn', pts: [[360, 390], [840, 390]], label: 'Account, report/ticket and excuse requests', lx: 600, ly: 368 },
  { id: 'parentOut', pts: [[840, 420], [360, 420]], label: 'Attendance notices, announcements and case updates', lx: 600, ly: 447 },
  { id: 'adviserIn', pts: [[360, 640], [840, 640]], label: 'Student/class updates and report decisions', lx: 600, ly: 618 },
  { id: 'adviserOut', pts: [[840, 670], [360, 670]], label: 'Class data, report status and alerts', lx: 600, ly: 697 },
  { id: 'guidanceIn', pts: [[360, 890], [840, 890]], label: 'Ticket decisions, case updates and announcements', lx: 600, ly: 868 },
  { id: 'guidanceOut', pts: [[840, 920], [360, 920]], label: 'Escalated cases and alerts', lx: 600, ly: 947 },
  { id: 'ictIn', pts: [[360, 1140], [840, 1140]], label: 'Administration requests and configuration updates', lx: 600, ly: 1118 },
  { id: 'ictOut', pts: [[840, 1170], [360, 1170]], label: 'Audit, delivery and deletion status', lx: 600, ly: 1197 },
  { id: 'principalIn', pts: [[2120, 390], [1640, 390]], label: 'Resolution decisions and announcements', lx: 1880, ly: 368 },
  { id: 'principalOut', pts: [[1640, 420], [2120, 420]], label: 'Attendance, student and report summaries', lx: 1880, ly: 447 },
  { id: 'rfidIn', pts: [[2120, 640], [1640, 640]], label: 'RFID tap data', lx: 1880, ly: 618 },
  { id: 'rfidOut', pts: [[1640, 670], [2120, 670]], label: 'Scan validation', lx: 1880, ly: 697 },
  { id: 'reportersIn', pts: [[2120, 890], [1640, 890]], label: 'Student or subject teacher report submission', lx: 1880, ly: 868 },
  { id: 'providerOut', pts: [[1640, 1140], [2120, 1140]], label: 'Email, SMS and OTP requests', lx: 1880, ly: 1118 },
  { id: 'providerIn', pts: [[2120, 1170], [1640, 1170]], label: 'Delivery status and errors', lx: 1880, ly: 1197 },
];

function esc(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function linePath(points) {
  return points.map(([x, y], index) => `${index ? 'L' : 'M'} ${x} ${y}`).join(' ');
}

function svgText(value, x, y, size = 15, weight = 'normal') {
  return `<text x="${x}" y="${y}" text-anchor="middle" font-family="${FONT}" font-size="${size}" font-weight="${weight}" fill="${BLACK}">${esc(value)}</text>`;
}

function svgEdge(points) {
  return `<path d="${linePath(points)}" fill="none" stroke="${BLACK}" stroke-width="2" marker-end="url(#arrow)"/>`;
}

function svgEntity(item) {
  const lines = item.label.split('\n');
  const firstY = item.y + (lines.length === 1 ? 48 : 36);
  return `<rect x="${item.x}" y="${item.y}" width="260" height="78" fill="none" stroke="${BLACK}" stroke-width="2"/>${lines.map((line, index) => svgText(line, item.x + 130, firstY + (index * 24), 19, 'bold')).join('')}`;
}

function svgProcess() {
  return `<rect x="840" y="300" width="800" height="940" rx="32" ry="32" fill="none" stroke="${BLACK}" stroke-width="3"/>
    ${svgText('0', 1240, 675, 30, 'bold')}
    ${svgText('PARENTCONNECT SYSTEM', 1240, 760, 34, 'bold')}
    ${svgText('School Attendance, Parent Communication,', 1240, 812, 21, 'normal')}
    ${svgText('Guidance Case and Administration System', 1240, 844, 21, 'normal')}`;
}

function svg() {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs><marker id="arrow" markerWidth="10" markerHeight="10" refX="8" refY="5" orient="auto" markerUnits="strokeWidth"><path d="M 0 0 L 10 5 L 0 10 z" fill="${BLACK}"/></marker></defs>
  <rect width="${W}" height="${H}" fill="#ffffff"/>
  ${svgText('PARENTCONNECT CONTEXT DIAGRAM', W / 2, 65, 30, 'bold')}
  ${svgText('External entities and the data exchanged with Process 0', W / 2, 98, 17)}
  ${flows.map((flow) => svgEdge(flow.pts)).join('')}
  ${entities.map(svgEntity).join('')}
  ${svgProcess()}
  ${flows.map((flow) => svgText(flow.label, flow.lx, flow.ly, 16)).join('')}
  ${svgText('Context Diagram: one process only. Data stores and internal processes appear in the Level 0 DFD.', W / 2, 1665, 16)}
  ${svgText('External entity = rectangle     Process = rounded rectangle     Arrow = one-way data flow', W / 2, 1700, 15)}
</svg>`;
}

function vertex(id, value, style, x, y, width, height) {
  return `<mxCell id="${id}" value="${esc(value)}" style="${style}" vertex="1" parent="1"><mxGeometry x="${x}" y="${y}" width="${width}" height="${height}" as="geometry"/></mxCell>`;
}

function edge(id, points) {
  const [start, end] = points;
  return `<mxCell id="${id}" style="edgeStyle=none;rounded=0;html=1;endArrow=classic;endFill=1;strokeColor=#000000;strokeWidth=2;" edge="1" parent="1"><mxGeometry relative="1" as="geometry"><mxPoint x="${start[0]}" y="${start[1]}" as="sourcePoint"/><mxPoint x="${end[0]}" y="${end[1]}" as="targetPoint"/></mxGeometry></mxCell>`;
}

function label(id, value, x, y) {
  return vertex(id, value, 'shape=none;html=1;align=center;verticalAlign=middle;fontSize=16;fontColor=#000000;whiteSpace=wrap;overflow=hidden;', x - 250, y - 14, 500, 28);
}

function drawioEntity(item) {
  return vertex(item.id, item.label.replace(/\n/g, '<br>'), 'whiteSpace=wrap;html=1;fillColor=none;fillOpacity=0;strokeColor=#000000;strokeWidth=2;fontColor=#000000;fontSize=19;fontStyle=1;align=center;verticalAlign=middle;', item.x, item.y, 260, 78);
}

function drawioProcess() {
  return vertex('process0', '0<br><br><b>PARENTCONNECT SYSTEM</b><br><br>School Attendance, Parent Communication,<br>Guidance Case and Administration System', 'rounded=1;whiteSpace=wrap;html=1;fillColor=none;fillOpacity=0;strokeColor=#000000;strokeWidth=3;fontColor=#000000;fontSize=21;align=center;verticalAlign=middle;', 840, 300, 800, 940);
}

function drawio() {
  const title = `${vertex('title', 'PARENTCONNECT CONTEXT DIAGRAM', 'shape=none;html=1;align=center;verticalAlign=middle;fontSize=30;fontStyle=1;fontColor=#000000;', 590, 38, 1300, 40)}${vertex('subtitle', 'External entities and the data exchanged with Process 0', 'shape=none;html=1;align=center;verticalAlign=middle;fontSize=17;fontColor=#000000;', 740, 78, 1000, 30)}`;
  const footer = `${vertex('footer1', 'Context Diagram: one process only. Data stores and internal processes appear in the Level 0 DFD.', 'shape=none;html=1;align=center;verticalAlign=middle;fontSize=16;fontColor=#000000;', 490, 1650, 1500, 30)}${vertex('footer2', 'External entity = rectangle     Process = rounded rectangle     Arrow = one-way data flow', 'shape=none;html=1;align=center;verticalAlign=middle;fontSize=15;fontColor=#000000;', 490, 1690, 1500, 30)}`;
  return `<?xml version="1.0" encoding="UTF-8"?>
<mxfile host="app.diagrams.net" modified="2026-10-29T00:00:00.000Z" agent="Codex" version="26.0.14"><diagram id="parentconnect-context" name="Context DFD"><mxGraphModel dx="2480" dy="1754" grid="1" gridSize="10" page="1" pageWidth="2480" pageHeight="1754" background="#ffffff" math="0" shadow="0"><root><mxCell id="0"/><mxCell id="1" parent="0"/>${title}${flows.map((flow) => edge(flow.id, flow.pts)).join('')}${entities.map(drawioEntity).join('')}${drawioProcess()}${flows.map((flow) => label(`${flow.id}label`, flow.label, flow.lx, flow.ly)).join('')}${footer}</root></mxGraphModel></diagram></mxfile>`;
}

async function main() {
  const base = '01-parentconnect-context-data-flow-diagram';
  fs.writeFileSync(path.join(outDir, `${base}.svg`), svg());
  fs.writeFileSync(path.join(outDir, `${base}.drawio`), drawio());
  await sharp(Buffer.from(svg())).png().toFile(path.join(outDir, `${base}.png`));
  console.log('Created ParentConnect context DFD (SVG, PNG, and editable draw.io).');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
