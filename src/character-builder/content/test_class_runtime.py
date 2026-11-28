"""Observable authoring-to-engine contract and deterministic Fighter goldens."""
import json
from pathlib import Path
import shutil
import tempfile
import unittest

import class_runtime
import runtime_common


class ClassRuntimeTest(unittest.TestCase):
    def test_warlock_curse_summary_preserves_the_class_power_and_shadow_walk(self):
        entries = {e["id"]: e for e in runtime_common.entries_of(
            class_runtime.build(class_ids=["modern4e.class.warlock"], include_advancement=False)
        )}
        summary_id = "modern4e.feature.warlock-warlock-s-curse"
        power_id = "modern4e.power.warlock-warlock-s-curse"
        summary = entries[summary_id]
        self.assertEqual("GRANT_SUMMARY", summary["presentation"]["grantDisplay"])
        self.assertIn(summary_id, {g["entryId"] for g in entries["modern4e.class.warlock"]["mechanics"]["grants"]})
        self.assertEqual([power_id], [g["entryId"] for g in summary["mechanics"]["grants"]])
        self.assertEqual("POWER", entries[power_id]["category"])
        self.assertNotIn("grantDisplay", entries[power_id]["presentation"])
        self.assertNotIn("grantDisplay", entries["modern4e.feature.warlock-shadow-walk"]["presentation"])
        for slug in ("eldritch-attack", "eldritch-pact"):
            feature = entries[f"modern4e.feature.warlock-{slug}"]
            self.assertEqual("CHOICE_INTRODUCTION", feature["presentation"]["grantDisplay"])
            self.assertTrue(feature["mechanics"]["choices"])

    def test_replacement_references_in_grants_and_progressions_must_resolve(self):
        for field in ("grants", "progression"):
            grant = {"type": "entry", "grantId": "techniques", "entryId": "default", "replacementEntryIds": ["missing"]}
            mechanics = {"grants": [grant]} if field == "grants" else {"progression": [{"level": 2, "grants": [grant]}]}
            assets = {"test/entries.json": {"id": "entries", "entries": [
                {"id": "source", "mechanics": mechanics}, {"id": "default", "mechanics": {}}]}}
            self.assertIn("missing", runtime_common.referenced_ids(assets["test/entries.json"]["entries"][0]))
            with self.assertRaisesRegex(ValueError, "mechanical reference missing is absent"):
                runtime_common.validate_references(assets)

    def test_only_authored_class_features_grant_the_technique_master_substitution(self):
        entries = {e["id"]: e for e in runtime_common.entries_of(class_runtime.build())}
        grants = [(entry["id"], grant) for entry in entries.values() for grant in entry["mechanics"]["grants"]
                  if grant.get("replacementEntryIds")]
        self.assertEqual({"modern4e.feature.artificer-techniques", "modern4e.feature.wizard-arcane-techniques"},
                         {entry_id for entry_id, _ in grants})
        self.assertEqual(2, len(grants))
        for entry_id, grant in grants:
            self.assertEqual("modern4e.feat.technique-master", grant["entryId"])
            self.assertEqual(["modern4e.feat.alchemist"], grant["replacementEntryIds"])
            self.assertEqual(1, grant["atLevel"])
            self.assertIn("Known rituals and formulas are tracked in Stats.", " ".join(entries[entry_id]["coverage"]["limitations"]))
            self.assertEqual([], entries[entry_id]["mechanics"]["choices"])

    def test_invalid_or_duplicate_grant_substitutions_are_rejected_at_authoring(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory) / "classes"
            shutil.copytree(class_runtime.authoring.CONTENT, root)
            path = root / "artificer-features.json"
            original = json.loads(path.read_text(encoding="utf-8"))
            for replacements, message in [(["modern4e.feat.alchemist", "modern4e.feat.alchemist"], "duplicate grant replacement"),
                                          (["modern4e.feat.technique-master"], "duplicate grant replacement"),
                                          (["modern4e.feature.artificer-techniques"], "reference category mismatch")]:
                data = json.loads(json.dumps(original))
                entry = next(e for e in data["features"] if e["id"] == "modern4e.feature.artificer-techniques")
                entry["grants"][0]["replacementEntryIds"] = replacements
                path.write_text(json.dumps(data), encoding="utf-8")
                with self.assertRaisesRegex(ValueError, message):
                    class_runtime.build(root)

    def test_fighter_exact_runtime_golden_and_independent_choices(self):
        assets = class_runtime.build(class_ids=["modern4e.class.fighter"], include_advancement=False)
        chunk = {"id": "entries", "entries": runtime_common.entries_of(assets)}
        golden = Path(__file__).parents[1] / "shared/fixtures/shared-fighter-chunk.json"
        self.assertEqual(json.loads(golden.read_text(encoding="utf-8")), chunk)
        self.assertEqual(assets, class_runtime.build(class_ids=["modern4e.class.fighter"], include_advancement=False))
        entries = {e["id"]: e for e in chunk["entries"]}
        fighter = entries["modern4e.class.fighter"]
        self.assertEqual(4, len(fighter["mechanics"]["grants"]))
        statistics = fighter["mechanics"]["classProfile"]["statistics"]
        self.assertEqual(18, statistics["HIT_POINTS"]["base"])
        self.assertEqual({"base": 13}, statistics["FORTITUDE"])
        self.assertEqual({"base": 11}, statistics["REFLEX"])
        self.assertEqual({"base": 11}, statistics["WILL"])
        for name in ("fighter-reactivity", "fighter-specialization"):
            feature = entries["modern4e.feature." + name]
            self.assertEqual("CHOICE_INTRODUCTION", feature["presentation"]["grantDisplay"])
            self.assertEqual("modern4e.choice." + name, feature["mechanics"]["choices"][0]["id"])
        self.assertNotIn("grantDisplay", entries["modern4e.feature.combat-reactivity"]["presentation"])
        self.assertEqual(2, len(entries["modern4e.feature.combat-reactivity"]["mechanics"]["grants"]))
        talent = entries["modern4e.feature.one-handed-weapon-talent"]
        self.assertEqual("ONE_HANDED_WEAPON", talent["mechanics"]["conditionalModifiers"][0]["condition"])
        self.assertNotIn("modifiers", talent["mechanics"])
        self.assertEqual("SUPPORTED", entries["modern4e.power.combat-challenge"]["coverage"]["status"])

    def test_conditions_preserve_grouping_and_unresolved_queries(self):
        node = {"type": "allOf", "conditions": [{"type": "classPowerSource", "powerSource": "MARTIAL"},
                {"type": "anyOf", "conditions": [{"type": "entry", "entryId": "x"},
                 {"type": "unresolved", "text": "ambiguous", "reason": "not decided"}]}]}
        self.assertEqual(node, class_runtime.condition(node))
        self.assertEqual("unresolved", class_runtime.condition({"type": "size", "size": "SMALL"})["type"])

    def test_collections_queries_and_overrides_compile_losslessly(self):
        chunk = {"entries": runtime_common.entries_of(class_runtime.build())}
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
            entries = runtime_common.entries_of(class_runtime.build(root))
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
        entries = {entry["id"]: entry for entry in runtime_common.entries_of(class_runtime.build())}
        book = entries["modern4e.feature.wizard-spellbook"]["mechanics"]
        modifiers = {modifier["choiceId"]: modifier for modifier in book["selectionModifiers"]}
        self.assertEqual(4, modifiers["modern4e.choice.class-attack-daily"]["count"])
        self.assertEqual(2, modifiers["modern4e.choice.class-utility-2"]["count"])
        self.assertEqual(2, modifiers["modern4e.choice.class-utility-17"]["count"])
        self.assertEqual(modifiers["modern4e.choice.class-utility-10"]["collection"], modifiers["modern4e.choice.class-utility-17"]["collection"])
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
        self.assertEqual([1, 3, 7, 13, 17], tome["replacementLevels"])
        self.assertEqual([1, 3, 7], entries["modern4e.feature.tome-of-readiness"]["sharedData"]["choices"][0]["replacementLevels"])
        self.assertIn("runtimeReferences", entries["modern4e.class.wizard"]["sharedData"])
        # The class entry itself is complete; its unresolved technique catalog is flagged on the feature entries.
        self.assertEqual("SUPPORTED", entries["modern4e.class.wizard"]["coverage"]["status"])

    def test_local_formula_changes_output_and_malformed_source_fails(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory) / "classes"
            shutil.copytree(class_runtime.authoring.CONTENT, root)
            path = root / "fighter.json"
            data = json.loads(path.read_text(encoding="utf-8"))
            data["classes"][0]["statistics"]["health"]["base"] = 23
            path.write_text(json.dumps(data), encoding="utf-8")
            chunk = {"entries": runtime_common.entries_of(class_runtime.build(root, ["modern4e.class.fighter"]))}
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
