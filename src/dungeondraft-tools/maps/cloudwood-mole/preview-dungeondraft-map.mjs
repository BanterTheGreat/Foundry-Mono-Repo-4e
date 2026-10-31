// Approximate render of a .dungeondraft_map from the data in the file alone: terrain, pattern polygons, paths, walls (with portal
// gaps), objects. It is not Dungeondraft's renderer; it exists to catch export mistakes (placement, scale, rotation, layers)
// and to produce a PNG of the map. Door sprites and wall end caps are not drawn.
// Usage: node preview-dungeondraft-map.mjs [map] [--pps 64] [--out file.png]   (pps 256 = native size)
import fs from 'node:fs';
import path from 'node:path';
import { MAPS_OUT_DIR } from '../../config.mjs';
import { decodePng, encodePng, Sprite, Canvas } from '../../lib/png.mjs';
import { readResource } from '../../lib/packs.mjs';

const arg = (n, d) => (process.argv.includes(n) ? process.argv[process.argv.indexOf(n) + 1] : d);
const MAP = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : path.join(MAPS_OUT_DIR, 'cloudwood-mole', 'cloudwood-mole.dungeondraft_map');
const pps = Number(arg('--pps', 64));
const OUT = path.resolve(arg('--out', MAP.replace(/\.dungeondraft_map$/, '-preview.png')));
const map = JSON.parse(fs.readFileSync(MAP, 'utf8'));
const lv = map.world.levels['0'];
const k = pps / 256;
const W = Math.round(map.world.width * pps), H = Math.round(map.world.height * pps);

const cache = new Map();
const tex = (res) => { if (!cache.has(res)) { cache.set(res, new Sprite(decodePng(readResource(res)))); } return cache.get(res); };
const vec = (s) => s.replace('Vector2', '').match(/-?\d+(?:\.\d+)?(?:e[-+]?\d+)?/gi).map(Number);
const pool = (s) => { const v = s.replace(/^Pool\w+\(/, '').replace(/\)$/, '').split(',').map(Number); const P = []; for (let i = 0; i + 1 < v.length; i += 2) { P.push([v[i], v[i + 1]]); } return P; };

/** Even-odd polygon mask with a per-row cache of the inside intervals (pixels, already scaled). */
function polygonMask(points) {
  let row = -1, spans = [];
  return (x, y) => {
    if (y !== row) {
      row = y;
      const cy = y + 0.5, xs = [];
      for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
        const [xi, yi] = points[i], [xj, yj] = points[j];
        if ((yi > cy) !== (yj > cy)) { xs.push(xi + ((cy - yi) * (xj - xi)) / (yj - yi)); }
      }
      xs.sort((a, b) => a - b);
      spans = [];
      for (let i = 0; i + 1 < xs.length; i += 2) { spans.push([xs[i], xs[i + 1]]); }
    }
    const cx = x + 0.5;
    return spans.some(([a, b]) => cx >= a && cx <= b) ? 1 : 0;
  };
}

const cv = new Canvas(W, H, [60, 60, 60]);
// terrain: each 64-px texel painted from its slot weights
{
  const v = lv.terrain.splat.replace(/^Pool\w+\(/, '').replace(/\)$/, '').split(',').map(Number);
  const slots = [1, 2, 3, 4].map((i) => tex(lv.terrain[`texture_${i}`]));
  const TW = map.world.width * 4;
  for (let ty = 0; ty < map.world.height * 4; ty++) {
    for (let tx = 0; tx < TW; tx++) {
      const i = (ty * TW + tx) * 4;
      slots.forEach((sp, s) => {
        const a = v[i + s] / 255;
        if (a > 0) { cv.fillPattern(sp, { x: tx * 64 * k, y: ty * 64 * k, w: 64 * k, h: 64 * k }, { tile: sp.w * k, opacity: a }); }
      });
    }
  }
}

function drawPattern(p) {
  const [ox, oy] = vec(p.position), sc = vec(p.scale)[0];
  const pts = pool(p.points).map(([x, y]) => [(x + ox) * k, (y + oy) * k]);
  const xs = pts.map((q) => q[0]), ys = pts.map((q) => q[1]);
  const sp = tex(p.texture);
  cv.fillPattern(sp, { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) }, { tile: sp.w * sc * k, ox: ox * k, oy: oy * k, mask: polygonMask(pts) });
}

function clipRect(a, ang, t0, t1, th) {
  const c = Math.cos(ang), s = Math.sin(ang), xs = [], ys = [];
  for (const [u, v] of [[t0, -th / 2], [t1, -th / 2], [t1, th / 2], [t0, th / 2]]) { xs.push((a[0] + u * c - v * s) * k); ys.push((a[1] + u * s + v * c) * k); }
  return { x0: Math.floor(Math.min(...xs)), x1: Math.ceil(Math.max(...xs)), y0: Math.floor(Math.min(...ys)), y1: Math.ceil(Math.max(...ys)) };
}

/** A wall is the texture tiled along each segment, its height as thickness; every portal cuts a gap of its diameter. */
function drawWall(w) {
  const sp = tex(w.texture), P = pool(w.points);
  const segs = P.map((a, i) => [a, P[(i + 1) % P.length]]).slice(0, w.loop ? P.length : P.length - 1);
  segs.forEach(([a, b], si) => {
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]), ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
    const gaps = w.portals.filter((p) => p.point_index === si).map((p) => { const t = (p.wall_distance - si) * len; return [t - p.radius, t + p.radius]; }).sort((x, y) => x[0] - y[0]);
    const ext = w.loop ? sp.h / 2 : 0; // sharp joints: run each segment half a thickness past its corners
    const pieces = [];
    let cur = -ext;
    for (const [g0, g1] of gaps) { pieces.push([cur, g0]); cur = g1; }
    pieces.push([cur, len + ext]);
    for (const [t0, t1] of pieces) {
      for (let t = t0; t < t1; t += sp.w) {
        const mid = t + sp.w / 2;
        cv.draw(sp, { cx: (a[0] + Math.cos(ang) * mid) * k, cy: (a[1] + Math.sin(ang) * mid) * k, w: sp.w * k, h: sp.h * k, rot: ang, clip: clipRect(a, ang, t, Math.min(t + sp.w, t1), sp.h) });
      }
    }
  });
}

/** A path is its texture tiled along the polyline, `width` px thick (texture scaled uniformly, so a tile is texture-width * width / texture-height long). */
function drawPath(p) {
  const sp = tex(p.texture), [ox, oy] = vec(p.position), P = pool(p.edit_points).map(([x, y]) => [x + ox, y + oy]);
  const tile = sp.w * (p.width / sp.h);
  for (let i = 0; i + 1 < P.length; i++) {
    const a = P[i], b = P[i + 1], len = Math.hypot(b[0] - a[0], b[1] - a[1]), ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
    for (let t = 0; t < len; t += tile) {
      const t1 = Math.min(t + tile, len), mid = t + tile / 2;
      cv.draw(sp, { cx: (a[0] + Math.cos(ang) * mid) * k, cy: (a[1] + Math.sin(ang) * mid) * k, w: tile * k, h: p.width * k, rot: ang, clip: clipRect(a, ang, t, t1, p.width) });
    }
  }
}

function drawObject(o) {
  const sp = tex(o.texture), [x, y] = vec(o.position), sc = vec(o.scale)[0];
  cv.draw(sp, { cx: x * k, cy: y * k, w: sp.w * sc * k, rot: o.rotation, flipX: o.mirror });
}

// Dungeondraft draws user layers in order, with walls above layers 100-400 and below "Above Walls" (700)
const WALL_Z = 600;
const items = [
  ...lv.patterns.map((p) => ({ z: p.layer, draw: () => drawPattern(p) })),
  ...lv.paths.map((p) => ({ z: p.layer, draw: () => drawPath(p) })),
  ...lv.objects.map((o) => ({ z: o.layer, draw: () => drawObject(o) })),
  ...lv.walls.map((w) => ({ z: WALL_Z, draw: () => drawWall(w) })),
];
items.sort((a, b) => a.z - b.z); // stable: file order within a layer
for (const item of items) { item.draw(); }

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, encodePng(cv.toImage()));
console.log('wrote', OUT, `${W}x${H}`);
