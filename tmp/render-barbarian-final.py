from pathlib import Path
import sys,re
sys.path.insert(0,str(Path('tmp/barbarian-deps').resolve()))
import pymupdf
pdf=pymupdf.open('src/modern4e/inDev.pdf')
for i in [101,127]:pdf[i].get_pixmap(matrix=pymupdf.Matrix(1.4,1.4)).save(f'tmp/barbarian-final-{i+1}.png')
print('Final affected pages rendered.')
