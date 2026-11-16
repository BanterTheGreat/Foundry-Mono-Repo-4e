"""Number the rendered atlas without adding GM labels to the player map."""
import json
from pathlib import Path
import pymupdf

out = Path(__file__).parent
key = json.loads((out / 'room-key.json').read_text())
doc = pymupdf.open()
page = doc.new_page(width=2688, height=2404)
page.draw_rect(page.rect, color=None, fill=(.11, .11, .17))
page.insert_image(pymupdf.Rect(0, 100, 2688, 2404), filename=str(out / 'overview.png'))
page.insert_text((48, 48), 'CAULDRON HILL COMPLEX', fontsize=30, color=(.95, .86, .67))
page.insert_text((48, 78), 'ZEITGEIST Book 5 / Part 3 | 112 x 96 squares | 5 feet per square | GM reference', fontsize=18, color=(.9, .9, .92))

def badge(text, x, y, size=20):
    w = pymupdf.get_text_length(text, fontsize=size) + 14
    r = pymupdf.Rect(x - w / 2, y - size, x + w / 2, y + 7)
    page.draw_rect(r, color=(.93, .76, .45), fill=(.08, .09, .14), width=1)
    page.insert_text((r.x0 + 7, y), text, fontsize=size, color=(1, .93, .76))

for r in key['rooms']:
    if r['id'] in ['1', '3', '5', '10', '11', '12', '13', '14'] or r['id'].isdigit() and 15 <= int(r['id']) <= 26:
        badge(r['id'], (r['x'] + r['w'] / 2) * 24, 100 + (r['y'] + r['h'] / 2) * 24)
    elif r['area'] == '4':
        badge('4', (r['x'] + r['w'] / 2) * 24, 100 + (r['y'] + r['h'] / 2) * 24)
badge('2 / BARRACKS', 48 * 24, 100 + 72 * 24)
badge('9', 68.5 * 24, 100 + 54 * 24)
badge('9', 81 * 24, 100 + 78.5 * 24)
badge('9', 83 * 24, 100 + 36.5 * 24)
badge('VIP LEVEL  +100 FT', 81 * 24, 100 + 38.5 * 24, 19)
badge('PARITY LAKE DOCK  -300 FT', 27 * 24, 100 + 10 * 24, 19)
badge('LOWER FACILITY  0 FT', 46 * 24, 100 + 47 * 24, 19)

notes = [
    'AREAS 6-8 OMITTED',
    'Borne chamber / freight lifts / bridge',
    '',
    'Atlas sections are on different levels.',
    'VIP: +100 ft via chamber or service shaft.',
    'Lake dock: -300 ft via Area 3 cargo lift.',
    '',
    '1  Oil-fire checkpoint + secret guard rooms',
    '2  Barracks, commissary, kitchen, stores, offices',
    '3  Empty staging hall, checkpoint and cargo lift',
    '4  Five steam / hydraulic utility plants',
    '5  Prototype golem guardpost (retained)',
    '9  Narrow service tunnels / alarmed hatches',
    '10  Dignitary checkpoint',
    '11  VIP dining hall',
    '12  Kitchen, chilled locker and utility hatch',
    '13  Hybridization laboratory',
    '14  Golem laboratory',
    '15-26  Lodgings (16 Leone / 18 Tinker / 20 Kasvarina)',
    '',
    'Barracks details and dock footprint are adapted.',
    'Exact doorway / secret-hatch data: room-key.json',
    'Native doors use invisible portals for manual art.',
]
for i, line in enumerate(notes):
    page.insert_text((75, 950 + i * 25), line, fontsize=16 if i else 24, color=(.9, .87, .79))
page.get_pixmap().save(str(out / 'gm-reference.png'))
print(out / 'gm-reference.png')
