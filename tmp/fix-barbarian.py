from pathlib import Path
p=Path('tmp/import-barbarian.py');s=p.read_text(encoding='utf-8').replace("'#pagebreak(weak: true)\\n== '","'== '");p.write_text(s,encoding='utf-8')
