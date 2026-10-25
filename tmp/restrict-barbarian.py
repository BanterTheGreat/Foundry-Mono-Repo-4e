from pathlib import Path
p=Path('tmp/import-barbarian.py');s=p.read_text(encoding='utf-8')
s=s.replace("s=s.replace('Heal (Wis)'", "s=re.sub(r' and \\+4 at 21st level', '', s)\ns=s.replace(', burst 10 at 21st level', '').replace('burst 5 at 11th level, ', 'burst 5 at 11th level')\ns=s.replace('Heal (Wis)'")
s=s.replace("title,kind,level,desc=h.groups(); rows=[]", "title,kind,level,desc=h.groups()\n if level and int(level)>11:return ''\n rows=[]")
s=s.replace("line=clean(line)\n  if not line:continue", "line=clean(line)\n  if re.match(r'^Level (?:1[2-9]|[2-9][0-9]):',line):continue\n  if not line:continue")
s=s.replace("elif line.startswith('Level ') and re.fullmatch(r'Level \\d+',line):out.append('=== '+line+'\\n')", "elif line.startswith('Level ') and re.fullmatch(r'Level \\d+',line):\n    if int(line.split()[1])<=11:out.append('=== '+line+'\\n')")
p.write_text(s,encoding='utf-8')
