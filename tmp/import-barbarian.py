from pathlib import Path
import re,json
s=Path('tmp/barbarian-source.txt').read_text(encoding='utf-8')
# Source labels use both Plains and Steppe for the same Heartland.
s=s.replace('Endless Plains','Endless Steppe').replace('weapon with with','weapon with').replace("you' ll", "you'll")
s=re.sub(r'\b(Strength|Constitution|Dexterity|Intelligence|Wisdom|Charisma) [Mm]odifier\b',r'\1',s)
s=re.sub(r' and \+4 at 21st level', '', s)
s=s.replace(', burst 10 at 21st level', '').replace('burst 5 at 11th level, ', 'burst 5 at 11th level')
s=re.sub(r',? and [^.;\n]+ at 21st level', '', s)
s=s.replace('Heal (Wis)', 'Medicine (Int)').replace('Dungeoneering','Nature').replace('Streetwise','Society')
def clean(x):
 x=re.sub(r'\s+',' ',x).strip()
 x=x.replace(' burst 10 at 21st level', '').replace(', increasing to 2[W] extra damage at 21st level', '').replace(', 4 at 21st level', '')
 return x
def q(x):return json.dumps(clean(x),ensure_ascii=False)
def markup(x):
 x=clean(x)
 for c in ['\\','#','@','<','>','*','_','$']:x=x.replace(c,'\\'+c)
 return x
header=re.compile(r'^\s*(.+?)\s+Barbarian (Attack|Utility|Feature)\s*(\d+)?\s*(.*)$')
section=re.compile(r'^(?:Level \d+|Primal (?:At-will|Encounter|Daily) Attack Powers|Elemental (?:At-will|Encounter) Attack Powers|Barbarian Elemental Daily Attack Powers|Might of the [^:]+|Hero\x27s Heart|Pulse of Heroism|Heartland Might|Barbarian 2.0.*)$')
actions={'Standard Action':'standard','Minor Action':'minor','Move Action':'move','Free Action':'free','No Action':'noAction','Immediate Interrupt':'immediateInterrupt','Immediate Reaction':'immediateReaction','Opportunity Action':'opportunity'}
stats=[]
def card(h,ls):
 title,kind,level,desc=h.groups()
 if (level and int(level)>11) or title.strip() == 'Thunderstorm Rage Attack':return ''
 rows=[];fields={}; desc=[desc] if desc else [];typekey=None;traits=[];action=None;ran=None
 # Join wrapped metadata/prose while retaining labels and rule order.
 merged=[]
 for line in ls:
  line=clean(line)
  if re.match(r'^Level (?:1[2-9]|[2-9][0-9]):',line):continue
  if not line:continue
  if re.match(r'^(?:At-[Ww]ill|Encounter|Daily)\b',line):
   if typekey is not None: continue # duplicated Mountain's Wrath metadata in source
   m=re.match(r'^(At-[Ww]ill|Encounter|Daily)(.*?)✦\s*(.*)',line)
   assert m,(title,line)
   typekey={'at-will':'at-will','encounter':'encounter','daily':'daily'}[m[1].lower()];traits=[m[3]]
   if m[2].strip():rows.append('Special: '+m[2].strip(' ()'))
  elif any(line.startswith(x) for x in actions):
   a=next(x for x in actions if line.startswith(x)); action=actions[a];ran=line[len(a):].strip()
  elif typekey is None:desc.append(line)
  elif action is None:traits.append(line)
  elif re.match(r'^(Target|Trigger|Requirement):',line):
   k,v=line.split(':',1);fields[k]=v.strip()
  elif not ran and re.match(r'^(Personal|Melee|Ranged|Close|Area)',line):ran=line
  elif ran and not rows and line.startswith(('burst ','blast ')):ran+=' '+line
  elif re.match(r'^[A-Za-z][A-Za-z0-9 ()\x27’/-]*:',line):rows.append(line)
  elif rows:rows[-1]+=' '+line
  else:rows.append(line)
 assert typekey and action and ran,(title,typekey,action,ran,rows)
 out=['#powers.power(',f'  title: {q(title)},',f'  bonusTitle: {q("Level "+level) if level else q(kind)},',f'  description: {q(" ".join(desc))},',f'  type: powers.powerType.{typekey},',f'  action: powers.actionType.{action},',f'  range: {q(ran)},',f'  traits: {q(" ".join(traits))},']
 for k,v in fields.items():out.append(f'  {k.lower()}: {q(v)},')
 # Preserve attack riders/dual-defense instructions verbatim instead of reducing them to a single defense.
 out.append('  additionalRows: (')
 for r in rows:
  if ':' in r:
   k,v=r.split(':',1);out.append('    [*'+markup(k)+':* '+markup(v)+'],')
  else:out.append('    ['+markup(r)+'],')
 out+=['  ),',')','']
 stats.append((title,kind,level,typekey))
 return '\n'.join(out)
def convert(part,features=False):
 lines=part.splitlines();out=[];i=0
 while i<len(lines):
  line=lines[i].strip();h=header.match(line)
  if h:
   j=i+1
   while j<len(lines) and not header.match(lines[j]) and not section.match(lines[j].strip()):j+=1
   out.append(card(h,lines[i+1:j]));i=j;continue
  if line:
   if line.startswith('Barbarian 2.0'): pass
   elif line.startswith('Level ') and re.fullmatch(r'Level \d+',line):
    if int(line.split()[1])<=11:out.append('=== '+line+'\n')
   elif 'Attack Powers' in line:out.append('== '+markup(line)+'\n')
   elif section.match(line):out.append('== '+markup(line)+'\n')
   elif line.startswith('Berserker Alternative:') or line.startswith('Heroes of the Feywild') or line.startswith('The Heartland Hero Barbarian creates'):pass
   else:out.append(markup(line)+'\n')
  i+=1
 return '\n'.join(out)
powerstart=s.index('Primal At-will Attack Powers');elem=s.index('Barbarian 2.0',powerstart);elemstart=s.index('Elemental At-will Attack Powers')
base=Path('src/modern4e/classes')
imports='#import "../helpers/powers.typ";\n\n'
(base/'barbarian-primal-powers.typ').write_text('// Adapted from Barbarian 2.0, A Sharp Sword And A Straight Path.\n'+imports+'#let primalPowers() = [\n'+convert(s[powerstart:elem])+'\n]\n',encoding='utf-8')
(base/'barbarian-elemental-powers.typ').write_text('// Adapted from Barbarian 2.0, A Sharp Sword And A Straight Path.\n'+imports+'#let elementalPowers() = [\n'+convert(s[elemstart:])+'\n]\n',encoding='utf-8')
(base/'barbarian-heartland.typ').write_text('// Adapted from Barbarian 2.0, A Sharp Sword And A Straight Path.\n'+imports+'#let heartlandFeatures() = [\n= Heartland Hero\nYou can replace Feral Might with Heartland Might, Rampage with Hero\'s Heart, or both. These choices do not replace Barbarian Agility or Rage Strike.\n\n'+convert(s[elem:elemstart],True)+'\n]\n',encoding='utf-8')
Path('tmp/barbarian-import-stats.json').write_text(json.dumps(stats,indent=2),encoding='utf-8')
print('Imported',len(stats),'powers; types:',{k:sum(x[3]==k for x in stats) for k in ['at-will','encounter','daily']})
