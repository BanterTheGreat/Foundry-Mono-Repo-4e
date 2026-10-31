// Crop and scale a region of a PNG so a huge render can be inspected at readable size with the Read tool.
// Usage: node src/dungeondraft-tools/inspect/crop.mjs <in.png> <out.png> <x> <y> <w> <h> <outWidth>
//   (x, y, w, h in pixels of the input; the output keeps the region's aspect ratio at outWidth pixels wide)
import fs from 'node:fs';
import { decodePng, encodePng, Sprite, Canvas } from '../lib/png.mjs';

const [input, output, x, y, w, h, outWidth] = process.argv.slice(2);
if (!outWidth) {
  console.error('Usage: node crop.mjs <in.png> <out.png> <x> <y> <w> <h> <outWidth>');
  process.exit(2);
}
const image = decodePng(fs.readFileSync(input));
const scale = Number(outWidth) / Number(w);
const canvas = new Canvas(Number(outWidth), Math.round(Number(h) * scale));
canvas.draw(new Sprite(image), { cx: (image.w / 2 - Number(x)) * scale, cy: (image.h / 2 - Number(y)) * scale, w: image.w * scale, h: image.h * scale });
fs.writeFileSync(output, encodePng(canvas.toImage()));
console.log('wrote', output);
