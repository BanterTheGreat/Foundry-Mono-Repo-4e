"""Observable authoring-to-engine contract and deterministic Fighter goldens."""
import json
from pathlib import Path
import shutil
import tempfile
import unittest

import class_runtime


class ClassRuntimeTest(unittest.TestCase):
    def test_fighter_exact_runtime_golden_and_independent_choices(self):
        assets = class_runtime.build(class_ids=["modern4e.class.fighter"], include_advancement=False)
        chunk = assets["modern4e.classes/entries.json"]
        golden = Path(__file__).parents[1] / "shared/fixtures/shared-fighter-chunk.json"
        self.assertEqual(json.loads(golden.read_text(encoding="utf-8")), chunk)
        self.assertEqual(assets, class_runtime.build(class_ids=["modern4e.class.fighter"], include_advancement=False))
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

    def test_collections_queries_and_overrides_compile_losslessly(self):
        chunk = class_runtime.build()["modern4e.classes/entries.json"]
        wizard = next(e for e in chunk["entries"] if e["sharedData"].get("collections"))
        self.assertEqual(wizard["sharedData"]["collections"], wizard["mechanics"]["collections"])
        self.assertTrue(wizard["mechanics"]["choices"][0]["query"])
        self.assertIn("collections", wizard["sharedData"])
        self.assertNotEqual("SUPPORTED", wizard["coverage"]["status"])

    def test_utility_pick_kind_filter_survives_authoring_and_compilation(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory) / "classes"
            shutil.copytree(class_runtime.authoring.CONTENT, root)
            path = root / "advancement.json"
            data = json.loads(path.read_text(encoding="utf-8"))
            choice = next(c for c in data["powerChoices"] if c["id"] == "modern4e.choice.class-utility-2")
            choice["source"]["filters"]["pickKind"] = "COMBAT"
            path.write_text(json.dumps(data), encoding="utf-8")
            entries = class_runtime.build(root)["modern4e.classes/entries.json"]["entries"]
            fighter = next(e for e in entries if e["id"] == "modern4e.class.fighter")
            compiled = next(c for c in fighter["mechanics"]["choices"] if c["id"] == choice["id"])
            self.assertEqual("COMBAT", compiled["query"]["pickKind"])
            choice["source"]["filters"]["pickKind"] = "SPELL"
            path.write_text(json.dumps(data), encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "unknown value"):
                class_runtime.build(root)

            choice["source"]["filters"]["pickKind"] = "COMBAT"
            choice["source"]["filters"]["powerKind"] = "ATTACK"
            path.write_text(json.dumps(data), encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "pickKind requires a UTILITY"):
                class_runtime.build(root)

    def test_shared_slots_mirror_authoritative_gain_events_through_level_ten(self):
        catalog = class_runtime.authoring.catalog()
        creation = json.loads((class_runtime.authoring.CONTENT.parent / "creation/standard.json").read_text(encoding="utf-8"))
        slots = catalog["advancement"]["powerChoices"]
        expected = [(row["level"], event["count"], event["powerKind"], event["usage"])
                    for row in creation["levels"][:10] for event in row["events"]
                    if event.get("category") == "POWER" and event["operation"] == "GAIN"]
        actual = [(choice["atLevel"], choice["count"], choice["source"]["filters"]["powerKind"],
                   choice["source"]["filters"].get("usage", "UNRESOLVED")) for choice in slots]
        self.assertEqual(expected, actual)
        self.assertEqual(len(slots), len({choice["id"] for choice in slots}))
        self.assertTrue(all(choice["atLevel"] <= 10 for choice in slots))

    def test_wizard_acquisition_preparation_techniques_and_tome_have_separate_slots(self):
        entries = {entry["id"]: entry for entry in class_runtime.build()["modern4e.classes/entries.json"]["entries"]}
        book = entries["modern4e.feature.wizard-spellbook"]["mechanics"]
        modifiers = {modifier["choiceId"]: modifier for modifier in book["selectionModifiers"]}
        self.assertEqual(4, modifiers["modern4e.choice.class-attack-daily"]["count"])
        self.assertEqual(2, modifiers["modern4e.choice.class-utility-2"]["count"])
        self.assertEqual(2, modifiers["modern4e.choice.class-attack-daily-5"]["count"])
        daily = next(choice for choice in book["choices"] if choice["id"].endswith("prepare-dailies"))
        utility = next(choice for choice in book["choices"] if choice["id"].endswith("prepare-utilities"))
        self.assertEqual([2, 3], [step["count"] for step in daily["countByLevel"]])
        self.assertEqual([1, 2, 3, 4, 5], [step["count"] for step in utility["countByLevel"]])
        self.assertEqual(daily["requiresCollection"], utility["requiresCollection"])
        techniques = [choice for choice in book["choices"] if choice["query"]["category"] == "TECHNIQUE"]
        self.assertEqual([1, 5, 11, 15, 21, 25], [choice["atLevel"] for choice in techniques])
        self.assertEqual([3, 2, 2, 2, 2, 2], [choice["count"] for choice in techniques])
        tome = entries["modern4e.feature.tome-of-readiness"]["mechanics"]["choices"][0]
        self.assertEqual([{"type": "notKnown"}], tome["constraints"])
        self.assertEqual([1, 3, 7], tome["replacementLevels"])
        self.assertIn("runtimeReferences", entries["modern4e.class.wizard"]["sharedData"])
        self.assertNotEqual("SUPPORTED", entries["modern4e.class.wizard"]["coverage"]["status"])

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
