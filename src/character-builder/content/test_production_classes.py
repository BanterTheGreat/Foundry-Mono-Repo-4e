"""Production adoption cannot borrow or silently restore published class definitions."""
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

import build
import class_runtime
import samples

HERE = Path(__file__).parent


def classes_package(assets):
    """Every chunk of the chunked classes package."""
    return {name: value for name, value in assets.items() if name.startswith('modern4e.classes/')}


class ProductionClassesTest(unittest.TestCase):
    def test_exact_generated_bytes_and_only_authoritative_class_identities(self):
        assets = build.production()
        self.assertEqual(assets, build.production())
        for name, value in assets.items():
            self.assertEqual(build.serialize(value), (HERE / 'production-generated' / name).read_bytes())
        classes = [e for name, value in assets.items() if '/entries' in name
                   for e in value['entries'] if e['category'] == 'CLASS']
        self.assertEqual(19, len(classes))
        self.assertEqual(19, len({entry['id'] for entry in classes}))
        self.assertTrue(all(e['id'].startswith('modern4e.class.') and e['sharedData']['flavor'] for e in classes))
        self.assertTrue(all(e['coverage']['status'] != 'SUPPORTED' for e in classes))
        self.assertFalse(any(e['id'] == 'class3' for name, value in assets.items() if '/entries' in name for e in value['entries']))

    def test_poisoned_source_class_html_never_read_or_used(self):
        original = build.payload
        def poisoned(path):
            if Path(path).parent.name == 'class' and Path(path).name != '_listing.js':
                raise AssertionError('Published class HTML must not be read')
            result = original(path)
            if Path(path).parent.name == 'class':
                columns, rows = result[-2:]
                for row in rows:
                    row[columns.index('Name')] = 'POISONED SOURCE CLASS'
            return result
        expected = build.production()
        with patch.object(build, 'payload', side_effect=poisoned):
            self.assertEqual(expected, build.production())

    def test_local_change_changes_output_and_fingerprint_and_missing_data_fails(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory) / 'classes'
            shutil.copytree(class_runtime.authoring.CONTENT, root)
            expected = classes_package(build.production(root))
            path = root / 'fighter.json'
            data = json.loads(path.read_text(encoding='utf-8'))
            data['classes'][0]['flavor']['quote'] += ' Changed locally.'
            path.write_text(json.dumps(data), encoding='utf-8')
            changed_assets = build.production(root)
            changed = classes_package(changed_assets)
            digest = lambda value: hashlib.sha256(build.serialize(value)).hexdigest()
            self.assertNotEqual(digest(expected), digest(changed))
            baseline = samples.modern_sample()['levels'][0]['entries'][0]['selection']['acknowledgedFingerprint']
            with patch.object(samples.build, 'production', return_value=changed_assets):
                self.assertNotEqual(baseline, samples.modern_sample()['levels'][0]['entries'][0]['selection']['acknowledgedFingerprint'])
            path.unlink()
            with self.assertRaises((ValueError, OSError)):
                build.production(root)

    def test_invalid_reference_duplicate_id_and_false_supported_coverage_fail(self):
        for mutate in (
            lambda data: data['classes'][0]['grants'][0].update(entryId='modern4e.feature.missing'),
            lambda data: data['classes'].append(data['classes'][0]),
            lambda data: data['classes'][0].update(coverage={'status': 'SUPPORTED', 'limitations': []},
                                                 prerequisites={'type': 'unresolved', 'text': 'Unknown', 'reason': 'Unknown'}),
        ):
            with tempfile.TemporaryDirectory() as directory:
                root = Path(directory) / 'classes'
                shutil.copytree(class_runtime.authoring.CONTENT, root)
                path = root / 'fighter.json'
                data = json.loads(path.read_text(encoding='utf-8'))
                mutate(data)
                path.write_text(json.dumps(data), encoding='utf-8')
                with self.assertRaises(ValueError):
                    build.production(root)

    def test_default_check_detects_stale_output(self):
        with tempfile.TemporaryDirectory() as directory:
            command = [sys.executable, str(HERE / 'build.py'), '--output', directory]
            self.assertEqual(0, subprocess.run(command, capture_output=True).returncode)
            path = Path(directory) / 'modern4e.classes/manifest.json'
            path.write_text('{}', encoding='utf-8')
            result = subprocess.run(command + ['--check'], capture_output=True)
            self.assertNotEqual(0, result.returncode)
            self.assertIn(b'stale', result.stderr)

    def test_modern_sample_is_distinct_from_unchanged_legacy_provenance(self):
        modern = samples.modern_sample()
        saved = modern['levels'][0]['entries'][0]['selection']
        self.assertEqual('modern4e.class.fighter', saved['entryId'])
        self.assertEqual('modern4e.classes', saved['supplierPackageId'])
        legacy = json.loads((samples.FIXTURES / 'character.json').read_text(encoding='utf-8'))
        self.assertEqual('class.fighter', legacy['levels'][0]['entries'][0]['selection']['entryId'])
        for root in (samples.FIXTURES, HERE.parent / 'web/public/samples', HERE.parent / 'android/src/main/assets/samples'):
            self.assertEqual(build.serialize(modern), (root / 'sample-modern-fighter.json').read_bytes())
