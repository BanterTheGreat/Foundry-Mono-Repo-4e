"""Portable sample packaging, coverage completeness and deterministic production."""
import unittest
import build
import samples


class SampleTest(unittest.TestCase):
    def test_samples_and_coverage_are_reproducible_and_complete(self):
        assets = samples.assets()
        self.assertEqual(5, len(assets))
        for name, value in assets.items():
            self.assertEqual(build.serialize(value), (samples.FIXTURES / name).read_bytes())
        coverage = {entry['id']: entry for entry in assets['sample-coverage.json']['entries']}
        used = set()
        for name, document in assets.items():
            if name == 'sample-coverage.json':
                continue
            used.update(e['selection']['entryId'] for level in document['levels'] for e in level['entries'])
            used.update(e['selection']['entryId'] for e in document['equipment'])
            self.assertEqual(4, len([p for p in document['levels'][0]['proficiencies'] if p['slot']['sourceInstanceId'] != 'training']))
        self.assertEqual(used, coverage.keys())
        for entry in coverage.values():
            self.assertTrue(entry['publications'])
            self.assertTrue(entry['source'].endswith(entry['id']))
            self.assertTrue(entry['coverage']['limitations'])

    def test_platform_bundles_have_identical_bytes_and_current_packages(self):
        roots = [samples.HERE.parent / 'web/public/proof', samples.HERE.parent / 'android/src/main/assets/proof']
        bundles = [{p.relative_to(root).as_posix(): p.read_bytes() for p in root.rglob('*.json')} for root in roots]
        self.assertEqual(bundles[0], bundles[1])
        expected = {name: build.serialize(value) for name, value in build.build(samples.HERE / 'proof.json').items() if name.split('/')[0] in (samples.BASE, samples.OVERRIDE)}
        expected.update({'samples/' + name: build.serialize(value) for name, value in samples.assets().items()})
        self.assertEqual(expected, bundles[0])
