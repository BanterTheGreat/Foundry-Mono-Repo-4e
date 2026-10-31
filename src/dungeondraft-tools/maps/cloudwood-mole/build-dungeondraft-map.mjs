// Writes a native Dungeondraft map for the Cloudwood mole encounter.
// scene.mjs composes everything from the encounter grid under the user's mapping rules, including the terrain paint;
// lib/map-writer.mjs serialises it (format notes are there and in the dungeondraft skill).
// Usage: node build-dungeondraft-map.mjs [--out dir] [--name file-stem] [--html encounter.html] [--seed n]
import fs from 'node:fs';
import path from 'node:path';
import { MAPS_OUT_DIR, REPO_DIR } from '../../config.mjs';
import { cliArg } from '../../lib/cli.mjs';
import { describeMap, serialiseMap, writeMapFile } from '../../lib/map-writer.mjs';
import { composeScene } from './scene.mjs';

const ENCOUNTER = 'cloudwood-mole';
const OUT = path.resolve(cliArg('--out', path.join(MAPS_OUT_DIR, ENCOUNTER)));
const NAME = cliArg('--name', ENCOUNTER);
const HTML = cliArg('--html', path.join(REPO_DIR, 'output', 'encounters', `${ENCOUNTER}.html`));
const SEED = Number(cliArg('--seed', 20261031));

const scene = composeScene(fs.readFileSync(HTML, 'utf8'), { seed: SEED });

const built = serialiseMap(scene, { seed: SEED, splat: scene.terrain.splat, cameraZoom: 3.6 });
const file = writeMapFile(built.map, OUT, NAME);
console.log(`Wrote ${file}`);
console.log(describeMap(built, scene.stats));
