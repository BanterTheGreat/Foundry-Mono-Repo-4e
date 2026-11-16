import fs from 'node:fs';
import assert from 'node:assert/strict';
import { renderMapPreview } from '../../src/dungeondraft-tools/lib/map-preview.mjs';
const dir = 'C:/Users/Imre/Documents/Dungeondraft Assets/Generated Maps/cauldron-hill-entrance/';
const original = JSON.parse(fs.readFileSync(dir + 'cauldron-hill-entrance.dungeondraft_map', 'utf8'));
const map = structuredClone(original);
const lv = map.world.levels['0'];
const numbers = s => s.replace(/^[^(]*\(/, '').replace(/\)$/, '').split(',').map(Number);
const inside = (x,y) => x >= 6400 && x <= 8448 && y >= 1792 && y <= 3072;
const removedWalls = lv.walls.filter(w => { const p = numbers(w.points); return p.every((v,i) => i % 2 === 0 || inside(p[i-1],v)); });
assert.equal(removedWalls.length, 2);
lv.walls = lv.walls.filter(w => !removedWalls.includes(w));
const removedGears = lv.objects.filter(o => { const [x,y] = numbers(o.position); return inside(x,y) && o.texture.toLowerCase().includes('gears_metal'); });
assert.equal(removedGears.length, 4);
lv.objects = lv.objects.filter(o => !removedGears.includes(o));
// Repaint the former trench and rock core with nearby ordinary ground, with a soft edge.
const weights = numbers(lv.terrain.splat), before = [...weights], width = map.world.width * 4;
for (let ty=26; ty<50; ty++) {
  for (let tx=98; tx<134; tx++) {
    const x=(tx+0.5)*64, y=(ty+0.5)*64;
    const distance = Math.max(6400-x, x-8448, 1792-y, y-3072, 0);
    const alpha = Math.max(0, 1-distance/128);
    if (!alpha) { continue; }
    const at=(ty*width+tx)*4, donor=((ty+24)*width+tx)*4;
    const mixed=[0,1,2,3].map(k => Math.round(before[at+k]*(1-alpha)+before[donor+k]*alpha));
    mixed[0] += 255-mixed.reduce((a,b)=>a+b,0);
    mixed.forEach((v,k)=>{weights[at+k]=v;});
  }
}
lv.terrain.splat = `PoolByteArray( ${weights.join(', ')} )`;
assert.deepEqual(lv.paths, original.world.levels['0'].paths);
assert.deepEqual(lv.patterns, original.world.levels['0'].patterns);
assert.equal(lv.objects.length, original.world.levels['0'].objects.length-4);
const out='output/maps/cauldron-hill-entrance-v2';
fs.writeFileSync(out+'.dungeondraft_map',JSON.stringify(map,null,'\t')+'\n');
console.log('Verified: removed exactly two enclosure walls and four gates; preserved other objects, paths and floors.');
console.log(renderMapPreview(out+'.dungeondraft_map',{pps:64,out:out+'.png'}));


