"""Reviewed mappings target actual shared identities; runtime never matches titles."""
import unittest
from pathlib import Path

import build
import runtime_common


class MigrationPlanTest(unittest.TestCase):
    def test_feat_consolidation_only_maps_retired_duplicate_identities(self):
        plan = build.load_json(Path(__file__).with_name('migrations') / 'feat-consolidation-v1.json')
        self.assertEqual(1, plan['schemaVersion'])
        self.assertEqual(9, len(plan['mappings']))
        self.assertEqual(9, len({m['sourceId'] for m in plan['mappings']}))
        definitions = {e['id']: e for e in runtime_common.entries_of(build.production())}
        for mapping in plan['mappings']:
            self.assertNotIn(mapping['sourceId'], definitions)
            self.assertEqual('FEAT', mapping['category'])
            self.assertEqual('FEAT', definitions[mapping['targetId']]['category'])
        self.assertFalse(any('double-lunge' in m['sourceId'] or 'bloodthirsty-visage' in m['sourceId']
                             for m in plan['mappings']))

    def test_fighter_plan_is_explicit_unique_and_matches_authored_provenance(self):
        path = Path(__file__).with_name('migrations') / 'fighter-v1.json'
        plan = build.load_json(path)
        self.assertEqual({'schemaVersion', 'id', 'mappings'}, set(plan))
        self.assertEqual(1, plan['schemaVersion'])
        self.assertEqual('modern4e.fighter-identities.v1', plan['id'])
        self.assertEqual(175, len(plan['mappings']))
        self.assertEqual(len(plan['mappings']), len({m['sourceId'] for m in plan['mappings']}))
        self.assertEqual(len(plan['mappings']), len({m['targetId'] for m in plan['mappings']}))
        definitions = {e['id']: e for e in runtime_common.entries_of(build.production())}
        for mapping in plan['mappings']:
            self.assertEqual({'sourceId', 'targetId', 'category'}, set(mapping))
            target = definitions[mapping['targetId']]
            self.assertEqual(mapping['category'], target['category'])
            if mapping['category'] == 'POWER':
                self.assertEqual(mapping['sourceId'], target['sharedData']['source']['entryId'])
            else:
                self.assertEqual({'sourceId': 'class3', 'targetId': 'modern4e.class.fighter', 'category': 'CLASS'}, mapping)


if __name__ == '__main__':
    unittest.main()
