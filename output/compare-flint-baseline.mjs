import fs from 'node:fs';
import path from 'node:path';
import {findTexture as T} from '../src/dungeondraft-tools/lib/packs.mjs';
import {parseEdgeGrid} from '../src/dungeondraft-tools/lib/edge-grid.mjs';
import {rectPolygon} from '../src/dungeondraft-tools/lib/geometry.mjs';
import {buildObject,patternRecord,wallRecord,orderWalls,shadowPathRecord,circleShadows,applyClutterCuts,CLUTTER_CUTS,pathRecord} from '../src/dungeondraft-tools/lib/scene-kit.mjs';
import {serialiseMap} from '../src/dungeondraft-tools/lib/map-writer.mjs';
import {renderMapPreview} from '../src/dungeondraft-tools/lib/map-preview.mjs';
import {REFERENCE_MAP} from '../src/dungeondraft-tools/config.mjs';
import * as checks from '../src/dungeondraft-tools/lib/map-checks.mjs';

const out=path.resolve('output/flint-safehouse');
fs.mkdirSync(out,{recursive:true});
// Preserve the first map's edge data; convert SVG child titles for the shared grid reader.
const html=fs.readFileSync('output/flint-safehouse.html','utf8').replace(/(<rect\b[^>]*)(><title>(Column \d+, row \d+: [^<]+)<\/title>)/g,'$1 title="$3">');
const grid=parseEdgeGrid(html);
const S=256, offset=256, cols=grid.cols+2, rows=grid.rows+2;
const shift=([x,y])=>[x+offset,y+offset];
const scene={world:{cols,rows,size:S},terrain:{textures:[T('Seasons:ch_dirtdark_base:terrain'),null,null,null]},patterns:[],walls:[],paths:[],objects:[]};
const floor=(spec,x1,y1,x2,y2,layer)=>scene.patterns.push(patternRecord(T(spec),rectPolygon(x1,y1,x2,y2),layer));
floor('Interior:cobbles_1c:patterns',0,0,cols*S,rows*S,-400);
floor('Interior:wood_4a:patterns',S,S,8*S,11*S,-100);
floor('Seasons:Stone_Tiled_Dark:patterns',8*S,S,13*S,6*S,-100);
floor('Interior:wood_1a:patterns',8*S,6*S,13*S,11*S,-100);
const wallSpecs=grid.lines.map(l=>({points:l.points.map(shift),openings:l.openings.map(o=>shift([o.x,o.y])),loop:false,outer:l.points.every(([x,y])=>x===0)||l.points.every(([x,y])=>x===12*S)||l.points.every(([x,y])=>y===0)||l.points.every(([x,y])=>y===10*S)}));
const ranks=new Map();
scene.walls=orderWalls(wallSpecs.map(w=>{const r=wallRecord(T(w.outer?'Scenes:wall1a:walls':'Interior:wood2a:walls'),w,T('Interior:empty:portals'));ranks.set(r,w.outer?1:0);return r;}),w=>ranks.get(w));
// Split shade at every doorway, keeping each room face independently shaded.
for(const w of wallSpecs){
  const [a,b]=w.points, horizontal=a[1]===b[1], start=horizontal?a[0]:a[1],end=horizontal?b[0]:b[1];
  const cuts=w.openings.map(p=>horizontal?p[0]:p[1]).sort((a,b)=>a-b);
  let cur=start;
  for(const stop of [...cuts,end+128]){
    const hi=stop-128;
    if(hi>cur){
      const p=horizontal?[[cur,a[1]],[hi,a[1]]]:[[a[0],cur],[a[0],hi]];
      for(const points of [p,[...p].reverse()]){scene.paths.push(shadowPathRecord(T,{edge:'half',size:'small',strength:'025'},points,400));}
    }
    cur=stop+128;
  }
}
// Threshold lines conceal joins between the different room floors.
for(const [x1,y1,x2,y2] of [[8*S,4*S,8*S,5*S],[10*S,6*S,11*S,6*S],[8*S,8*S,8*S,9*S]]){
  scene.paths.push(pathRecord(T('Buildings:line:paths'),[[x1,y1],[x2,y2]],13,100,'threshold'));
}
const casters=[];
/** Place a pack prop at original-room coordinates in squares. */
function prop(spec,x,y,rot=.02,scale=1,layer=200,shade=false){
  const tex=T(spec),[px,py]=shift([x*S,y*S]);
  const {object}=buildObject(tex,px,py,{scale,rot,layer});scene.objects.push(object);
  if(shade){casters.push({x:px,y:py,size:Math.max(tex.w,tex.h)*scale,strength:'025'});}
  return object;
}
// Delft's office: a quiet, orderly place to address four constables.
prop('Interior:rug_1a:objects',3.5,5.25,.025,1.2,-100);
prop('Dungeondraft:desk_3a:objects',3.6,2.65,.012,1.2,200,true);
prop('Interior:chair_4a:objects',3.6,1.65,Math.PI+.02,1);
for(const [x,y,r] of [[2.45,4.5,-.04],[4.65,4.55,.05],[2.5,6.25,-.02],[4.7,6.3,.035]]){
  prop('Interior:chair_4a:objects',x,y,r,1);
}
prop('Foundation:cabinet3a:objects',.7,2.8,-Math.PI/2+.008,.85,200,true);
prop('Interior:book_open_1a:objects',3.7,2.65,.06,.8,300);
prop('Buildings:Quill_Ink_01:objects',2.7,2.65,-.08,.85,300);
prop('Buildings:Crate_01:objects',.65,9.2,.06,1);
// A few deliberate decorations, leaving the chairs and the route between doors clear.
prop('Scenes:wall_clock_1a:objects',3.55,.28,.008,1,700);
prop('Buildings:Shelf_Wall_Small:objects',1.65,.33,.012,1,700);
prop('Crosshead:books_top_01:objects',1.38,.36,.035,.85,700);
prop('Crosshead:books_top_02:objects',1.91,.35,-.02,.85,700);
prop('Buildings:Painting_Wall_01:objects',.23,5.8,-Math.PI/2+.005,1,700);
prop('Buildings:Painting_Wall_01:objects',6.78,5.75,Math.PI/2-.005,1,700);
prop('Interior:table_side_round_f_1a:objects',6.05,6.45,.035,1,200,true);
prop('Interior:flowers_1a:objects',6.05,6.45,-.08,.8,300);
prop('Interior:plant_1a:objects',5.95,9.15,.16,.8,200,true);
prop('Crosshead:books_top_01:objects',.72,2.1,-Math.PI/2+.025,.85,300);
prop('Buildings:Paper_Scatter_01:objects',4.42,2.65,-.1,.8,300);
// A freestanding sideboard gives the office a little more occupied space.
prop('Interior:dresser_2a:objects',4.15,8.65,-.018,1,200,true);
// Kitchen, supplies and a small shared meal table.
prop('Interior:stove_1a:objects',10.8,.95,.02,.85,200,true);
prop('Interior:kettle_1a:objects',10.7,.92,.1,.8,300);
prop('Interior:table_1a:objects',8.25,.95,-.02,1);
prop('Interior:vegetables_box_1a:objects',8.25,.95,.09,.8,300);
prop('Interior:table_round_1a:objects',10.65,3.45,.03,1);
prop('Interior:plate_1a:objects',10.25,3.45,-.06,.9,300);
prop('Interior:plate_1a:objects',11.05,3.45,.09,.9,300);
prop('Interior:bread_1a:objects',10.65,3.28,.18,.9,300);
prop('Interior:mug_1a:objects',10.4,3.85,.3,.85,300);
prop('Interior:mug_1a:objects',10.95,3.03,-.4,.85,300);
prop('Interior:chair_4a:objects',10.65,4.5,.09,.85);
prop('Interior:chair_4a:objects',11.65,3.45,-Math.PI/2+.04,.85);
prop('Buildings:Crate_01:objects',7.65,2.25,.04,1);
prop('Buildings:Crate_01:objects',7.7,4.3,-.05,.85);
// Two beds, a chest and folded bedding in the private back room.
prop('Interior:bed_1a:objects',8.25,7.05,.008,1,200,true);
prop('Interior:bed_2a:objects',10.95,7.1,-.012,1,200,true);
prop('Buildings:Chest_Open_Base_01:objects',9.6,9.25,.04,1);
prop('Buildings:Chest_Open_Contents_Documents:objects',9.6,9.4,.04,1,300);
prop('Team:dresser_01:objects',9.6,7.25,.015,1,200,true);
prop('Crosshead:books_top_02:objects',9.6,7.25,-.08,.8,300);
for(const [x,y,r] of [[6.8,1.1,Math.PI/2],[11.1,4.82,Math.PI],[7.22,9.4,-Math.PI/2],[.21,7.4,-Math.PI/2]]){
  prop('Buildings:Lantern_Wall_01:objects',x,y,r,.85,700);
}
// A lived-in interior, with just a few small papers instead of rubble or hazards.
const clutter=[];
for(const [x,y,r] of [[.9,4.8,.4],[1.15,4.9,1.2],[6.5,9.2,.8],[7.6,4.7,2.8],[9.7,9.5,2.2],[.8,8.8,1.4],[6.5,.55,.8]]){
  clutter.push(prop('Buildings:Paper_Scatter_01:objects',x,y,r,.8,100));
}
applyClutterCuts(scene.objects,clutter,20261104,CLUTTER_CUTS);
scene.objects.push(...circleShadows(casters,{seed:20261104,sizePerScale:520,T}).map(c=>c.object));
const splat=Array(cols*rows*64).fill(0);for(let i=0;i<splat.length;i+=4){splat[i]=255;}
const {map}=serialiseMap(scene,{seed:20261104,splat,cameraZoom:2.6});
const file=path.join(out,'flint-safehouse-comparison-original.dungeondraft_map');
fs.writeFileSync(file,JSON.stringify(map,null,'\t')+'\n');
const {ok,failed,summary}=checks.createChecker();
checks.checkStructure(ok,map,checks.loadMap(REFERENCE_MAP));
const {caveLen}=checks.checkArraySizes(ok,map);
checks.checkAssets(ok,map);checks.checkColorable(ok,map);
checks.checkMappingRules(ok,map,{S,caveLen});
checks.checkNodes(ok,map,{S,margin:0});checks.checkWallOrder(ok,map);
checks.checkShadowTextures(ok,map,{pathLayer:400,onlyShadowPaths:false});
ok(map.world.levels['0'].walls.flatMap(w=>w.portals).length===4,'four original doors retained');
ok(scene.objects.filter(o=>o.name==='chair_4a').length===7,'Delft, four visitors and two kitchen chairs');
console.log(summary());if(failed()){process.exit(1);}
renderMapPreview(file,{pps:192,out:path.join(out,'flint-safehouse-comparison-original.png')});
console.log(file);
