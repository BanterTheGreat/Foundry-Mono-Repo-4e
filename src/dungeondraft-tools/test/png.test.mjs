import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Canvas, Sprite, decodePng, encodePng } from '../lib/png.mjs';

/** Solid-colour RGBA image. */
const solid = (w, h, [r, g, b, a = 255]) => {
  const data = new Uint8Array(w * h * 4);
  for (let i = 0; i < w * h; i++) { data.set([r, g, b, a], i * 4); }
  return { w, h, data };
};
const pixel = (canvas, x, y) => [...canvas.data.slice((y * canvas.w + x) * 4, (y * canvas.w + x) * 4 + 3)];

test('encode then decode round-trips RGBA and RGB images across every row filter', () => {
  const w = 33, h = 17;
  const data = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4;
      // gradients, noise and flat runs so the encoder picks different filters for different rows
      data[o] = (x * 7 + y * 3) & 255;
      data[o + 1] = y % 3 === 0 ? 40 : (x * y * 13) & 255;
      data[o + 2] = (x ^ y) * 9 & 255;
      data[o + 3] = (x + y) % 5 === 0 ? 0 : 255 - ((x * 11) & 127);
    }
  }
  const rgba = decodePng(encodePng({ w, h, data }, { alpha: true }));
  assert.deepEqual([rgba.w, rgba.h], [w, h]);
  assert.deepEqual(rgba.data, data);

  const rgb = decodePng(encodePng({ w, h, data }, { alpha: false }));
  for (let i = 0; i < w * h; i++) {
    assert.deepEqual([...rgb.data.slice(i * 4, i * 4 + 3)], [...data.slice(i * 4, i * 4 + 3)]);
    assert.equal(rgb.data[i * 4 + 3], 255, 'RGB output decodes as opaque');
  }
});

test('decodePng rejects data that is not a PNG', () => {
  assert.throws(() => decodePng(Buffer.from('definitely not a png file')), /Not a PNG/);
});

test('draw places a sprite at its centre and leaves everything outside it untouched', () => {
  const canvas = new Canvas(40, 40, [10, 20, 30]);
  canvas.draw(new Sprite(solid(4, 4, [200, 0, 0])), { cx: 20, cy: 20, w: 8 });
  assert.deepEqual(pixel(canvas, 20, 20), [200, 0, 0]);
  assert.deepEqual(pixel(canvas, 17, 17), [200, 0, 0]);
  assert.deepEqual(pixel(canvas, 5, 5), [10, 20, 30]);
  assert.deepEqual(pixel(canvas, 30, 20), [10, 20, 30]);
});

test('a quarter turn swaps the sprite footprint, and mirroring keeps it inside the same box', () => {
  const wide = new Sprite(solid(8, 2, [0, 200, 0]));
  const flat = new Canvas(40, 40, [0, 0, 0]);
  flat.draw(wide, { cx: 20, cy: 20, w: 16 });
  assert.deepEqual(pixel(flat, 14, 20), [0, 200, 0], 'wide before rotating');
  assert.deepEqual(pixel(flat, 20, 14), [0, 0, 0], 'not tall before rotating');

  const turned = new Canvas(40, 40, [0, 0, 0]);
  turned.draw(wide, { cx: 20, cy: 20, w: 16, rot: Math.PI / 2 });
  assert.deepEqual(pixel(turned, 20, 14), [0, 200, 0], 'tall after a quarter turn');
  assert.deepEqual(pixel(turned, 14, 20), [0, 0, 0], 'no longer wide');

  const left = new Canvas(40, 40, [0, 0, 0]);
  const half = new Sprite({ w: 2, h: 1, data: Uint8Array.from([255, 0, 0, 255, 0, 0, 255, 255]) }); // red | blue
  left.draw(half, { cx: 20, cy: 20, w: 20 });
  const mirrored = new Canvas(40, 40, [0, 0, 0]);
  mirrored.draw(half, { cx: 20, cy: 20, w: 20, flipX: true });
  const [lr, , lb] = pixel(left, 15, 20);
  assert.ok(lr > 200 && lb < 40, `unmirrored: left half is red (got r=${lr} b=${lb})`);
  const [mr, , mb] = pixel(mirrored, 15, 20);
  assert.ok(mb > 200 && mr < 40, `mirrored: left half is blue (got r=${mr} b=${mb})`);
});

test('clip restricts drawing to the given rectangle', () => {
  const canvas = new Canvas(40, 40, [0, 0, 0]);
  canvas.draw(new Sprite(solid(4, 4, [255, 255, 255])), { cx: 20, cy: 20, w: 20, clip: { x0: 20, y0: 0, x1: 40, y1: 40 } });
  assert.deepEqual(pixel(canvas, 25, 20), [255, 255, 255]);
  assert.deepEqual(pixel(canvas, 15, 20), [0, 0, 0]);
});

test('soft shadows work with fractional offsets and blur, drawing around the sprite only', () => {
  // Regression: typed arrays silently ignore fractional indices, so unrounded offsets once wrote
  // shadow pixels to the wrong places (or nowhere). Offsets here are deliberately fractional.
  const canvas = new Canvas(80, 80, [200, 200, 200]);
  canvas.draw(new Sprite(solid(4, 4, [255, 255, 255])), {
    cx: 40, cy: 40, w: 16, shadow: { dx: 1.75, dy: 2.5, blur: 2.4, opacity: 0.6 },
  });
  assert.deepEqual(pixel(canvas, 40, 40), [255, 255, 255], 'sprite sits on top of its shadow');
  const beside = pixel(canvas, 49, 41)[0];
  assert.ok(beside < 200 && beside > 0, `shadow darkens the canvas just right of the sprite (got ${beside})`);
  assert.deepEqual(pixel(canvas, 36, 36), [255, 255, 255], 'sprite interior is solid (edges are bilinear-soft)');
  assert.deepEqual(pixel(canvas, 10, 10), [200, 200, 200], 'far away stays untouched');
  for (let i = 0; i < canvas.data.length; i++) { assert.ok(Number.isFinite(canvas.data[i])); }
});

test('fillPattern repeats the tile and honours the rectangle', () => {
  const checker = new Sprite({ w: 2, h: 1, data: Uint8Array.from([255, 255, 255, 255, 0, 0, 0, 255]) }); // white | black
  const canvas = new Canvas(40, 10, [128, 128, 128]);
  canvas.fillPattern(checker, { x: 0, y: 0, w: 20, h: 10 }, { tile: 8 }); // each tile = 8 px: 4 white then 4 black texels (bilinear: compare relationships, not exact texel values)
  assert.ok(pixel(canvas, 2, 5)[0] > pixel(canvas, 6, 5)[0] + 150, 'white texel then black texel');
  for (const x of [1, 2, 3, 5, 6, 7]) { assert.equal(pixel(canvas, x + 8, 5)[0], pixel(canvas, x, 5)[0], `tile repeats every 8 px at x=${x}`); }
  assert.deepEqual(pixel(canvas, 30, 5), [128, 128, 128], 'outside the rectangle');
});
