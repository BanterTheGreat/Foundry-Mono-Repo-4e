import fs from 'node:fs';
import path from 'node:path';
import {composeLevels,serialise,shiftScene,shiftSplat,OUT,STEMS} from './build.mjs';
import {writeMapFile} from '../../../src/dungeondraft-tools/lib/map-writer.mjs';
import {renderMapPreview} from '../../../src/dungeondraft-tools/lib/map-preview.mjs';

const pps=Number(process.argv[2]??64),source=composeLevels();
for (const [i,entry] of source.levels.entries()) {
  const {x,y,...world}=entry.crop;
  const cropped={world,levels:[{
    label:entry.label,scene:shiftScene(entry.scene,-x,-y,world),
    splat:shiftSplat(entry.splat,source.world,world,-x,-y),
  }]};
  const built=serialise(cropped),name=`_render-${i}`;
  const file=writeMapFile(built.map,OUT,name);
  try {
    console.log(renderMapPreview(file,{pps,out:path.join(OUT,`${STEMS[i]}${pps===16?'-preview':''}.png`)}));
  } finally { fs.unlinkSync(file); }
}
