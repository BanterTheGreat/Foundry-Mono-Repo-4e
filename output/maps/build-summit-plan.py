from pathlib import Path
from html import escape

out = Path(__file__).parent
parts = []
def rect(x,y,w,h,cls='furniture',rx=0):
    parts.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{rx}" class="{cls}"/>')
def line(x,y,a,b,cls='wall'):
    parts.append(f'<path d="M{x} {y}H{a}" class="{cls}"/>' if y==b else f'<path d="M{x} {y}L{a} {b}" class="{cls}"/>')
def label(x,y,t,cls='label'):
    parts.append(f'<text x="{x}" y="{y}" class="{cls}" text-anchor="middle">{escape(t)}</text>')
def circle(x,y,r,cls='furniture'):
    parts.append(f'<circle cx="{x}" cy="{y}" r="{r}" class="{cls}"/>')
def door(x,y,a,b):
    line(x,y,a,b,'door')
def chair(x,y): rect(x,y,13,13,'chair',2)

label(260,28,'WEST TOWER - RISURI SIDE','heading')
label(820,28,'EAST TOWER - DANORAN SIDE','heading')
rect(30,50,460,650,'floor')
rect(690,50,270,650,'floor')
rect(490,230,200,145,'floor')
# Exterior walls, interrupted at the skywalk entrances.
for x,y,a,b in [(30,50,490,50),(30,50,30,700),(30,700,490,700),(490,50,490,260),(490,340,490,700),(690,50,960,50),(960,50,960,700),(690,700,960,700),(690,50,690,260),(690,340,690,700),(490,230,690,230),(490,375,690,375)]: line(x,y,a,b)
# West room divisions and actual open doorways.
for x,y,a,b in [(30,430,210,430),(280,430,490,430),(30,515,100,515),(150,515,350,515),(400,515,490,515),(320,515,320,700)]:line(x,y,a,b)
door(210,430,280,430);door(100,515,150,515);door(350,515,400,515)
door(490,260,490,340);door(690,260,690,340)
label(260,80,'BANQUET HALL','heading')
# Head table: 7 on each long side and 1 at each end = 16.
rect(110,125,300,47,'furniture',3)
for x in range(120,401,45): chair(x,104);chair(x,180)
chair(88,142);chair(419,142)
label(260,154,'HEAD TABLE - 16 SEATS')
label(260,217,'Clear aisle for arrivals and toasts','small')
for x in [140,365]:
    for y in [280,370]:
        circle(x,y,26)
        for dx,dy in [(0,-42),(36,-22),(36,22),(0,42),(-36,22),(-36,-22)]:chair(x+dx-6,y+dy-6)
label(255,329,'Guest tables','small')
label(245,464,'ARRIVAL / ANNOUNCING CHAMBER')
rect(45,452,45,43);label(68,478,'Lift','small')
rect(423,450,50,48)
for y in range(456,494,7):line(427,y,469,y,'detail')
label(449,507,'Stairs','small')
label(175,548,'MINGLING SALON','heading')
for x,y in [(55,580),(225,580),(55,650)]:
    rect(x,y,60,22,'furniture',3)
for x,y in [(155,592),(195,650)]:circle(x,y,13)
rect(40,555,18,60);label(175,684,'Drinks & conversation','small')
label(405,548,'PRIVATE')
label(405,568,'CONFERENCE')
rect(368,602,73,40)
for x in [375,402,429]:chair(x,582);chair(x,650)
label(405,684,'Kings debrief','small')
# Gallery in the connecting bridge.
label(590,285,'SKYWALK')
label(590,309,'ART GALLERY')
for x in [518,565,612,659]:rect(x,237,23,6)
for x in [525,590,655]:circle(x,357,6)
label(590,410,'Open air below','small')
# East: lounge, quartet, then delegation antechamber and private room.
for x,y,a,b in [(690,430,780,430),(840,430,960,430),(690,530,780,530),(840,530,960,530)]:line(x,y,a,b)
door(780,430,840,430);door(780,530,840,530)
label(825,82,'RECEPTION LOUNGE','heading')
label(825,113,'String quartet','small')
for x,y in [(770,140),(820,140),(770,180),(820,180)]:
    chair(x,y);rect(x+18,y,12,8)
line(720,215,930,215,'detail')
label(825,257,'Open mingling space','small')
for x,y in [(720,300),(877,300),(798,383)]:rect(x,y,52,20,'furniture',3)
for x,y in [(752,357),(889,357)]:circle(x,y,13)
label(825,470,'DELEGATION FOYER')
rect(705,480,40,35);label(725,503,'Lift','small')
rect(900,480,42,35)
for y in range(486,513,6):line(905,y,937,y,'detail')
label(825,568,'PRIVATE SITTING ROOM')
rect(745,610,55,22,'furniture',3);rect(850,610,55,22,'furniture',3)
circle(825,650,18)
label(500,738,'Solid line: wall    -    Dashed opening: doorway    -    Rectangles / circles: furniture','small')

svg='''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 760" role="img" aria-label="Hotel Aurum peace summit schematic floor plan"><style>
.floor{fill:var(--card,#fff)}.wall{stroke:var(--foreground,#17212b);stroke-width:4;fill:none}.door{stroke:var(--success,#347553);stroke-width:2;stroke-dasharray:5 5;fill:none}.furniture{fill:var(--secondary,#edf0f2);stroke:var(--muted-foreground,#66717c);stroke-width:1.5}.chair{fill:none;stroke:var(--muted-foreground,#66717c);stroke-width:1.2}.detail{stroke:var(--border,#adb5bd);stroke-width:1;fill:none}text{fill:var(--foreground,#17212b);font-family:Arial,sans-serif;font-size:15px}.heading{font-size:16px;font-weight:500}.small{font-size:13px}
</style>'''+''.join(parts)+'</svg>'
(out/'hotel-aurum-floor-plan.svg').write_text(svg,encoding='utf-8')
html='<!doctype html><html><head><meta charset="utf-8"><style>body{margin:0;color:var(--foreground);font-family:var(--font-sans)}svg{display:block;width:100%;height:auto}</style></head><body>'+svg+'</body></html>'
(out/'hotel-aurum-floor-plan.html').write_text(html,encoding='utf-8')
