// Writes a native Dungeondraft map for the Cauldron Hill entrance (40 x 28), ZEITGEIST Act One, Adventure Five.
// scene.mjs composes everything from the encounter grid under the user's mapping rules, including the terrain paint;
// lib/map-writer.mjs serialises it (format notes are there and in the dungeondraft skill).
// Usage: node build-dungeondraft-map.mjs [--out dir] [--name file-stem] [--html encounter.html] [--seed n]
import fs from 'node:fs';
import path from 'node:path';
import { MAPS_OUT_DIR, REPO_DIR } from '../../config.mjs';
import { cliArg } from '../../lib/cli.mjs';
import { describeMap, serialiseMap, writeMapFile } from '../../lib/map-writer.mjs';
import { composeScene } from './scene.mjs';

const ENCOUNTER = 'cauldron-hill-entrance';
const OUT = path.resolve(cliArg('--out', path.join(MAPS_OUT_DIR, ENCOUNTER)));
const NAME = cliArg('--name', ENCOUNTER);
const HTML = cliArg('--html', path.join(REPO_DIR, 'output', 'maps', `${ENCOUNTER}.html`));
const SEED = Number(cliArg('--seed', 20261107));

const scene = composeScene(fs.readFileSync(HTML, 'utf8'), { seed: SEED });
const built = serialiseMap(scene, { seed: SEED, splat: scene.terrain.splat, cameraZoom: 7 });
const file = writeMapFile(built.map, OUT, NAME);
console.log(`Wrote ${file}`);
console.log(describeMap(built, scene.stats));
console.log(`lamps ${scene.stats.lamps}, prop shadows ${scene.stats.propShadows}`);
