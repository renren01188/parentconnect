const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const ROOT = __dirname;
const BLACK = '#000000';
const FONT = 'Arial, Helvetica, sans-serif';

function esc(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function pathD(points) {
  return points.map(([x, y], index) => `${index ? 'L' : 'M'} ${x} ${y}`).join(' ');
}

function svgText(value, x, y, size = 14, weight = 'normal') {
  return `<text x="${x}" y="${y}" text-anchor="middle" font-family="${FONT}" font-size="${size}" font-weight="${weight}" fill="${BLACK}">${esc(value)}</text>`;
}

function svgEntity(item) {
  const lines = String(item.label).split('\n');
  const fontSize = item.fontSize || 16;
  const lineGap = item.lineGap || 20;
  const firstLineY = item.y + item.h / 2 + (fontSize * 0.35) - ((lines.length - 1) * (lineGap / 2));
  return `<rect x="${item.x}" y="${item.y}" width="${item.w}" height="${item.h}" fill="none" stroke="${BLACK}" stroke-width="2"/>${lines.map((line, index) => svgText(line, item.x + item.w / 2, firstLineY + (index * lineGap), fontSize, 'bold')).join('')}`;
}

function svgProcess(item) {
  const cx = item.x + item.w / 2;
  const numberSize = item.numberSize || 15;
  const fontSize = item.fontSize || 17;
  const lines = item.lines.length === 2
    ? `${svgText(item.number, cx, item.y + (item.numberOffset || 36), numberSize, 'bold')}${svgText(item.lines[0], cx, item.y + (item.lineOneOffset || 62), fontSize, 'bold')}${svgText(item.lines[1], cx, item.y + (item.lineTwoOffset || 84), fontSize, 'bold')}`
    : `${svgText(item.number, cx, item.y + (item.numberOffset || 42), numberSize, 'bold')}${svgText(item.lines[0], cx, item.y + (item.lineOneOffset || 72), fontSize, 'bold')}`;
  return `<rect x="${item.x}" y="${item.y}" width="${item.w}" height="${item.h}" rx="16" ry="16" fill="none" stroke="${BLACK}" stroke-width="2.5"/>${lines}`;
}

function svgLinked(item) {
  const cx = item.x + item.w / 2;
  const values = item.lines.length === 2
    ? `${svgText(item.lines[0], cx, item.y + 37, 15, 'bold')}${svgText(item.lines[1], cx, item.y + 61, 16, 'bold')}`
    : svgText(item.lines[0], cx, item.y + 52, 16, 'bold');
  return `<rect x="${item.x}" y="${item.y}" width="${item.w}" height="${item.h}" rx="16" ry="16" fill="none" stroke="${BLACK}" stroke-width="2.5"/>${values}`;
}

function svgStore(item) {
  const fontSize = item.fontSize || 13;
  const codeWidth = 56;
  return `<rect x="${item.x}" y="${item.y}" width="${item.w}" height="${item.h}" fill="none" stroke="${BLACK}" stroke-width="2"/><line x1="${item.x + codeWidth}" y1="${item.y}" x2="${item.x + codeWidth}" y2="${item.y + item.h}" stroke="${BLACK}" stroke-width="2"/>${svgText(item.code, item.x + codeWidth / 2, item.y + item.h / 2 + (fontSize * 0.35), fontSize, 'bold')}${svgText(item.name, item.x + codeWidth + (item.w - codeWidth) / 2, item.y + item.h / 2 + (fontSize * 0.35), fontSize, 'bold')}`;
}

function svgEdge(flow) {
  return `<path d="${pathD(flow.pts)}" fill="none" stroke="${BLACK}" stroke-width="2" marker-end="url(#arrow)"/>`;
}

function vertex(id, value, style, x, y, width, height) {
  return `<mxCell id="${id}" value="${esc(value)}" style="${style}" vertex="1" parent="1"><mxGeometry x="${x}" y="${y}" width="${width}" height="${height}" as="geometry"/></mxCell>`;
}

function drawioEdge(id, points) {
  const [first, ...rest] = points;
  const last = rest.pop();
  const mid = rest.length ? `<Array as="points">${rest.map(([x, y]) => `<mxPoint x="${x}" y="${y}"/>`).join('')}</Array>` : '';
  return `<mxCell id="${id}" style="edgeStyle=none;rounded=0;html=1;endArrow=classic;endFill=1;strokeColor=#000000;strokeWidth=2;" edge="1" parent="1"><mxGeometry relative="1" as="geometry"><mxPoint x="${first[0]}" y="${first[1]}" as="sourcePoint"/><mxPoint x="${last[0]}" y="${last[1]}" as="targetPoint"/>${mid}</mxGeometry></mxCell>`;
}

function drawioText(id, value, x, y, width = 260, size = 13, bold = false) {
  const height = Math.max(24, size + 8);
  return vertex(id, value, `shape=none;html=1;align=center;verticalAlign=middle;fontSize=${size};fontColor=#000000;${bold ? 'fontStyle=1;' : ''}fillColor=none;fillOpacity=0;strokeColor=none;strokeOpacity=0;whiteSpace=wrap;overflow=hidden;`, x - width / 2, y - height / 2, width, height);
}

function drawioEntity(item) {
  return vertex(item.id, String(item.label).replace(/\n/g, '<br>'), `whiteSpace=wrap;html=1;align=center;verticalAlign=middle;fontSize=${item.fontSize || 16};fontStyle=1;fontColor=#000000;fillColor=none;fillOpacity=0;strokeColor=#000000;strokeWidth=2;`, item.x, item.y, item.w, item.h);
}

function drawioProcess(item) {
  const content = item.lines.length === 2
    ? `${item.number}<br><b>${item.lines[0]}<br>${item.lines[1]}</b>`
    : `${item.number}<br><b>${item.lines[0]}</b>`;
  return vertex(item.id, content, `rounded=1;whiteSpace=wrap;html=1;align=center;verticalAlign=middle;fontSize=${item.fontSize || 16};fontColor=#000000;fillColor=none;fillOpacity=0;strokeColor=#000000;strokeWidth=2;`, item.x, item.y, item.w, item.h);
}

function drawioLinked(item) {
  return vertex(item.id, item.lines.join('<br>'), 'rounded=1;whiteSpace=wrap;html=1;align=center;verticalAlign=middle;fontSize=16;fontStyle=1;fontColor=#000000;fillColor=none;fillOpacity=0;strokeColor=#000000;strokeWidth=2.5;', item.x, item.y, item.w, item.h);
}

function drawioStore(item) {
  const base = 'whiteSpace=wrap;html=1;align=center;verticalAlign=middle;fillColor=none;fillOpacity=0;strokeColor=#000000;strokeWidth=2;fontColor=#000000;fontStyle=1;';
  const fontSize = item.fontSize || 13;
  const codeWidth = 56;
  return `${vertex(`${item.id}code`, item.code, `${base}fontSize=${fontSize};`, item.x, item.y, codeWidth, item.h)}${vertex(item.id, item.name, `${base}fontSize=${fontSize};`, item.x + codeWidth, item.y, item.w - codeWidth, item.h)}`;
}

function makeSvg(diagram) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${diagram.w}" height="${diagram.h}" viewBox="0 0 ${diagram.w} ${diagram.h}">
  <defs><marker id="arrow" markerWidth="10" markerHeight="10" refX="8" refY="5" orient="auto" markerUnits="strokeWidth"><path d="M 0 0 L 10 5 L 0 10 z" fill="${BLACK}"/></marker></defs>
  <rect width="${diagram.w}" height="${diagram.h}" fill="#ffffff"/>
  ${svgText(diagram.title, diagram.w / 2, 52, diagram.titleSize || 25, 'bold')}
  ${svgText(diagram.subtitle, diagram.w / 2, 82, diagram.subtitleSize || 14)}
  ${diagram.flows.map(svgEdge).join('')}
  ${diagram.entities.map(svgEntity).join('')}
  ${diagram.links.map(svgLinked).join('')}
  ${diagram.processes.map(svgProcess).join('')}
  ${diagram.stores.map(svgStore).join('')}
  ${diagram.flows.map((flow) => svgText(flow.label, flow.lx, flow.ly, diagram.flowSize || flow.size || 13)).join('')}
  ${svgText('External entity = rectangle     Process = rounded rectangle     Data store = segmented D# box', diagram.w / 2, diagram.h - 38, diagram.footerSize || 13)}
  ${svgText(diagram.note, diagram.w / 2, diagram.h - 15, diagram.footerSize || 13)}
</svg>`;
}

function makeDrawio(diagram) {
  const title = `${drawioText('title', diagram.title, diagram.w / 2, 46, 1250, diagram.titleSize || 24, true)}${drawioText('subtitle', diagram.subtitle, diagram.w / 2, 78, 1300, diagram.subtitleSize || 14)}`;
  const labels = diagram.flows.map((flow) => drawioText(`${flow.id}label`, flow.label, flow.lx, flow.ly, flow.lw || 250, diagram.flowSize || flow.size || 13)).join('');
  const footer = `${drawioText('legend', 'External entity = rectangle     Process = rounded rectangle     Data store = segmented D# box', diagram.w / 2, diagram.h - 38, 1400, diagram.footerSize || 13)}${drawioText('note', diagram.note, diagram.w / 2, diagram.h - 15, 1400, diagram.footerSize || 13)}`;
  return `<?xml version="1.0" encoding="UTF-8"?><mxfile host="app.diagrams.net" modified="2026-10-28T00:00:00.000Z" agent="Codex" version="26.0.14"><diagram id="${diagram.id}" name="${esc(diagram.name)}"><mxGraphModel dx="2400" dy="1450" grid="1" gridSize="10" page="1" pageWidth="${diagram.w}" pageHeight="${diagram.h}" background="#ffffff" math="0" shadow="0"><root><mxCell id="0"/><mxCell id="1" parent="0"/>${title}${diagram.flows.map((flow) => drawioEdge(flow.id, flow.pts)).join('')}${diagram.entities.map(drawioEntity).join('')}${diagram.links.map(drawioLinked).join('')}${diagram.processes.map(drawioProcess).join('')}${diagram.stores.map(drawioStore).join('')}${labels}${footer}</root></mxGraphModel></diagram></mxfile>`;
}

const baseProcess = (id, number, lines, x, y) => ({ id, number, lines, x, y, w: 300, h: 110 });
const entity = (id, label, x, y) => ({ id, label, x, y, w: 250, h: 80 });
const linked = (id, lines, x, y) => ({ id, lines, x, y, w: 260, h: 90 });
const store = (id, code, name, x, y) => ({ id, code, name, x, y, w: 340, h: 60 });
const reportProcess = (id, number, lines, x, y) => ({
  id, number, lines, x, y, w: 320, h: 130,
  fontSize: 20, numberSize: 18, numberOffset: 38, lineOneOffset: 74, lineTwoOffset: 102,
});
const reportEntity = (id, label, x, y) => ({ id, label, x, y, w: 260, h: 85, fontSize: 18, lineGap: 22 });
const reportStore = (id, code, name, x, y, w = 340) => ({ id, code, name, x, y, w, h: 70, fontSize: 17 });
const overviewProcess = (id, number, lines, x, y) => ({
  id, number, lines, x, y, w: 350, h: 140,
  fontSize: 22, numberSize: 19, numberOffset: 40, lineOneOffset: 78, lineTwoOffset: 106,
});
const overviewEntity = (id, label, x, y) => ({ id, label, x, y, w: 260, h: 90, fontSize: 20, lineGap: 24 });
const overviewStore = (id, code, name, x, y) => ({ id, code, name, x, y, w: 350, h: 70, fontSize: 18 });

const level0 = {
  id: 'parentconnect-level-0',
  name: 'Level 0 DFD',
  w: 2600,
  h: 1840,
  titleSize: 34,
  subtitleSize: 18,
  footerSize: 16,
  flowSize: 18,
  title: 'PARENTCONNECT LEVEL 0 DATA FLOW DIAGRAM',
  subtitle: 'Overview of ParentConnect processes, external entities, data flows, and data stores',
  note: '* Repeated Parent and ICT boxes represent the same external entities; they are repeated only for readability.',
  entities: [
    overviewEntity('parentAccess', 'Parents / Guardians', 70, 345),
    overviewEntity('advisers', 'Advisers', 720, 720),
    overviewEntity('parentExcuse', 'Parents / Guardians*', 1430, 700),
    overviewEntity('parentReports', 'Parents / Guardians*', 70, 900),
    overviewEntity('reporters', 'Students /\nSubject Teachers', 70, 1050),
    overviewEntity('ictRecords', 'ICT Administrators*', 750, 610),
    overviewEntity('guidance', 'Guidance Counselors', 2260, 900),
    overviewEntity('principal', 'Principal', 2260, 1050),
    overviewEntity('ict', 'ICT Administrators', 70, 1385),
    overviewEntity('rfid', 'RFID Scanner', 2260, 345),
    overviewEntity('provider', 'Email / SMS Provider', 2260, 1385),
    overviewEntity('parentNotice', 'Parents / Guardians*', 2260, 1650),
  ],
  links: [],
  processes: [
    overviewProcess('p1', '1.0', ['User Account & Access', 'Management'], 450, 320),
    overviewProcess('p2', '2.0', ['Student, Parent &', 'Class Records'], 1080, 320),
    overviewProcess('p3', '3.0', ['Attendance Recording', '& Monitoring'], 1710, 320),
    overviewProcess('p4', '4.0', ['Report, Guidance &', 'Case Resolution'], 1080, 880),
    overviewProcess('p6', '6.0', ['ICT Administration', '& Audit'], 450, 1360),
    overviewProcess('p5', '5.0', ['Notification &', 'Announcement Management'], 1710, 1360),
  ],
  stores: [
    overviewStore('d1', 'D1', 'User & Role Records', 450, 530),
    overviewStore('d2', 'D2', 'Student, Parent & Class Records', 1080, 530),
    overviewStore('d3', 'D3', 'Attendance Records', 1710, 530),
    overviewStore('d4', 'D4', 'Report & Guidance Case Records', 1080, 1100),
    overviewStore('d6', 'D6', 'ICT Administration & Audit Records', 415, 1600, 420),
    overviewStore('d5', 'D5', 'Notification & Announcement Records', 1675, 1600, 420),
  ],
  flows: [
    { id: 'f1', pts: [[330, 390], [450, 390]], label: 'Account and access requests', lx: 390, ly: 360, lw: 260 },
    { id: 'f2', pts: [[800, 390], [1080, 390]], label: 'Authorised user context', lx: 940, ly: 360, lw: 230 },
    { id: 'f3', pts: [[1430, 390], [1710, 390]], label: 'Student and class context', lx: 1570, ly: 360, lw: 240 },
    { id: 'f4', pts: [[980, 765], [1030, 765], [1030, 410], [1080, 410]], label: 'Student/class updates', lx: 1070, ly: 785, lw: 220 },
    { id: 'f4a', pts: [[1010, 655], [1040, 655], [1040, 430], [1080, 430]], label: 'Record update request', lx: 930, ly: 575, lw: 220 },
    { id: 'f5', pts: [[330, 945], [1080, 945]], label: 'Parent guidance tickets and replies', lx: 705, ly: 915, lw: 320 },
    { id: 'f5b', pts: [[1690, 745], [1695, 745], [1695, 430], [1710, 430]], label: 'Parent Excuse Request', lx: 1550, ly: 650, lw: 220 },
    { id: 'f5a', pts: [[330, 1095], [900, 1095], [900, 990], [1080, 990]], label: 'Student or subject teacher report submission', lx: 615, ly: 1130, lw: 330 },
    { id: 'f6', pts: [[850, 810], [850, 850], [1255, 850], [1255, 880]], label: 'Report review, decision, and escalation', lx: 1050, ly: 825, lw: 320 },
    { id: 'f7', pts: [[2260, 390], [2060, 390]], label: 'RFID tap data', lx: 2160, ly: 360, lw: 180 },
    { id: 'f8', pts: [[2060, 430], [2180, 430], [2180, 1250], [1955, 1250], [1955, 1360]], label: 'Attendance notification request', lx: 2330, ly: 790, lw: 280 },
    { id: 'f9', pts: [[2260, 945], [1430, 945]], label: 'Guidance decision or escalation', lx: 1845, ly: 915, lw: 280 },
    { id: 'f10', pts: [[2260, 1095], [1530, 1095], [1530, 990], [1430, 990]], label: 'Principal resolution or approval', lx: 1880, ly: 1130, lw: 280 },
    { id: 'f11', pts: [[1430, 950], [1600, 950], [1600, 1250], [1795, 1250], [1795, 1360]], label: 'Report and case notification request', lx: 1600, ly: 1180, lw: 300 },
    { id: 'f14', pts: [[330, 1430], [450, 1430]], label: 'Administration and configuration', lx: 390, ly: 1400, lw: 280 },
    { id: 'f15', pts: [[450, 1470], [330, 1470]], label: 'Audit status', lx: 390, ly: 1510, lw: 180 },
    { id: 'f16', pts: [[800, 1430], [1710, 1430]], label: 'Notification configuration', lx: 1255, ly: 1400, lw: 280 },
    { id: 'f16b', pts: [[1710, 1470], [800, 1470]], label: 'Notification delivery audit events', lx: 1255, ly: 1520, lw: 320 },
    { id: 'f17', pts: [[2060, 1430], [2260, 1430]], label: 'Email, SMS, and OTP requests', lx: 2160, ly: 1400, lw: 260 },
    { id: 'f18', pts: [[2260, 1470], [2060, 1470]], label: 'Delivery status', lx: 2160, ly: 1510, lw: 180 },
    { id: 'f19', pts: [[2060, 1500], [2180, 1500], [2180, 1695], [2260, 1695]], label: 'Attendance notices, announcements, and case outcomes', lx: 2310, ly: 1600, lw: 340 },
    { id: 's1a', pts: [[600, 460], [600, 530]], label: '', lx: 0, ly: 0 },
    { id: 's1b', pts: [[650, 530], [650, 460]], label: '', lx: 0, ly: 0 },
    { id: 's2a', pts: [[1230, 460], [1230, 530]], label: '', lx: 0, ly: 0 },
    { id: 's2b', pts: [[1280, 530], [1280, 460]], label: '', lx: 0, ly: 0 },
    { id: 's3a', pts: [[1860, 460], [1860, 530]], label: '', lx: 0, ly: 0 },
    { id: 's3b', pts: [[1910, 530], [1910, 460]], label: '', lx: 0, ly: 0 },
    { id: 's4a', pts: [[1230, 1020], [1230, 1100]], label: '', lx: 0, ly: 0 },
    { id: 's4b', pts: [[1280, 1100], [1280, 1020]], label: '', lx: 0, ly: 0 },
    { id: 's6a', pts: [[600, 1500], [600, 1600]], label: '', lx: 0, ly: 0 },
    { id: 's6b', pts: [[650, 1600], [650, 1500]], label: '', lx: 0, ly: 0 },
    { id: 's5a', pts: [[1860, 1500], [1860, 1600]], label: '', lx: 0, ly: 0 },
    { id: 's5b', pts: [[1910, 1600], [1910, 1500]], label: '', lx: 0, ly: 0 },
  ],
};

const attendance = {
  id: 'parentconnect-level-1-attendance',
  name: 'Level 1 - Attendance',
  w: 2400,
  h: 1100,
  title: 'PARENTCONNECT LEVEL 1 DATA FLOW DIAGRAM',
  subtitle: 'Decomposition of Level 0 Process 3.0: Attendance Capture & Monitoring',
  note: 'This Level 1 diagram expands Process 3.0; its inputs and outputs balance with Level 0.',
  entities: [
    entity('adviser', 'Advisers', 80, 420),
    entity('rfid', 'RFID Scanner', 80, 600),
    entity('parents', 'Parents / Guardians', 80, 780),
  ],
  links: [linked('notifications', ['5.0 Notification &', 'Announcement Management'], 1990, 610)],
  processes: [
    baseProcess('p31', '3.1', ['Receive Attendance', 'Input'], 420, 400),
    baseProcess('p32', '3.2', ['Validate Student', '& Session'], 800, 400),
    baseProcess('p33', '3.3', ['Record Attendance', 'Status'], 1180, 400),
    baseProcess('p34', '3.4', ['Queue Email / SMS', 'Attendance Notifications'], 1560, 580),
  ],
  stores: [store('d2', 'D2', 'Student, Parent & Class Records', 780, 180), store('d3', 'D3', 'Attendance Records', 1160, 600)],
  flows: [
    { id: 'a1', pts: [[330, 460], [420, 460]], label: 'Manual attendance or status updates', lx: 375, ly: 440, lw: 280 },
    { id: 'a2', pts: [[330, 640], [370, 640], [370, 500], [420, 500]], label: 'RFID tap data', lx: 330, ly: 667 },
    { id: 'a2b', pts: [[330, 820], [390, 820], [390, 480], [420, 480]], label: 'Parent Excuse Request', lx: 440, ly: 720, lw: 220 },
    { id: 'a3', pts: [[720, 455], [800, 455]], label: 'Attendance input', lx: 760, ly: 435 },
    { id: 'a4', pts: [[950, 240], [950, 400]], label: 'Student and class context', lx: 1075, ly: 320, lw: 250 },
    { id: 'a5', pts: [[1100, 455], [1180, 455]], label: 'Validated student and session', lx: 1140, ly: 435, lw: 250 },
    { id: 'a6', pts: [[1330, 510], [1330, 600]], label: 'Attendance record', lx: 1430, ly: 560 },
    { id: 'a7', pts: [[1460, 630], [1510, 630], [1510, 640], [1560, 640]], label: 'Recorded attendance status', lx: 1510, ly: 600, lw: 240 },
    { id: 'a8', pts: [[1860, 640], [1930, 640], [1930, 655], [1990, 655]], label: 'Attendance email/SMS notification request', lx: 1940, ly: 725, lw: 310 },
  ],
};

const reports = {
  id: 'parentconnect-level-1-reports',
  name: 'Level 1 - Reports and Guidance',
  // A4 portrait layout. The central column is the escalation ladder.
  w: 1770,
  h: 2350,
  titleSize: 28,
  subtitleSize: 16,
  footerSize: 13,
  flowSize: 16,
  title: 'PARENTCONNECT LEVEL 1 DATA FLOW DIAGRAM',
  subtitle: 'Decomposition of Level 0 Process 4.0: Reports, Conversations, Escalation & Resolution',
  note: '* Repeated Parent boxes represent the same external entity. Unresolved cases move to the next review level; any resolved case is closed through Process 4.6.',
  entities: [
    reportEntity('reporters', 'Students /\nSubject Teachers', 60, 522),
    reportEntity('parentsAdviser', 'Parents / Guardians', 60, 1042),
    reportEntity('advisers', 'Advisers', 1050, 1042),
    reportEntity('parentsGuidance', 'Parents / Guardians*', 60, 1302),
    reportEntity('guidance', 'Guidance Counselors', 1050, 1302),
    reportEntity('parentsPrincipal', 'Parents / Guardians*', 60, 1562),
    reportEntity('principal', 'Principal', 1050, 1562),
  ],
  links: [linked('notifications', ['5.0 Notification &', 'Announcement Management'], 980, 1820)],
  processes: [
    reportProcess('p41', '4.1', ['Receive & Validate', 'Report Submission'], 400, 500),
    reportProcess('p42', '4.2', ['Register & Assign', 'Report to Adviser'], 400, 720),
    reportProcess('p43', '4.3', ['Adviser Review &', 'Parent Conversation'], 400, 1020),
    reportProcess('p44', '4.4', ['Guidance Review &', 'Parent Conversation'], 400, 1280),
    reportProcess('p45', '4.5', ['Principal Resolution &', 'Parent Conversation'], 400, 1540),
    reportProcess('p46', '4.6', ['Record Case Outcome &', 'Generate Notifications'], 400, 1800),
  ],
  stores: [
    reportStore('d2', 'D2', 'Student, Parent & Class Records', 970, 270, 560),
    reportStore('d4', 'D4', 'Report & Guidance Case Records', 390, 2020, 580),
  ],
  flows: [
    { id: 'r1', pts: [[320, 565], [400, 565]], label: 'Report submission', lx: 360, ly: 480, lw: 190 },
    { id: 'r2', pts: [[560, 630], [560, 720]], label: 'Validated report', lx: 690, ly: 675, lw: 180 },
    { id: 'r3', pts: [[970, 305], [850, 305], [850, 785], [720, 785]], label: 'Student, parent, and adviser context', lx: 830, ly: 400, lw: 300 },
    { id: 'r4', pts: [[560, 850], [560, 1020]], label: 'Assigned adviser report', lx: 690, ly: 935, lw: 220 },
    { id: 'r5', pts: [[320, 1072], [400, 1072]], label: 'Parent reply', lx: 360, ly: 1025, lw: 160 },
    { id: 'r6', pts: [[400, 1112], [320, 1112]], label: 'Adviser message or status', lx: 360, ly: 1142, lw: 230 },
    { id: 'r7', pts: [[1050, 1082], [720, 1082]], label: 'Review, resolve, or escalate', lx: 885, ly: 990, lw: 250 },
    { id: 'r8', pts: [[560, 1150], [560, 1280]], label: 'Unresolved adviser case', lx: 700, ly: 1215, lw: 230 },
    { id: 'r10', pts: [[320, 1332], [400, 1332]], label: 'Direct ticket or parent reply', lx: 360, ly: 1260, lw: 250 },
    { id: 'r11', pts: [[400, 1372], [320, 1372]], label: 'Guidance message or decision', lx: 360, ly: 1402, lw: 250 },
    { id: 'r12', pts: [[1050, 1342], [720, 1342]], label: 'Guidance decision or escalation', lx: 885, ly: 1250, lw: 270 },
    { id: 'r13', pts: [[560, 1410], [560, 1540]], label: 'Unresolved guidance case', lx: 710, ly: 1475, lw: 260 },
    { id: 'r15', pts: [[320, 1592], [400, 1592]], label: 'Parent reply', lx: 360, ly: 1520, lw: 160 },
    { id: 'r16', pts: [[400, 1632], [320, 1632]], label: 'Principal message or outcome', lx: 360, ly: 1662, lw: 270 },
    { id: 'r17', pts: [[1050, 1602], [720, 1602]], label: 'Final resolution', lx: 885, ly: 1500, lw: 180 },
    { id: 'r18', pts: [[560, 1670], [560, 1800]], label: 'Case outcome', lx: 680, ly: 1735, lw: 180 },
    { id: 'r20', pts: [[560, 1930], [560, 2020]], label: 'Lifecycle updates', lx: 700, ly: 1975, lw: 190 },
    { id: 'r21', pts: [[720, 1865], [980, 1865]], label: 'Notification request', lx: 850, ly: 1840, lw: 210 },
  ],
};

async function writeDiagram(diagram, folder, baseName) {
  const output = path.join(ROOT, folder);
  fs.mkdirSync(output, { recursive: true });
  const svg = makeSvg(diagram);
  fs.writeFileSync(path.join(output, `${baseName}.svg`), svg);
  fs.writeFileSync(path.join(output, `${baseName}.drawio`), makeDrawio(diagram));
  await sharp(Buffer.from(svg)).png().toFile(path.join(output, `${baseName}.png`));
}

async function main() {
  const requestedDiagram = process.argv[2];
  const onlyReports = requestedDiagram === 'reports';
  const onlyLevel0 = requestedDiagram === 'level0';
  const onlyAttendance = requestedDiagram === 'attendance';

  if (onlyLevel0) {
    await writeDiagram(level0, 'Level-0-Diagram', '02-parentconnect-level-0-data-flow-diagram');
    console.log('Created the Level 0 DFD.');
    return;
  }

  if (onlyAttendance) {
    await writeDiagram(attendance, 'Level-1-Diagram', '03-parentconnect-level-1-attendance-capture-and-monitoring-data-flow-diagram');
    console.log('Created the Level 1 Attendance DFD.');
    return;
  }

  if (!onlyReports) {
    await writeDiagram(level0, 'Level-0-Diagram', '02-parentconnect-level-0-data-flow-diagram');
    await writeDiagram(attendance, 'Level-1-Diagram', '03-parentconnect-level-1-attendance-capture-and-monitoring-data-flow-diagram');
  }

  await writeDiagram(reports, 'Level-1-Diagram', '04-parentconnect-level-1-reports-guidance-and-resolution-data-flow-diagram');
  console.log(onlyReports ? 'Created the Level 1 Reports DFD.' : 'Created complete Level 0 and Level 1 ParentConnect DFDs.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
