// Writes a native Dungeondraft map for the Salt Ledger dockyard warehouse.
// scene.mjs composes everything from the encounter grid under the user's mapping rules; lib/map-writer.mjs serialises it
// (format notes are there and in the dungeondraft skill). This file only reads the encounter and paints the terrain: land
// (slot 3) up to the water line, shallows (slots 1 and 2) fading into harbour water beyond it.
// Usage: node build-dungeondraft-map.mjs [--out dir] [--name file-stem] [--html encounter.html] [--seed n]
import fs from 'node:fs';
import path from 'node:path';
import { ARTIFACTS_DIR, MAPS_OUT_DIR } from '../../config.mjs';
import { cliArg } from '../../lib/cli.mjs';
import { describeMap, serialiseMap, writeMapFile } from '../../lib/map-writer.mjs';
import { composeScene } from './scene.mjs';

const ENCOUNTER = 'dockyard-warehouse';
const OUT = path.resolve(cliArg('--out', path.join(MAPS_OUT_DIR, ENCOUNTER)));
const NAME = cliArg('--name', `${ENCOUNTER}-v2`);
const HTML = cliArg('--html', path.join(ARTIFACTS_DIR, `${ENCOUNTER}.html`));
const SEED = Number(cliArg('--seed', 20261031));

const scene = composeScene(fs.readFileSync(HTML, 'utf8'), { seed: SEED });
const { cols: COLS, rows: ROWS } = scene.world;

// ---------- terrain ----------
const TW = COLS * 4, TH = ROWS * 4; // 64-px texels
const splat = new Array(TW * TH * 4).fill(0);
for (let ty = 0; ty < TH; ty++) {
  for (let tx = 0; tx < TW; tx++) {
    const x = (tx + 0.5) * 64;
    const o = (ty * TW + tx) * 4;
    if (x >= scene.terrain.waterX) {
      const shallow = Math.max(0, Math.min(1, 1 - (x - scene.terrain.waterX) / scene.terrain.shallowWidth)) * 0.9;
      const w2 = Math.round(255 * shallow);
      splat[o] = 255 - w2; splat[o + 1] = w2;
    } else {
      splat[o + 2] = 255;
    }
  }
}

const built = serialiseMap(scene, { seed: SEED, splat, cameraZoom: 3.2 });
const file = writeMapFile(built.map, OUT, NAME);
console.log(`Wrote ${file}`);
console.log(describeMap(built, scene.stats));
