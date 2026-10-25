from pathlib import Path
import re,subprocess,collections
root=Path('src/modern4e/classes');s=Path('tmp/barbarian-source.txt').read_text(encoding='utf-8')
a=s.index('Primal At-will Attack Powers');h=s.index('Barbarian 2.0',a)
headers=re.compile(r'^\s*(.+?)\s+Barbarian Attack\s+(\d+)\b',re.M)
expected=[(m[1].strip(),int(m[2])) for m in headers.finditer(s[a:]) if int(m[2])<=11]
actual=[]
for n in ['barbarian-primal-powers.typ','barbarian-elemental-powers.typ']:
 t=(root/n).read_text(encoding='utf-8');actual+= [(x,int(y)) for x,y in re.findall(r'title: "([^"]+)",\s+bonusTitle: "Level (\d+)"',t)]
assert collections.Counter(expected)==collections.Counter(actual),(collections.Counter(expected)-collections.Counter(actual),collections.Counter(actual)-collections.Counter(expected))
print('Verified all',len(actual),'source attack powers through level 11; no extra attack powers.')
old=subprocess.check_output(['git','show','HEAD:src/modern4e/classes/barbarian.typ']).decode('utf-8');new=(root/'barbarian.typ').read_text(encoding='utf-8')
feats=lambda t:re.findall(r'#theme.featBlock\(\s+title: "([^"]+)"',t)
assert feats(old)==feats(new)
print('Verified all',len(feats(new)),'existing feat entries retained in order; no feats added.')
for p in root.glob('barbarian-*.typ'):
 t=p.read_text(encoding='utf-8'); assert not re.search(r'Level (?:1[2-9]|[2-9]\d)|(?:1[2-9]|[2-9]\d)(?:st|nd|rd|th) level',t),p
 print(p.name, t.count('#powers.power('),'cards')
