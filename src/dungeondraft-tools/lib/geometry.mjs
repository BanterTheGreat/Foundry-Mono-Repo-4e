// Small geometry helpers shared by the map composer, exporter, verifier and preview. Points are [x, y] in world px.

/** Deterministic random generator (mulberry32). Returns a function giving floats in [0, 1). */
export function seededRandom(seed) {
  let state = seed | 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Axis-aligned rectangle as a clockwise polygon. */
export const rectPolygon = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];

/**
 * Greedy decomposition of a set of "col,row" cell keys into disjoint rectangles {c1, r1, c2, r2} (1-based, inclusive),
 * scanning rows top to bottom.
 */
export function decompose(cellKeys, cols, rows) {
  const left = new Set(cellKeys);
  const rects = [];
  for (let r = 1; r <= rows; r++) {
    for (let c = 1; c <= cols; c++) {
      if (!left.has(`${c},${r}`)) { continue; }
      let c2 = c;
      while (left.has(`${c2 + 1},${r}`)) { c2++; }
      let r2 = r;
      while (Array.from({ length: c2 - c + 1 }, (_, i) => left.has(`${c + i},${r2 + 1}`)).every(Boolean)) { r2++; }
      for (let a = c; a <= c2; a++) { for (let b = r; b <= r2; b++) { left.delete(`${a},${b}`); } }
      rects.push({ c1: c, r1: r, c2, r2 });
    }
  }
  return rects;
}

/** Even-odd point-in-polygon test. */
export function pointInPolygon([x, y], poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) { inside = !inside; }
  }
  return inside;
}

/**
 * Organic closed outline around (cx, cy): `n` vertices on an ellipse with radii (rx, ry), each pushed in or out by up to
 * `jitter` (a fraction of the radius) using two smooth noise octaves, so edges wander instead of looking drawn by compass.
 */
export function blob(rng, cx, cy, rx, ry, { n = 14, jitter = 0.28 } = {}) {
  const phase1 = rng() * Math.PI * 2, phase2 = rng() * Math.PI * 2;
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const wobble = 0.6 * Math.sin(a * 2 + phase1) + 0.4 * Math.sin(a * 3 + phase2) + (rng() - 0.5) * 0.5;
    const k = 1 + jitter * wobble;
    pts.push([+(cx + Math.cos(a) * rx * k).toFixed(1), +(cy + Math.sin(a) * ry * k).toFixed(1)]);
  }
  return pts;
}

/**
 * Find where (x, y) sits on a polyline: the segment index, the fraction along that segment and the distance to it.
 * For a loop the closing segment (last point back to the first) has index points.length - 1.
 */
export function locateOnPolyline(points, loop, x, y) {
  const count = loop ? points.length : points.length - 1;
  let best = null;
  for (let i = 0; i < count; i++) {
    const a = points[i], b = points[(i + 1) % points.length];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (!len) { continue; }
    const t = Math.max(0, Math.min(1, ((x - a[0]) * (b[0] - a[0]) + (y - a[1]) * (b[1] - a[1])) / (len * len)));
    const dist = Math.hypot(a[0] + t * (b[0] - a[0]) - x, a[1] + t * (b[1] - a[1]) - y);
    if (!best || dist < best.dist) { best = { index: i, t, dist, direction: [(b[0] - a[0]) / len, (b[1] - a[1]) / len] }; }
  }
  return best;
}

/**
 * Pick which items to remove so exactly round(items.length * keepFraction) remain. Every item gets a random sort key
 * regardless of keepFraction, so for one rng seed a deeper cut always removes a superset of what a shallower cut removes
 * (cuts nest). Returns the Set of items to remove.
 */
export function chooseRemovals(items, keepFraction, rng) {
  const ranked = items.map((item) => [rng(), item]).sort((a, b) => a[0] - b[0]);
  const removeCount = items.length - Math.round(items.length * keepFraction);
  return new Set(ranked.slice(0, removeCount).map(([, item]) => item));
}
