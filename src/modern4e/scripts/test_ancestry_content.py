"""Observable ancestry catalog and rendering regressions; run with unittest."""
import copy
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

import ancestry_content as content

BOOK = content.CONTENT.parents[1]


class AncestryContentTest(unittest.TestCase):
    def setUp(self):
        self.documents = [json.loads(p.read_text()) for p in sorted(content.CONTENT.glob('*.json')) if p.name != 'catalog.json']
        self.entries = content.load()

    def test_complete_local_catalog_and_page_consumers(self):
        ancestries = [e for e in self.entries.values() if '.ancestry.' in e['id']]
        self.assertEqual(len(ancestries), 13)
        self.assertEqual(len([e for e in self.entries if '.power.' in e]), 15)
        for entry in ancestries:
            name = entry['id'].split('.')[-1]
            page = (BOOK / 'ancestries' / (name + '.typ')).read_text()
            self.assertIn('ancestryContent.attributes("' + entry['id'] + '")', page)
            self.assertNotIn('#powers.power(', page)
            self.assertNotIn('== ', page)
            for grant in entry['grants']:
                self.assertIn('ancestryContent.trait("' + grant['entryId'] + '")', page)
        pages = "\n".join(p.read_text() for p in (BOOK / 'ancestries').glob('*.typ'))
        for eid in self.entries:
            if '.power.' in eid:
                self.assertEqual(pages.count('ancestryContent.powerCard("' + eid + '")'), 1)
        root = (BOOK / 'ancestries/root.typ').read_text()
        self.assertIn('// revenant.revenantPage()', root)

    def test_local_rules_and_choices(self):
        dwarf = self.entries['modern4e.ancestry.dwarf']
        self.assertEqual(dwarf['attributes']['speed'], 5)
        self.assertEqual(self.entries['modern4e.ancestry.elf']['attributes']['speed'], 7)
        self.assertEqual(self.entries['modern4e.ancestry.deva']['attributes']['size'], 'normal')
        self.assertIn('pending', self.entries['modern4e.ancestry.deva']['note'])
        self.assertIn('+1 healing surges', self.entries['modern4e.feature.dwarf-sturdy']['description'])
        for name in ['elf', 'dragonborn']:
            choices = [e['choices'][0] for e in self.entries.values() if e['id'].startswith('modern4e.feature.' + name + '-') and 'choices' in e and 'entryIds' in e['choices'][0]['source']]
            self.assertEqual(len(choices), 1)
            self.assertEqual(choices[0]['count'], 1)
            self.assertEqual(len(choices[0]['source']['entryIds']), 2)
        self.assertEqual(self.entries['modern4e.power.goblin-tactics']['usage'], 'AT_WILL')
        self.assertEqual(self.entries['modern4e.power.shifty-maneuver']['usage'], 'AT_WILL')
        self.assertEqual(self.entries['modern4e.power.heroic-effort']['target'], 'You or one ally that you can see')
        breath = self.entries['modern4e.power.dragon-breath']
        self.assertEqual(breath['rows'][0]['scaling'][1], {'atLevel': 21, 'text': '3d6 + Main Ability damage.'})
        self.assertIn('Dragonborn Scales', breath['rows'][1]['text'])
        for name, count in [('deva', 2), ('human', 1), ('dwarf', 0)]:
            self.assertEqual(self.entries['modern4e.ancestry.' + name]['attributes']['languages']['choiceCount'], count)

    def test_rejects_malformed_authoring(self):
        mutations = [
            lambda d: d[0]['ancestries'][0].update(unknown=True),
            lambda d: d.append(copy.deepcopy(d[0])),
            lambda d: d[0]['ancestries'][0]['grants'][0].update(entryId='missing'),
            lambda d: d[0]['ancestries'][0]['attributes'].update(speed=True),
            lambda d: d[0]['powers'][0].update(action='SCRIPT'),
            lambda d: d[0]['ancestries'][0].update(access={'type': 'unresolved'}),
            lambda d: d[0]['features'][0].update(choices=[{'id': 'bad', 'count': 3, 'source': {'damageTypes': ['FIRE']}}]),
            lambda d: d[0]['features'][0].update(choices=[{'id': 'bad', 'count': 1, 'source': {'entryIds': ['missing']}}]),
            lambda d: d[0]['features'][0].update(grants=[{'id': 'cycle', 'atLevel': 1, 'entryId': d[0]['ancestries'][0]['id']}]),
        ]
        for mutate in mutations:
            with self.subTest(mutation=mutate):
                docs = copy.deepcopy(self.documents)
                mutate(docs)
                with self.assertRaises(ValueError):
                    content.validate(docs)

    @unittest.skipUnless(shutil.which(os.environ.get('TYPST_BIN', 'typst')), 'Typst unavailable')
    def test_typst_renders_all_entries_including_revenant(self):
        # Query actual renderer output rather than testing a duplicate formatter.
        source = '''#import "helpers/ancestry_content.typ" as a
#let rendered = a.entries.pairs().map(((id, value)) => {
  if id.starts-with("modern4e.power.") { a.powerCard(id) }
  else if id.starts-with("modern4e.feature.") { a.trait(id) }
  else { a.attributes(id) }
}).join()
#metadata(repr(rendered))
'''
        with tempfile.NamedTemporaryFile(mode='w', suffix='.typ', dir=BOOK, delete=False) as handle:
            handle.write(source)
            path = Path(handle.name)
        try:
            output = subprocess.check_output([os.environ.get('TYPST_BIN', 'typst'), 'query', '--root', str(BOOK), str(path), 'metadata'], text=True)
            rendered = json.loads(output)[0]['value']
            for eid, entry in self.entries.items():
                if '.feature.' in eid:
                    self.assertIn(entry['title'].replace("'", '’'), rendered.replace("'", '’'))
            for text in ['3d6 + Main Ability damage.', 'Low-light', 'Common + 2', 'extra necrotic damage equal to 1d8']:
                self.assertIn(text, rendered)
        finally:
            path.unlink()


if __name__ == '__main__':
    unittest.main()
