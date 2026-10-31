import sys,json
sys.path.insert(0,'.tmp-region-tools')
from shapely.geometry import Polygon,box,mapping
from shapely import make_valid
from shapely.ops import unary_union
d=json.load(open('.tmp-region-input.json'))
entries=d['entries']
bounds=box(0,0,d['scene']['width'],d['scene']['height'])
polys={e['id']:make_valid(Polygon(list(zip(e['shapes'][0]['points'][::2],e['shapes'][0]['points'][1::2])))).intersection(bounds) for e in entries}
overlaps=[]
for i,a in enumerate(entries):
 for b in entries[i+1:]:
  area=polys[a['id']].intersection(polys[b['id']]).area
  if area>0.01: overlaps.append([a['name'],a['elevation'],b['name'],b['elevation'],round(area/256**2,3)])
print(json.dumps(overlaps))
claimed=Polygon()
updates=[]
result={}
for e in sorted(entries,key=lambda e:-e['elevation']):
 p=polys[e['id']].difference(claimed)
 claimed=unary_union([claimed,polys[e['id']]])
 parts=[p] if p.geom_type=='Polygon' else [g for g in p.geoms if g.geom_type=='Polygon']
 shapes=[]
 for part in parts:
  if part.area<=0.000001: continue
  shapes.append(dict(type='polygon',hole=False,points=[v for xy in list(part.exterior.coords)[:-1] for v in xy]))
  for ring in part.interiors:
   shapes.append(dict(type='polygon',hole=True,points=[v for xy in list(ring.coords)[:-1] for v in xy]))
 assert shapes
 result[e['id']]=p
 updates.append(dict(id=e['id'],shapes=shapes))
assert all(a.intersection(b).area<0.00001 for i,a in enumerate(result.values()) for b in list(result.values())[i+1:])
assert unary_union(list(result.values())).symmetric_difference(unary_union(list(polys.values()))).area<0.00001
json.dump(dict(uuid=d['scene']['uuid'],summary='Trim overlapping Region shapes along the higher elevation border and clip them to the map; preserve elevations and behaviors.',update=updates),open('.tmp-region-update.json','w'))
print('Validated: no interior overlaps, no lost coverage, all Regions retained.')
