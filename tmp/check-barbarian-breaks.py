import sys
from pathlib import Path
sys.path.insert(0,str(Path('tmp/barbarian-deps').resolve()))
import pymupdf
pdf=pymupdf.open('src/modern4e/inDev.pdf')
for title in ['Primal At-will Attack Powers','Primal Encounter Attack Powers','Primal Daily Attack Powers']:
 for i,p in enumerate(pdf):
  if title in p.get_text():
   matches=p.search_for(title)
   assert matches and matches[0].y0<40,(title,i+1,matches)
   print(title,'starts page',i+1)
   p.get_pixmap(matrix=pymupdf.Matrix(1.1,1.1)).save(f'tmp/barbarian-break-{i+1}.png')
