import { findTexture as lookup } from '../../../src/dungeondraft-tools/lib/packs.mjs';
import { buildObject, pathRecord, circleShadows } from '../../../src/dungeondraft-tools/lib/scene-kit.mjs';

/** Give the two golem encounters authored equipment clusters and readable tactical landmarks. */
export function dressGolemRooms(scene) {
  const S=256, textures=new Map(), placed=[], casters=[];
  const T=spec=>{ if (!textures.has(spec)) { textures.set(spec,lookup(spec)); } return textures.get(spec); };
  const doors=[...scene.plan.doors.values()];
  const blocked=(x,y,hx,hy)=>doors.some(d=>Math.abs(x-d.x-(d.axis==='h'?.5:0))<hx+(d.axis==='h'?.48:.65)&&Math.abs(y-d.y-(d.axis==='v'?.5:0))<hy+(d.axis==='h'?.65:.48));
  function prop(spec,x,y,role,{rot=.017,scale=1,layer=300}={}) {
    const t=T(spec),hx=(Math.abs(Math.cos(rot))*t.w+Math.abs(Math.sin(rot))*t.h)*scale/(2*S),hy=(Math.abs(Math.sin(rot))*t.w+Math.abs(Math.cos(rot))*t.h)*scale/(2*S);
    if (blocked(x,y,hx,hy)) { throw new Error(`Golem detail obstructs doorway: ${role}`); }
    const {object}=buildObject(t,x*S,y*S,{rot,scale,layer});
    object.golemRole=role; scene.objects.push(object); placed.push(object);
    if (layer===300&&Math.max(t.w,t.h)*scale>590) { casters.push({x:x*S,y:y*S,size:Math.max(t.w,t.h)*scale,strength:'050'}); }
    return object;
  }
  function line(spec,points,role,layer=200) {
    const t=T(spec); scene.paths.push(pathRecord(t,points.map(p=>p.map(v=>v*S)),t.h,layer,role));
  }
  const plate='Team:metal_detail_07:objects',gear='Buildings:Gears_Metal_03:objects',valve='Mechanism:pipe_wheel_1a:objects';
  const copper='Mechanism:pipe_path_1:paths', chain='Buildings:Chain_Big:paths';
  // Remove generic paper/books and obsolete furniture from the authored equipment zones.
  scene.objects=scene.objects.filter(o=>{
    const x=o.x/S,y=o.y/S;
    return !((x>81&&x<87&&y>46&&y<58&&o.layer===300)||
      ((x<74||x>94)&&x>64&&x<104&&y>30&&y<36&&o.layer===300));
  });
  // AREA 5: two compact prototype cradles and one larger servicing station.
  // Docking rings are floor markings; the centre three squares remain clear of blocking props.
  const bays=[{x:82.15,y:47.6,large:false},{x:82.15,y:54.7,large:false},{x:85.65,y:51.2,large:true}];
  for (const [i,b] of bays.entries()) {
    prop('Death:floor_art_circle_1e:objects',b.x,b.y,'prototype-docking-ring',{layer:300,scale:b.large?1.15:.9,rot:.03});
    const wx=i===2?86.65:81.35;
    prop(valve,wx,b.y-1.45,'prototype-feed-valve',{scale:.8,rot:Math.PI/2+.01,layer:700});
    prop(plate,wx,b.y+1.4,'prototype-isolation-panel',{scale:1,layer:700});
    line(copper,[[wx,b.y-1.5],[wx,b.y+1.5]],'prototype-feed',700);
    const sx=i===2?86.35:81.65;
    prop('Mechanism:pipe_object_1a:objects',sx,b.y,'prototype-service-cylinder',{scale:.85,rot:Math.PI/2+.01,layer:700});
    prop('Mechanism:pipe_wheel_2a:objects',sx,b.y,'prototype-cylinder-control',{scale:.9,rot:.01,layer:700});
    // Empty restraints and spare shell pieces describe the berths without baking in creatures.
    prop('Above&Below:armor_01a:objects',b.x,b.y+.1,'prototype-spare-shell',{scale:.85,rot:.08,layer:700});
    prop('Above&Below:armor_helmet_05a:objects',b.x,b.y-.45,'prototype-spare-shell',{scale:.9,rot:.12,layer:700});
    line('Dungeondraft:chain:paths',[[wx,b.y-.7],[b.x,b.y-.45]],'prototype-restraint',700);
  }
  // A repair trolley and disassembled parts at the far end, outside the entrance landings.
  prop('Buildings:Table_Workbench:objects',85.75,57.9,'prototype-repair-bench',{scale:.9,rot:Math.PI/2+.01});
  prop('Tomb & Anvil:tool_1a:objects',85.75,57.65,'prototype-tools',{layer:700,rot:.25});
  prop(gear,85.7,58.25,'prototype-tools',{scale:.8,layer:700});
  // Alcoves become visibly different north/south interlock controls.
  for (const [x,y] of [[79.8,44.9],[88.15,44.9]]) {
    prop('Scenes:wall_clock_1a:objects',x,y,'airlock-interlock-gauges',{scale:.9,layer:700});
    prop(plate,x,y-1,'airlock-interlock-panel',{scale:1,layer:700});
  }
  // AREA 6: matched witchoil reservoir banks, with feed pipes facing Borne.
  for (const [x,ys] of [[67,[31,34]],[101,[31,34]]]) {
    for (const y of ys) { prop('Mechanism:pressure_tank_2a:objects',x,y,'borne-fuel-reservoir',{scale:.9}); }
    line(copper,[[x,29],[x,36]],'borne-fuel-main',700);
    prop(valve,x+1.1,35.7,'borne-emergency-shutoff',{scale:1,layer:700});
    prop('Scenes:wall_clock_1a:objects',x,36.5,'borne-pressure-gauges',{scale:1,layer:700});
  }
  // Paired fabrication / repair islands at the shoulders of the staging projection.
  for (const x of [75.8,92.2]) {
    prop('Buildings:Table_Workbench:objects',x,25.7,'borne-service-bench',{scale:1.1});
    prop('Above&Below:armor_01a:objects',x-.1,25.7,'borne-service-parts',{layer:700,scale:.9});
    prop('Tomb & Anvil:tool_1a:objects',x+.5,25.7,'borne-service-parts',{layer:700,rot:.4});
    prop('Above&Below:crane_pulley_01:objects',x,23.5,'borne-service-hoist',{scale:.85});
  }
  // Spare adamantine scales form stacks against the staging perimeter.
  for (const x of [71,74,94,97]) {
    prop('Buildings:Crate_Cloth_Covered_01:objects',x+.04,36.2,'crated-spare-components',{rot:.06,scale:1});
    prop(gear,x+.04,36.2,'spare-component-sample',{rot:.08,scale:.8,layer:700});
  }
  // AREA 8: four independently readable restraint winches, connected to the existing chains.
  for (const [x,y] of [[113,50],[151,50],[113,59],[151,59]]) {
    prop('Modular:crane_wheel_1a:objects',x,y,'restraint-winch',{scale:.9});
    prop(gear,x,y+.8,'restraint-winch-drive',{scale:.9,layer:700});
    prop(valve,x,y-1,'restraint-release',{scale:.8,layer:700});
  }
  // Bridge-side cable reels and paired explosive supply clusters leave the centre lane open.
  for (const x of [120,144]) {
    for (const dx of [-.55,.55]) { prop('Buildings:Barrel_Closed:objects',x+dx,66.8,'bridge-explosive-barrels',{scale:.9,rot:dx*.1}); }
    prop('Dungeondraft:rope_1a:objects',x,71.2,'bridge-cable-coil',{scale:.9,rot:.2});
  }
  // Big hinge/drive mechanisms make the retractable centre seam more than a drawn line.
  for (const y of [66.75,71.25]) {
    prop(gear,131.35,y,'bridge-hinge',{scale:1.1});
    prop(gear,132.65,y,'bridge-hinge',{scale:1.1,rot:.19});
    line('Mechanism:pipe_path_2:paths',[[130,y],[134,y]],'bridge-hydraulic-ram',700);
  }
  // Warding binders around the lower torso and upper head are mechanical rings and copper feeds.
  for (const [x,y] of [[78,18],[90,18],[126,57.5],[138,57.5]]) {
    prop('Death:floor_art_circle_1b:objects',x,y,'borne-warding-collar',{scale:1.1,layer:700,rot:.02});
    prop(gear,x,y,'borne-warding-core',{scale:.8,layer:700});
  }
  for (const [a,b] of [[[74,20],[78,18]],[[94,20],[90,18]],[[122,60],[126,57.5]],[[142,60],[138,57.5]]]) {
    line(chain,[a,b],'borne-binding-link',700);
  }
  for (const s of circleShadows(casters,{seed:44318,sizePerScale:520,T})) { scene.objects.push(s.object); }
  // Fine grating reads as a surface instead of overpowering the encounter fixtures.
  for (const p of scene.patterns) {
    if (p.role==='borne') { continue; }
    const xs=p.points.map(q=>q[0]/S),ys=p.points.map(q=>q[1]/S);
    const r=scene.plan.cells.get(scene.plan.key(Math.floor(Math.min(...xs)+.5),Math.floor(Math.min(...ys)+.5)));
    if (r&&['5','6','8'].includes(r.area)&&r.floor==='metal') { p.nativeScale=.25; }
  }
  scene.stats.golemDetails={objects:placed.length,bays:3,reservoirs:4,winches:4};
  return scene;
}
