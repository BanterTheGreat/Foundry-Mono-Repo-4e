import { findTexture as lookupTexture } from '../../../src/dungeondraft-tools/lib/packs.mjs';
import { seededRandom } from '../../../src/dungeondraft-tools/lib/geometry.mjs';
import { buildObject, pathRecord, applyClutterCuts, CLUTTER_CUTS, circleShadows } from '../../../src/dungeondraft-tools/lib/scene-kit.mjs';

const textures = new Map();
function T(spec) {
  if (!textures.has(spec)) { textures.set(spec, lookupTexture(spec)); }
  return textures.get(spec);
}

/** Dress existing fixtures and add distinct work areas without changing the room plan. */
export function detailScene(scene) {
  const S = 256, rng = seededRandom(847219), rr = (a,b) => a+(b-a)*rng();
  const original = [...scene.objects], floor = [], added = [], casters = [], counts = {};
  const doors = [...scene.plan.doors.values()];
  const at = (x,y) => scene.plan.cells.get(scene.plan.key(Math.floor(x),Math.floor(y)));
  const touchDoor = (x,y,hx,hy) => doors.some(d => {
    const cx=d.x+(d.axis==='h'?.5:0),cy=d.y+(d.axis==='v'?.5:0);
    return Math.abs(x-cx)<hx+(d.axis==='h'?.48:.65) && Math.abs(y-cy)<hy+(d.axis==='h'?.65:.48);
  });
  function put(spec,x,y,{rot=.013,scale=1,layer=300,role='fixture',room,ground=false,overlap=false}={}) {
    const tex=T(spec), hx=(Math.abs(Math.cos(rot))*tex.w+Math.abs(Math.sin(rot))*tex.h)*scale/(2*S);
    const hy=(Math.abs(Math.sin(rot))*tex.w+Math.abs(Math.cos(rot))*tex.h)*scale/(2*S);
    if (room && [[x-hx,y-hy],[x+hx,y-hy],[x-hx,y+hy],[x+hx,y+hy]].some(([a,b])=>at(a,b)?.id!==room.id)) { return; }
    if (touchDoor(x,y,hx,hy)) { return; }
    // Solid floor additions use their real rotated bounds; tabletop details deliberately overlap their host.
    if (!overlap && layer===300 && [...original,...added].some(o => {
      if (o.layer!==300) { return false; }
      const t=T(`${o.pack}:${o.name}:objects`), a=o.rot;
      const ox=(Math.abs(Math.cos(a))*t.w+Math.abs(Math.sin(a))*t.h)*o.scale/(2*S);
      const oy=(Math.abs(Math.sin(a))*t.w+Math.abs(Math.cos(a))*t.h)*o.scale/(2*S);
      return Math.abs(x-o.x/S)<hx+ox+.08 && Math.abs(y-o.y/S)<hy+oy+.08;
    })) { return; }
    const {object}=buildObject(tex,x*S,y*S,{rot,scale,layer});
    object.detailRole=role; added.push(object); scene.objects.push(object);
    counts[role]=(counts[role]||0)+1;
    if (ground) { floor.push(object); }
    if (layer===300 && Math.max(tex.w,tex.h)*scale>590 && !overlap) { casters.push({x:x*S,y:y*S,size:Math.max(tex.w,tex.h)*scale,strength:'050'}); }
    return object;
  }
  const book='Interior:book_1a:objects', open='Interior:book_open_1a:objects', scroll='Interior:scroll_1a:objects';
  const gear='Buildings:Gears_Metal_03:objects', tool='Tomb & Anvil:tool_1a:objects';
  const food='Interior:food_plate_1a:objects', bottle='Interior:potion_bottle_1a:objects';
  const top=(spec,x,y,role='tabletop',rot=.07,scale=.85)=>put(spec,x,y,{layer:700,role,rot,scale,overlap:true});
  // Existing fixtures acquire contents: this is the largest missing scale of detail in v2.
  for (const o of original) {
    const x=o.x/S,y=o.y/S,r=at(x,y);
    if (!r) { continue; }
    if (o.name==='Shelf_Wall_01') {
      const storage=['store','kitchen','locker'].includes(r.kind);
      const lab=['bio','golem-lab'].includes(r.kind);
      for (let j=0;j<6;j++) {
        const dx=(j-2.5)*.29;
        const spec=lab?(r.kind==='bio'?'Interior:potion_bottle_1a:objects':'Team:metal_detail_02:objects'):storage?(j%2?'Buildings:Food_Bread_Roll:objects':'Team:food_basket_01:objects'):'Buildings:Book_Upright_01:objects';
        if (storage && j%2) { continue; }
        top(spec,x+dx,y+.02,lab?'lab-shelf':storage?'stocked-shelf':'library',rr(-.06,.06),storage||lab?.8:.95);
      }
    } else if (o.name==='table_1a') {
      const dishes=[food,'Interior:food_plate_2a:objects','Interior:food_plate_3a:objects','Interior:food_plate_4a:objects','Interior:food_bowl_1a:objects'];
      for (const sign of [-1,1]) {
        if (rng()<.8) { top(dishes[Math.floor(rng()*dishes.length)],x+sign*.33+rr(-.08,.08),y+sign*.28+rr(-.08,.08),'meal',rr(-.4,.4),.8); }
      }
      if (rng()<.45) { top('Interior:bottle_1a:objects',x+rr(-.12,.12),y+rr(-.14,.14),'meal',rr(-.2,.2),.8); }
      else if (rng()<.5) { top('Interior:candle_1a:objects',x+.08,y-.02,'meal',.08,.8); }
      else { top('Interior:book_2a:objects',x+.15,y-.08,'off-duty-reading',rr(-.3,.3),.8); }
    } else if (o.name==='Desk_Writing') {
      top(open,x-.35,y+.02,'desk-papers'); top(scroll,x+.45,y,'desk-papers',.12,.8);
      top('Interior:candle_1a:objects',x+.6,y-.2,'desk-papers',.02,.8);
    } else if (o.name==='Table_Workbench') {
      if (r.kind==='bio') {
        top('Modular:vial_rack_1a:objects',x,y-.28,'specimen-bench');
        top('Buildings:Skeleton_01:objects',x-.3,y+.16,'specimen-bench',.2,.8);
        top(tool,x+.4,y+.1,'specimen-bench',-.3,.8);
      } else if (r.kind==='kitchen') {
        top('Buildings:Food_Cheese_Wheel:objects',x-.25,y,'food-prep');
        top('Team:food_basket_01:objects',x+.4,y-.15,'food-prep',-.03,.8);
      } else {
        top(tool,x-.3,y,'machine-bench',.2,.9); top('Team:metal_detail_02:objects',x+.3,y+.03,'machine-bench',.1,.85);
      }
    } else if (o.name==='bed_1a') {
      // Folded clothes and a small book on selected beds break up the dormitory repetition.
      if (rng()<.45) {
        const books=[book,'Interior:book_2a:objects','Interior:book_3a:objects'];
        top(books[Math.floor(rng()*books.length)],x+.15,y+.37,'personal-belongings',rr(-.25,.25),.8);
      }
    }
  }
  function pipe(points,spec='Mechanism:pipe_path_1:paths',role='utility-pipe',layer=700) {
    const t=T(spec); scene.paths.push(pathRecord(t,points.map(p=>p.map(v=>v*S)),t.h,layer,role));
    counts[role]=(counts[role]||0)+1;
  }
  // Structural fittings and the gas / oil distribution network follow the steel walls.
  // Leave every portal clear; these are overhead pipes and shallow riveted wall plates.
  for (const e of scene.geometry.edges) {
    if (e.door) { continue; }
    for (const [id,side] of [[e.a,-1],[e.b,1]]) {
      const r=scene.plan.rooms.find(r=>r.id===id);
      if (!r || r.floor!=='metal' || ['service','freight'].includes(r.kind)) { continue; }
      const x=e.x+(e.axis==='h'?.5:side*.22), y=e.y+(e.axis==='v'?.5:side*.22);
      if ((e.x+e.y)%4===1) { put('Team:metal_detail_07:objects',x,y,{layer:700,role:'wall-fastener',scale:.8,rot:.013}); }
      if (['checkpoint','airlock','hall','guard','utility','control','golem-lab','bio'].includes(r.kind)) {
        const points=e.axis==='h'?[[e.x,e.y+side*.34],[e.x+1,e.y+side*.34]]:[[e.x+side*.34,e.y],[e.x+side*.34,e.y+1]];
        pipe(points,'Mechanism:pipe_path_1:paths','wall-manifold');
      }
    }
  }
  // Room-specific work stations and personal storage, with useful open space retained.
  for (const r of scene.plan.rooms) {
    const {x,y,w,h,kind}=r;
    if (['bunk','lodging','leone','tinker','kasvarina'].includes(kind)) {
      for (let j=0;j<(kind==='bunk'?3:1);j++) {
        put('Interior:chest_1a:objects',x+1+j*1.4,y+h/2,{room:r,scale:.85,role:'personal-storage',rot:rr(-.06,.06)});
      }
      if (kind!=='bunk') {
        put('Scenes:Painting_1a:objects'.replace('Painting','painting'),x+w/2,y+.12,{layer:700,scale:1,role:'wall-decor',rot:.01});
        if (kind==='leone') {
          top('Buildings:Food_Cheese_Wheel:objects',x+4.15,y+3.65,'leone-hospitality');
          top('Interior:bottle_1a:objects',x+4.55,y+3.7,'leone-hospitality',.05,.8);
        }
        if (kind==='tinker') {
          for (let j=0;j<3;j++) { top('Team:metal_detail_07:objects',x+1+j*.33,y+3.65,'tinker-prototypes',rr(-.3,.3),.9); }
        }
      }
    }
    if (kind==='utility') {
      pipe([[x+.45,y+.4],[x+w-.45,y+.4],[x+w-.45,y+h-.4]]);
      pipe([[x+.45,y+h-.4],[x+.45,y+1]],'Mechanism:pipe_path_2:paths');
      for (let j=0;j<2;j++) { top('Mechanism:pipe_wheel_1a:objects',x+w-.45,y+1+j*1.4,'valve-bank',Math.PI/2,.85); }
      put('Buildings:Furnace_Metal_01:objects',x+w/2,y+h/2+.4,{room:r,scale:.8,role:'pump-drive'});
      put('Scenes:wall_clock_1a:objects',x+w/2,y+.22,{layer:700,role:'pressure-console',scale:.8});
    } else if (kind==='service') {
      if (w>h) { pipe([[x+.05,y+.22],[x+w-.05,y+.22]],'Mechanism:pipe_path_1:paths','service-main'); }
      else { pipe([[x+.22,y+.05],[x+.22,y+h-.05]],'Mechanism:pipe_path_2:paths','service-main'); }
    } else if (['guard','vip-guard','control','airlock','checkpoint'].includes(kind)) {
      put('Buildings:Weapon_Rack_01:objects',x+w-1,y+h-.7,{room:r,role:'security-equipment',scale:.85});
      top('Scenes:wall_clock_1a:objects',x+w/2,y+.18,'security-console',.01,.9);
      if (kind==='control'||kind==='airlock') {
        for (let j=0;j<3;j++) { top('Team:metal_detail_02:objects',x+w-.28,y+.7+j*.65,'control-panel',Math.PI/2,.9); }
      }
    } else if (kind==='store'||kind==='locker') {
      for (let j=0;j<3;j++) {
        put('Team:food_basket_01:objects',x+1.1+j*1.5,y+h/2,{room:r,role:'supply-stock',scale:.9,rot:rr(-.15,.15)});
      }
    } else if (kind==='kitchen') {
      top('Buildings:Rack_Pan:objects',x+w/2,y+.24,'kitchen-wallware',.01,.9);
      put('Buildings:Food_Rack_Bread:objects',x+w-1,y+h/2,{room:r,role:'kitchen-stock',scale:.85});
    } else if (kind==='golem-lab') {
      put('Dungeondraft:anvil_1a:objects',x+3,y+h-1,{room:r,role:'forge-station',scale:1});
      put('Buildings:Furnace_Metal_01:objects',x+7,y+h-1,{room:r,role:'forge-station',scale:.9});
      pipe([[x+.4,y+.4],[x+w-.4,y+.4],[x+w-.4,y+h-.4]],'Mechanism:pipe_path_2:paths','lab-service');
    } else if (kind==='bio') {
      put('Buildings:Torture_Machine_01:objects',x+4,y+h-1.1,{room:r,role:'surgical-station',scale:1});
      pipe([[x+.35,y+.35],[x+w-.35,y+.35]],'Mechanism:pipe_path_3:paths','lab-service');
    } else if (kind==='freight'||kind==='lift') {
      for (const dx of [.3,w-.3]) { pipe([[x+dx,y+.4],[x+dx,y+h-.4]],'Mechanism:pipe_path_2:paths','lift-guide',300); }
      top('Team:metal_detail_02:objects',x+w-.3,y+h/2,'lift-control',Math.PI/2,1);
    }
    // Floor detail is themed and sparse, mostly in corners; separately calibrated.
    if (!['pit','water','service','rail'].includes(kind)) {
      const specs=kind==='utility'||kind==='golem-lab'||kind==='deck'||kind==='bridge'?[tool,'Buildings:Cloth_Rag_Stained:objects','Team:metal_detail_09:objects']:
        kind==='kitchen'||kind==='store'?['Buildings:Sack_Open_Spilled_01:objects','Buildings:Food_Bread_Roll:objects']:
        ['bunk','lodging','tinker','leone','kasvarina'].includes(kind)?['Modular:boot_1a:objects','Interior:cloth_gr_1a:objects']:[book,scroll];
      for (let j=0;j<Math.max(2,Math.floor(w*h/35));j++) {
        const px=rr(x+.5,x+w-.5),py=j%2?y+.65:y+h-.65;
        put(specs[j%specs.length],px,py,{room:r,ground:true,role:'floor-detail',scale:.8,rot:rr(-2,2)});
      }
    }
  }
  // Maintenance stations at the edges of staging, plus cargo equipment at the dock.
  for (const [x,y] of [[67,31],[100,31],[115,69],[149,69]]) {
    const bench=put('Buildings:Table_Workbench:objects',x+.1,y+.05,{role:'maintenance-station'});
    if (bench) { top(tool,x-.2,y+.05,'maintenance-tools'); top(gear,x+.3,y+.05,'maintenance-tools',.05,.8); }
    put('Dungeondraft:rope_1a:objects',x+.9,y+1.4,{role:'maintenance-stock',scale:.9,rot:.3});
  }
  for (const [x,y] of [[41.2,18.8],[41.3,27.4],[47,25]]) {
    put('Crosshead:mine_cart:objects',x,y,{role:'dock-cargo',scale:1,rot:.09});
    put('Dungeondraft:rope_1a:objects',x+1,y+.7,{role:'dock-cargo',scale:.9,rot:.3});
  }
  // Borne: riveted armour, mechanical jaw, exposed gear trains and copper conduits.
  // The texture pieces keep their native scale; no creature sprite is enlarged.
  for (const [x,y] of [[126,51.8],[131,51.8],[136,51.8],[121,61],[143,61],[77,11],[82,10],[87,10],[92,12]]) {
    put('Team:metal_detail_04:objects',x,y,{role:'borne-armour',scale:1.15,overlap:true,rot:rr(-.07,.07)});
  }
  for (const [x,y] of [[128,56.7],[135.5,56.7],[80,15],[87,15]]) {
    put('Team:metal_detail_08:objects',x,y,{role:'borne-armour',scale:1.15,overlap:true,rot:.03});
  }
  put('Team:metal_detail_10:objects',132,60.5,{role:'borne-jaw',scale:1.2,overlap:true,rot:.01});
  for (const [x,y] of [[120,60],[144,60],[124,57],[140,57],[76,17],[92,17]]) {
    for (let j=0;j<3;j++) {
      put(gear,x+(j-1)*.9,y+.1*Math.sin(j),{role:'borne-gearing',scale:1,overlap:true,rot:j*.23});
    }
  }
  for (const [a,b] of [[[124,51],[124,58]],[[140,51],[140,58]],[[77,11],[77,18]],[[91,11],[91,18]]]) {
    pipe([a,b],'Mechanism:pipe_path_1:paths','borne-conduit',700);
  }
  const kept=applyClutterCuts(scene.objects,floor,98131,CLUTTER_CUTS);
  for (const s of circleShadows(casters,{seed:98131,sizePerScale:520,T})) { scene.objects.push(s.object); }
  scene.stats.details={...counts,placedFloor:floor.length,keptFloor:kept,totalAdded:scene.objects.length-original.length};
  return scene;
}
