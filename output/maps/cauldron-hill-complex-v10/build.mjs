import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { composeScene } from '../cauldron-hill-complex-v9/build.mjs';
import { serialiseMap, writeMapFile } from '../../../src/dungeondraft-tools/lib/map-writer.mjs';
import { orderWalls } from '../../../src/dungeondraft-tools/lib/scene-kit.mjs';

export const OUT=path.dirname(fileURLToPath(import.meta.url));
export const NAME='cauldron-hill-complex-v10';
export const LABELS=['Ground - Lower Facility','Lake Entrance (-300 ft)','Upper Borne Chamber (+100 ft)','VIP Suites (+100 ft)'];
const S=256;

/** Assign rooms by their identity, never a broad bounding box that could catch another floor. */
export function roomLevel(r) {
  if (r.area==='dock') { return 1; }
  if (r.id==='4VIP'||r.id.startsWith('9VIP')||(Number(r.area)>=10&&Number(r.area)<=26)) { return 3; }
  if (r.area==='8'||r.id==='7W-upper'||r.id==='7E-upper') { return 2; }
  return 0;
}

/** Split the existing authored scene into explicit levels without moving any entity. */
export function composeLevels() {
  const source=composeScene();
  const {cols,rows}=source.world;
  const at=(x,y)=>source.plan.cells.get(source.plan.key(Math.floor(x/S),Math.floor(y/S)));
  const cells=[...source.plan.cells].map(([k,r])=>({xy:k.split(',').map(Number),r}));
  /** Prefer the room under an anchor; wall fixtures outside a floor use the nearest occupied cell. */
  function owner(x,y) {
    const r=at(x,y);
    if (r) { return roomLevel(r); }
    let best=Infinity,level;
    for (const {xy:[cx,cy],r} of cells) {
      const dx=Math.max(cx*S-x,0,x-(cx+1)*S),dy=Math.max(cy*S-y,0,y-(cy+1)*S);
      const d=dx*dx+dy*dy;
      if (d<best) { best=d;level=roomLevel(r); }
    }
    return level;
  }
  /** Existing shared walls/seams belong to both adjacent levels, retaining their doorway cuts. */
  function boundaryOwners(x,y,horizontal) {
    const result=new Set();
    for (const side of [-1,1]) {
      const r=at(x+(horizontal?0:side*.1*S),y+(horizontal?side*.1*S:0));
      if (r) { result.add(roomLevel(r)); }
    }
    if (!result.size) { result.add(owner(x,y)); }
    return result;
  }
  const levels=LABELS.map(label=>({label,scene:{world:source.world,terrain:{textures:source.terrain.textures},patterns:[],walls:[],paths:[],objects:[]},splat:Array(cols*rows*64).fill(0)}));
  for (const o of source.objects) { levels[owner(o.x,o.y)].scene.objects.push(o); }
  for (const p of source.patterns) {
    const xs=p.points.map(q=>q[0]),ys=p.points.map(q=>q[1]);
    levels[owner((Math.min(...xs)+Math.max(...xs))/2,(Math.min(...ys)+Math.max(...ys))/2)].scene.patterns.push(p);
  }
  // Walls are straight grid runs in this source map. Split only when level ownership changes.
  for (const w of source.walls) {
    if (w.loop||w.points.length!==2) { throw new Error('Unexpected source wall shape'); }
    const [a,b]=w.points,dx=b[0]-a[0],dy=b[1]-a[1],length=Math.hypot(dx,dy),units=Math.round(length/S);
    if (length!==units*S||!(dx===0||dy===0)) { throw new Error('Source wall is off the grid'); }
    for (let level=0;level<levels.length;level++) {
      let start=null;
      function flush(end) {
        if (start===null) { return; }
        const p=[a[0]+dx*start/units,a[1]+dy*start/units],q=[a[0]+dx*end/units,a[1]+dy*end/units];
        const openings=w.openings.filter(o=>o.x>=Math.min(p[0],q[0])&&o.x<=Math.max(p[0],q[0])&&o.y>=Math.min(p[1],q[1])&&o.y<=Math.max(p[1],q[1]));
        levels[level].scene.walls.push({...w,id:`${w.id}-level-${level}-${start}`,points:[p,q],openings});
        start=null;
      }
      for (let u=0;u<units;u++) {
        const x=a[0]+dx*(u+.5)/units,y=a[1]+dy*(u+.5)/units;
        if (boundaryOwners(x,y,dy===0).has(level)) { if (start===null) { start=u; } }
        else { flush(u); }
      }
      flush(units);
    }
  }
  // Most paths stay whole. Border seams are intentionally present on each side of a level transfer.
  for (const p of source.paths) {
    const owners=new Set();
    for (let i=1;i<p.points.length;i++) {
      const a=p.points[i-1],b=p.points[i],x=(a[0]+b[0])/2,y=(a[1]+b[1])/2;
      if (p.role==='seam') {
        for (const level of boundaryOwners(x,y,a[1]===b[1])) { owners.add(level); }
      } else { owners.add(owner(x,y)); }
    }
    if (owners.size>1&&p.role!=='seam') { throw new Error(`Path crosses levels: ${p.role}`); }
    for (const level of owners) { levels[level].scene.paths.push(p); }
  }
  // Terrain weights are exclusive to each floor: water and sump paint cannot leak into other levels.
  for (let ty=0;ty<rows*4;ty++) {
    for (let tx=0;tx<cols*4;tx++) {
      const r=source.plan.cells.get(source.plan.key(Math.floor(tx/4),Math.floor(ty/4)));
      const own=r?roomLevel(r):null,index=(ty*cols*4+tx)*4;
      for (let level=0;level<levels.length;level++) {
        levels[level].splat[index]=255;
        if (own===level) {
          for (let c=0;c<4;c++) { levels[level].splat[index+c]=source.terrain.splat[index+c]; }
        }
      }
    }
  }
  for (const entry of levels) { entry.scene.walls=orderWalls(entry.scene.walls); }
  const roomKey=source.plan.rooms.map(r=>({...r,level:roomLevel(r),levelLabel:LABELS[roomLevel(r)]}));
  return {world:source.world,levels,source,roomKey,owner};
}

export function build() {
  const scene=composeLevels();
  const built=serialiseMap(scene,{seed:20261116,cameraZoom:18,currentLevel:0});
  scene.levels.forEach((entry,level)=>entry.scene.patterns.forEach((p,i)=>{
    if (p.nativeScale) { built.map.world.levels[level].patterns[i].scale=`Vector2( ${p.nativeScale}, ${p.nativeScale} )`; }
  }));
  const file=writeMapFile(built.map,OUT,NAME);
  fs.writeFileSync(path.join(OUT,'room-key.json'),JSON.stringify({source:'ZEITGEIST Book 5 Part 3; migrated from v9',levels:LABELS,coordinates:'Original v9 coordinates retained on each level',rooms:scene.roomKey},null,2));
  console.log(file);
  for (const [id,level] of Object.entries(built.map.world.levels)) {
    console.log(`${id}: ${level.label}; ${level.objects.length} objects, ${level.patterns.length} floors, ${level.walls.length} walls`);
  }
  return built.map;
}
if (process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) { build(); }
