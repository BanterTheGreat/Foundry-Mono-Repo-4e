/** Leave Borne for a separate token/model; retain only chamber infrastructure. */
export function finalLayout(scene) {
  const bodyRoles=new Set(['borne-armour','borne-jaw','borne-gearing','borne-conduit']);
  const bodyFixtures=new Set(['borne-warding-collar','borne-warding-core','prototype-spare-shell']);
  scene.patterns=scene.patterns.filter(p=>p.role!=='borne');
  scene.paths=scene.paths.filter(p=>!bodyRoles.has(p.role)&&p.role!=='borne-binding-link');
  scene.objects=scene.objects.filter(o=>{
    if (bodyRoles.has(o.detailRole)||bodyFixtures.has(o.golemRole)) { return false; }
    const room=scene.plan.cells.get(scene.plan.key(Math.floor(o.x/256),Math.floor(o.y/256)));
    // The original schematic's untagged gear joints also stood in the open shaft.
    return room?.kind!=='pit'||o.name==='crane_01'||o.name.startsWith('BW_Shadow_Circle');
  });
  for (const role of bodyRoles) { scene.stats.details[role]=0; }
  scene.stats.golemDepiction=false;
  return scene;
}
