from pathlib import Path
p=Path('tmp/check-barbarian-breaks.py');s=p.read_text();s=s.replace("body=[b for b in p.get_text('blocks') if b[1]>30 and b[3]<p.rect.height-25]\n   assert title in body[0][4],(title,i+1,body[0])", "matches=p.search_for(title)\n   assert matches and matches[0].y0<40,(title,i+1,matches)") ;p.write_text(s)
