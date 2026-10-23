#!/usr/bin/env python3
"""Build heroic class utility cards from the offline snapshot."""
import json
import re
from pathlib import Path

import compendium

ROOT = Path(__file__).resolve().parents[1]


def plain(html):
  reader = compendium.PlainText()
  reader.feed(html)
  return reader.text()


def adapt(text):
  for old, new in (("Dungeoneering", "Nature"), ("Streetwise", "Society"),
                   ("History", "Society"), ("Heal", "Medicine")):
    text = re.sub(r"\b" + old + r"\b", new, text)
  text = re.sub(r"\b(Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma) modifiers?\b", r"\1", text, flags=re.I)
  text = re.sub(r"\bhave training in\b", "be proficient in", text)
  text = re.sub(r"\bhave trained in\b", "be proficient in", text)
  text = re.sub(r"\bbe trained in\b", "be proficient in", text)
  text = re.sub(r"\bare trained in\b", "are proficient in", text)
  text = re.sub(r"\bis trained in\b", "is proficient in", text)
  text = text.replace("you are trained", "you are proficient").replace("you’re trained", "you’re proficient").replace("you\'re trained", "you\'re proficient")
  text = text.replace("untrained skill check", "skill check without proficiency").replace("trained skill check", "skill check with proficiency")
  text = text.replace("Training in one skill", "Proficiency in one skill")
  return text


def review_reasons(row, html, text):
  reasons = []
  if int(row["Level"]) not in (2, 6, 10):
    reasons.append("Nonstandard utility level: review class-feature acquisition before treating this as a selectable utility.")
  if row["ID"] == "power14428":
    reasons.append("Requires the berserker defender aura and vengeful guardian, absent from the local barbarian.")
  if row["ID"] == "power14472":
    reasons.append("Modifies the skald aura, absent from the local bard.")
  prereqs = re.findall(r"Prerequisite: ([^\n]+)", text)
  for prerequisite in prereqs:
    if not re.search(r"train(?:ed|ing) in|wild shape", prerequisite, re.I):
      reasons.append("Unusual prerequisite: " + prerequisite)
  mechanics = text.split("✦", 1)[-1]
  if re.search(r"\bfamiliar\b", mechanics, re.I):
    reasons.append("Requires or modifies an arcane familiar; familiar rules are not supplied by the class chapter.")
  if row['ClassName'] == 'Ranger' and re.search(r"beast companion|\bBeast:", mechanics, re.I):
    reasons.append("Uses the Beast Mastery companion subsystem, absent from the local ranger.")
  if re.search(r"nature.s growth", mechanics, re.I):
    reasons.append("Requires nature's growth, absent from the local druid.")
  if 'Summoning' in row['Keywords'] or re.search(r"summoned creature|instinctive effect", mechanics, re.I):
    reasons.append("Depends on summoning rules or summoned-creature statistics; review that dependency before placement.")
  return reasons


def extract(row, html):
  lines = plain(html).splitlines()
  metadata = next(i for i, line in enumerate(lines) if re.match(r"^(At-Will|Encounter|Daily)(?:\s|$)", line))
  usage, _, traits = lines[metadata].partition('✦')
  action_range = lines[metadata + 1]
  match = re.match(r"(Immediate Interrupt|Immediate Reaction|Opportunity Action|Standard Action|Move Action|Minor Action|Free Action|No Action)(.*)", action_range)
  if not match:
    raise ValueError(f"Unrecognized action: {row['ID']} {action_range!r}")
  body = lines[metadata + 2:]
  source = next((line for line in body if line.startswith('Published in ')), row['SourceBook'])
  # Update notes describe source history, not additional power rules.
  end = next((i for i, line in enumerate(body) if line.startswith(('Published in ', 'Update (', 'Revision ('))), len(body))
  body = body[:end]
  return {
    'id': row['ID'], 'title': row['Name'], 'className': row['ClassName'],
    'level': int(row['Level']), 'type': usage.strip(),
    'description': adapt(' '.join(lines[1:metadata])) or None,
    'traits': traits.strip() or None, 'action': match[1],
    'range': adapt(match[2].strip()), 'rows': [adapt(line) for line in body],
    'source': source, 'link': 'https://iws.mx/dnd/?view=' + row['ID'],
  }


def main():
  listing = compendium.payload(compendium.DATA / 'power/_listing.js')
  classes = {path.stem.capitalize() for path in (ROOT / 'classes').glob('*.typ')} - {'Root'}
  rows = [dict(zip(listing[-2], row)) for row in listing[-1]]
  rows = [row for row in rows if row['ClassName'] in classes and row['Level'].isdigit()
          and 1 <= int(row['Level']) <= 10 and 'Utility' in row['Type']]
  cache, included, deferred = {}, [], []
  for row in rows:
    path = compendium.batch_path('power', row['ID'])
    if path not in cache:
      cache[path] = compendium.payload(path)[-1]
    html = cache[path][row['ID']]
    card = extract(row, html)
    reasons = review_reasons(row, html, plain(html))
    if reasons:
      card['reviewReasons'] = reasons
      deferred.append(card)
    else:
      included.append(card)
  for class_name in sorted(classes):
    cards = sorted((card for card in included if card['className'] == class_name), key=lambda card: (card['level'], card['title']))
    (ROOT / 'content/class-utilities' / (class_name.lower() + '.json')).write_text(json.dumps({'powers': cards}, indent=2, ensure_ascii=False) + '\n')
  (ROOT / 'content/class-utilities/deferred.json').write_text(json.dumps({'powers': deferred}, indent=2, ensure_ascii=False) + '\n')
  assert len({card['id'] for card in included + deferred}) == len(rows)
  print(f'{len(rows)} total: {len(included)} placed, {len(deferred)} deferred')


if __name__ == '__main__':
  main()
