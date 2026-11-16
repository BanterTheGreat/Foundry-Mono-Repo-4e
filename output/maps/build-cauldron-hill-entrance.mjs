// Cauldron Hill front-door encounter (ZEITGEIST Act One, Adventure Five, "Cauldron Hill Entrance").
// Builds a read-only 40 x 28 grid with edge walls (data-walls / data-doors) per the dnd4e-battlemap skill.
import { writeFileSync } from 'node:fs';

const COLS = 40;
const ROWS = 28;
const key = (c, r) => `${c},${r}`;

/* ---------- terrain kinds ---------- */
const KINDS = {
  open: { color: '#E9DFC9', sym: '.', name: 'Open ground' },
  diff: { color: '#B9A587', sym: '~', name: 'Scrub and scree (difficult)' },
  tree: { color: '#214E92', sym: 'T', name: 'Dead tree (blocking)' },
  boulder: { color: '#214E92', sym: 'B', name: 'Boulder (blocking)' },
  machine: { color: '#214E92', sym: 'M', name: 'Hydraulic mechanism (blocking)' },
  rock: { color: '#4A4E55', sym: '▒', name: 'Solid rock (off-map)' },
  ward: { color: '#6BADE8', sym: 'W', name: 'Ward post (cover)' },
  slag: { color: '#6BADE8', sym: 'S', name: 'Slag heap (cover)' },
  cart: { color: '#6BADE8', sym: 'K', name: 'Rail cart (cover)' },
  furn: { color: '#6BADE8', sym: 'F', name: 'Guard-room furnishings (cover)' },
  debris: { color: '#6BADE8', sym: 'D', name: 'Shack debris (cover)' },
  pyre: { color: '#6BADE8', sym: 'O', name: 'Unlit pyre (cover)' },
  ramp: { color: '#C9AD73', sym: 'R', name: 'Worn ascent (ramp)' },
  start: { color: '#42A568', sym: 'P', name: 'Party start' },
  lever: { color: '#42A568', sym: 'L', name: 'Door lever' },
  gate: { color: '#42A568', sym: 'G', name: 'Rusted ring gate' },
};

const cells = {};
const set = (c, r, kind, h) => {
  const cell = cells[key(c, r)];
  cell.kind = kind;
  if (h !== undefined) {
    cell.h = h;
  }
};
const rect = (c1, r1, c2, r2, kind, h) => {
  for (let r = r1; r <= r2; r++) {
    for (let c = c1; c <= c2; c++) {
      set(c, r, kind, h);
    }
  }
};
for (let r = 1; r <= ROWS; r++) {
  for (let c = 1; c <= COLS; c++) {
    cells[key(c, r)] = { c, r, kind: 'open', h: 0, walls: new Set(), doors: new Set() };
  }
}

/* ---------- the hill: ledges at +10, foyer inside ---------- */
rect(1, 1, 15, 6, 'open', 10);
rect(26, 1, 40, 6, 'open', 10);
// scree on the ledges
for (const [c, r] of [[2,2],[3,2],[2,3],[7,2],[8,2],[8,3],[12,2],[12,3],[13,3],[10,5],[11,5],[11,6],
  [29,2],[30,2],[30,3],[34,2],[34,3],[35,3],[38,2],[39,3],[38,5],[32,5],[33,5],[28,6]]) {
  set(c, r, 'diff');
}
for (const [c, r] of [[5,3],[9,4],[14,2],[31,3],[36,3],[27,4]]) {
  set(c, r, 'boulder');
}
// worn ascents (two-wide), one per flank: ground 0 -> ramp +5 -> ledge +10
rect(4, 6, 5, 6, 'ramp', 5);
rect(36, 6, 37, 6, 'ramp', 5);

// foyer (ground level, inside the hill)
rect(16, 1, 25, 3, 'rock', 0);
rect(16, 4, 25, 6, 'open', 0);
rect(20, 1, 21, 3, 'open', 0); // tunnel to Checkpoint One
rect(16, 5, 17, 6, 'machine', 0);
set(18, 4, 'lever', 0);
set(20, 4, 'cart', 0);
set(21, 4, 'cart', 0);
rect(25, 4, 25, 6, 'furn', 0);
set(24, 5, 'furn', 0);

/* ---------- ground ---------- */
// dead scrub along the flanks
rect(1, 8, 4, 11, 'diff');
rect(37, 8, 40, 11, 'diff');
rect(13, 19, 15, 21, 'diff');
rect(25, 20, 27, 22, 'diff');
rect(10, 24, 12, 26, 'diff');

// south grove: arrival point, dead wood and undergrowth
for (let r = 22; r <= 28; r++) {
  for (let c = 1; c <= COLS; c++) {
    if (c >= 17 && c <= 23) {
      continue;
    }
    set(c, r, 'diff');
  }
}
for (const [c, r] of [[6,22],[10,22],[14,22],[26,22],[30,22],[34,22],[8,23],[12,23],[28,23],[32,23],[36,23],
  [5,24],[9,24],[13,24],[27,24],[31,24],[35,24],[38,24],[7,25],[11,25],[15,25],[25,25],[29,25],[33,25],
  [3,26],[14,27],[26,27],[37,27]]) {
  set(c, r, 'tree');
}
set(20, 26, 'pyre');
for (const [c, r] of [[18,26],[19,26],[21,26],[22,26]]) {
  set(c, r, 'start');
}

// ward posts and slag heaps
for (const [c, r] of [[14,9],[25,9]]) {
  set(c, r, 'ward');
}
for (const [c, r] of [[16,12],[24,13],[17,16],[23,19],[27,17],[14,15]]) {
  set(c, r, 'slag');
}

// concealed U-shaped trench with four rusted ring gates (cols 26-33, rows 8-12)
rect(28, 8, 31, 10, 'rock', 0);
for (const [c, r] of [[26,10],[27,10],[29,11],[29,12],[31,11],[31,12],[32,10],[33,10]]) {
  set(c, r, 'gate', 0);
}

// west shacks
rect(5, 12, 9, 15, 'open');
rect(10, 17, 12, 19, 'open');
for (const [c, r] of [[6,13],[8,14],[11,19]]) {
  set(c, r, 'debris');
}
// east shack
for (const [c, r] of [[34,17],[33,16]]) {
  set(c, r, 'debris');
}

// ambush cover: dead trees on both flanks
for (const [c, r] of [[3,15],[1,18],[4,17],[39,16],[37,18],[40,17]]) {
  set(c, r, 'tree');
}
rect(1, 14, 3, 14, 'diff');
rect(38, 14, 40, 15, 'diff');

/* ---------- walls (edges) ---------- */
const OPP = { N: 'S', S: 'N', E: 'W', W: 'E' };
const DELTA = { N: [0, -1], S: [0, 1], E: [1, 0], W: [-1, 0] };
const edge = (c, r, side, type) => {
  const here = cells[key(c, r)];
  const [dc, dr] = DELTA[side];
  const there = cells[key(c + dc, r + dr)];
  const bucket = type === 'door' ? 'doors' : 'walls';
  here[bucket].add(side);
  if (there) {
    there[bucket].add(OPP[side]);
  }
};
const run = (c1, r1, c2, r2, side, type = 'wall') => {
  for (let r = r1; r <= r2; r++) {
    for (let c = c1; c <= c2; c++) {
      edge(c, r, side, type);
    }
  }
};

// cliff face along the north edge of row 7, except the main door and the two ascents
run(1, 6, 3, 6, 'S');
run(6, 6, 18, 6, 'S');
run(23, 6, 35, 6, 'S');
run(38, 6, 40, 6, 'S');
// ascent side walls (rock either side of each ramp)
run(4, 6, 4, 6, 'W');
run(5, 6, 5, 6, 'E');
run(36, 6, 36, 6, 'W');
run(37, 6, 37, 6, 'E');
// main steel doors (closed): 20 ft wide = 4 squares
run(19, 6, 22, 6, 'S', 'door');

// foyer shell
run(16, 4, 18, 4, 'N');
run(16, 4, 16, 6, 'W');
run(19, 4, 19, 4, 'N');
run(22, 4, 22, 4, 'N');
run(25, 4, 25, 6, 'E');
run(23, 4, 25, 4, 'N');
// tunnel (continues to Checkpoint One off the north edge)
run(20, 1, 20, 3, 'W');
run(21, 1, 21, 3, 'E');
run(20, 1, 21, 1, 'N', 'door');
// mechanism room | lobby
run(18, 4, 18, 4, 'E');
run(18, 6, 18, 6, 'E');
run(18, 5, 18, 5, 'E', 'door');
// lobby | guard room
run(22, 4, 22, 4, 'E');
run(22, 6, 22, 6, 'E');
run(22, 5, 22, 5, 'E', 'door');

// U-trench cut (outer walls)
run(26, 8, 26, 12, 'W');
run(26, 12, 33, 12, 'S');
run(33, 8, 33, 12, 'E');
run(27, 8, 27, 10, 'E');
run(32, 8, 32, 10, 'W');
run(28, 11, 31, 11, 'N');
run(28, 8, 31, 8, 'N');
// west shack A (cols 5-9, rows 12-15)
run(5, 12, 9, 12, 'N');
run(5, 12, 5, 15, 'W');
run(5, 15, 9, 15, 'S');
run(9, 12, 9, 15, 'E');
edge(7, 15, 'S', 'door');
edge(9, 13, 'E', 'door'); // collapsed wall gap
// west shack B (cols 10-12, rows 17-19)
run(10, 17, 12, 17, 'N');
run(10, 17, 10, 19, 'W');
run(10, 19, 12, 19, 'S');
run(12, 17, 12, 19, 'E');
edge(12, 18, 'E', 'door');
// east shack (cols 32-36, rows 15-18)
run(32, 15, 36, 15, 'N');
run(32, 15, 32, 18, 'W');
run(32, 18, 36, 18, 'S');
run(36, 15, 36, 18, 'E');
edge(32, 16, 'W', 'door');
edge(35, 15, 'N', 'door'); // collapsed roofline gap

// door edges clear any wall flag on the same side
for (const cell of Object.values(cells)) {
  for (const side of cell.doors) {
    cell.walls.delete(side);
  }
}

/* ---------- creatures ---------- */
const TIER = {
  A: { color: '#7B2935', label: 'Base (door closed)' },
  B: { color: '#B5651D', label: 'Shift change' },
  C: { color: '#5B2C83', label: 'Alerted ambush' },
};
const creatures = [
  // [id, name, tier, col, row, note]
  ['1', 'Cauldron Hill guard (goon)', 'A', 24, 4, 'guard room, h 0'],
  ['2', 'Cauldron Hill guard (goon)', 'A', 24, 6, 'guard room, h 0'],
  ['3', 'Cauldron Hill guard (goon)', 'A', 14, 10, 'patrol at ward post'],
  ['4', 'Cauldron Hill guard (goon)', 'A', 25, 10, 'patrol at ward post'],
  ['5', 'Obscurati dark creeper (goon)', 'A', 14, 4, 'west ledge, h +10'],
  ['6', 'Obscurati dark creeper (goon)', 'A', 27, 5, 'east ledge, h +10'],
  ['7', 'Cauldron Hill guard (goon)', 'B', 20, 6, 'arrives as the door cycles'],
  ['8', 'Cauldron Hill guard (goon)', 'B', 21, 6, 'arrives as the door cycles'],
  ['9', 'Obscurati dark creeper (goon)', 'C', 2, 16, 'west ambush'],
  ['10', 'Obscurati dark creeper (goon)', 'C', 3, 16, 'west ambush'],
  ['13', 'Tamed serpent-maned lion (minion)', 'C', 3, 17, 'west ambush'],
  ['16', 'Tamed cackling crawler (minion)', 'C', 1, 16, 'west ambush'],
  ['18', 'Obscurati slayer', 'C', 4, 18, 'west ambush'],
  ['19', 'Obscurati slayer', 'C', 2, 19, 'west ambush'],
  ['20', 'Obscurati slayer', 'C', 3, 19, 'west ambush'],
  ['11', 'Obscurati dark creeper (goon)', 'C', 38, 17, 'east ambush'],
  ['12', 'Obscurati dark creeper (goon)', 'C', 40, 16, 'east ambush'],
  ['14', 'Tamed serpent-maned lion (minion)', 'C', 39, 18, 'east ambush'],
  ['17', 'Tamed cackling crawler (minion)', 'C', 38, 16, 'east ambush'],
  ['15', 'Obscurati veteran nethermancer', 'C', 39, 17, 'east ambush'],
  ['21', 'Obscurati slayer', 'C', 37, 17, 'east ambush'],
  ['22', 'Obscurati slayer', 'C', 40, 18, 'east ambush'],
];
const pcs = [
  ['P1', 18, 26],
  ['P2', 19, 26],
  ['P3', 21, 26],
  ['P4', 22, 26],
];

/* ---------- validation ---------- */
const problems = [];
const blocking = new Set(['tree', 'boulder', 'machine', 'rock']);
const seen = new Set();
for (const [id, , , c, r] of creatures) {
  const cell = cells[key(c, r)];
  if (!cell || blocking.has(cell.kind)) {
    problems.push(`creature ${id} on blocking square ${c},${r}`);
  }
  if (seen.has(key(c, r))) {
    problems.push(`creature ${id} shares square ${c},${r}`);
  }
  seen.add(key(c, r));
}
for (const [id, c, r] of pcs) {
  if (cells[key(c, r)].kind !== 'start') {
    problems.push(`${id} not on a start square`);
  }
}
// 4e distance helper (diagonals alternate 1 and 2)
const dist = (a, b) => {
  const dx = Math.abs(a[0] - b[0]);
  const dy = Math.abs(a[1] - b[1]);
  return Math.max(dx, dy) + Math.floor(Math.min(dx, dy) / 2);
};
const doorSquares = [[19, 7], [20, 7], [21, 7], [22, 7]];
for (const [id, , tier, c, r] of creatures) {
  if (tier === 'C') {
    const d = Math.min(...doorSquares.map((s) => dist(s, [c, r])));
    if (d < 20) {
      problems.push(`ambusher ${id} only ${d} squares from the door`);
    }
  }
}
// symmetric walls
for (const cell of Object.values(cells)) {
  for (const [bucket, label] of [['walls', 'wall'], ['doors', 'door']]) {
    for (const side of cell[bucket]) {
      const [dc, dr] = DELTA[side];
      const other = cells[key(cell.c + dc, cell.r + dr)];
      if (other && !other[bucket].has(OPP[side])) {
        problems.push(`asymmetric ${label} at ${cell.c},${cell.r} ${side}`);
      }
    }
  }
}
// reachability from the party starts (walls block; doors closed except inside-open gaps)
const walkable = (cell) => !blocking.has(cell.kind);
const passable = (a, side) => !a.walls.has(side) && !(a.doors.has(side) && a.c >= 19 && a.c <= 22 && a.r >= 6 && a.r <= 7);
const bfs = (start, openDoor) => {
  const q = [start];
  const vis = new Set([key(...start)]);
  while (q.length) {
    const [c, r] = q.shift();
    const cell = cells[key(c, r)];
    for (const side of ['N', 'S', 'E', 'W']) {
      const [dc, dr] = DELTA[side];
      const next = cells[key(c + dc, r + dr)];
      if (!next || !walkable(next) || vis.has(key(next.c, next.r))) {
        continue;
      }
      if (cell.walls.has(side)) {
        continue;
      }
      if (cell.doors.has(side) && !openDoor && c >= 19 && c <= 22 && (r === 6 || r === 7)) {
        continue;
      }
      vis.add(key(next.c, next.r));
      q.push([next.c, next.r]);
    }
  }
  return vis;
};
const closed = bfs([20, 20], false);
const open = bfs([20, 20], true);
for (const [id, , , c, r] of creatures) {
  const k = key(c, r);
  if (!open.has(k)) {
    problems.push(`creature ${id} at ${k} unreachable even with the door open`);
  }
}
for (const [c, r] of [[12, 18], [7, 14], [34, 17], [14, 4], [27, 5], [27, 9]]) {
  if (!closed.has(key(c, r))) {
    problems.push(`feature square ${c},${r} unreachable from party start`);
  }
}
if (closed.has(key(20, 5))) {
  problems.push('foyer reachable with the door closed');
}
if (!open.has(key(20, 5)) || !open.has(key(24, 5)) || !open.has(key(18, 4))) {
  problems.push('foyer rooms unreachable with the door open');
}
if (problems.length) {
  console.error(problems.join('\n'));
  process.exit(1);
}

/* ---------- render ---------- */
const sideOrder = ['N', 'E', 'S', 'W'];
const shadow = (cell) => {
  const parts = [];
  const lines = { N: [0, 1], S: [0, -1], W: [1, 0], E: [-1, 0] };
  for (const side of sideOrder) {
    for (const [bucket, color] of [['walls', '#214E92'], ['doors', '#42A568']]) {
      if (!cell[bucket].has(side)) {
        continue;
      }
      const [dc, dr] = DELTA[side];
      const other = cells[key(cell.c + dc, cell.r + dr)];
      const shared = other && other[bucket].has(OPP[side]);
      const w = shared ? 2 : 4;
      const [x, y] = lines[side];
      parts.push(`inset ${x * w}px ${y * w}px 0 0 ${color}`);
    }
  }
  return parts.length ? `;box-shadow:${parts.join(',')}` : '';
};
const tokenAt = {};
for (const [id, , tier, c, r] of creatures) {
  tokenAt[key(c, r)] = { id, color: TIER[tier].color };
}
for (const [id, c, r] of pcs) {
  tokenAt[key(c, r)] = { id, color: '#183F79' };
}

const out = [];
out.push('<div class="axis"></div>');
for (let c = 1; c <= COLS; c++) {
  out.push(`<div class="axis">${c}</div>`);
}
for (let r = 1; r <= ROWS; r++) {
  out.push(`<div class="axis">${r}</div>`);
  for (let c = 1; c <= COLS; c++) {
    const cell = cells[key(c, r)];
    const kind = KINDS[cell.kind];
    const attrs = [];
    if (cell.walls.size) {
      attrs.push(`data-walls="${sideOrder.filter((s) => cell.walls.has(s)).join(',')}"`);
    }
    if (cell.doors.size) {
      attrs.push(`data-doors="${sideOrder.filter((s) => cell.doors.has(s)).join(',')}"`);
    }
    attrs.push(`data-height="${cell.h}"`);
    const tok = tokenAt[key(c, r)];
    const sym = tok ? '' : `<span class="symbol">${kind.sym}</span>`;
    const tokHtml = tok ? `<span class="token" style="background:${tok.color}">${tok.id}</span>` : '';
    const hHtml = cell.h ? `<span class="h">+${cell.h}</span>` : '';
    out.push(`<div class="cell" style="background:${kind.color}${shadow(cell)}" title="Column ${c}, row ${r}: ${kind.name}" ${attrs.join(' ')}>${sym}${tokHtml}${hHtml}</div>`);
  }
}

const legendRows = [
  ['<i class="sw" style="background:#E9DFC9"></i>.', 'Open ground', 'Normal movement. Ledge squares are marked +10.'],
  ['<i class="sw" style="background:#B9A587"></i>~', 'Scrub, scree, grove undergrowth', 'Difficult terrain.'],
  ['<i class="sw" style="background:#214E92"></i>T B M', 'Dead tree, boulder, hydraulic mechanism', 'Impassable and blocks line of sight (freestanding).'],
  ['<i class="sw" style="background:#4A4E55"></i>▒', 'Solid rock', 'Not playable: hill mass and the trench core.'],
  ['<i class="sw" style="background:#6BADE8"></i>W S K F D O', 'Ward post, slag heap, rail cart, furnishings, debris, unlit pyre', 'Cover. Entering costs a normal square.'],
  ['<i class="sw" style="background:#C9AD73"></i>R', 'Worn ascent (+5)', 'Walkable ramp from the ground up to the +10 ledge. The only way up besides a cliff climb.'],
  ['<i class="sw" style="background:#42A568"></i>P L G', 'Party start, door lever, ring gate', 'P: starting squares in the grove. L: operates the main doors. G: concealed ring gates.'],
  ['<i class="ln" style="background:#214E92"></i>', 'Wall edge', 'Cliff face, foyer, shack and trench walls. Blocks movement and sight.'],
  ['<i class="ln" style="background:#42A568"></i>', 'Door or gap edge', 'Main steel doors (closed), interior doors, shack doors and collapsed-wall gaps.'],
  ['<b>+10 / +5</b>', 'Height', 'Printed bottom right. Ground is 0.'],
  ['<span class="tok" style="background:#7B2935">1</span> <span class="tok" style="background:#B5651D">7</span> <span class="tok" style="background:#5B2C83">9</span> <span class="tok" style="background:#183F79">P1</span>', 'Tokens', 'Red: base. Orange: shift-change extras. Purple: alerted ambush. Blue: party.'],
];
const deployRows = [
  ...pcs.map(([id, c, r]) => `<tr><td>${id}</td><td>Party member</td><td>${c}, ${r}</td></tr>`),
  ...creatures.slice().sort((a, b) => Number(a[0]) - Number(b[0])).map(([id, name, tier, c, r, note]) => {
    const h = cells[key(c, r)].h;
    return `<tr><td><span class="tok" style="background:${TIER[tier].color}">${id}</span></td><td>${name}<br><small>${TIER[tier].label} · ${note}</small></td><td>${c}, ${r}${h ? ` (+${h})` : ''}</td></tr>`;
  }),
];

const html = `<!doctype html><html><head><meta charset="utf-8"><title>Cauldron Hill Entrance</title><style>
html,body{margin:0;font-family:system-ui,sans-serif;color:var(--foreground,#222)}
.wrap{padding:8px}
.grid{display:grid;grid-template-columns:22px repeat(${COLS},minmax(20px,1fr));gap:0;min-width:${22 + COLS * 20}px}
.axis{text-align:center;font-size:10px;align-self:center;opacity:.8}
.cell{aspect-ratio:1;position:relative;display:grid;place-items:center;color:#17212a;outline:1px solid rgba(0,0,0,.12);outline-offset:-1px}
.symbol{opacity:.6;font-size:11px}
.token{font:700 10px/1.5 system-ui;color:#fff;padding:0 3px;border-radius:4px;z-index:2}
.h{position:absolute;right:1px;bottom:0;font-size:8px;color:#4b3a12}
.scroll{overflow-x:auto}
.columns{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:14px;align-items:start}
table{border-collapse:collapse;width:100%;font-size:12px}
td,th{padding:4px;text-align:left;vertical-align:top;border-bottom:1px solid var(--border,#999)}
.sw{display:inline-block;width:12px;height:12px;margin-right:5px;vertical-align:middle}
.ln{display:inline-block;width:22px;height:4px;margin-right:5px;vertical-align:middle}
.tok{font:700 10px system-ui;color:#fff;padding:1px 4px;border-radius:4px}
h2{font-size:15px;margin:0 0 6px}
@media(max-width:700px){.columns{grid-template-columns:1fr}}
</style></head><body><div class="wrap">
<p><b>Cauldron Hill Entrance · west Nettles front door</b><br>${COLS} columns × ${ROWS} rows · 5-foot squares · north is up. A dark, lifeless mirror of the Nettles at the foot of Cauldron Hill: a sheer hill face with a steel gate, two ledges with worn ascents, a hidden ring-gate trench, abandoned shacks, and the dead grove where the ritual lands the party.</p>
<div class="scroll"><div class="grid">${out.join('')}</div></div>
<div class="columns">
<div><h2>Legend</h2><table><thead><tr><th>Square / symbol</th><th>Terrain / feature</th><th>Effect</th></tr></thead><tbody>
${legendRows.map(([a, b, c]) => `<tr><td>${a}</td><td>${b}</td><td>${c}</td></tr>`).join('\n')}
</tbody></table></div>
<div><h2>Deployment</h2><table><thead><tr><th>ID</th><th>Creature</th><th>Position (column, row)</th></tr></thead><tbody>
${deployRows.join('\n')}
</tbody></table></div>
</div></div></body></html>`;

const target = new URL('./cauldron-hill-entrance.html', import.meta.url);
writeFileSync(target, html);
console.log(`wrote ${target.pathname} (${COLS}x${ROWS}), ${creatures.length} creatures`);
