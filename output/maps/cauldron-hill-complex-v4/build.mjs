// Book 5 Part 3, printed pp. 405–410. Five-foot squares; includes the colossus chamber on two playable elevations.
// Furnishing and the subdivisions of the otherwise schematic barracks are an adaptation.
import fs from 'node:fs';
import { detailScene } from './detail.mjs';
import { dressGolemRooms } from './golem-rooms.mjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { findTexture as T } from '../../../src/dungeondraft-tools/lib/packs.mjs';
import { seededRandom, rectPolygon } from '../../../src/dungeondraft-tools/lib/geometry.mjs';
import { patternRecord, wallRecord, pathRecord, buildObject, orderWalls, applyClutterCuts, CLUTTER_CUTS, circleShadows } from '../../../src/dungeondraft-tools/lib/scene-kit.mjs';
import { serialiseMap, writeMapFile } from '../../../src/dungeondraft-tools/lib/map-writer.mjs';

export const OUT = path.dirname(fileURLToPath(import.meta.url));
export const COLS = 174, ROWS = 96, S = 256;
export const FLOOR = { metal: 'Buildings:Floor_Metal_Grate_01:patterns', stone: 'Seasons:Stone_Tiled_Dark:patterns', wood: 'Crosshead:ch_wood_dark:patterns', water: 'Team:ch_waterdark:terrain', pit: 'Above&Below:ch_stars_black:terrain' };

/** Create a room inventory and an explicit cell plan; each opening names the edge it cuts. */
export function layout() {
  const rooms = [], cells = new Map(), doors = new Map();
  let upper = false;
  const key = (x, y) => `${x},${y}`;
  function room(id, name, x, y, w, h, kind, floor = 'metal', area = id) {
    if (upper) { y -= 3; x += 60; }
    const r = { id: String(id), name, x, y, w, h, kind, floor, area: String(area) };
    rooms.push(r);
    for (let j = y; j < y + h; j++) {
      for (let i = x; i < x + w; i++) {
        cells.set(key(i, j), r);
      }
    }
    return r;
  }
  function door(x, y, axis, width = 1, secret = false, external = false) {
    if (upper) { y -= 3; x += 60; }
    for (let i = 0; i < width; i++) {
      const a = axis === 'h' ? x + i : x, b = axis === 'v' ? y + i : y;
      doors.set(`${axis}:${a},${b}`, { x: a, y: b, axis, secret, external });
    }
  }
  // Lower facility: three approach stubs, checkpoint, barracks, staging hall and guardpost.
  room('approach', 'Three front-door rail approaches (continue off map)', 2, 69, 12, 2, 'rail');
  room('canal-approach', 'Canal approach', 6, 61, 2, 8, 'rail');
  room('south-approach', 'South Nettles approach', 6, 71, 2, 9, 'rail');
  room('1', 'Checkpoint One: oil-fire killing corridor', 14, 68, 16, 4, 'checkpoint');
  room('1N', 'Checkpoint One: northern secret observation room', 14, 64, 6, 4, 'guard', 'metal', 1);
  room('1S', 'Checkpoint One: southern secret observation room', 14, 72, 6, 4, 'guard', 'metal', 1);
  door(14, 69, 'v', 2); door(30, 69, 'v', 2);
  door(17, 68, 'h', 1, true); door(17, 72, 'h', 1, true);
  door(2, 69, 'v', 2, false, true); door(6, 61, 'h', 2, false, true); door(6, 80, 'h', 2, false, true);
  room('2-circulation', 'Barracks circulation', 30, 50, 36, 42, 'corridor', 'stone', 2);
  for (const y of [50, 86]) {
    for (let i = 0; i < 6; i++) {
      room(`2-bunk-${y}-${i}`, `${y === 50 ? 'North' : 'South'} dormitory ${i + 1}`, 30 + i * 6, y, 6, 6, 'bunk', 'wood', 2);
      door(32 + i * 6, y === 50 ? 56 : 86, 'h');
    }
  }
  // Central dining room with kitchen, stores and logistics rooms around it.
  room('2-mess', 'Commissary / engineers mess', 36, 64, 24, 16, 'mess', 'wood', 2);
  door(36, 69, 'v', 2); door(60, 69, 'v', 2);
  for (const [i, kind, name] of [[0, 'store', 'Dry goods and food stores'], [1, 'kitchen', 'Large barracks kitchen'], [2, 'office', 'Logistics and requisitions office']]) {
    room(`2-n-${i}`, name, 36 + i * 8, 58, 8, 6, kind, kind === 'kitchen' ? 'stone' : 'wood', 2);
    door(39 + i * 8, 58, 'h'); door(39 + i * 8, 64, 'h');
  }
  for (const [i, kind, name] of [[0, 'store', 'Equipment supply'], [1, 'office', 'Engineering papers and plans'], [2, 'store', 'Linen and reserve supplies']]) {
    room(`2-s-${i}`, name, 36 + i * 8, 80, 8, 4, kind, 'wood', 2);
    door(39 + i * 8, 80, 'h'); door(39 + i * 8, 84, 'h');
  }
  room('2-exit', 'Barracks east connection', 66, 69, 10, 2, 'corridor', 'metal', 2);
  door(66, 69, 'v', 2); door(76, 69, 'v', 2);
  room('3', 'Checkpoint Two / former heavy-component staging hall', 76, 64, 26, 10, 'hall');
  room('3N', 'Checkpoint Two northern secret guard booth', 72, 64, 4, 4, 'guard', 'metal', 3);
  room('3S', 'Checkpoint Two southern secret guard booth', 72, 70, 4, 4, 'guard', 'metal', 3);
  door(76, 65, 'v', 1, true); door(76, 72, 'v', 1, true);
  room('3-lift', 'Hydraulic cargo lift: 300 feet down to Parity Lake', 102, 64, 8, 10, 'lift', 'wood', 3);
  door(102, 67, 'v', 4);
  room('5-vestibule', 'Golem airlock southern vestibule', 81, 60, 6, 4, 'corridor', 'metal', 5);
  door(81, 64, 'h', 6);
  room('5', 'Prototype Golem Guardpost', 81, 42, 6, 18, 'airlock');
  room('5W', 'Guardpost west control alcove', 79, 42, 2, 4, 'control', 'metal', 5);
  room('5E', 'Guardpost east control alcove', 87, 42, 2, 4, 'control', 'metal', 5);
  door(81, 43, 'v', 2); door(87, 43, 'v', 2);
  door(81, 60, 'h', 6);
  room('5-north', 'North double-door vestibule: to colossus staging platform', 81, 38, 6, 4, 'corridor', 'metal', 5);
  door(81, 42, 'h', 6); door(81, 38, 'h', 6, false, true);
  // One-square utility runs retain the bypass routes without inventing a route through the omitted room.
  room('9a', 'Service bypass north from barracks', 68, 48, 1, 14, 'service', 'metal', 9);
  room('9a-link', 'Barracks north access hatch', 66, 61, 2, 1, 'service', 'metal', 9);
  room('9a-top', 'North utility run to colossus chamber', 60, 47, 9, 1, 'service', 'metal', 9);
  door(66, 61, 'v', 1, true); door(68, 61, 'v'); door(68, 48, 'h');
  door(60, 47, 'v', 1, true, true);
  room('9b', 'South service bypass from barracks to checkpoint / upper shaft', 66, 78, 31, 1, 'service', 'metal', 9);
  room('9b-rise', 'Service bypass to checkpoint', 96, 74, 1, 4, 'service', 'metal', 9);
  room('9b-upper', 'Service shaft to upper facility (+100 ft)', 96, 56, 1, 8, 'service', 'metal', 9);
  door(66, 78, 'v', 1, true); door(96, 78, 'h');
  door(96, 74, 'h', 1, true); door(96, 64, 'h', 1, true); door(96, 56, 'h', 1, true, true);
  for (const [id, x, y, w, h, dx, dy, ax] of [['4NW', 26, 58, 4, 6, 30, 60, 'v'], ['4SW', 26, 80, 4, 6, 30, 82, 'v'], ['4E', 102, 74, 8, 4, 105, 74, 'h'], ['4C', 56, 42, 4, 6, 60, 47, 'v']]) {
    room(id, 'Utility access: pumps, steam engine and surface vent', x, y, w, h, 'utility', 'metal', 4);
    door(dx, dy, ax, 1, true);
  }
  // VIP level: two galleries with pairs of rooms, laboratories above and reception rooms below.
  upper = true;
  room('vip-west-gallery', 'VIP western gallery (+100 ft)', 66, 10, 2, 18, 'corridor', 'wood', 10);
  room('vip-central-gallery', 'VIP middle gallery', 80, 10, 2, 18, 'corridor', 'wood', 10);
  room('vip-east-gallery', 'VIP eastern gallery', 94, 10, 2, 18, 'corridor', 'wood', 10);
  room('vip-north-gallery', 'Laboratory gallery', 66, 10, 30, 2, 'corridor', 'wood', 10);
  room(13, 'Hybridization Laboratory', 66, 4, 14, 6, 'bio', 'stone');
  room(14, 'Golem Laboratory', 82, 4, 14, 6, 'golem-lab', 'stone');
  door(67, 10, 'h', 2); door(93, 10, 'h', 2);
  const ids = [[15, 16, 21, 22], [17, 18, 23, 24], [19, 20, 25, 26]];
  const occupants = { 16: 'Leone Quital', 18: 'Tinker Oddcog (vacated)', 20: 'Grappa / Kasvarina', 21: 'Researcher', 23: 'Researcher', 25: 'Researcher' };
  ids.forEach((row, j) => row.forEach((id, i) => {
    const x = [68, 74, 82, 88][i], y = 12 + j * 5;
    room(id, `${occupants[id] || 'Obscurati slayers'} lodging`, x, y, 6, 5, id === 16 ? 'leone' : id === 18 ? 'tinker' : id === 20 ? 'kasvarina' : 'lodging', 'wood');
    door([68, 80, 82, 94][i], y + 2, 'v');
  }));
  room('vip-south-gallery', 'VIP south gallery', 66, 27, 30, 1, 'corridor', 'wood', 10);
  room(10, 'Dignitary Checkpoint (+100 ft)', 62, 28, 12, 8, 'vip-guard', 'wood');
  room(11, 'VIP Dining Hall', 74, 28, 18, 8, 'dining', 'wood');
  room(12, 'VIP Kitchen', 92, 28, 8, 8, 'kitchen', 'stone');
  room('12-locker', 'Chilled meat locker and utility hatch', 100, 28, 4, 8, 'locker', 'stone', 12);
  room('4VIP', 'Upper utility plant and surface shaft', 104, 28, 4, 6, 'utility', 'metal', 4);
  door(62, 30, 'v', 2, false, true); door(68, 28, 'h', 2); door(82, 28, 'h', 2); door(94, 28, 'h');
  door(74, 31, 'v', 2); door(92, 31, 'v', 2); door(100, 31, 'v'); door(104, 30, 'v', 1, true);
  room('9VIP', 'Upper service run (+100 ft); ladder down at west end', 64, 39, 39, 1, 'service', 'metal', 9);
  room('9VIP-rise', 'Kitchen service bypass', 102, 36, 1, 3, 'service', 'metal', 9);
  room('9VIP-west', 'Upper shaft access', 64, 36, 1, 3, 'service', 'metal', 9);
  door(102, 36, 'h', 1, true); door(102, 39, 'h'); door(64, 39, 'h'); door(64, 36, 'h', 1, true);
  // Separate lower dock inset: its exact floor plan is an adaptation of the prose description.
  upper = false;
  room('dock-channel', 'Parity Lake water tunnel (-300 ft; 30 ft wide, 10 ft deep)', 4, 20, 24, 6, 'water', 'water', 'dock');
  room('dock-basin', 'Delivery boat berth', 28, 16, 12, 14, 'water', 'water', 'dock');
  room('dock-quay', 'Cargo unloading quay', 40, 16, 4, 14, 'quay', 'stone', 'dock');
  room('dock-lift', 'Lower landing of hydraulic cargo lift (-300 ft)', 44, 18, 8, 10, 'lift', 'wood', 'dock');
  room('dock-guard', 'Lake entrance guard station', 28, 12, 6, 4, 'guard', 'metal', 'dock');
  room('dock-machine', 'Hydraulic lake-door machinery', 34, 12, 6, 4, 'utility', 'metal', 'dock');
  room('dock-north-quay', 'Narrow walkway outside guard and machinery rooms', 28, 16, 12, 2, 'quay', 'stone', 'dock');
  door(4, 20, 'v', 6, false, true); door(18, 20, 'v', 6);
  door(40, 20, 'v', 6); door(44, 21, 'v', 4);
  door(30, 16, 'h'); door(37, 16, 'h');
  door(40, 16, 'v', 2);
  // Colossus staging level, connected directly to the north doors of Area 5.
  room('6-pit', 'Colossus shaft: witchoil sump 150 ft below staging', 64, 6, 40, 32, 'pit', 'pit', 6);
  room('6', 'Staging platform (0 ft)', 64, 28, 40, 10, 'deck', 'metal', 6);
  room('6-tongue', 'Staging platform central projection', 74, 22, 20, 6, 'deck', 'metal', 6);
  room('6-west', 'West lift catwalk', 64, 18, 2, 10, 'deck', 'metal', 6);
  room('6-east', 'East lift catwalk', 102, 18, 2, 10, 'deck', 'metal', 6);
  room('7W', 'West freight elevator: starts at staging level', 66, 18, 6, 6, 'freight', 'metal', 7);
  room('7E', 'East freight elevator: starts at VIP level', 96, 18, 6, 6, 'freight', 'metal', 7);
  // Upper chamber is an atlas inset; its east landing leads into the relocated VIP wing.
  room('8-pit', 'Upper chamber open shaft: 250-ft drop to sump', 112, 44, 40, 36, 'pit', 'pit', 8);
  room('8', 'Retractable construction bridge (+100 ft)', 112, 66, 40, 6, 'bridge', 'metal', 8);
  room('7W-upper', 'West freight lift upper landing', 112, 72, 6, 6, 'freight', 'metal', 7);
  room('7E-upper', 'East freight lift upper landing', 146, 72, 6, 6, 'freight', 'metal', 7);
  room('8-west-cab', 'West drawbridge control cabin', 112, 62, 4, 4, 'control', 'metal', 8);
  room('8-east-cab', 'East drawbridge control cabin', 148, 62, 4, 4, 'control', 'metal', 8);
  door(113, 66, 'h', 2); door(149, 66, 'h', 2);
  door(112, 62, 'h', 2); door(150, 62, 'h', 2);
  room('8-gallery', 'Gear-toothed crane access gallery', 112, 44, 40, 2, 'deck', 'metal', 8);
  room('8-west-walk', 'Upper perimeter walkway', 112, 46, 2, 16, 'deck', 'metal', 8);
  room('8-east-walk', 'Upper perimeter walkway', 150, 46, 2, 16, 'deck', 'metal', 8);
  room('8-vip-link', 'Upper catwalk to dignitary checkpoint', 120, 27, 2, 39, 'deck', 'metal', 8);
  room('9a-chamber', 'Service bypass into staging platform', 64, 38, 1, 9, 'service', 'metal', 9);
  door(64, 38, 'h', 1, true); door(64, 47, 'h');
  room('9b-chamber', 'East service bypass into staging platform', 96, 38, 1, 18, 'service', 'metal', 9);
  door(96, 38, 'h', 1, true); door(96, 56, 'h');
  return { rooms, cells, doors, key };
}

/** Derive every wall and floor from the same occupied cells, including shared room partitions. */
export function geometry(plan) {
  const { cells, doors, key } = plan, edges = [], floorRuns = [];
  for (let y = 0; y <= ROWS; y++) {
    for (let x = 0; x <= COLS; x++) {
      for (const [axis, a, b] of [['h', cells.get(key(x, y - 1)), cells.get(key(x, y))], ['v', cells.get(key(x - 1, y)), cells.get(key(x, y))]]) {
        if ((!a && !b) || a?.id === b?.id) { continue; }
        // Connected rail approaches have no interior divider.
        if (a?.kind === 'rail' && b?.kind === 'rail') { continue; }
        if (a?.kind === 'water' && b?.kind === 'water') { continue; }
        if (a?.kind === 'corridor' && b?.kind === 'corridor' && a.area === '10' && b.area === '10') { continue; }
        const openKinds = ['pit', 'deck', 'freight', 'bridge'];
        if (a && b && openKinds.includes(a.kind) && openKinds.includes(b.kind) && ['6', '7', '8'].includes(a.area) && ['6', '7', '8'].includes(b.area)) { continue; }
        const id = `${axis}:${x},${y}`, d = doors.get(id);
        edges.push({ id, x, y, axis, a: a?.id, b: b?.id, door: d, external: !a || !b });
      }
    }
  }
  // The lake gate cuts a freestanding wall across the water tunnel.
  for (let y = 20; y < 26; y++) {
    const id = `v:18,${y}`;
    edges.push({ id, x: 18, y, axis: 'v', a: 'dock-channel', b: 'dock-channel', door: doors.get(id), external: false });
  }
  // Cell runs produce disjoint floor polygons even where one rectangle overrides another.
  for (let y = 0; y < ROWS; y++) {
    let x = 0;
    while (x < COLS) {
      const r = cells.get(key(x, y));
      if (!r) { x++; continue; }
      let end = x + 1;
      while (end < COLS && cells.get(key(end, y))?.id === r.id) { end++; }
      floorRuns.push({ room: r, x, y, w: end - x, h: 1 }); x = end;
    }
  }
  // Coalesce vertically identical floor runs; no polygon overlaps.
  const floors = [];
  for (const r of floorRuns) {
    const previous = floors.findLast(p => p.room.id === r.room.id && p.x === r.x && p.w === r.w && p.y + p.h === r.y);
    if (previous) { previous.h++; } else { floors.push({ ...r }); }
  }
  // Merge collinear edge units. Opening portals are attached to their exact run.
  const groups = new Map();
  for (const e of edges) {
    const k = `${e.axis}:${e.axis === 'h' ? e.y : e.x}`;
    if (!groups.has(k)) { groups.set(k, []); }
    groups.get(k).push(e);
  }
  const walls = [];
  for (const list of groups.values()) {
    list.sort((a, b) => (a.axis === 'h' ? a.x - b.x : a.y - b.y));
    let run = [];
    function flush() {
      if (!run.length) { return; }
      const first = run[0], last = run.at(-1), h = first.axis === 'h';
      walls.push({ id: `wall-${walls.length}`, loop: false, points: [[first.x * S, first.y * S], [(last.x + (h ? 1 : 0)) * S, (last.y + (h ? 0 : 1)) * S]], openings: run.filter(e => e.door).map(e => [(e.x + (h ? .5 : 0)) * S, (e.y + (h ? 0 : .5)) * S]) });
      run = [];
    }
    for (const e of list) {
      const last = run.at(-1);
      if (last && (e.axis === 'h' ? e.x !== last.x + 1 : e.y !== last.y + 1)) { flush(); }
      run.push(e);
    }
    flush();
  }
  for (const d of doors.values()) {
    if (!edges.some(e => e.id === `${d.axis}:${d.x},${d.y}`)) { throw new Error(`Door has no wall: ${JSON.stringify(d)}`); }
  }
  return { edges, floors, walls };
}

/** Compose furnished rooms with seeded, restrained clutter and clear circulation. */
export function composeScene(seed = 20261116) {
  const plan = layout(), g = geometry(plan), rng = seededRandom(seed);
  const objects = [], clutter = [], casters = [], paths = [];
  const rr = (a, b) => a + (b - a) * rng();
  const place = (spec, x, y, rot = .012, layer = 300, scale = 1, isClutter = false) => {
    const tex = T(spec);
    // Furniture must leave a usable landing on both sides of every doorway.
    const hx = (Math.abs(Math.cos(rot)) * tex.w + Math.abs(Math.sin(rot)) * tex.h) * scale / (2 * S);
    const hy = (Math.abs(Math.sin(rot)) * tex.w + Math.abs(Math.cos(rot)) * tex.h) * scale / (2 * S);
    if (layer === 300 && [...plan.doors.values()].some(d => {
      const cx = d.x + (d.axis === 'h' ? .5 : 0), cy = d.y + (d.axis === 'v' ? .5 : 0);
      return Math.abs(x - cx) < hx + (d.axis === 'h' ? .48 : .65) && Math.abs(y - cy) < hy + (d.axis === 'h' ? .65 : .48);
    })) { return null; }
    const { object } = buildObject(tex, x * S, y * S, { rot, layer, scale });
    objects.push(object);
    if (isClutter) { clutter.push(object); }
    if (!isClutter && Math.max(tex.w, tex.h) * scale > 590 && layer === 300) {
      casters.push({ x: x * S, y: y * S, size: Math.max(tex.w, tex.h) * scale, strength: '050' });
    }
    return object;
  };
  const P = {
    bed: 'Interior:bed_1a:objects', desk: 'Buildings:Desk_Writing:objects', chair: 'Interior:chair_1a:objects',
    table: 'Interior:table_1a:objects', shelf: 'Buildings:Shelf_Wall_01:objects', crate: 'Buildings:Crate_01:objects',
    barrel: 'Buildings:Barrel_Closed:objects', paper: 'Interior:paper_1a:objects', bottle: 'Interior:potion_bottle_1a:objects',
    tank: 'Mechanism:pressure_tank_1a:objects', stove: 'Interior:stove_1a:objects', work: 'Buildings:Table_Workbench:objects',
    pipe: 'Mechanism:pipe_object_1a:objects', valve: 'Mechanism:pipe_wheel_1a:objects', rug: 'Interior:rug_1a:objects',
  };
  let beds = 0;
  function bed(x, y, rot = 0) {
    if (place(P.bed, x + .03, y + .02, rot + .008, 300, .9)) { beds++; }
  }
  function desk(x, y) { place(P.desk, x, y, .015); place(P.chair, x, y + .85, 3.1, 300, .9); }
  function shelf(x, y, rot = 0) { place(P.shelf, x, y, rot + .006); }
  function tables(x, y, n, spacing = 2.5) {
    for (let i = 0; i < n; i++) {
      place(P.table, x + i * spacing, y, rr(-.04, .04));
      place(P.chair, x + i * spacing, y - 1, .02, 300, .9);
      place(P.chair, x + i * spacing, y + 1, Math.PI + .01, 300, .9);
    }
  }
  for (const r of plan.rooms) {
    const { x, y, w, h, kind } = r;
    if (kind === 'bunk') {
      for (const dx of [1, 2.3, 3.7, 5]) { bed(x + dx, y + 1.3); bed(x + dx, y + 4.7, Math.PI); }
    } else if (['lodging', 'leone', 'tinker', 'kasvarina'].includes(kind)) {
      bed(x + 1.3, y + 1.45);
      if (kind === 'lodging' && !['21', '23', '25'].includes(r.id)) { bed(x + 4.6, y + 1.45); }
      desk(x + 4.1, y + 3.7); shelf(x + 3.3, y + .4);
      place(P.rug, x + 2.5, y + 3.5, .02, -100, .9);
      if (kind === 'tinker') { place(P.work, x + 1.3, y + 3.8, .03); place(P.valve, x + 1.2, y + 3.7, .1); }
      if (kind === 'leone') { place('Buildings:Bottle_Square_Mid_01:objects', x + 4.2, y + 3.7, .04, 700, .8); }
    } else if (kind === 'mess' || kind === 'dining') {
      for (let row = 0; row < (kind === 'mess' ? 3 : 2); row++) {
        tables(x + 3, y + 2 + row * 4, kind === 'mess' ? 7 : 5);
      }
      shelf(x + w - 2.2, y + .45);
    } else if (kind === 'kitchen') {
      place(P.stove, x + 1.3, y + 1.4, .02);
      place(P.stove, x + 3.6, y + 1.4, .02);
      shelf(x + w - 2, y + .45);
      for (let j = 0; j < 2; j++) { place(P.work, x + 2 + j * 3.2, y + h - 1.5, .02); }
      place(P.barrel, x + w - 1, y + h - 1, .1);
    } else if (kind === 'store' || kind === 'locker') {
      for (let j = 0; j < Math.floor(w / 2); j++) { shelf(x + 1.2 + j * 2, y + .5); }
      for (let j = 0; j < Math.floor(w); j++) {
        place(j % 3 ? P.crate : P.barrel, x + .8 + j * .95, y + h - .8, rr(-.16, .16), 300, .9);
      }
    } else if (kind === 'office' || kind === 'guard' || kind === 'vip-guard') {
      desk(x + 1.8, y + 1.2); shelf(x + w - 1.7, y + .4);
      if (w > 6) { desk(x + w - 2, y + h - 1.4); }
      place(P.crate, x + .65, y + h - .65, .12, 300, .9);
    } else if (kind === 'utility') {
      place(P.tank, x + w / 2, y + 1.6, .02, 300, .9);
      place(P.pipe, x + w / 2, y + h - 1.1, .025, 300, .85);
      place(P.valve, x + w / 2, y + h - 1.1, .02, 700, .85);
    } else if (kind === 'bio' || kind === 'golem-lab') {
      for (let j = 0; j < 4; j++) {
        const dx = x + 2 + j * 3.2;
        place(P.work, dx, y + 3.2, .018);
        if (kind === 'bio') {
          place(P.bottle, dx - .3, y + 3.2, .15, 700, .8);
          place('Buildings:Bottle_Square_Mid_01:objects', dx + .4, y + 3.2, -.13, 700, .8);
        } else { place(P.valve, dx, y + 3.2, .24, 700, .8); }
      }
      for (let j = 0; j < 4; j++) { shelf(x + 2 + j * 3, y + .5); }
      place(P.tank, x + w - 1.6, y + h - 1.6, .03, 300, .8);
    } else if (kind === 'control') {
      place(P.valve, x + w / 2, y + h / 2, Math.PI / 2 + .02, 300, .9);
    } else if (kind === 'airlock') {
      place(P.valve, x + w - .7, y + h - 1.4, Math.PI / 2 + .01, 700, .8);
    } else if (kind === 'lift') {
      // Four hydraulic pistons around a clear cargo platform.
      for (const dx of [.65, w - .65]) {
        for (const dy of [.8, h - .8]) { place(P.pipe, x + dx, y + dy, Math.PI / 2 + .015, 300, .8); }
      }
      place(P.valve, x + w - .6, y + h / 2, Math.PI / 2 + .015, 700, .9);
    }
  }
  // Gas lamps along non-service wall faces, every ten feet, with clear door gaps.
  let lamps = 0;
  for (const e of g.edges) {
    if (e.door || (e.x + e.y) % 2) { continue; }
    for (const [id, side] of [[e.a, -1], [e.b, 1]]) {
      const r = plan.rooms.find(r => r.id === id);
      if (!r || ['service', 'rail', 'water', 'pit'].includes(r.kind)) { continue; }
      const x = e.x + (e.axis === 'h' ? .5 : side * .22), y = e.y + (e.axis === 'v' ? .5 : side * .22);
      place('Buildings:Lantern_Wall_01:objects', x, y, e.axis === 'h' ? (side === 1 ? 0 : Math.PI) : (side === 1 ? -Math.PI / 2 : Math.PI / 2), 700, .85);
      lamps++;
    }
  }
  // Restrained papers / loose engineering fragments near edges. Passage centres stay clear.
  for (const r of plan.rooms.filter(r => !['service', 'rail', 'lift', 'water', 'pit'].includes(r.kind))) {
    const count = Math.max(1, Math.round(r.w * r.h / 15));
    for (let j = 0; j < count; j++) {
      const x = rr(r.x + .4, r.x + r.w - .4), y = j % 2 ? r.y + .45 : r.y + r.h - .45;
      if (plan.cells.get(plan.key(Math.floor(x), Math.floor(y)))?.id !== r.id) { continue; }
      place(P.paper, x, y, rr(-Math.PI, Math.PI), 300, .8, true);
    }
  }
  const placedClutter = clutter.length;
  const keptClutter = applyClutterCuts(objects, clutter, seed, CLUTTER_CUTS);
  for (const s of circleShadows(casters, { seed, sizePerScale: 520, T })) { objects.push(s.object); }
  // Twin light rails through the approaches and first checkpoint.
  const rail = T('Above&Below:mine_tracks1:paths');
  for (const y of [69.2, 70.8]) { paths.push(pathRecord(rail, [[2 * S, y * S], [30 * S, y * S]], rail.h * .8, 200, 'rail')); }
  for (const [a, b] of [[[7, 61], [7, 69]], [[7, 71], [7, 80]]]) {
    paths.push(pathRecord(rail, [a.map(v => v * S), b.map(v => v * S)], rail.h * .8, 200, 'rail'));
  }
  // Mark floor joins at every doorway; the thin line remains below furniture.
  for (const e of g.edges.filter(e => e.door && e.a && e.b)) {
    const a = plan.rooms.find(r => r.id === e.a), b = plan.rooms.find(r => r.id === e.b);
    if (a.floor === b.floor) { continue; }
    paths.push(pathRecord(T('Buildings:line:paths'), [[e.x * S, e.y * S], [(e.x + (e.axis === 'h' ? 1 : 0)) * S, (e.y + (e.axis === 'v' ? 1 : 0)) * S]], 13, 100, 'seam'));
  }
  const patterns = g.floors.filter(r => !['water', 'pit'].includes(r.room.floor)).map(r => patternRecord(T(FLOOR[r.room.floor]), rectPolygon(r.x * S, r.y * S, (r.x + r.w) * S, (r.y + r.h) * S), -400));
  const walls = orderWalls(g.walls.map(w => wallRecord(T('Buildings:metaldark:walls'), w, T('Interior:empty:portals'))));
  // Rails mark every exposed platform edge; no wall or shadow substitutes for the drop.
  const railTex = T('Scenes:railing_1a:paths');
  for (const [k, a] of plan.cells) {
    if (!['deck', 'bridge', 'freight'].includes(a.kind)) { continue; }
    const [x, y] = k.split(',').map(Number);
    for (const [dx, dy, points] of [[0,-1,[[x,y],[x+1,y]]],[1,0,[[x+1,y],[x+1,y+1]]],[0,1,[[x,y+1],[x+1,y+1]]],[-1,0,[[x,y],[x,y+1]]]]) {
      const b = plan.cells.get(plan.key(x + dx, y + dy));
      if (b?.kind === 'pit') { paths.push(pathRecord(railTex, points.map(p => p.map(v => v*S)), railTex.h, 200, 'safety-rail')); }
    }
  }
  // Construct Borne from metallic plate polygons at two cross-sections, rather than scaling an unrelated creature sprite.
  function armour(points, texture = 'Buildings:Floor_Metal_Grate_02:patterns', layer = -100) {
    const p = patternRecord(T(texture), points.map(q => q.map(v => v*S)), layer);
    p.role = 'borne'; patterns.push(p);
  }
  // Upright torso and arms seen from the staging platform, below the elevated bridge.
  armour([[75,9],[79,7],[89,7],[93,9],[96,18],[92,22],[89,19],[79,19],[76,22],[72,18]]);
  armour([[79,8],[89,8],[91,17],[88,20],[80,20],[77,17]], 'Buildings:Floor_Metal_Grate_03:patterns', 100);
  // Shoulder-level upper view: broad shoulders, neck and mechanical head behind the bridge.
  armour([[120,57],[124,55],[140,55],[144,57],[146,64],[141,66],[137,63],[127,63],[123,66],[118,64]]);
  armour([[127,50],[137,50],[140,53],[140,59],[137,62],[127,62],[124,59],[124,53]], 'Buildings:Floor_Metal_Grate_03:patterns', 100);
  for (const [x,y] of [[124,56],[140,56],[120,62],[144,62]]) { place('Buildings:Gears_Metal_01:objects', x+.03, y+.02, .02, 300, 1.1); }
  const darkPlate = 'Above&Below:ch_stars_darkness:terrain';
  armour([[126,54],[129,54],[129,55],[126,55]], darkPlate, 200);
  armour([[135,54],[138,54],[138,55],[135,55]], darkPlate, 200);
  armour([[128,59],[136,59],[136,60],[128,60]], darkPlate, 200);
  // Restraint chains and the overhead service crane stay at natural asset scale.
  const chain = T('Dungeondraft:chain:paths');
  for (const [a,b] of [[[114,50],[124,54]],[[150,50],[140,54]],[[114,62],[123,63]],[[150,62],[141,63]]]) {
    paths.push(pathRecord(chain, [a,b].map(p => p.map(v => v*S)), chain.h, 200, 'restraint-chain'));
  }
  place('Above&Below:crane_01:objects', 132.05, 47.05, .02, 300, 1);
  // The bridge halves meet at a visible retraction seam.
  paths.push(pathRecord(T('Buildings:line:paths'), [[132*S,66*S],[132*S,72*S]], 13, 200, 'bridge-split'));
  for (const [x,y] of [[66,35],[68,35],[101,35],[101,33],[115,68],[149,68]]) { place(P.barrel,x+.07,y+.04,.12,300,.95); }
  // Bare rock separates the atlas elevations; no artificial shadows.

  const splat = Array(COLS * ROWS * 64).fill(0);
  for (let ty = 0; ty < ROWS * 4; ty++) {
    for (let tx = 0; tx < COLS * 4; tx++) {
      const kind = plan.cells.get(plan.key(Math.floor(tx / 4), Math.floor(ty / 4)))?.kind;
      splat[(ty * COLS * 4 + tx) * 4 + (kind === 'water' ? 1 : kind === 'pit' ? 2 : 0)] = 255;
    }
  }
  return dressGolemRooms(detailScene({ world: { cols: COLS, rows: ROWS, size: S }, terrain: { textures: [T('Above&Below:ch_stars_darkness:terrain'), T('Team:ch_waterdark:terrain'), T('Above&Below:ch_stars_black:terrain')], splat }, patterns, walls, paths, objects, plan, geometry: g, stats: { rooms: plan.rooms.length, beds, lamps, placedClutter, keptClutter } }));
}

export function build() {
  const scene = composeScene();
  const built = serialiseMap(scene, { seed: 20261116, splat: scene.terrain.splat, cameraZoom: 18 });
  scene.patterns.forEach((p,i)=>{
    if (p.nativeScale) { built.map.world.levels['0'].patterns[i].scale=`Vector2( ${p.nativeScale}, ${p.nativeScale} )`; }
  });
  const file = writeMapFile(built.map, OUT, 'cauldron-hill-complex-v4');
  fs.writeFileSync(path.join(OUT, 'room-key.json'), JSON.stringify({ source: 'ZEITGEIST Act One, Adventure Five, Part Three, printed pp. 405–410; overview p. 408', scale: '5 feet per square', omitted: [], elevation: 'VIP wing +100 ft; staging 0 ft; bridge and VIP +100 ft; sump -150 ft; lake dock -300 ft', rooms: scene.plan.rooms, doors: [...scene.plan.doors.values()], stats: scene.stats }, null, 2));
  console.log(file, built.counts, scene.stats);
  return file;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) { build(); }
