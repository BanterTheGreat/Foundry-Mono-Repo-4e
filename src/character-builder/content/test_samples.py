"""Current-data fixtures follow authored packages and never enter app catalogs."""
import unittest
from unittest.mock import patch
import build
import runtime_common
import samples


class SampleTest(unittest.TestCase):
    def test_accepted_samples_use_real_themed_origins_and_level_two_feat(self):
        packages = build.production()
        definitions = {e['id']: e for e in runtime_common.entries_of(packages)}
        accepted = samples.accepted_assets(packages)
        self.assertEqual(3, len(accepted))
        for name, document in accepted.items():
            self.assertEqual(build.serialize(document), (samples.FIXTURES / name).read_bytes())
            for selection in [e['selection'] for row in document['levels'] for e in row['entries']] + [e['selection'] for e in document['equipment']]:
                self.assertEqual(samples.fingerprint(definitions[selection['entryId']]), selection['acknowledgedFingerprint'])
            self.assertIn('modern4e.theme.docker', [e['selection']['entryId'] for e in document['levels'][0]['entries']])
            self.assertEqual(3, len(document['equipment']))
            self.assertEqual(document['level'], sum(e['slot']['choiceId'] == 'feat' for row in document['levels'] for e in row['entries']))

    def test_level_nineteen_regression_fighter_covers_later_progression(self):
        packages = build.production()
        definitions = {e['id']: e for e in runtime_common.entries_of(packages)}
        generated = samples.regression_assets(packages)
        self.assertEqual(['sample-regression-fighter-19.json'], list(generated))
        document = generated['sample-regression-fighter-19.json']
        self.assertEqual(build.serialize(document), (samples.FIXTURES / 'sample-regression-fighter-19.json').read_bytes())
        self.assertEqual(list(range(1, 20)), [row['level'] for row in document['levels']])
        rows = {row['level']: row for row in document['levels']}
        selections = [e['selection'] for row in document['levels'] for e in row['entries']] + \
            [r['replacement']['selection'] for row in document['levels'] for r in row.get('replacements', [])] + \
            [e['selection'] for e in document['equipment']]
        for selection in selections:
            self.assertEqual(samples.fingerprint(definitions[selection['entryId']]), selection['acknowledgedFingerprint'])
        self.assertIn('modern4e.path.notorious-celebrity', [e['selection']['entryId'] for e in rows[11]['entries']])
        self.assertEqual([9, 15, 19], [level for level, row in rows.items() if row.get('replacements')])
        self.assertEqual({4: 'CONSTITUTION', 12: 'DEXTERITY'}, {level: next(iter(row['abilityAdvancements'][0]['increases']))
                                                              for level, row in rows.items() if row.get('abilityAdvancements')})
        self.assertEqual(4, len(rows[4]['values']))
        self.assertTrue(any(definitions[s['entryId']]['mechanics'].get('multiclassFor') for s in selections))

    def test_samples_are_reproducible_and_reference_current_definitions(self):
        packages = build.production()
        original_bytes = {name: build.serialize(value) for name, value in packages.items()}
        generated = samples.assets(packages)
        self.assertEqual(original_bytes, {name: build.serialize(value) for name, value in packages.items()})
        self.assertEqual(4, len(generated))
        definitions = {e['id']: e for e in runtime_common.entries_of(packages)}
        override = runtime_common.entries_of(samples.test_override(packages))[0]
        for name, document in generated.items():
            self.assertEqual(build.serialize(document), (samples.FIXTURES / name).read_bytes())
            self.assertEqual(document['level'], len(document['levels']))
            for selected in [e['selection'] for level in document['levels'] for e in level['entries']] + [e['selection'] for e in document['equipment']]:
                entry = override if selected['supplierPackageId'] == samples.OVERRIDE else definitions[selected['entryId']]
                self.assertEqual(samples.fingerprint(entry), selected['acknowledgedFingerprint'])
                self.assertEqual(entry['presentation']['title'], selected['savedTitle'])
            training = definitions['modern4e.feat.skill-training']['mechanics']['choices'][0]
            selected = [p for p in document['levels'][0]['proficiencies'] if p['slot']['sourceInstanceId'] == 'training']
            self.assertEqual(training['count'], len(selected))
            self.assertTrue(all(p['slot']['choiceId'] == training['id'] for p in selected))

    def test_local_changes_flow_into_fingerprints_and_test_override(self):
        packages = build.production()
        before = samples.assets(packages)['sample-current-fighter-1-base.json']
        fighter = next(e for e in runtime_common.entries_of(packages) if e['id'] == 'modern4e.class.fighter')
        fighter['presentation']['description'] += ' Current local edit.'
        after = samples.assets(packages)['sample-current-fighter-1-base.json']
        self.assertNotEqual(before['levels'][0]['entries'][0]['selection']['acknowledgedFingerprint'],
                            after['levels'][0]['entries'][0]['selection']['acknowledgedFingerprint'])
        override = runtime_common.entries_of(samples.test_override(packages))[0]
        self.assertEqual(fighter['mechanics'], override['mechanics'])
        self.assertEqual(fighter['sharedData'], override['sharedData'])
        self.assertTrue(override['presentation']['description'].startswith(fighter['presentation']['description']))

    def test_production_catalog_and_platform_starters_exclude_test_packages(self):
        packages = build.production()
        self.assertEqual(set(samples.MODERN_PACKAGES), {n.split('/')[0] for n in packages})
        starter = samples.modern_sample(packages)
        self.assertEqual(samples.MODERN_PACKAGES, [p['packageId'] for p in starter['packages']])
        for root in (samples.HERE.parent / 'web/public', samples.HERE.parent / 'android/src/main/assets'):
            self.assertFalse((root / 'proof').exists())
            self.assertEqual(build.serialize(starter), (root / 'samples/sample-modern-fighter.json').read_bytes())
        self.assertEqual(build.serialize(starter), (samples.FIXTURES / 'sample-modern-fighter.json').read_bytes())
        for name, value in samples.test_override(packages).items():
            self.assertEqual(build.serialize(value), (samples.TEST_PACKAGES / name).read_bytes())

    def test_production_does_not_consult_the_legacy_importer(self):
        with patch.object(build, 'build', side_effect=AssertionError('Legacy importer consulted')):
            self.assertEqual(set(samples.MODERN_PACKAGES), {n.split('/')[0] for n in build.production()})
