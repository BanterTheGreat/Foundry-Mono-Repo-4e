// Re-renders this map's .dungeondraft_map to a PNG (lib/map-preview.mjs holds the renderer and its caveats).
// Usage: node preview-dungeondraft-map.mjs [map] [--pps 64] [--out file.png]   (pps 256 = native size)
import path from 'node:path';
import { MAPS_OUT_DIR } from '../../config.mjs';
import { previewCli } from '../../lib/map-preview.mjs';

previewCli(path.join(MAPS_OUT_DIR, 'grappa-safehouse', 'grappa-safehouse.dungeondraft_map'));
