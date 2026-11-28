"""Source parity, progression boundaries and invalid authoring regressions."""
import copy
import json
import os
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

import creation_content as content


class CreationContentTest(unittest.TestCase):
    def setUp(self):
        self.rules = content.read(content.SOURCE)

    def test_current_creation_steps_and_original_progression_rows(self):
        rules = content.validate(self.rules)
        golden = content.read(content.BOOK / 'scripts/fixtures/creation-source-golden.json')
        self.assertEqual([step['id'].rsplit('.', 1)[-1] for step in rules['steps']],
                         ['ancestry', 'class', 'equipment', 'skills', 'theme', 'feat'])
        self.assertEqual(rules['steps'][3]['title'], 'Choose four Trained skills')
        for row, original in zip(rules['levels'], golden['rows']):
            kind = row['abilityIncrease']['type']
            ability = {'CLASS': 'See class', 'NONE': '\u2014', 'MAIN': '+1 to main', 'NON_MAIN': '+1 to non-main', 'ALL': '+1 to all'}[kind]
            events = '; '.join(e['target'] if e['operation'] == 'GRANT_FEATURES' else f"{e['operation'].lower()} {e['count']} {e['target']}" for e in row['events'])
            self.assertEqual(ability, original['ability'])
            self.assertEqual(events, original['features'].rstrip(';'))
            self.assertEqual(row['featTotal'], original['feats'])
            self.assertEqual('/'.join(str(row['powerTotals'][k]) for k in ['atWill', 'encounter', 'daily', 'utility']), original['totals'])

    def test_replacements_provisional_levels_and_optional_choices(self):
        rules = content.validate(self.rules)
        self.assertEqual([r['level'] for r in rules['levels'] if any(e['operation'] == 'REPLACE' for e in r['events'])], [9, 15, 19, 23, 25, 29])
        self.assertEqual([r['level'] for r in rules['levels'] if r['status'] == 'PROVISIONAL'], list(range(11, 31)))
        self.assertFalse(rules['steps'][4]['required'])
        self.assertTrue(rules['techniqueAcquisition']['optional'])
        self.assertEqual(list(range(rules['techniqueAcquisition']['firstLevel'], 31, rules['techniqueAcquisition']['everyLevels'])), list(range(2, 31, 2)))
        self.assertEqual(rules['abilityAllocation']['nonMainBudget'], 5)
        self.assertEqual(rules['abilityAllocation']['tradeoff']['raisedMaximum'], 3)

    def test_rejects_invalid_rules_and_totals(self):
        mutations = [
            lambda d: d.update(unexpected=True),
            lambda d: d.update(schemaVersion=True),
            lambda d: d['levels'].pop(),
            lambda d: d['levels'].reverse(),
            lambda d: d['levels'][10].update(status='AUTHORED'),
            lambda d: d['levels'][1].update(featTotal=99),
            lambda d: d['levels'][8]['events'][0].update(count=99),
            lambda d: d['levels'][0]['events'][0].update(operation='SCRIPT'),
            lambda d: d['levels'][1]['events'][0].update(maximumEntryLevel=30),
            lambda d: d['levels'][0]['powerTotals'].update(daily=True),
            lambda d: d['levels'][1]['events'][0].update(id=d['levels'][0]['events'][0]['id']),
            lambda d: d['creationRules']['equipment'].update(weaponMinimum=3),
            lambda d: d['abilityAllocation']['tradeoff'].update(maximumPairs=2),
            lambda d: d['techniqueAcquisition'].update(everyLevels=0),
            lambda d: d.update(initialPowerChoices='missing'),
            lambda d: d['coverage'].update(status='SUPPORTED'),
        ]
        for mutate in mutations:
            with self.subTest(mutation=mutate):
                data = copy.deepcopy(self.rules)
                mutate(data)
                with self.assertRaises(ValueError):
                    content.validate(data)

    def test_checks_existing_initial_choice_contract(self):
        initial = content.read(content.BOOK / 'content/classes/advancement.json')
        initial['powerChoices'][0]['count'] = 3
        with self.assertRaisesRegex(ValueError, 'Initial class choices disagree'):
            content.validate(self.rules, initial)

    def test_deterministic_export_staleness_and_source_protection(self):
        command = [sys.executable, str(Path(content.__file__))]
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / 'creation.json'
            subprocess.run(command + ['--output', str(output)], check=True, capture_output=True)
            first = output.read_bytes()
            subprocess.run(command + ['--output', str(output)], check=True, capture_output=True)
            self.assertEqual(first, output.read_bytes())
            self.assertEqual(json.loads(first)['kind'], 'modern4e.creation-authoring')
            subprocess.run(command + ['--output', str(output), '--check'], check=True, capture_output=True)
            output.write_text('{}', encoding='utf-8')
            self.assertNotEqual(subprocess.run(command + ['--output', str(output), '--check'], capture_output=True).returncode, 0)
        self.assertNotEqual(subprocess.run(command + ['--output', str(content.SOURCE)], capture_output=True).returncode, 0)

    def test_duplicate_json_keys_rejected(self):
        with self.assertRaisesRegex(ValueError, 'Duplicate JSON key'):
            json.loads('{"level": 1, "level": 2}', object_pairs_hook=content.unique_object)

    @unittest.skipUnless(shutil.which(os.environ.get('TYPST_BIN', 'typst')), 'Typst unavailable')
    def test_actual_typst_table_and_creation_renderer(self):
        source = '''#import "helpers/creation_content.typ" as c
#import "glossary/creation_&_advancement.typ": creationAndAdvancementPage
#metadata(repr(creationAndAdvancementPage())) <chapter>
#metadata(c.tableCells().len()) <cells>
#metadata(repr(c.tableCells().last())) <last-cell>
'''
        with tempfile.NamedTemporaryFile(mode='w', encoding='utf-8', suffix='.typ', dir=content.BOOK, delete=False) as handle:
            handle.write(source)
            path = Path(handle.name)
        try:
            command = [os.environ.get('TYPST_BIN', 'typst'), 'query', '--root', str(content.BOOK), str(path)]
            cells = json.loads(subprocess.check_output(command + ['<cells>'], encoding='utf-8'))
            self.assertEqual(cells[0]['value'], 150)
            rendered = json.loads(subprocess.check_output(command + ['<chapter>'], encoding='utf-8'))[0]['value']
            for step in self.rules['steps']:
                self.assertIn(step['title'], rendered)
            self.assertNotIn('Create a Background', rendered)
            last = json.loads(subprocess.check_output(command + ['<last-cell>'], encoding='utf-8'))[0]['value']
            self.assertIn('2/7/4/7', last)
        finally:
            path.unlink()


if __name__ == '__main__':
    unittest.main()
