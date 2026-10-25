from pathlib import Path
for n in ['barbarian-elemental-powers.typ','barbarian-primal-powers.typ']:
 p=Path('src/modern4e/classes')/n;s=p.read_text(encoding='utf-8')
 s=s.replace('Each of these powers, adapted from the Heroes of the Feywild Barbarian options, is made available in heroic tier with higher-level upgrades. To use the higher-level versions of the power, you must learn the power in an encounter attack slot of that level or higher','Choose these powers using encounter attack power slots of the listed level or higher.').replace('Each of these powers is likewise made available in heroic tier with higher-level upgrades. To use the higher-level versions of the power, you must learn the power in a daily attack slot of that level or higher.','Choose these powers using daily attack power slots of the listed level or higher.')
 p.write_text(s,encoding='utf-8')
for p in Path('src/modern4e/classes').glob('barbarian-*.typ'):
 lines=p.read_text(encoding='utf-8').splitlines(); start=next(i for i,x in enumerate(lines) if x.startswith('#let '));end=max(i for i,x in enumerate(lines) if x==']')
 lines=lines[:start+1]+['  '+x if x else '' for x in lines[start+1:end]]+lines[end:]
 p.write_text('\n'.join(lines)+'\n',encoding='utf-8')
