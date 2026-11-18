"""Offline importer stays available independently of authoritative production content."""
import copy
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
import build

HERE = Path(__file__).resolve().parent


class ImporterTest(unittest.TestCase):
    def setUp(self):
        # Presentation-only source imports, never provisional Modern 4e rules.
        self.config = {'packages': [
            dict(id='test.import', revision='1', title='Importer test', entries=[{'id': 'class3'}, {'id': 'feat166'}]),
            dict(id='test.import.override', revision='1', title='Importer override test',
                 dependencies=[dict(packageId='test.import', revision='1')], entries=[{'id': 'feat166'}])
        ]}

    def configured(self, change=lambda c: None):
        config = copy.deepcopy(self.config)
        change(config)
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'authored.json'
            path.write_bytes(build.serialize(config))
            return build.build(path)

    def reject(self, change, message):
        with self.assertRaisesRegex(ValueError, 'authored.json:.*' + message):
            self.configured(change)

    def test_deterministic_source_identity_html_and_lightweight_indexes(self):
        assets = self.configured()
        self.assertEqual(assets, self.configured(lambda c: c['packages'][0]['entries'].reverse()))
        for package in ('test.import', 'test.import.override'):
            manifest = assets[f'{package}/manifest.json']
            entries = [e for chunk in manifest['chunks'] for e in assets[f'{package}/{chunk}.json']['entries']]
            index = assets[f'{package}/index.json']['entries']
            self.assertEqual([e['id'] for e in entries], [e['id'] for e in index])
            for metadata in index:
                self.assertEqual({'id', 'category', 'title', 'chunkId'}, metadata.keys())
            for entry in entries:
                category = build.compendium.category(entry['id'])
                number = int(''.join(filter(str.isdigit, entry['id'])))
                batch = build.SNAPSHOT / category / f'data{number % 20}.js'
                self.assertEqual(build.payload(batch)[-1][entry['id']], entry['presentation']['description'])
                self.assertTrue(entry['presentation']['publications'])
                self.assertEqual({}, entry['mechanics'])
                self.assertEqual('UNIMPLEMENTED', entry['coverage']['status'])

    def test_duplicate_missing_unsafe_and_unknown_inputs(self):
        self.reject(lambda c: c['packages'][0]['entries'].append({'id': 'class3'}), 'duplicate entry ID')
        self.reject(lambda c: c['packages'][0]['entries'][0].update(id='class999999'), 'missing source entry')
        self.reject(lambda c: c['packages'][0].update(id='../escape'), 'safe directory')
        self.reject(lambda c: c['packages'][0]['entries'][0].update(typo=True), 'unknown fields')
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'duplicate.json'
            path.write_text('{"id":1,"id":2}')
            with self.assertRaisesRegex(ValueError, 'duplicate JSON key'):
                build.load_json(path)

    def test_dependencies_references_and_cycles(self):
        self.reject(lambda c: c['packages'][1]['dependencies'][0].update(packageId='missing'), 'missing dependency')
        self.reject(lambda c: c['packages'][1]['dependencies'][0].update(revision='2'), 'revision mismatch')
        self.reject(lambda c: c['packages'][0].update(dependencies=[dict(packageId='test.import.override', revision='1')]), 'dependency cycle')
        self.reject(lambda c: c['packages'][0].update(dependencies=[dict(packageId='test.import', revision='1')]), 'self dependency')
        def reference(c, target):
            c['packages'][1]['entries'][0].update(mechanics={'grants': [{'type': 'entry', 'grantId': 'test', 'entryId': target}]},
                coverage={'status': 'PARTIAL', 'limitations': ['Synthetic reference validation input.']})
        self.configured(lambda c: reference(c, 'class3'))
        self.reject(lambda c: reference(c, 'class999999'), 'mechanical reference')

    def test_jsonp_is_data_never_executed(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'malformed.js'
            for text in ('alert(1)', 'od.reader.jsonp_data(1, (() => 2)())', 'od.reader.jsonp_data(1,{"x":1}); evil()', 'od.reader.jsonp_data()'):
                path.write_text(text)
                with self.subTest(text=text), self.assertRaises(ValueError):
                    build.payload(path)
            path.write_text("od.reader.jsonp_data(1,{key:'data',});")
            self.assertEqual({'key': 'data'}, build.payload(path)[-1])

    def test_closed_mechanics_validation(self):
        for mechanics, message in [
            ({'script': 'evil()'}, 'unknown fields'),
            ({'choices': [{'type': 'proficiencies', 'id': 'skill', 'count': 1, 'skills': ['HEAL']}]}, 'expected one of'),
            ({'progression': [{'level': 31}]}, 'maximum 30'),
            ({'prerequisites': [{'type': 'abilityScore', 'minimum': 13}]}, 'expected one of'),
            ({'modifiers': [{'target': {'statistic': 'SKILL_CHECK'}, 'operation': 'ADD', 'value': 1}]}, 'skill required'),
        ]:
            with self.subTest(mechanics=mechanics), self.assertRaisesRegex(ValueError, message):
                build.validate_mechanics(mechanics, 'test input')
        with self.assertRaisesRegex(ValueError, 'absent authored mechanics'):
            self.configured(lambda c: c['packages'][0]['entries'][0].update(coverage={'status': 'SUPPORTED', 'limitations': []}))

    def test_default_check_detects_stale_and_unexpected_assets(self):
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory)
            args = [sys.executable, str(HERE / 'build.py'), '--output', str(output)]
            self.assertEqual(0, subprocess.run(args, capture_output=True).returncode)
            manifest = output / 'modern4e.classes/manifest.json'
            manifest.write_text('{}')
            result = subprocess.run(args + ['--check'], capture_output=True, text=True)
            self.assertNotEqual(0, result.returncode)
            self.assertIn('stale', result.stderr)
            (output / 'modern4e.classes/obsolete.json').write_text('{}')
            result = subprocess.run(args, capture_output=True, text=True)
            self.assertNotEqual(0, result.returncode)
            self.assertIn('unexpected stale assets', result.stderr)
            self.assertEqual('{}', manifest.read_text())

    def test_explicit_source_category_export_stays_unimplemented(self):
        def categories(config):
            config['packages'] = [dict(config['packages'][0], sourceCategories=['class'], entries=[])]
        assets = self.configured(categories)
        expected = build.payload(build.SNAPSHOT / 'class/_listing.js')[-1]
        self.assertEqual({row[0] for row in expected}, {row['id'] for row in assets['test.import/index.json']['entries']})
        self.assertTrue(all(e['coverage']['status'] == 'UNIMPLEMENTED' for n, v in assets.items() if '/entries-' in n for e in v['entries']))

    def test_missing_html_and_dangling_presentation_reference_are_actionable(self):
        with tempfile.TemporaryDirectory() as directory:
            snapshot = Path(directory)
            (snapshot / "catalog.js").write_text('od.reader.jsonp_catalog(1,{"class":1})')
            (snapshot / "class").mkdir()
            (snapshot / "class/_listing.js").write_text('od.reader.jsonp_data_listing(1,"class",["ID","Name"],[["class3","Fighter"]])')
            batch = snapshot / "class/data3.js"
            config = snapshot / "author.json"
            config.write_bytes(build.serialize({"packages": [{"id": "test", "revision": "1", "title": "test", "entries": [{"id": "class3"}]}]}))
            batch.write_text('od.reader.jsonp_data(1,"class",{})')
            with self.assertRaisesRegex(ValueError, "_listing.js:rows.*missing HTML class3"):
                build.build(config, snapshot)
            batch.write_text('od.reader.jsonp_data(1,"class",{"class3":"<a href=\\\"?view=power999\\\">missing</a>"})')
            with self.assertRaisesRegex(ValueError, "data3.js:class3.*dangling presentation reference power999"):
                build.build(config, snapshot)

    def test_modifier_progression_and_reference_variants(self):
        mechanics = {
            "prerequisites": [{"type": "level", "minimum": 2}, {"type": "entry", "entryId": "feat1"}, {"type": "proficiency", "skill": "RELIGION"}],
            "grants": [{"type": "proficiency", "grantId": "medicine", "skill": "MEDICINE"}],
            "choices": [{"type": "entries", "id": "power", "count": 1, "entryIds": ["power1"]}],
            "progression": [{"level": 4, "grants": [{"type": "entry", "grantId": "feature", "entryId": "classfeature1"}], "modifiers": [{"target": {"statistic": "ABILITY_POINTS", "ability": "WISDOM"}, "operation": "ADD", "value": 1}]}]
        }
        self.assertEqual(["feat1", "power1", "classfeature1"], build.validate_mechanics(mechanics, "authored"))
        mechanics["progression"].append({"level": 4})
        with self.assertRaisesRegex(ValueError, "duplicate"):
            build.validate_mechanics(mechanics, "authored")
