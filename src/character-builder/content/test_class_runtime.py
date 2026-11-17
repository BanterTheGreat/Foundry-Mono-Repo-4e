"""Observable authoring-to-engine contract and deterministic Fighter goldens."""
import json
from pathlib import Path
import shutil
import tempfile
import unittest

import class_runtime


class ClassRuntimeTest(unittest.TestCase):
    def test_fighter_exact_runtime_golden_and_independent_choices(self):
        assets = class_runtime.build(class_ids=["modern4e.class.fighter"])
        chunk = assets["modern4e.classes/entries.json"]
        golden = Path(__file__).parents[1] / "shared/fixtures/shared-fighter-chunk.json"
        self.assertEqual(json.loads(golden.read_text(encoding="utf-8")), chunk)
        self.assertEqual(assets, class_runtime.build(class_ids=["modern4e.class.fighter"]))
        entries = {e["id"]: e for e in chunk["entries"]}
        fighter = entries["modern4e.class.fighter"]
        self.assertEqual(4, len(fighter["mechanics"]["grants"]))
        self.assertEqual(18, fighter["mechanics"]["classProfile"]["statistics"]["HIT_POINTS"]["base"])
        for name in ("fighter-reactivity", "fighter-specialization"):
            choice = entries["modern4e.feature." + name]["mechanics"]["choices"][0]
            self.assertEqual("modern4e.choice." + name, choice["id"])
        self.assertEqual(2, len(entries["modern4e.feature.combat-reactivity"]["mechanics"]["grants"]))
        talent = entries["modern4e.feature.one-handed-weapon-talent"]
        self.assertEqual("ONE_HANDED_WEAPON", talent["mechanics"]["conditionalModifiers"][0]["condition"])
        self.assertNotIn("modifiers", talent["mechanics"])
        self.assertEqual("UNIMPLEMENTED", entries["modern4e.power.combat-challenge"]["coverage"]["status"])

    def test_conditions_preserve_grouping_and_unresolved_queries(self):
        node = {"type": "allOf", "conditions": [{"type": "classPowerSource", "powerSource": "MARTIAL"},
                {"type": "anyOf", "conditions": [{"type": "entry", "entryId": "x"},
                 {"type": "unresolved", "text": "ambiguous", "reason": "not decided"}]}]}
        self.assertEqual(node, class_runtime.condition(node))
        self.assertEqual("unresolved", class_runtime.condition({"type": "size", "size": "SMALL"})["type"])

    def test_unsupported_collections_and_queries_remain_explicit_and_lossless(self):
        chunk = class_runtime.build()["modern4e.classes/entries.json"]
        wizard = next(e for e in chunk["entries"] if e["sharedData"].get("collections"))
        self.assertTrue(wizard["mechanics"]["unsupported"])
        self.assertIn("collections", wizard["sharedData"])
        self.assertNotEqual("SUPPORTED", wizard["coverage"]["status"])

    def test_local_formula_changes_output_and_malformed_source_fails(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory) / "classes"
            shutil.copytree(class_runtime.authoring.CONTENT, root)
            path = root / "fighter.json"
            data = json.loads(path.read_text(encoding="utf-8"))
            data["classes"][0]["statistics"]["health"]["base"] = 23
            path.write_text(json.dumps(data), encoding="utf-8")
            chunk = class_runtime.build(root, ["modern4e.class.fighter"])["modern4e.classes/entries.json"]
            fighter = next(e for e in chunk["entries"] if e["category"] == "CLASS")
            self.assertEqual(23, fighter["mechanics"]["classProfile"]["statistics"]["HIT_POINTS"]["base"])
            data["classes"][0]["grants"][0]["entryId"] = "modern4e.feature.missing"
            path.write_text(json.dumps(data), encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "undeclared reference"):
                class_runtime.build(root)

    def test_closed_conditional_vocabulary_rejects_unknown_context(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory) / "classes"
            shutil.copytree(class_runtime.authoring.CONTENT, root)
            path = root / "fighter-features.json"
            data = json.loads(path.read_text(encoding="utf-8"))
            talent = next(e for e in data["features"] if "conditionalModifiers" in e)
            talent["conditionalModifiers"][0]["condition"] = "EXECUTE_SCRIPT"
            path.write_text(json.dumps(data), encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "unknown value"):
                class_runtime.build(root)


if __name__ == "__main__":
    unittest.main()
