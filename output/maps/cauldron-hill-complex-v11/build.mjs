import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {composeLevels as originalLevels,LABELS} from '../cauldron-hill-complex-v10/build.mjs';
import {serialiseMap,writeMapFile} from '../../../src/dungeondraft-tools/lib/map-writer.mjs';

export const OUT=path.dirname(fileURLToPath(import.meta.url));
export const NAME='cauldron-hill-complex-v11';
export {LABELS};
export const WORLD={cols:112,rows:90,size:256};
// Whole-square moves preserve wall alignment. Multiples of four retain floor tile registration.
export const OFFSETS=[[0,-4],[28,24],[-76,-8],[-88,28]];
export const STEMS=['ground','lake-entrance','upper-borne-chamber','vip-suites'];

/** Translate every kind of entity together; no internal distance or size changes. */
export function shiftScene(scene,dx,dy,world) {
  const move=([x,y])=>[x+dx*256,y+dy*256];
  return {
    world,terrain:{...scene.terrain},
    patterns:scene.patterns.map(p=>({...p,points:p.points.map(move)})),
    walls:scene.walls.map(w=>({...w,points:w.points.map(move),openings:w.openings.map(o=>({...o,x:o.x+dx*256,y:o.y+dy*256}))})),
    paths:scene.paths.map(p=>({...p,points:p.points.map(move)})),
    objects:scene.objects.map(o=>({...o,x:o.x+dx*256,y:o.y+dy*256})),
  };
}

/** Move/crop terrain by exact texels, retaining all paint that is not the empty background. */
export function shiftSplat(splat,oldWorld,newWorld,dx,dy) {
  const result=Array(newWorld.cols*newWorld.rows*64).fill(0);
  for (let y=0;y<newWorld.rows*4;y++) {
    for (let x=0;x<newWorld.cols*4;x++) {
      const dest=(y*newWorld.cols*4+x)*4,sx=x-dx*4,sy=y-dy*4;
      result[dest]=255;
      if (sx>=0&&sy>=0&&sx<oldWorld.cols*4&&sy<oldWorld.rows*4) {
        const src=(sy*oldWorld.cols*4+sx)*4;
        for (let c=0;c<4;c++) { result[dest+c]=splat[src+c]; }
      }
    }
  }
  return result;
}

export function composeLevels() {
  const original=originalLevels();
  const roomKey=original.roomKey.map(r=>({...r,x:r.x+OFFSETS[r.level][0],y:r.y+OFFSETS[r.level][1]}));
  const levels=original.levels.map((entry,level)=>{
    const [dx,dy]=OFFSETS[level];
    const rooms=roomKey.filter(r=>r.level===level);
    const minX=Math.min(...rooms.map(r=>r.x)),minY=Math.min(...rooms.map(r=>r.y));
    const maxX=Math.max(...rooms.map(r=>r.x+r.w)),maxY=Math.max(...rooms.map(r=>r.y+r.h));
    // Export bounds leave a two-square border, expanded to the floor tile's four-square lattice.
    const x=Math.max(0,Math.floor((minX-2)/4)*4),y=Math.max(0,Math.floor((minY-2)/4)*4);
    const right=Math.min(WORLD.cols,Math.ceil((maxX+2)/4)*4),bottom=Math.min(WORLD.rows,Math.ceil((maxY+2)/4)*4);
    return {
      label:entry.label,scene:shiftScene(entry.scene,dx,dy,WORLD),
      splat:shiftSplat(entry.splat,original.world,WORLD,dx,dy),
      crop:{x,y,cols:right-x,rows:bottom-y,size:256},
    };
  });
  return {world:WORLD,levels,roomKey,original};
}

/** Retain the deliberate fine-grate scale on the bridge/staging patterns. */
export function serialise(scene,options={}) {
  const built=serialiseMap(scene,{seed:20261116,cameraZoom:12,currentLevel:0,...options});
  scene.levels.forEach((entry,level)=>entry.scene.patterns.forEach((p,i)=>{
    if (p.nativeScale) { built.map.world.levels[level].patterns[i].scale=`Vector2( ${p.nativeScale}, ${p.nativeScale} )`; }
  }));
  return built;
}

export function build() {
  const scene=composeLevels(),built=serialise(scene);
  const file=writeMapFile(built.map,OUT,NAME);
  fs.writeFileSync(path.join(OUT,'room-key.json'),JSON.stringify({levels:LABELS,world:WORLD,offsets:OFFSETS,crops:scene.levels.map(l=>l.crop),rooms:scene.roomKey},null,2));
  console.log(file);
  console.log(`Shared canvas ${WORLD.cols} x ${WORLD.rows}; previous 174 x 96`);
  scene.levels.forEach((l,i)=>console.log(`${i}: ${l.label}; crop ${l.crop.cols} x ${l.crop.rows}; move ${OFFSETS[i]}`));
  return built.map;
}
if (process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) { build(); }
