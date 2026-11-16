import path from 'node:path';
import {OUT,NAME,LABELS} from './build.mjs';
import {renderMapPreview} from '../../../src/dungeondraft-tools/lib/map-preview.mjs';

const pps=Number(process.argv[2]??64);
const stems=['ground','lake-entrance','upper-borne-chamber','vip-suites'];
for (let level=0;level<LABELS.length;level++) {
  const out=path.join(OUT,`${stems[level]}${pps===16?'-preview':''}.png`);
  console.log(renderMapPreview(path.join(OUT,`${NAME}.dungeondraft_map`),{level,pps,out}));
}
