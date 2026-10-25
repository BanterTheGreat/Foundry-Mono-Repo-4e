import sys
from pathlib import Path
sys.path.insert(0,str(Path('tmp/barbarian-deps').resolve()))
import pymupdf
pdf=pymupdf.open('src/modern4e/inDev.pdf')
starts=[x[2]-1 for x in pdf.get_toc() if x[1].endswith('. Barbarian')]
start=starts[0];end=next(x[2]-1 for x in pdf.get_toc() if x[0]==2 and x[2]>start+1)
found=[]
for i in range(start,end):
 p=pdf[i]
 for block in p.get_text('dict')['blocks']:
  for line in block.get('lines',[]):
   text=''.join(span['text'] for span in line['spans']).strip()
   if text.lower() in ['level 3','level 7','level 5','level 9']:
    level=int(text.split()[1]);assert line['bbox'][1]<40,(i+1,text,line['bbox'])
    found.append((i+1,level));p.get_pixmap(matrix=pymupdf.Matrix(1,1)).save(f'tmp/barbarian-level-{level}.png')
print('New level headings at top of pages:',found)
assert sorted(x[1] for x in found)==[3,5,7,9],found
