// Writes a native Dungeondraft map for The Mindmaker's Last Delivery v2 safehouse (20 x 16: the 16 x 14 encounter grid plus a
// two-row corridor south and a four-column street east).
// scene.mjs composes everything from the encounter grid under the user's mapping rules, including the terrain paint;
// lib/map-writer.mjs serialises it (format notes are there and in the dungeondraft skill).
// Usage: node build-dungeondraft-map.mjs [--out dir] [--name file-stem] [--html encounter.html] [--seed n]
import fs from 'node:fs';
import path from 'node:path';
import { MAPS_OUT_DIR, REPO_DIR } from '../../config.mjs';
import { cliArg } from '../../lib/cli.mjs';
import { describeMap, serialiseMap, writeMapFile } from '../../lib/map-writer.mjs';
import { composeScene } from './scene.mjs';

const ENCOUNTER = 'grappa-safehouse-v2';
const OUT = path.resolve(cliArg('--out', path.join(MAPS_OUT_DIR, ENCOUNTER)));
const NAME = cliArg('--name', ENCOUNTER);
const HTML = cliArg('--html', path.join(REPO_DIR, 'output', 'encounters', 'grappav2', `${ENCOUNTER}.html`));
const SEED = Number(cliArg('--seed', 20261031));

// Grappa's trolley square comes from the deployment list the encounter wrote beside its grid page
const JSON_FILE = HTML.replace(/\.html$/, '.json');
const deployment = fs.existsSync(JSON_FILE) ? JSON.parse(fs.readFileSync(JSON_FILE, 'utf8')).deployment ?? [] : [];

const scene = composeScene(fs.readFileSync(HTML, 'utf8'), { seed: SEED, deployment });
const built = serialiseMap(scene, { seed: SEED, splat: scene.terrain.splat, cameraZoom: 4.2 });
const file = writeMapFile(built.map, OUT, NAME);
console.log(`Wrote ${file}`);
console.log(describeMap(built, scene.stats));
