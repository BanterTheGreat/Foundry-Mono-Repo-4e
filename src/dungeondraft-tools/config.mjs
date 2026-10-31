// Where the Dungeondraft tooling finds things. Each location can be overridden with an environment variable,
// so nothing else in this folder hard-codes a machine path.
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const TOOLS_DIR = path.dirname(fileURLToPath(import.meta.url));
export const REPO_DIR = path.resolve(TOOLS_DIR, '..', '..');

const at = (variable, fallback) => path.resolve(process.env[variable] || fallback);
const DOCUMENTS = 'C:/Users/Imre/Documents';

/** Folder holding the `.dungeondraft_pack` files the user maps from (DD_PACK_DIR). */
export const PACK_DIR = at('DD_PACK_DIR', `${DOCUMENTS}/Dungeondraft Assets/New Crosshead Textures`);
/** Generated, git-ignored index of every pack texture: assets.tsv, catalog/, vocab.md, README.md (DD_INDEX_DIR). */
export const INDEX_DIR = at('DD_INDEX_DIR', path.join(TOOLS_DIR, 'index-data'));
/** Where rendered PNGs and generated `.dungeondraft_map` files are written, one folder per encounter (DD_MAPS_DIR). */
export const MAPS_OUT_DIR = at('DD_MAPS_DIR', `${DOCUMENTS}/Dungeondraft Assets/Generated Maps`);
/** The user's own finished maps, the ground truth for the file format (DD_MAP_LIBRARY). */
export const MAP_LIBRARY_DIR = at('DD_MAP_LIBRARY', `${DOCUMENTS}/DungeonDraft Maps`);
/** A real map from the newest Dungeondraft build, used as the structural reference by verify (DD_REFERENCE_MAP). */
export const REFERENCE_MAP = at('DD_REFERENCE_MAP', path.join(MAP_LIBRARY_DIR, 'Zeitgeist', 'Book 5', 'Subway.dungeondraft_map'));
/** The Dungeondraft installation, whose `.pck` and assembly the inspect tools read (DD_INSTALL_DIR). */
export const DD_INSTALL_DIR = at('DD_INSTALL_DIR', 'C:/Program Files/Dungeondraft');
/** Encounter write-ups (read-only grids) that maps are generated from. */
export const ARTIFACTS_DIR = path.join(REPO_DIR, 'artifacts');
