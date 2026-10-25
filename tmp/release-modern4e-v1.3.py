from pathlib import Path
import sys
sys.path.insert(0,str(Path('tmp/barbarian-deps').resolve()))
import typst,pymupdf
root=Path('src/modern4e')
for name in ['inDev.pdf','Modern4e-v1.3.pdf']:
 result=typst.compile_with_warnings(str(root/'main.typ'),output=str(root/name),root=str(root))
 print(name,'warnings:',result[1])
pdf=pymupdf.open(root/'Modern4e-v1.3.pdf')
for i,p in enumerate(pdf):
 if 'v1.3 - Barbarian Powers' in p.get_text():
  p.get_pixmap(matrix=pymupdf.Matrix(1.2,1.2)).save('tmp/modern4e-v1.3-history.png')
  print('Release history page:',i+1)
  break
else:raise AssertionError('Release history entry missing')
assert 'v1.3' in pdf[101].get_text()
print('Release footer verified.')
