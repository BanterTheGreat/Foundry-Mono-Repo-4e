// Re-derives the format facts documented in the dungeondraft skill from the user's own maps.
// Usage: node src/dungeondraft-tools/inspect/library-survey.mjs [folder of .dungeondraft_map files]
// Prints counts per build for wall `type` and shadow flags, then checks three rules against every map:
//  - cave bitmap length = floor(2wh + 1.5(w+h) + 2)
//  - terrain splat length = 16 * w * h * 4
//  - portal wall_distance = wall segment index + fraction along that segment, point_index = segment index
import fs from 'node:fs';
import path from 'node:path';
import { MAP_LIBRARY_DIR } from '../config.mjs';

const root = path.resolve(process.argv[2] || MAP_LIBRARY_DIR);
const vec = (s) => s.replace(/^Vector2/, '').match(/-?\d+(?:\.\d+)?(?:e[-+]?\d+)?/gi).map(Number);
const pool = (s) => { const v = s.replace(/^Pool\w+\(/, '').replace(/\)$/, '').split(',').map(Number); const P = []; for (let i = 0; i + 1 < v.length; i += 2) { P.push([v[i], v[i + 1]]); } return P; };
const poolLen = (s) => s.replace(/^Pool\w+\(/, '').replace(/\)$/, '').split(',').length;
const count = (m, k) => { m[k] = (m[k] || 0) + 1; };

const builds = {}, wallType = {}, flags = {};
const tally = { maps: 0, caveOk: 0, caveBad: 0, splatOk: 0, splatBad: 0, portalOk: 0, portalBad: 0, portalLoopOk: 0, pointIndexBad: 0 };
const badPortals = [];

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) { walk(file); continue; }
    if (!file.endsWith('.dungeondraft_map')) { continue; }
    let map;
    try { map = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { continue; }
    tally.maps++;
    const build = map.header.creation_build.split(' ')[0];
    count(builds, build);
    const { width: w, height: h } = map.world;
    if (map.world.wall_shadow !== undefined) { count(flags, `${build} wall_shadow=${map.world.wall_shadow} object_shadow=${map.world.object_shadow}`); }
    for (const lv of Object.values(map.world.levels)) {
      if (poolLen(lv.cave.bitmap) === Math.floor(2 * w * h + 1.5 * (w + h) + 2)) { tally.caveOk++; } else { tally.caveBad++; }
      if (poolLen(lv.terrain.splat) === 16 * w * h * 4) { tally.splatOk++; } else { tally.splatBad++; }
      for (const wall of lv.walls) {
        count(wallType, `${build} type${wall.type}`);
        const P = pool(wall.points);
        const segs = [];
        for (let i = 0; i < (wall.loop ? P.length : P.length - 1); i++) { segs.push([P[i], P[(i + 1) % P.length]]); }
        for (const portal of wall.portals) {
          const [px, py] = vec(portal.position);
          let best = null;
          segs.forEach(([a, b], i) => {
            const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
            if (!len) { return; }
            const t = Math.max(0, Math.min(1, ((px - a[0]) * (b[0] - a[0]) + (py - a[1]) * (b[1] - a[1])) / (len * len)));
            const dist = Math.hypot(a[0] + t * (b[0] - a[0]) - px, a[1] + t * (b[1] - a[1]) - py);
            if (!best || dist < best.dist) { best = { i, t, dist }; }
          });
          if (!best) { continue; }
          if (Math.abs(best.i + best.t - portal.wall_distance) < 0.02) { tally[wall.loop ? 'portalLoopOk' : 'portalOk']++; } else { tally.portalBad++; if (badPortals.length < 5) { badPortals.push({ map: entry.name, wd: portal.wall_distance, expected: best.i + best.t }); } }
          if (Number.isInteger(portal.point_index) && portal.point_index !== best.i) { tally.pointIndexBad++; }
        }
      }
    }
  }
}
walk(root);
console.log('maps by build:', builds);
console.log('wall type by build:', wallType);
console.log('shadow flags:', flags);
console.log(tally);
if (badPortals.length) { console.log('portal mismatches (first few):', badPortals); }
