import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {composeLevels,OUT,NAME,WORLD,OFFSETS,LABELS} from './build.mjs';
import {REFERENCE_MAP} from '../../../src/dungeondraft-tools/config.mjs';
import {findTexture} from '../../../src/dungeondraft-tools/lib/packs.mjs';
import {checkStructure,checkArraySizes,checkAssets,checkColorable,checkMappingRules,checkNodes,checkShadowTextures,checkWallOrder,pool,vec} from '../../../src/dungeondraft-tools/lib/map-checks.mjs';

const scene=composeLevels();
const map=JSON.parse(fs.readFileSync(`${OUT}/${NAME}.dungeondraft_map`,'utf8'));
const previous=JSON.parse(fs.readFileSync(`${OUT}/../cauldron-hill-complex-v10/cauldron-hill-complex-v10.dungeondraft_map`,'utf8'));
const fmt=v=>Number(v.toFixed(5));
const moveVec=(text,dx,dy)=>{const [x,y]=vec(text);return `Vector2( ${fmt(x+dx)}, ${fmt(y+dy)} )`;};
const movePool=(text,dx,dy)=>`PoolVector2Array( ${pool(text).map(([x,y])=>`${fmt(x+dx)}, ${fmt(y+dy)}`).join(', ')} )`;

test('shared canvas shrinks and all four levels are centred with useful export crops',()=>{
  assert.equal(map.world.width,112);assert.equal(map.world.height,90);
  assert(WORLD.cols*WORLD.rows<previous.world.width*previous.world.height*.61);
  assert.deepEqual(Object.values(map.world.levels).map(l=>l.label),LABELS);
  for (let level=0;level<4;level++) {
    const rooms=scene.roomKey.filter(r=>r.level===level),crop=scene.levels[level].crop;
    const left=Math.min(...rooms.map(r=>r.x)),right=Math.max(...rooms.map(r=>r.x+r.w));
    const top=Math.min(...rooms.map(r=>r.y)),bottom=Math.max(...rooms.map(r=>r.y+r.h));
    assert(Math.abs((left+right)/2-WORLD.cols/2)<=2);
    assert(Math.abs((top+bottom)/2-WORLD.rows/2)<=2);
    assert(left>=crop.x+2&&right<=crop.x+crop.cols-2);
    assert(top>=crop.y+2&&bottom<=crop.y+crop.rows-2);
    if (level>0) { assert(crop.cols*crop.rows<WORLD.cols*WORLD.rows*.3); }
  }
});

test('all geometry and props differ from v10 only by the documented translation',()=>{
  for (let level=0;level<4;level++) {
    const [dx,dy]=OFFSETS[level].map(v=>v*256),a=map.world.levels[level],b=previous.world.levels[level];
    assert.deepEqual(a.objects,b.objects.map(o=>({...o,position:moveVec(o.position,dx,dy)})));
    assert.deepEqual(a.patterns,b.patterns.map(p=>({...p,points:movePool(p.points,dx,dy)})));
    assert.deepEqual(a.paths,b.paths.map(p=>({...p,position:moveVec(p.position,dx,dy)})));
    assert.deepEqual(a.walls,b.walls.map(w=>({...w,points:movePool(w.points,dx,dy),portals:w.portals.map(p=>({...p,position:moveVec(p.position,dx,dy)}))})));
  }
});

test('every room coordinate changes by its level offset with no room resized or removed',()=>{
  assert.equal(scene.roomKey.length,scene.original.roomKey.length);
  scene.roomKey.forEach((r,i)=>{
    const old=scene.original.roomKey[i],[dx,dy]=OFFSETS[r.level];
    assert.deepEqual(r,{...old,x:old.x+dx,y:old.y+dy});
  });
});

test('no sprite is clipped by the shared canvas or its cropped export',()=>{
  const cache=new Map();
  for (const entry of scene.levels) {
    const c=entry.crop;
    for (const o of entry.scene.objects) {
      const spec=`${o.pack}:${o.name}:objects`;
      if (!cache.has(spec)) { cache.set(spec,findTexture(spec)); }
      const t=cache.get(spec),hx=(Math.abs(Math.cos(o.rot))*t.w+Math.abs(Math.sin(o.rot))*t.h)*o.scale/2;
      const hy=(Math.abs(Math.sin(o.rot))*t.w+Math.abs(Math.cos(o.rot))*t.h)*o.scale/2;
      assert(o.x-hx>=c.x*256&&o.x+hx<=(c.x+c.cols)*256,`Horizontal crop: ${o.name}`);
      assert(o.y-hy>=c.y*256&&o.y+hy<=(c.y+c.rows)*256,`Vertical crop: ${o.name}`);
    }
  }
});

test('lake and sump terrain paint translates without losing a painted texel',()=>{
  for (let level=0;level<4;level++) {
    const old=scene.original.levels[level].splat,current=scene.levels[level].splat,[dx,dy]=OFFSETS[level];
    let before=0,after=0;
    for (let y=0;y<scene.original.world.rows*4;y++) {
      for (let x=0;x<scene.original.world.cols*4;x++) {
        const src=(y*scene.original.world.cols*4+x)*4;
        if (old[src]===255) { continue; }
        before++;
        const nx=x+dx*4,ny=y+dy*4;
        assert(nx>=0&&ny>=0&&nx<WORLD.cols*4&&ny<WORLD.rows*4);
        const dst=(ny*WORLD.cols*4+nx)*4;
        assert.deepEqual(current.slice(dst,dst+4),old.slice(src,src+4));
      }
    }
    for (let i=0;i<current.length;i+=4) { if (current[i]!==255) { after++; } }
    assert.equal(before,after);
  }
});

test('native multilevel schema, assets, arrays, IDs and mapping rules pass',()=>{
  const errors=[],ok=(yes,msg)=>{if(!yes){errors.push(msg);}};
  checkStructure(ok,map,JSON.parse(fs.readFileSync(REFERENCE_MAP,'utf8')));
  const {caveLen}=checkArraySizes(ok,map);
  checkAssets(ok,map);checkColorable(ok,map);checkMappingRules(ok,map,{S:256,caveLen});
  checkNodes(ok,map,{S:256,margin:0});checkShadowTextures(ok,map,{onlyShadowPaths:false,pathLayer:400});checkWallOrder(ok,map);
  assert.deepEqual(errors,[]);
});
