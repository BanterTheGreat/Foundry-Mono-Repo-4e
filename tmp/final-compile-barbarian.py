from pathlib import Path
p=Path('tmp/compile-barbarian.py');s=p.read_text().replace("typst.compile('src/modern4e/main.typ',output='src/modern4e/inDev.pdf',root='src/modern4e')", "result=typst.compile_with_warnings('src/modern4e/main.typ',output='src/modern4e/inDev.pdf',root='src/modern4e')\n print('Compiler warnings:', result[1])")
p.write_text(s)
