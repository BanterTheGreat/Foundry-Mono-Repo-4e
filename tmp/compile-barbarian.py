import sys
from pathlib import Path
sys.path.insert(0,str(Path('tmp/barbarian-deps').resolve()))
import typst
try:
 result=typst.compile_with_warnings('src/modern4e/main.typ',output='src/modern4e/inDev.pdf',root='src/modern4e')
 print('Compiler warnings:', result[1])
 print('Compiled inDev.pdf')
except Exception as e:
 print(e)
 raise
