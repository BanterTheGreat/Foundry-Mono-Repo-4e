from pathlib import Path
import re,sys
sys.stdout.reconfigure(encoding='utf-8')
s=Path('tmp/barbarian-source.txt').read_text(encoding='utf-8')
parts=re.split(r'(?m)^(?=\s*[^\n]+?\s+Barbarian Attack\b)',s)
names=['Storm of Blades','Hurricane of Blades','Feast of Violence','Whirling Skirmish','Whirling Frenzy','Vault the Fallen','Blood-Spattered Frenzy','Rampaging Dragon Strike','Rage Drake\'s Frenzy','Ancient Berserkers\' Rage','Ancient Forebears\' Rage','Tiger\'s Claw Rage','Eye of the Maelstrom']
for p in parts:
 if any(p.lstrip().startswith(n+'\t') or p.lstrip().startswith(n+' ') for n in names):print(p.strip()+'\n')
print('OTHER MULTIATTACKS')
for p in parts:
 if re.search(r'two attacks|three attacks|four attacks|repeat the attack|repeat this attack|attack twice|attack three|attack four|secondary attack',p,re.I):
  if not any(p.lstrip().startswith(n) for n in names):print(p.strip()+'\n')
