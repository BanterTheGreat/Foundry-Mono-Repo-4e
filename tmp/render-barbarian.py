import sys,json
from pathlib import Path
sys.path.insert(0,str(Path('tmp/barbarian-deps').resolve()))
import pymupdf as fitz
pdf=fitz.open('src/modern4e/inDev.pdf')
print('TOC', [x for x in pdf.get_toc() if 'Barbarian' in x[1] or 'Ranger'==x[1]])
start=next(x[2]-1 for x in pdf.get_toc() if x[1].endswith('. Barbarian'))
toc=pdf.get_toc();end=next(x[2]-1 for x in toc if x[0]==2 and x[2]>start+1)
print('Barbarian pages',start+1,end)
Path('tmp/barbarian-pages.txt').write_text('\n'.join(f'PAGE {i+1}\n'+pdf[i].get_text() for i in range(start,end)),encoding='utf-8')
for batch in range(start,end,8):
 contact=fitz.open();p=contact.new_page(width=920,height=554*2)
 for j,i in enumerate(range(batch,min(batch+8,end))):
  r=fitz.Rect((j%4)*230,(j//4)*554,(j%4+1)*230,(j//4+1)*554)
  p.show_pdf_page(r,pdf,i)
 p.get_pixmap(matrix=fitz.Matrix(1.7,1.7)).save(f'tmp/barbarian-contact-{batch+1}.png')
for i in [start+1,start+3]:pdf[i].get_pixmap(matrix=fitz.Matrix(1.6,1.6)).save(f'tmp/barbarian-page-{i+1}.png')

