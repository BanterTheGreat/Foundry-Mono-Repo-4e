from pathlib import Path
p=Path('tmp/check-barbarian-levels.py');s=p.read_text();a=s.index(' for level in');b=s.index("print('New level",a)
s=s[:a]+''' for block in p.get_text('dict')['blocks']:
  for line in block.get('lines',[]):
   text=''.join(span['text'] for span in line['spans']).strip()
   if text.lower() in ['level 3','level 7','level 5','level 9']:
    level=int(text.split()[1]);assert line['bbox'][1]<40,(i+1,text,line['bbox'])
    found.append((i+1,level));p.get_pixmap(matrix=pymupdf.Matrix(1,1)).save(f'tmp/barbarian-level-{level}.png')
'''+s[b:];p.write_text(s)
