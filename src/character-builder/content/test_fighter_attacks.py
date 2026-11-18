"""Fighter acquisitions use reviewed local JSON, with published provenance retained."""
import json
from pathlib import Path
import sys
import unittest
from unittest.mock import patch

import class_runtime
import runtime_common

SCRIPTS = Path(__file__).resolve().parents[2] / "modern4e/scripts"
sys.path.insert(0, str(SCRIPTS))
import compendium
import import_class_attacks as migration


class FighterAttacksTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.powers = json.loads((class_runtime.authoring.CONTENT / "fighter-attack-powers.json").read_text(encoding="utf-8"))["powers"]
        cls.by_source = {p["source"]["entryId"]: p for p in cls.powers}

    def test_complete_level_fifteen_boundary_and_independent_identities(self):
        self.assertEqual(174, len(self.powers))
        self.assertEqual(174, len({p["id"] for p in self.powers}))
        self.assertEqual({row["ID"] for row in migration.source_rows()}, set(self.by_source))
        self.assertEqual({1, 3, 5, 7, 9, 13, 15}, {p["level"] for p in self.powers})
        self.assertEqual(22, sum(p["level"] == 13 for p in self.powers))
        self.assertEqual(18, sum(p["level"] == 15 for p in self.powers))
        for power in self.powers:
            self.assertEqual({"type": "entry", "entryId": "modern4e.class.fighter"}, power["access"])
            self.assertEqual("ATTACK", power["powerKind"])
            self.assertNotEqual("SUPPORTED", power["coverage"]["status"])

    def test_source_rules_retained_and_reviewed_rules_use_direct_points(self):
        cache = {}
        for source_id, power in self.by_source.items():
            path = compendium.batch_path("power", source_id)
            if path not in cache:
                cache[path] = compendium.payload(path)[-1]
            self.assertEqual(migration.text(cache[path][source_id]), power["source"]["rulesText"])
            reviewed = json.dumps(power["activations"])
            self.assertNotIn("Strength modifier", reviewed)
            self.assertNotIn("Constitution modifier", reviewed)
        cleave = self.by_source["power992"]["activations"][0]
        hit = cleave["blocks"][0]["comparisons"][0]["outcomes"]["hit"][0]
        self.assertIn("1[W] + Strength", hit["text"])
        self.assertIn("Strength damage", hit["text"])

    def test_multiple_attacks_scaling_and_manual_conditional_rules_survive(self):
        rain = self.by_source["power268"]["activations"][0]
        attack = next(b for b in rain["blocks"] if b["type"] == "attack")
        self.assertEqual(2, attack["roll"]["count"])
        bash = self.by_source["power10517"]["activations"][0]
        attack = next(b for b in bash["blocks"] if b["type"] == "attack")
        self.assertEqual(2, attack["roll"]["count"])
        self.assertEqual("ALL_TARGETS", attack["roll"]["sharing"])
        dragon = self.by_source["power1101"]
        self.assertIn("If you target only one creature", json.dumps(dragon["activations"]))
        self.assertFalse(any(b["type"] == "attack" for b in dragon["activations"][0]["blocks"]))
        self.assertIn("21", json.dumps(self.by_source["power992"]["activations"]))

    def test_proficiency_requirements_are_selection_prerequisites_not_weapon_conditions(self):
        for source, skill in (("power10153", "ENDURANCE"), ("power4324", "ATHLETICS"), ("power10001", "ATHLETICS")):
            power = self.by_source[source]
            self.assertIn({"type": "proficiency", "skill": skill}, power["prerequisites"]["conditions"])
        bash = self.by_source["power10473"]
        self.assertEqual({"type": "level", "minimum": 1}, bash["prerequisites"])
        self.assertEqual("You must have a hand free.", bash["activations"][0]["requirement"])

    def test_runtime_compiles_exact_local_profiles_and_readable_rules_without_compendium(self):
        with patch.object(compendium, "payload", side_effect=AssertionError("Production must not read source classes/powers")):
            assets = class_runtime.build()
        entries = {e["id"]: e for e in runtime_common.entries_of(assets)}
        for power in self.powers:
            runtime = entries[power["id"]]
            self.assertEqual(power["level"], runtime["mechanics"]["powerProfile"]["level"])
            self.assertEqual(power, {k: v for k, v in runtime["sharedData"].items() if k != "category"})
            self.assertIn(power["activations"][0]["blocks"][0]["label"] + ":", runtime["presentation"]["description"])
        self.assertEqual("DAILY", entries[self.by_source["power1101"]["id"]]["mechanics"]["powerProfile"]["usage"])
        fighter_only = runtime_common.entries_of(class_runtime.build(class_ids=["modern4e.class.fighter"]))
        self.assertEqual(set(p["id"] for p in self.powers), {e["id"] for e in fighter_only if e["id"].startswith("modern4e.power.fighter-power")})


if __name__ == "__main__":
    unittest.main()
