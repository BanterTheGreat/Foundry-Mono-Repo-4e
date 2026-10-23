#!/usr/bin/env python3
"""Adapt new non-combat PDF additions into shared power-source utility cards."""
import json
import re
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'content/reference/non-combat-utility-powers.json'
SOURCES = {'Cleric': 'Divine', 'Paladin': 'Divine', 'Fighter': 'Martial',
           'Rogue': 'Martial', 'Warlord': 'Martial', 'Wizard': 'Arcane', 'Warlock': 'Arcane'}
MARTIAL_RANGER = {'brushing-machetes', 'two-bladed-weapons-demonstration',
                 'near-miss-intimidating-arrow', 'stealthy-wilderness-scout',
                 'clear-the-riff-raff', 'still-target', 'carving-the-terrain',
                 'delayed-falling-arrow'}

# Local exclusions from the shared power-source lists. Shield-compatible powers remain.
EXCLUDED_POWERS = {
    'paladin-10-revive-mount',
    'paladin-16-show-us-the-meaning-of-haste',
    'paladin-22-divinely-empowered-mount',
    'ranger-2-calming-rider',
    'ranger-2-galloping-jump',
    'ranger-6-pack-horse-s-strength',
    'ranger-10-speedy-gallop',
    'warlock-6-summon-eldritch-steed',
    # Named removals and Charming Rapscallion (moved to Diplomacy).
    'fighter-2-are-you-not-entertained',
    'fighter-2-i-ll-give-you-one',
    'fighter-2-old-war-buddy',
    'rogue-2-charming-rapscallion',
    'warlord-2-ambush-captain',
    'warlord-2-natural-leader',
    'warlord-2-pre-battle-rituals',
    'warlord-2-setup-camp-quickly',
    'warlord-2-tactical-knowledge',
    'warlord-6-old-war-buddy-warlord',
    # Specific weapon requirements, including dual-wielding and ranged weapons.
    'fighter-10-butterfly-vice',
    'fighter-10-flail-pull',
    'fighter-10-polearm-platform',
    'fighter-16-blade-brake',
    'fighter-16-floating-defensive-spin',
    'fighter-16-shackling-flail',
    'fighter-16-sundering-strike',
    'fighter-2-fighter-s-polearm-vault',
    'fighter-2-improvised-climbing-hook-s',
    'fighter-2-snatching-flail',
    'fighter-2-swords-to-pitons',
    'fighter-22-bisecting-blade',
    'fighter-22-executioner-s-swing',
    'fighter-6-balancing-polearm',
    'fighter-6-flail-swing',
    'ranger-10-brushing-machetes',
    'ranger-10-near-miss-intimidating-arrow',
    'ranger-16-clear-the-riff-raff',
    'ranger-16-still-target',
    'ranger-2-two-bladed-weapons-demonstration',
    'ranger-22-carving-the-terrain',
    'ranger-22-delayed-falling-arrow',
    'rogue-10-artful-wound',
    'rogue-10-my-tools-of-pain',
    'rogue-10-unexpected-ko',
    'rogue-6-nothing-up-my-sleeve',
    'rogue-6-ranged-distraction',
    'warlock-16-sacrifice-ally',
    'warlord-16-defensive-spin',
    'warlord-22-hooooold',
    'warlord-22-signal-arrow',
    # Renown powers.
    'fighter-10-slashed-scar-of-renown',
    'fighter-16-cutting-mark-of-fearful-renown',
    'fighter-6-cutting-symbol-of-renown',
    'ranger-22-beast-companion-of-great-renown',
}


def adapt(value):
  for old, new in [('Dungeoneering', 'Nature'), ('Dungoneering', 'Nature'),
                   ('Streetwise', 'Society'), ('History', 'Society'),
                   ('Heal', 'Medicine'), ('Intimidation', 'Intimidate')]:
    value = re.sub(r'\b' + old + r'\b', new, value)
  value = re.sub(r'\b(Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma) modifiers?\b', r'\1', value, flags=re.I)
  value = value.replace('Streng th modifier', 'Strength')
  value = re.sub(r'\bability scores?\b', 'ability points', value)
  value = re.sub(r'\btrained in\b', 'proficient in', value, flags=re.I)
  value = re.sub(r'\bMedium DC\b', 'Normal DC', value, flags=re.I)
  value = value.replace('Nature or Nature', 'Nature').replace('Nature, Nature,', 'Nature,')
  return value


def main():
  source = json.loads(SOURCE.read_text())
  cards = []
  for entry in source['powers']:
    if entry['id'] in EXCLUDED_POWERS:
      continue
    if not ('Non-Combat' in entry['reportedCategories'] and entry['hasPrintedDefinition']
            and any(row['markers']['newPower'] for row in entry['overviewRows'] + entry['categoryListings'])):
      continue
    power_source = SOURCES.get(entry['class'])
    if entry['class'] == 'Ranger':
      power_source = 'Martial' if any(entry['id'].endswith('-' + name) for name in MARTIAL_RANGER) else 'Primal'
    for definition in entry['definitions']:
      metadata = definition['actionAndRangeText']
      metadata = metadata.replace('Immediate In terrupt', 'Immediate Interrupt')
      metadata = re.sub(r'Immediate (.*?) (Interrupt|Reaction)\b', r'Immediate \2 \1', metadata)
      match = re.match(r'(Standard Action|Minor Action|Move Action|Free Action|No Action|Immediate Interrupt|Immediate Reaction)\s+(.*)', metadata)
      if not match:
        raise ValueError((entry['id'], metadata))
      action, range_text = match.groups()
      # Extraction occasionally attaches the next paragraph to the range line.
      spill = re.search(r'\s+(Speical\s*:|Special\s*:|Csat Time\s*:|Point:)', range_text)
      extra = ''
      if spill:
        extra = range_text[spill.start():].strip().replace('Speical', 'Special').replace('Csat Time', 'Cast Time')
        range_text = range_text[:spill.start()]
        if extra == 'Point: Description.':
          extra = ''  # Unfilled template text in the source, not a rule.
      rules = definition['rulesText']
      if extra:
        rules = extra + '\n' + rules
      rules = re.sub(r'\s+', ' ', rules).strip()
      # Preserve all text, including unlabeled paragraphs and lists. Split only
      # at printed rule labels; parsed convenience fields omit some source text.
      labels = sorted({f['label'] for f in definition['ruleFields']} | {'Special', 'Cast Time'}, key=len, reverse=True)
      rows = re.split(r'(?<!^)(?=\b(?:' + '|'.join(re.escape(label) for label in labels) + r')\s*:)', rules)
      keywords = [k for k in definition['keywords'] if k not in ('Martial', 'Arcane', 'Divine', 'Primal')]
      if power_source == 'Primal':
        keywords = [k for k in keywords if k != 'Martial Practice']
      cards.append(dict(id=entry['id'], title=entry['name'], level=entry['level'],
                        source=power_source, type=definition['usage'],
                        description=adapt(definition['flavourText']),
                        traits=', '.join([power_source] + keywords), action=action,
                        range=adapt(range_text), rows=[adapt(row.strip()) for row in rows if row.strip()],
                        pages=definition['pages'], originalClass=entry['class']))
  output = ROOT / 'content/power-source-utilities.json'
  migrations = json.loads((ROOT / 'content/skill-utility-migrations.json').read_text())['moves']
  skill_cards = []
  source_cards = []
  for card in cards:
    if card['id'] not in migrations:
      source_cards.append(card)
      continue
    card['skill'] = migrations[card['id']]
    card['traits'] = ', '.join(keyword for keyword in card['traits'].split(', ')
                               if keyword not in ('Martial', 'Arcane', 'Divine', 'Primal', 'Martial Practice'))
    prerequisite = f"Prerequisite: You must be proficient in {card['skill']}."
    card['rows'] = [row for row in card['rows'] if row != prerequisite]
    card['rows'].insert(0, prerequisite)
    card['source'] = None
    card['rows'] = [row.replace('related to your past as a rogue', 'related to your past as an adventurer')
                   .replace('Make an Intelligence ability check, or a Tactics skill check if that skill exists in your campaign.',
                            'Make an Insight check.')
                   .replace('Favored Terrain power (Ranger 2)', 'Favored Terrain skill utility power (level 2)')
                   for row in card['rows']]
    skill_cards.append(card)
  assert set(migrations) == {card['id'] for card in skill_cards}
  # The printed utility lists stop before level 16, including skill utilities.
  skill_cards = [card for card in skill_cards if card['level'] < 16]
  cards = [card for card in source_cards if card['level'] < 16]
  additions = json.loads((ROOT / 'content/primal-utility-additions.json').read_text())['powers']
  assert all(card['source'] == 'Primal' and card['level'] <= 10 for card in additions)
  assert max(Counter(card['originalClass'] for card in additions).values(), default=0) <= 3
  cards.extend(additions)
  assert len({card['id'] for card in cards}) == len(cards)
  (ROOT / 'content/skill-utilities.json').write_text(
      json.dumps({'powers': skill_cards}, indent=2, ensure_ascii=False) + '\n')
  output.write_text(json.dumps({'powers': cards}, indent=2, ensure_ascii=False) + '\n')
  print(f'{len(skill_cards)} migrated skill cards')
  print(f'{len(cards)} cards:', dict(Counter(card['source'] for card in cards)))


if __name__ == '__main__':
  main()
