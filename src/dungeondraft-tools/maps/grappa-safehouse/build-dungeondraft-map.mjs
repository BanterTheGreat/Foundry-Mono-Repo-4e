// Writes a native Dungeondraft map for Grappa's safehouse, extended with the east street and the south corridor.
// scene.mjs composes everything from the encounter grid under the user's mapping rules; lib/map-writer.mjs serialises it
// (format notes are there and in the dungeondraft skill). This file only reads the encounter and paints the terrain: dark dirt
// everywhere, covered by the patterns.
// Usage: node build-dungeondraft-map.mjs [--out dir] [--name file-stem] [--json encounter.json] [--seed n]
import fs from 'node:fs';
import path from 'node:path';
import { MAPS_OUT_DIR, REPO_DIR } from '../../config.mjs';
import { cliArg } from '../../lib/cli.mjs';
import { describeMap, serialiseMap, writeMapFile } from '../../lib/map-writer.mjs';
import { composeScene } from './scene.mjs';

const ENCOUNTER = 'grappa-safehouse';
const OUT = path.resolve(cliArg('--out', path.join(MAPS_OUT_DIR, ENCOUNTER)));
const NAME = cliArg('--name', ENCOUNTER);
const JSON_FILE = cliArg('--json', path.join(REPO_DIR, 'output', 'maps', `${ENCOUNTER}.json`));
const SEED = Number(cliArg('--seed', 20261031));

const scene = composeScene(JSON.parse(fs.readFileSync(JSON_FILE, 'utf8')), { seed: SEED });
const { cols: COLS, rows: ROWS } = scene.world;

// ---------- terrain: dark dirt everywhere, covered by the patterns ----------
const splat = new Array(COLS * 4 * ROWS * 4 * 4).fill(0); // 64-px texels, RGBA8
for (let i = 0; i < splat.length; i += 4) { splat[i] = 255; }

const built = serialiseMap(scene, { seed: SEED, splat, cameraZoom: 3.6 });
const file = writeMapFile(built.map, OUT, NAME);
console.log(`Wrote ${file}`);
console.log(describeMap(built, scene.stats));
