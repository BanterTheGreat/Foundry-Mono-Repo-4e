import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { REPO_DIR } from '../config.mjs';
import { COLS, ROWS, S, parseGrid } from '../maps/cloudwood-mole/grid.mjs';
import { deriveStructure } from '../maps/cloudwood-mole/structure.mjs';

const TRAIL = 'Firm trail / clearing', STREAM = 'Stream / wet undergrowth', STAIR = 'Root stair / worn ascent', TRUNK = 'Massive tree trunk';

/** A synthetic 18x14 encounter: west shelf +5 (columns 1-6), gully +0, a stream in column 9, a 2x2 stair at columns 6-7 rows 6-7. */
function fixture(override = {}) {
  let html = '';
  for (let r = 1; r <= 14; r++) {
    for (let c = 1; c <= 18; c++) {
      const stair = (c === 6 || c === 7) && (r === 6 || r === 7);
      const spec = override[`${c},${r}`] ?? { label: stair ? STAIR : c === 9 ? STREAM : TRAIL, elev: c <= 6 ? 5 : 0 };
      html += `<div class="cell" title="(${c},${r}) ${spec.label}, elevation +${spec.elev} feet "></div>`;
    }
  }
  return html;
}

test('the grid grows by one square on every side and keeps playable ground there', () => {
  assert.equal(COLS, 20);
  assert.equal(ROWS, 16);
  const grid = parseGrid(fixture({ '1,1': { label: TRUNK, elev: 5 } }));
  assert.equal(grid.cells.size, 20 * 16);
  assert.equal(grid.at(2, 2).kind, 'trunk', 'original squares shift by one');
  assert.equal(grid.at(1, 1).kind, 'trail', 'a copied trunk is open ground, not a second tree');
  assert.ok(grid.at(1, 1).ext && !grid.at(2, 2).ext);
});

test('added squares copy the nearest height and let the stream run off the map', () => {
  const grid = parseGrid(fixture());
  assert.equal(grid.at(1, 8).elev, 5);
  assert.equal(grid.at(20, 8).elev, 0);
  assert.equal(grid.at(10, 1).kind, 'stream');
  assert.equal(grid.at(10, 16).kind, 'stream');
  assert.equal(grid.at(1, 5).kind, 'trail');
});

test('an unknown terrain label is refused instead of guessed', () => {
  assert.throws(() => parseGrid(fixture({ '3,3': { label: 'Lava', elev: 5 } })), /Unknown terrain label/);
});

test('a height change gets one continuous cliff, tucked under the stair and running on to the map edge', () => {
  const st = deriveStructure(parseGrid(fixture()));
  // the step sits on the line between columns 7 and 8 (new numbering); rows 7-8 are the stair
  assert.equal(st.cliffs.length, 2);
  const [north, south] = st.cliffs.sort((a, b) => a.from - b.from);
  assert.deepEqual([north.line, north.from, north.to], [7 * S, 0, 6 * S]);
  assert.deepEqual([south.line, south.from, south.to], [7 * S, 8 * S, 16 * S]);
  assert.ok(st.cliffs.every((c) => c.vertical && c.n[0] === -1 && c.n[1] === 0 && c.drop === 5), 'the high ground is to the west');
});

test('the stair is one block that climbs along x, and no cliff is drawn where it stands', () => {
  const st = deriveStructure(parseGrid(fixture()));
  assert.equal(st.stairs.length, 1);
  const [stair] = st.stairs;
  assert.deepEqual([stair.x0, stair.y0, stair.x1, stair.y1], [6 * S, 6 * S, 8 * S, 8 * S]);
  assert.equal(stair.axis, 'x');
  assert.ok(st.cliffs.every((c) => c.to <= stair.y0 || c.from >= stair.y1), 'cliffs stop at the stair');
});

test('a wide, shallow stair climbs along the short axis', () => {
  // two squares wide, one deep, level along x and rising along y
  const spec = { label: STAIR, elev: 5 };
  const grid = parseGrid(fixture({ '10,10': spec, '11,10': spec, '10,9': { label: TRAIL, elev: 10 }, '11,9': { label: TRAIL, elev: 10 } }));
  const stairs = deriveStructure(grid).stairs.filter((b) => b.c1 === 11 && b.c2 === 12);
  assert.equal(stairs.length, 1);
  assert.equal(stairs[0].axis, 'y');
});

test('water covers the stream and the plank crossing, which spans it', () => {
  const grid = parseGrid(fixture({ '9,6': { label: 'Plank crossing', elev: 0 }, '9,7': { label: 'Plank crossing', elev: 0 } }));
  const st = deriveStructure(grid);
  assert.equal(st.plank.cells.length, 2);
  assert.equal(st.water.length, st.poolsAndStream.length + 2);
});

const encounter = path.join(REPO_DIR, 'output', 'encounters', 'cloudwood-mole.html');
test('the real encounter yields eight cliffs, five stairs, four trunks and two logs', { skip: !fs.existsSync(encounter) }, () => {
  const st = deriveStructure(parseGrid(fs.readFileSync(encounter, 'utf8')));
  assert.equal(st.cliffs.length, 8);
  assert.equal(st.stairs.length, 5);
  assert.equal(st.stairs.filter((b) => b.axis === 'x').length, 4, 'four 2x2 root stairs climb west-east');
  assert.equal(st.stairs.filter((b) => b.axis === 'y').length, 1, 'the terrace stair climbs north-south');
  assert.equal(st.trunks.length, 4);
  assert.equal(st.logs.length, 2);
  assert.equal(st.thorns.cells.length, 4);
});
