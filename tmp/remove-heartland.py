from pathlib import Path
p=Path('src/modern4e/classes/barbarian.typ');s=p.read_text(encoding='utf-8')
s=s.replace('#import "barbarian-heartland.typ": heartlandFeatures;\n','').replace('#import "barbarian-elemental-powers.typ": elementalPowers;\n','')
s=s.replace('Choose one of the following options, or replace this feature with Heartland Might from the Heartland Hero section:', 'Choose one of the following options:')
s=s.replace("\n      You can replace this feature with Hero's Heart from the Heartland Hero section.\n",'')
s=s.replace('    #pagebreak()\n    #classes.classFeatures[\n      #heartlandFeatures()\n    ]\n\n','')
s=s.replace('      #elementalPowers()\n','')
p.write_text(s,encoding='utf-8')
