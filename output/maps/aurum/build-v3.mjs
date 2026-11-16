import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { findTexture as T } from '../../../src/dungeondraft-tools/lib/packs.mjs';
import { rectPolygon } from '../../../src/dungeondraft-tools/lib/geometry.mjs';
import { buildObject, patternRecord, wallRecord, orderWalls, shadowPathRecord, circleShadows, applyClutterCuts, CLUTTER_CUTS, pathRecord } from '../../../src/dungeondraft-tools/lib/scene-kit.mjs';
import { serialiseMap } from '../../../src/dungeondraft-tools/lib/map-writer.mjs';
import { renderMapPreview } from '../../../src/dungeondraft-tools/lib/map-preview.mjs';
import { REFERENCE_MAP } from '../../../src/dungeondraft-tools/config.mjs';
import * as checks from '../../../src/dungeondraft-tools/lib/map-checks.mjs';

const out = path.dirname(fileURLToPath(import.meta.url));
const layout = JSON.parse(fs.readFileSync(path.join(out, 'layout.json'), 'utf8'));
const S = 256, seed = 20261104;
const scene = { world: { cols: layout.columns, rows: layout.rows, size: S }, terrain: { textures: [T('Team:ch_dungeonvoid:terrain'), null, null, null] }, patterns: [], walls: [], paths: [], objects: [] };
for (const room of layout.rooms) {
  const floor = room.id === 'sitting' ? 'Buildings:Wood_Dark:patterns' : room.floor;
  scene.patterns.push(patternRecord(T(floor), rectPolygon(...room.bounds.map(n => n * S)), -400));
}
const ranks = new Map();
scene.walls = orderWalls(layout.walls.map(w => {
  const record = wallRecord(T(w.rank === 0 ? 'Scenes:wall2a:walls' : 'Scenes:wall1a:walls'), {
    points: w.points.map(p => p.map(n => n * S)), openings: w.openings.map(p => p.map(n => n * S)), loop: !!w.loop,
  }, T('Interior:empty:portals'));
  ranks.set(record, w.rank);
  return record;
}), w => ranks.get(w));

// Small contact shadows on both sides of every standing wall, split at doors.
for (const w of layout.walls) {
  const points = w.loop ? [...w.points, w.points[0]] : w.points;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i].map(n => n * S), b = points[i + 1].map(n => n * S);
    const dx = b[0] - a[0], dy = b[1] - a[1], length = Math.hypot(dx, dy);
    const d = [dx / length, dy / length];
    const cuts = w.openings.map(p => p.map(n => n * S)).filter(p => Math.abs((p[0] - a[0]) * d[1] - (p[1] - a[1]) * d[0]) < 1).map(p => (p[0] - a[0]) * d[0] + (p[1] - a[1]) * d[1]).filter(t => t > 0 && t < length).sort((a,b) => a-b);
    let start = 0;
    for (const cut of [...cuts, length + S / 2]) {
      const end = cut - S / 2;
      if (end > start) {
        const run = [[a[0] + d[0] * start, a[1] + d[1] * start], [a[0] + d[0] * end, a[1] + d[1] * end]];
        for (const side of [run, [...run].reverse()]) {
          scene.paths.push(shadowPathRecord(T, { edge: 'half', size: 'small', strength: '025' }, side, 400));
        }
      }
      start = cut + S / 2;
    }
  }
}
// Floor seams are visible only inside these openings.
for (const [a,b] of [[[8,14],[10,14]],[[5,17],[7,17]],[[13,17],[15,17]],[[28,14],[30,14]],[[28,18],[30,18]],[[17,10],[17,12]]]) {
  scene.paths.push(pathRecord(T('Buildings:line:paths'), [a,b].map(p => p.map(n => n * S)), 13, 100, 'threshold'));
}

const casters = [], roles = [];
/** Place one original pack asset, preserving its normal scale. */
function prop(spec, x, y, rot = .012, scale = 1, layer = 200, role = '', shade = false) {
  const tex = T(spec);
  const { object } = buildObject(tex, x * S, y * S, { scale, rot, layer });
  scene.objects.push(object);
  roles.push({ role, object });
  if (shade) {
    casters.push({ x:x*S, y:y*S, size:Math.max(tex.w,tex.h)*scale, strength:'025' });
  }
  return object;
}
const chair = (x,y,r,role='chair') => prop('Interior:chair_4a:objects',x,y,r,.95,200,role);
/** One dining place, facing inward, on a tabletop. */
function setting(x,y,r) {
  prop('Crosshead:plate_01:objects',x,y,r+.015,1,300,'place-setting');
  const dx = Math.cos(r)*.24, dy = Math.sin(r)*.24;
  prop('Interior:goblet_1a:objects',x+dx,y+dy,r-.03,.8,300,'goblet');
}
// Sixteen-seat head table, built from two joined straight modular tables.
prop('Modular:table_5_2a:objects',6.853,3.8,.002,.85,200,'head-table');
prop('Modular:table_5_2a:objects',11.147,3.8,.002,.85,200,'head-table');
for (let i=0;i<7;i++) {
  const x=5.55+i*1.15;
  chair(x,2.77,.006*(i%3-1),'head-seat');
  chair(x,4.83,Math.PI+.007*(i%3-1),'head-seat');
  setting(x,3.49,0); setting(x,4.11,Math.PI);
}
chair(4.14,3.8,-Math.PI/2+.005,'head-seat');
chair(13.86,3.8,Math.PI/2-.005,'head-seat');
setting(4.99,3.8,-Math.PI/2); setting(13.01,3.8,Math.PI/2);
for (const x of [6.7,9,11.3]) {
  prop('Interior:flowers_1a:objects',x,3.8,.18,.8,300);
}
// Four six-seat tables, with wide service and conversation lanes.
for (const [cx,cy] of [[5,8.15],[12.5,8.15],[5,11.65],[12.5,11.65]]) {
  prop('Interior:table_round_f_1a:objects',cx,cy,.025,1.1,200,'guest-table');
  for (let i=0;i<6;i++) {
    const a=-Math.PI/2+i*Math.PI/3;
    chair(cx+Math.cos(a)*1.5,cy+Math.sin(a)*1.5,a+Math.PI/2+.008,'guest-seat');
    setting(cx+Math.cos(a)*.64,cy+Math.sin(a)*.64,a+Math.PI/2);
  }
  prop('Interior:candle_centre_1a:objects',cx,cy,.05,.85,300);
}
// Hall sideboards face the hall and remain flush against the walls.
for (const [x,y,r] of [[1.46,5.8,-Math.PI/2],[16.54,6.1,Math.PI/2]]) {
  prop('Buildings:Cabinet:objects',x,y,r,1,200,'sideboard',true);
  prop('Interior:flowers_1a:objects',x,y,.2,.8,300);
}

/** A sofa, two armchairs and a drinks table; orientation follows the seat fronts. */
function salon(cx,cy,blue=false) {
  prop(blue?'Scenes:couch_1b:objects':'Scenes:couch_1a:objects',cx,cy-1.9,.004,.95,200,'sofa',true);
  prop('Scenes:side_table_r_1a:objects',cx,cy,.06,1,200,'drinks-table');
  prop(blue?'Scenes:couch_single_1b:objects':'Scenes:couch_single_1a:objects',cx-2.1,cy+.4,-Math.PI/2+.02,1,200,'armchair',true);
  prop(blue?'Scenes:couch_single_1b:objects':'Scenes:couch_single_1a:objects',cx+2.1,cy+.4,Math.PI/2-.02,1,200,'armchair',true);
  prop('Interior:goblet_1a:objects',cx+.2,cy,.15,.8,300);
}
salon(6.2,20.6);
prop('Scenes:carpet_1b:objects',6.2,20.15,Math.PI/2+.01,1.15,-100,'rug');
prop('Buildings:Cabinet:objects',1.48,21.8,-Math.PI/2,1,200,'sideboard',true);
prop('Interior:goblet_1a:objects',1.55,21.6,.1,.8,300);
prop('Scenes:side_table_r_1a:objects',9.45,18.8,.04,1,200,'drinks-table');
prop('Interior:flowers_1a:objects',9.45,18.8,.08,.8,300);
// Two additional four-chair conversation tables in the west salon.
for (const [cx,cy] of [[3.3,23.2],[7.35,23.45]]) {
  prop('Scenes:side_table_r_1a:objects',cx,cy,.035,1.1,200,'salon-added-table');
  for (let i=0;i<4;i++) {
    const a=i*Math.PI/2;
    chair(cx+Math.cos(a)*1.02,cy+Math.sin(a)*1.02,a+Math.PI/2+.01,'salon-added-chair');
  }
  prop('Interior:goblet_1a:objects',cx-.18,cy-.1,.08,.8,300);
  prop('Interior:goblet_1a:objects',cx+.19,cy+.12,Math.PI+.03,.8,300);
}

// Private conference table, preserving a clear door approach from the foyer.
prop('Interior:table_7a:objects',14.1,21.25,.015,1.1,200,'conference-table');
for (const x of [13.05,14.1,15.15]) {
  chair(x,19.75,.015); chair(x,22.75,Math.PI-.015);
}
prop('Interior:book_open_1a:objects',14.1,21.3,Math.PI,.85,300);
prop('Buildings:Paper_Scatter_01:objects',15,21.25,.1,.8,300);
prop('Buildings:Cabinet:objects',14,24.5,Math.PI,1,200,'cabinet',true);

// Skywalk: wall-mounted art, sculptures and benches along the edges only.
for (const [i,x] of [18.25,20.4,22.6].entries()) {
  prop(`Scenes:painting_${i===1?'4':'1'}a:objects`,x,8.19,.005,1,700,'gallery-painting');
  prop(`Scenes:statue_${i+1}a:objects`,x,12.1,.04*(i+1),.85,200,'gallery-sculpture',true);
}
// A small runner is native-sized; broad gallery centre stays open.
prop('Scenes:carpet_1b:objects',20.5,10.6,.004,1.05,-100,'gallery-runner');

// Four musicians' places. Upright instrument sprites avoid giant laid-flat instruments.
prop('Scenes:carpet_1b:objects',28.6,3.4,.004,1.2,-100,'quartet-rug');
for (const [i,x,y] of [[0,26.5,2.75],[1,28.3,2.55],[2,30.1,2.75],[3,31.5,3.55]]) {
  chair(x,y,.01,'quartet-seat');
  prop(`Tomb & Anvil:string_instrument_u_${i===3?4:1}a:objects`,x+.45,y+.6,.05,.85,300,'quartet-instrument');
}
// The public reception has several separate groups and an open cross-room lane.
for (const [cx,cy] of [[26.9,7.1],[30.55,7.2]]) {
  prop('Scenes:side_table_r_1a:objects',cx,cy,.04,1.1,200,'reception-table');
  for (const a of [-Math.PI/2,Math.PI/6,5*Math.PI/6]) {
    chair(cx+Math.cos(a)*1.13,cy+Math.sin(a)*1.13,a+Math.PI/2+.014,'reception-chair');
  }
  prop('Interior:goblet_1a:objects',cx-.16,cy,.06,.8,300);
  prop('Interior:candle_centre_1a:objects',cx+.18,cy+.1,.03,.8,300);
}
prop('Scenes:couch_1b:objects',28.5,12.7,Math.PI+.004,1,200,'reception-sofa',true);
for (const x of [26.3,30.7]) {
  prop('Scenes:side_table_r_1a:objects',x,12.35,.06,.8,200,'reception-side-table');
  prop('Interior:goblet_1a:objects',x,12.35,.04,.8,300);
}
prop('Buildings:Cabinet:objects',24.46,5.6,-Math.PI/2,1,200,'reception-refreshments',true);
prop('Interior:food_plate_1a:objects',24.47,5.28,.04,.8,300);
prop('Interior:goblet_1a:objects',24.47,6.05,.04,.8,300);
// One further small conversation group, with routes around it to the gallery and foyer.
prop('Scenes:side_table_r_1a:objects',28.8,10.05,.04,1.1,200,'reception-extra-table');
for (const a of [0,2*Math.PI/3,4*Math.PI/3]) {
  chair(28.8+Math.cos(a)*1.16,10.05+Math.sin(a)*1.16,a+Math.PI/2+.012,'reception-extra-chair');
}
prop('Interior:goblet_1a:objects',28.62,10,.03,.8,300);
prop('Interior:goblet_1a:objects',28.98,10.1,Math.PI+.03,.8,300);

// The private room is a compact facing-sofa arrangement on dark timber and blue rug.
prop('Scenes:carpet_1d:objects',28.5,21.6,.006,1.2,-100,'private-rug');
prop('Scenes:couch_1b:objects',26.25,21.55,-Math.PI/2+.004,1,200,'private-sofa',true);
prop('Scenes:couch_1b:objects',30.8,21.55,Math.PI/2-.004,1,200,'private-sofa',true);
prop('Interior:table_9a:objects',28.5,21.55,.012,.85,200,'private-coffee-table');
for (const x of [27.6,29.4]) {
  chair(x,23.3,Math.PI+.01,'private-chair');
}
prop('Interior:book_open_1a:objects',28.25,21.58,Math.PI,.8,300,'private-detail');
prop('Interior:goblet_1a:objects',29.05,21.4,.03,.8,300,'private-detail');
prop('Buildings:Cabinet:objects',31.5,18.48,.006,1,200,'private-sideboard',true);
prop('Interior:flowers_1a:objects',31.85,18.5,.08,.8,300,'private-detail');
prop('Interior:goblet_1a:objects',30.95,18.5,.04,.8,300,'private-detail');
for (const y of [20,23.3]) {
  prop('Buildings:Shelf_Wall_Small:objects',24.25,y,-Math.PI/2,1,700,'private-bookshelf');
  prop('Crosshead:books_top_01:objects',24.29,y,-Math.PI/2+.01,.9,700,'private-detail');
}

// Small room-specific details: service dishes, flowers, reading and writing supplies.
for (const [x,y,r] of [[1.5,5.2,-Math.PI/2],[16.5,6.7,Math.PI/2],[1.52,22.3,-Math.PI/2]]) {
  prop('Interior:food_plate_1a:objects',x,y,r,.8,300,'service-detail');
  prop('Interior:bread_1a:objects',x,y-.48,r+.05,.85,300,'service-detail');
}
prop('Scenes:wall_clock_1a:objects',10.65,14.2,.005,1,700,'arrival-clock');
prop('Buildings:Quill_Ink_01:objects',13.2,21.35,.04,.9,300,'conference-detail');
prop('Crosshead:books_top_01:objects',14.8,24.5,.02,.9,300,'conference-detail');
prop('Interior:flowers_1a:objects',14,24.5,.06,.8,300,'conference-detail');
prop('Scenes:painting_4a:objects',10.79,21.2,Math.PI/2,1,700,'salon-picture');
prop('Scenes:painting_4a:objects',32.79,22.2,Math.PI/2,1,700,'private-picture');

// Lift enclosures and stairs use wall/floor parts, not a prebuilt building.
for (const [x,y,h] of [[1,14,3],[24,14,4]]) {
  scene.patterns.push(patternRecord(T('Interior:wood_1a:patterns'),rectPolygon(x*S,y*S,(x+2)*S,(y+h)*S),-100));
  // Rail-like furniture supplies lift machinery detail within the existing foyer.
  prop('Buildings:Cabinet:objects',x+1,y+.38,.005,.8,200,'lift-control');
}
for (const [x,y] of [[15.1,15.45],[31.4,16]]) {
  prop('Scenes:round_stairs_1a:objects',x,y,Math.PI+.006,1.1,200,'stairs');
}
// A staffed announcing console and a waiting couch dress the west arrival chamber.
prop('Buildings:Cabinet:objects',4.8,14.45,.006,1,200,'arrival-console',true);
prop('Interior:flowers_1a:objects',4.25,14.46,.06,.8,300,'arrival-detail');
prop('Interior:book_open_1a:objects',5.25,14.45,Math.PI,.8,300,'arrival-detail');
prop('Buildings:Quill_Ink_01:objects',5.6,14.47,.05,.8,300,'arrival-detail');
prop('Scenes:couch_1a:objects',10.9,16.28,Math.PI+.004,.9,200,'arrival-waiting-couch',true);
prop('Scenes:painting_4a:objects',6.65,14.17,.004,1,700,'arrival-detail');
// The Danoran foyer has its own reception console, blue waiting chair and flower table.
prop('Buildings:Cabinet:objects',31.5,14.45,.006,1,200,'delegation-console',true);
prop('Interior:flowers_1a:objects',31.05,14.46,.06,.8,300,'delegation-detail');
prop('Buildings:Paper_Scatter_01:objects',31.95,14.46,.04,.8,300,'delegation-detail');
prop('Scenes:couch_single_1b:objects',26.78,14.98,-Math.PI/2+.01,.9,200,'delegation-waiting-chair',true);
prop('Scenes:side_table_r_1a:objects',27.05,17.38,.04,.8,200,'delegation-flower-table');
prop('Interior:flowers_1a:objects',27.05,17.38,.06,.8,300,'delegation-detail');
prop('Scenes:painting_4a:objects',27.05,14.17,.004,1,700,'delegation-detail');
// Windows read as closed glazing. They do not create walkable exterior doors.
for (const [x,y,r] of [[3.3,1,0],[8,1,0],[14,1,0],[1,9,-Math.PI/2],[1,19.5,-Math.PI/2],[1,23,-Math.PI/2],[7,25,Math.PI],[14,25,Math.PI],[27,1,0],[31,1,0],[33,6,Math.PI/2],[33,11,Math.PI/2],[33,21,Math.PI/2],[28.5,25,Math.PI]]) {
  prop('Scenes:window_1a:objects',x,y,r,1,700,'window');
}
// Gas lamps are mounted with their back toward the appropriate wall.
for (const [x,y,r] of [[5.3,1.24,0],[11.5,1.24,0],[1.24,3.8,-Math.PI/2],[16.76,3.8,Math.PI/2],[1.24,12,-Math.PI/2],[16.76,12.8,Math.PI/2],[3,14.24,0],[11.5,14.24,0],[1.24,18,-Math.PI/2],[10.76,23.5,Math.PI/2],[16.76,20,Math.PI/2],[18,8.24,0],[23,8.24,0],[18,12.76,Math.PI],[23,12.76,Math.PI],[25,1.24,0],[32,1.24,0],[32.76,8,Math.PI/2],[24.24,7,-Math.PI/2],[25,14.24,0],[32,18.24,0],[24.24,22,-Math.PI/2]]) {
  prop('Buildings:Lantern_Wall_01:objects',x,y,r,.85,700,'gas-lamp');
}
for (const [x,y] of [[2.1,2.2],[15.9,2.2],[2.1,13],[15.9,13],[2.2,18.1],[9.9,24],[12.1,24],[16,18.2],[25.1,2.1],[31.9,2.1],[25.1,12.7],[31.9,12.7],[25.1,19.1],[31.9,24]]) {
  prop('Interior:plant_1a:objects',x,y,.16,.8,200,'plant',true);
}
// A formal hotel has sparse service details, no rubble or discarded food.
const clutter = [];
for (const [x,y] of [[2,16.4],[16.1,16.5],[12,24.3],[16.2,24.4],[25.5,17.4],[32.1,17.4],[31.9,23.7]]) {
  clutter.push(prop('Buildings:Paper_Scatter_01:objects',x,y,.17+x*.03,.8,100,'clutter'));
}
applyClutterCuts(scene.objects,clutter,seed,CLUTTER_CUTS);
scene.objects.push(...circleShadows(casters,{seed,sizePerScale:520,T}).map(c=>c.object));

const splat = Array(layout.columns*layout.rows*64).fill(0);
for (let i=0;i<splat.length;i+=4) {
  splat[i]=255;
}
const {map} = serialiseMap(scene,{seed,splat,cameraZoom:6});
const file = path.join(out,'hotel-aurum-peace-summit-v3.dungeondraft_map');
fs.writeFileSync(file,JSON.stringify(map,null,'\t')+'\n');

// Verify the native file, plus the scene's defining social-play features.
const {ok,failed,summary} = checks.createChecker();
checks.checkStructure(ok,map,checks.loadMap(REFERENCE_MAP));
const {caveLen} = checks.checkArraySizes(ok,map);
checks.checkAssets(ok,map); checks.checkColorable(ok,map);
checks.checkMappingRules(ok,map,{S,caveLen});
checks.checkNodes(ok,map,{S,margin:0}); checks.checkWallOrder(ok,map);
checks.checkShadowTextures(ok,map,{pathLayer:400,onlyShadowPaths:false});
const count = role => roles.filter(r=>r.role===role).length;
ok(count('head-seat')===16,'sixteen head-table seats');
ok(count('guest-table')===4 && count('guest-seat')===24,'four guest tables with six seats each');
ok(count('quartet-seat')===4 && count('quartet-instrument')===4,'four quartet places');
ok(count('salon-added-table')===2 && count('salon-added-chair')===8,'west salon gains two four-chair tables');
ok(count('private-sofa')===2,'private room has two facing couches');
ok(count('reception-table')===2 && count('reception-chair')===6 && count('reception-sofa')===1,'public reception has three conversation groups');
ok(count('reception-extra-table')===1 && count('reception-extra-chair')===3,'one extra public conversation table with three chairs');
ok(roles.filter(r=>r.role==='stairs').length===2 && roles.filter(r=>r.role==='stairs').every(r=>r.object.name==='round_stairs_1a'),'both staircases use spiral staircase assets');
ok(count('arrival-detail')>=4 && count('delegation-detail')>=4,'both foyers have additional room-specific details');
ok(scene.patterns.some(p=>p.name==='Wood_Dark'),'private sitting room uses distinct timber flooring');
ok(count('gallery-painting')===3 && count('gallery-sculpture')===3,'gallery displays');
ok(scene.walls.flatMap(w=>w.openings).length===16,'fourteen room doorway units plus two lift doors');
ok(layout.rooms.length===8,'all eight floor-plan spaces preserved');
for (const w of scene.walls) {
  ok(w.points.every(([x,y])=>x%S===0&&y%S===0),'walls follow grid edges');
}
const headSeats = roles.filter(r=>r.role==='head-seat').map(r=>r.object);
ok(headSeats.every(o=>o.x>4*S&&o.x<14*S&&o.y>2*S&&o.y<6*S),'head-table seats stay inside their dining area');
// Flood the actual floor cells across the actual door gaps: all rooms must connect.
const floorCells = new Set();
for (const {bounds:[x1,y1,x2,y2]} of layout.rooms) {
  for (let y=y1;y<y2;y++) {
    for (let x=x1;x<x2;x++) {
      floorCells.add(`${x},${y}`);
    }
  }
}
const blocked = new Set();
const edgeKey = (a,b) => [a.join(','),b.join(',')].sort().join('|');
for (const w of layout.walls) {
  const run = w.loop ? [...w.points,w.points[0]] : w.points;
  for (let i=0;i<run.length-1;i++) {
    const [a,b]=[run[i],run[i+1]], dx=Math.sign(b[0]-a[0]),dy=Math.sign(b[1]-a[1]);
    const length=Math.abs(b[0]-a[0])+Math.abs(b[1]-a[1]);
    for (let t=0;t<length;t++) {
      const mx=a[0]+dx*(t+.5),my=a[1]+dy*(t+.5);
      if (w.openings.some(([x,y])=>Math.hypot(x-mx,y-my)<.01)) {
        continue;
      }
      const cells=dy===0?[[Math.floor(mx),my-1],[Math.floor(mx),my]]:[[mx-1,Math.floor(my)],[mx,Math.floor(my)]];
      blocked.add(edgeKey(...cells));
    }
  }
}
const seen=new Set(['8,15']),queue=[[8,15]];
for (let i=0;i<queue.length;i++) {
  const p=queue[i];
  for (const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
    const n=[p[0]+dx,p[1]+dy],key=n.join(',');
    if (floorCells.has(key)&&!seen.has(key)&&!blocked.has(edgeKey(p,n))) {
      seen.add(key); queue.push(n);
    }
  }
}
ok(seen.size===floorCells.size,'every floor cell, including both lifts, is reachable through the doorways');
if (seen.size!==floorCells.size) {
  console.log('Unreachable floor cells:', [...floorCells].filter(k=>!seen.has(k)).slice(0,30));
}
console.log(summary());
if (failed()) {
  process.exit(1);
}
const pps=Number(process.argv.find(a=>a.startsWith('--pps='))?.split('=')[1] ?? 96);
console.log(renderMapPreview(file,{pps,out:path.join(out,pps===96?'hotel-aurum-preview-v3.png':'hotel-aurum-peace-summit-v3.png')}));
console.log(file);
