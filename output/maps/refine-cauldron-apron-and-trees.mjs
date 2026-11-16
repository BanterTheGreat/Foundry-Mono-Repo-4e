import fs from 'node:fs';
import assert from 'node:assert/strict';
import { renderMapPreview } from '../../src/dungeondraft-tools/lib/map-preview.mjs';
import { findTexture, resPath } from '../../src/dungeondraft-tools/lib/packs.mjs';
import { blob, seededRandom } from '../../src/dungeondraft-tools/lib/geometry.mjs';
const input='output/maps/cauldron-hill-entrance-v2.dungeondraft_map';
const original=JSON.parse(fs.readFileSync(input,'utf8'));
const map=structuredClone(original), lv=map.world.levels['0'];
const vec=s=>s.replace(/^[^(]*\(/,'').replace(/\)$/,'').split(',').map(Number);
const trees=lv.objects.filter(o=>/dead_tree/i.test(o.texture));
const removed=[7,10,13,17,21,26,29].map(i=>trees[i]);
const shadows=lv.objects.filter(o=>/BW_Shadow_Circle/i.test(o.texture));
const removedShadows=removed.map(tree=>{
  const [x,y]=vec(tree.position);
  const matches=shadows.filter(o=>{const [sx,sy]=vec(o.position);return Math.hypot(sx-x,sy-y)<36;});
  assert.equal(matches.length,1,'Each removed tree has exactly one matching shadow');
  return matches[0];
});
const deleted=new Set([...removed,...removedShadows]);
lv.objects=lv.objects.filter(o=>!deleted.has(o));
const apron=lv.patterns.find(p=>p.texture.includes('Stone_Tiled_Dark'));
assert.ok(apron);
lv.patterns=lv.patterns.filter(p=>p!==apron);
const tex=findTexture('Buildings:Stone_Sidewalk_Dark:patterns');
const rng=seededRandom(20261116);
let id=parseInt(map.world.next_node_id,16);
// Small irregular remnants share a paving lattice, with generous gaps of exposed ground.
for(const [x,y,rx,ry] of [[4590,1810,180,100],[4810,1720,150,90],[5140,1760,200,110],[5460,1740,190,90],[5620,1900,130,110],[5410,2050,180,80],[5100,2120,200,75],[4760,2050,140,85],[4500,1980,110,65]]) {
  const points=blob(rng,x,y,rx,ry,{n:16,jitter:0.35});
  lv.patterns.push({...structuredClone(apron),texture:resPath(tex.pack,tex.rel),points:`PoolVector2Array( ${points.flat().map(v=>+v.toFixed(1)).join(', ')} )`,node_id:(id++).toString(16)});
}
map.world.next_node_id=id.toString(16);
assert.equal(lv.objects.filter(o=>/dead_tree/i.test(o.texture)).length,27);
assert.equal(lv.objects.length,original.world.levels['0'].objects.length-14);
assert.deepEqual(lv.walls,original.world.levels['0'].walls);
assert.deepEqual(lv.paths,original.world.levels['0'].paths);
assert.deepEqual(lv.terrain,original.world.levels['0'].terrain);
assert.ok(!lv.patterns.some(p=>p.texture.includes('Stone_Tiled_Dark')));
const out='output/maps/cauldron-hill-entrance-v3';
fs.writeFileSync(out+'.dungeondraft_map',JSON.stringify(map,null,'\t')+'\n');
console.log('Verified 7/34 trees removed (20.6%), matching shadows removed, 9 dark paving remnants; walls, tracks and terrain preserved.');
console.log(renderMapPreview(out+'.dungeondraft_map',{pps:64,out:out+'.png'}));
