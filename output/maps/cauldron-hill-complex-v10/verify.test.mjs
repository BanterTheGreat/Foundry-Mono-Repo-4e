import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {composeLevels,roomLevel,OUT,NAME,LABELS} from './build.mjs';
import {REFERENCE_MAP} from '../../../src/dungeondraft-tools/config.mjs';
import {checkStructure,checkArraySizes,checkAssets,checkColorable,checkMappingRules,checkNodes,checkShadowTextures,checkWallOrder,pool,vec} from '../../../src/dungeondraft-tools/lib/map-checks.mjs';

const scene=composeLevels();
const map=JSON.parse(fs.readFileSync(`${OUT}/${NAME}.dungeondraft_map`,'utf8'));
const previous=JSON.parse(fs.readFileSync(`${OUT}/../cauldron-hill-complex-v9/cauldron-hill-complex-v9.dungeondraft_map`,'utf8'));
const withoutId=({node_id,...o})=>o;
const signature=o=>JSON.stringify(withoutId(o));

test('four explicit levels contain the requested rooms, utilities and service passages',()=>{
  assert.deepEqual(Object.values(map.world.levels).map(l=>l.label),LABELS);
  assert.equal(map.header.editor_state.current_level,0);
  const byId=new Map(scene.roomKey.map(r=>[r.id,r.level]));
  for (const id of ['dock-channel','dock-basin','dock-lift','dock-guard','dock-machine']) { assert.equal(byId.get(id),1,id); }
  for (const id of ['8','8-pit','8-west-cab','8-east-cab','7W-upper','7E-upper','8-vip-link']) { assert.equal(byId.get(id),2,id); }
  for (const id of ['10','11','12','13','14','4VIP','9VIP','9VIP-rise','9VIP-west',...Array.from({length:12},(_,i)=>String(i+15))]) { assert.equal(byId.get(id),3,id); }
  for (const id of ['1','2-mess','3','5','6','6-pit','7W','7E','4C','9a-chamber']) { assert.equal(byId.get(id),0,id); }
});

test('every v9 object is moved exactly once with position, art, rotation, scale and layer unchanged',()=>{
  const current=Object.values(map.world.levels).flatMap(l=>l.objects).map(signature).sort();
  assert.deepEqual(current,previous.world.levels['0'].objects.map(signature).sort());
  for (let level=0;level<4;level++) {
    for (const o of scene.levels[level].scene.objects) { assert.equal(scene.owner(o.x,o.y),level); }
  }
  assert(Object.values(map.world.levels).flatMap(l=>l.objects).filter(o=>o.texture.endsWith('/Lantern_Wall_01.png')).every(o=>o.layer===300));
});

test('all floor polygons retain exact coordinates, textures and native scales on their own levels',()=>{
  assert.deepEqual(Object.values(map.world.levels).flatMap(l=>l.patterns).map(signature).sort(),previous.world.levels['0'].patterns.map(signature).sort());
  assert.equal(scene.levels.reduce((n,l)=>n+l.scene.patterns.length,0),scene.source.patterns.length);
  assert.equal(scene.source.patterns.some(p=>p.role==='borne'),false);
});

test('paths remain intact; only transfer seams may be duplicated across levels',()=>{
  for (const p of scene.source.paths) {
    const copies=scene.levels.flatMap(l=>l.scene.paths).filter(q=>q===p).length;
    assert(copies>=1,`Missing ${p.role}`);
    assert(copies===1||p.role==='seam',`Unexpected duplicate ${p.role}`);
  }
  const source=new Set(previous.world.levels['0'].paths.map(signature));
  for (const p of Object.values(map.world.levels).flatMap(l=>l.paths)) { assert(source.has(signature(p))); }
});

test('each wall unit appears on every adjacent room level, with no orphan or missing wall',()=>{
  const expected=Array.from({length:4},()=>new Set());
  const actual=Array.from({length:4},()=>new Set());
  const cell=(x,y)=>scene.source.plan.cells.get(scene.source.plan.key(Math.floor(x/256),Math.floor(y/256)));
  const unitKey=(a,b)=>`${a[0]},${a[1]}:${b[0]},${b[1]}`;
  for (const w of scene.source.walls) {
    const [a,b]=w.points,units=Math.round(Math.hypot(b[0]-a[0],b[1]-a[1])/256),h=a[1]===b[1];
    for (let u=0;u<units;u++) {
      const p=a.map((v,i)=>v+(b[i]-v)*u/units),q=a.map((v,i)=>v+(b[i]-v)*(u+1)/units);
      const x=(p[0]+q[0])/2,y=(p[1]+q[1])/2;
      const adjacent=[cell(x+(h?0:-1),y+(h?-1:0)),cell(x+(h?0:1),y+(h?1:0))].filter(Boolean);
      assert(adjacent.length>0);
      for (const r of adjacent) { expected[roomLevel(r)].add(unitKey(p,q)); }
    }
  }
  for (let level=0;level<4;level++) {
    for (const w of map.world.levels[level].walls) {
      const [a,b]=pool(w.points),units=Math.round(Math.hypot(b[0]-a[0],b[1]-a[1])/256);
      for (let u=0;u<units;u++) {
        const p=a.map((v,i)=>v+(b[i]-v)*u/units),q=a.map((v,i)=>v+(b[i]-v)*(u+1)/units);
        assert(!actual[level].has(unitKey(p,q)),'Duplicate wall');
        actual[level].add(unitKey(p,q));
      }
      for (const p of w.portals) {
        const [x,y]=vec(p.position);
        assert(x>=Math.min(a[0],b[0])&&x<=Math.max(a[0],b[0])&&y>=Math.min(a[1],b[1])&&y<=Math.max(a[1],b[1]));
        assert.equal(p.wall_id,w.node_id);
      }
    }
    assert.deepEqual([...actual[level]].sort(),[...expected[level]].sort(),`Level ${level} walls`);
  }
  const ports=Object.values(map.world.levels).flatMap(l=>l.walls.flatMap(w=>w.portals));
  for (const p of previous.world.levels['0'].walls.flatMap(w=>w.portals)) {
    assert(ports.some(q=>q.position===p.position&&q.texture===p.texture),'Missing portal');
  }
});

test('lake and sump terrain never leak onto another level',()=>{
  for (let ty=0;ty<scene.world.rows*4;ty++) {
    for (let tx=0;tx<scene.world.cols*4;tx++) {
      const r=scene.source.plan.cells.get(scene.source.plan.key(Math.floor(tx/4),Math.floor(ty/4)));
      const index=(ty*scene.world.cols*4+tx)*4;
      for (let level=0;level<4;level++) {
        if (r&&roomLevel(r)===level) { assert.deepEqual(scene.levels[level].splat.slice(index,index+4),scene.source.terrain.splat.slice(index,index+4)); }
        else { assert.deepEqual(scene.levels[level].splat.slice(index,index+4),[255,0,0,0]); }
      }
    }
  }
});

test('multilevel native format, assets, arrays, unique IDs and mapping rules pass',()=>{
  const errors=[],ok=(yes,msg)=>{if(!yes){errors.push(msg);}};
  checkStructure(ok,map,JSON.parse(fs.readFileSync(REFERENCE_MAP,'utf8')));
  const {caveLen}=checkArraySizes(ok,map);
  checkAssets(ok,map);checkColorable(ok,map);checkMappingRules(ok,map,{S:256,caveLen});
  checkNodes(ok,map,{S:256,margin:0});checkShadowTextures(ok,map,{onlyShadowPaths:false,pathLayer:400});
  checkWallOrder(ok,map);
  assert.deepEqual(errors,[]);
});
