"""Shared authoring behavior, migration regressions and Typst/compiler agreement."""
import copy
import importlib.util
import json
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest

import build


BOOK = build.ROOT / "src/modern4e"
spec = importlib.util.spec_from_file_location("feats", BOOK / "scripts/feats.py")
feats = importlib.util.module_from_spec(spec)
spec.loader.exec_module(feats)


class ModernFeatsTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.catalog = feats.catalog()
        cls.entries = {entry["id"]: entry for entry in cls.catalog["entries"]}

    def edited(self, edit):
        with tempfile.TemporaryDirectory() as directory:
            content = Path(directory)
            shutil.copytree(BOOK / "content/feats", content / "feats")
            for name in ("feat-references.json", "feat-sections.json"):
                shutil.copyfile(BOOK / "content" / name, content / name)
            edit(content)
            return feats.catalog(content)

    def edit_file(self, content, section, edit):
        path = content / "feats" / section
        data = feats.load_json(path)
        edit(data)
        path.write_text(json.dumps(data), encoding="utf-8")

    def named(self, title):
        return [e for e in self.entries.values() if e["title"] == title]

    def test_complete_catalog_has_stored_unique_ids_and_unchanged_section_order(self):
        self.assertEqual(818, len(self.entries))
        self.assertEqual(93, len(self.catalog["sections"]))
        for section, ids in self.catalog["sections"].items():
            authored = feats.load_json(BOOK / "content/feats" / section)["feats"]
            self.assertEqual([entry["id"] for entry in authored], ids)
        self.assertTrue(all("requirements" not in entry for entry in self.entries.values()))
        self.assertEqual("modern4e.feat.deep-gash", self.named("Deep Gash")[0]["id"])

    def test_initial_slug_is_convenience_not_identity(self):
        self.assertEqual("hunters-advantage", feats.slug("Hunter’s Advantage"))
        original = self.named("Deep Gash")[0]["id"]
        changed = self.edited(lambda c: self.edit_file(c, "heroic/fighter.json", lambda d: d["feats"][0].update(title="A Different Name")))
        self.assertEqual("A Different Name", next(e for e in changed["entries"] if e["id"] == original)["title"])

    def test_same_title_variants_do_not_overwrite_each_other(self):
        variants = self.named("Bloodthirsty Visage")
        self.assertEqual(2, len(variants))
        self.assertNotEqual(variants[0]["id"], variants[1]["id"])
        self.assertNotEqual(variants[0]["description"], variants[1]["description"])
        self.assertEqual(2, len(self.named("Armor of Burning Wrath")))

    def test_access_is_explicit_and_multiclass_target_is_not_a_class_requirement(self):
        fighter = self.named("Deep Gash")[0]
        self.assertEqual({"type": "entry", "entryId": "modern4e.class.fighter"}, fighter["access"])
        self.assertEqual({"type": "always"}, self.named("Alertness")[0]["access"])
        orc = self.named("Furious Devotion")[0]
        self.assertEqual({"type": "entry", "entryId": "modern4e.ancestry.orc"}, orc["access"])
        self.assertEqual(["classPowerSource", "entry"], [c["type"] for c in orc["prerequisites"]["conditions"]])
        student = self.named("Student of the Sword")[0]
        self.assertEqual("modern4e.class.fighter", student["multiclassFor"])
        self.assertEqual(["MULTICLASS"], student["tags"])
        self.assertEqual({"type": "always"}, student["access"])

    def test_access_survives_moving_a_file(self):
        def move(content):
            (content / "feats/heroic/fighter.json").rename(content / "feats/heroic/renamed-section.json")
            path = content / "feat-sections.json"
            data = feats.load_json(path)
            data["sections"][data["sections"].index("heroic/fighter.json")] = "heroic/renamed-section.json"
            path.write_text(json.dumps(data))
        self.assertEqual(self.catalog["entries"], self.edited(move)["entries"])

    def test_nested_boolean_ability_and_level_requirements(self):
        node = self.named("Lightning Arc")[0]["prerequisites"]
        self.assertEqual("allOf", node["type"])
        level, alternatives = node["conditions"]
        self.assertEqual({"type": "level", "minimum": 11}, level)
        self.assertEqual("anyOf", alternatives["type"])
        self.assertEqual(["CONSTITUTION", "DEXTERITY"], [c["ability"] for c in alternatives["conditions"]])
        self.assertEqual("11th level, (3 Constitution or 3 Dexterity)", self.catalog["requirementText"][self.named("Lightning Arc")[0]["id"]])

    def test_equipment_size_queries_and_feat_dependencies(self):
        self.assertEqual("anyOf", self.named("Lost in the Crowd")[0]["prerequisites"]["type"])
        self.assertEqual({"type": "equipmentProficiency", "equipment": "LEATHER"}, self.named("Armored Sorcerer")[0]["prerequisites"])
        novice = self.named("Novice Power")[0]["prerequisites"]["conditions"]
        self.assertEqual({"multiclass": True, "classSpecific": True}, novice[1]["filters"])
        self.assertEqual({"usage": "ENCOUNTER", "hasLevel": True}, novice[2]["filters"])
        immutability = self.named("Immutability")[0]["prerequisites"]
        self.assertEqual(self.named("Improved Warforged Resolve")[0]["id"], immutability["entryId"])

    def test_unknown_and_ambiguous_requirements_remain_visible(self):
        for title, text in [("Improved Fate of the Void", "2 Constitution or Charisma"), ("Feral Companion", "Combined attack druid attack power"), ("Prophetic Preparation", "Vistani Heritage")]:
            entry = self.named(title)[0]
            self.assertIn(text, self.catalog["requirementText"][entry["id"]])
            self.assertTrue(self.catalog["limitations"][entry["id"]])
        unavailable = self.catalog["references"]["modern4e.ancestry.eladrin"]
        self.assertEqual("UNAVAILABLE", unavailable["status"])

    def test_effect_conditions_and_repetition_are_not_misread_as_prerequisites(self):
        shield = self.named("Distracting Shield")[0]
        self.assertEqual({"type": "abilityPoints", "ability": "WISDOM", "minimum": 3}, shield["prerequisites"])
        self.assertIn("shield equipped", shield["description"])
        armor = self.named("Armor Proficiency")[0]
        self.assertIn("more than once", self.catalog["selectionText"][armor["id"]])
        self.assertNotIn("more than once", armor["description"])

    def test_duplicate_ids_unknown_fields_and_missing_inventory_are_rejected(self):
        cases = [
            (lambda d: d["feats"].append(copy.deepcopy(d["feats"][0])), "duplicate feat ID"),
            (lambda d: d["feats"][0].update(requirements="3 Constitution"), "unknown fields"),
            (lambda d: d["feats"][0].update(id="feat123"), "expected stable"),
            (lambda d: d.update(schemaVersion=True), "unsupported schema"),
        ]
        for change, message in cases:
            with self.subTest(message=message), self.assertRaisesRegex(ValueError, message):
                self.edited(lambda c: self.edit_file(c, "heroic/fighter.json", change))
        with self.assertRaisesRegex(ValueError, "every feat JSON"):
            self.edited(lambda c: (c / "feats/heroic/fighter.json").unlink())

    def test_invalid_conditions_fail_with_the_authoring_location(self):
        cases = [
            None,
            {"type": []},
            {"type": "entry", "entryId": "modern4e.feat.missing"},
            {"type": "proficiency", "skill": "HEAL"},
            {"type": "allOf", "conditions": []},
            {"type": "abilityPoints", "ability": "CONSTITUTION", "minimum": True},
            {"type": "abilityPoints", "ability": "CONSTITUTION", "minimum": -2},
            {"type": "level", "minimum": 31},
            {"type": "classPowerSource", "powerSource": "UNKNOWN"},
            {"type": "size", "size": "SMOL"},
            {"type": "equipmentProficiency", "equipment": "ROBE"},
            {"type": "unresolved", "text": "Mystery", "reason": ""},
            {"type": "selected", "category": "POWER", "filters": {"usage": "DAILY", "hasLevel": True}},
            {"type": "script", "expression": "true"},
        ]
        for node in cases:
            with self.subTest(node=node), self.assertRaisesRegex(ValueError, r"fighter.json:feats\[0\].prerequisites"):
                self.edited(lambda c: self.edit_file(c, "heroic/fighter.json", lambda d: d["feats"][0].update(prerequisites=node)))
        with self.assertRaisesRegex(ValueError, "access supports"):
            self.edited(lambda c: self.edit_file(c, "heroic/fighter.json", lambda d: d["feats"][0].update(access={"type": "level", "minimum": 1})))

    def test_compiler_preserves_structured_local_data_without_compendium_reads(self):
        assets = build.modern_feats()
        self.assertEqual({"modern4e.feats/catalog.json": self.catalog}, assets)
        self.assertEqual(build.serialize(assets), build.serialize(build.modern_feats()))
        with tempfile.TemporaryDirectory() as directory:
            command = [sys.executable, str(Path(build.__file__)), "--modern-feats", "--output", directory]
            for extra in ([], ["--check"]):
                result = subprocess.run(command + extra, capture_output=True, text=True)
                self.assertEqual(0, result.returncode, result.stderr)
            path = Path(directory) / "modern4e.feats/catalog.json"
            self.assertEqual(self.catalog, json.loads(path.read_text()))
            path.write_text("{}")
            result = subprocess.run(command + ["--check"], capture_output=True, text=True)
            self.assertNotEqual(0, result.returncode)
            self.assertIn("stale", result.stderr)

    def test_modern_build_rejects_conflicting_modes_and_source_output(self):
        command = [sys.executable, str(Path(build.__file__)), "--modern-feats"]
        for extra, message in [
            (["--config", str(Path(build.__file__).with_name("full.json"))], "not allowed"),
            (["--output", str(BOOK / "content/feats")], "must not overwrite shared authoring"),
        ]:
            result = subprocess.run(command + extra, capture_output=True, text=True)
            self.assertNotEqual(0, result.returncode)
            self.assertIn(message, result.stderr)

    @unittest.skipUnless(shutil.which("typst"), "Typst is not installed")
    def test_typst_and_builder_render_the_same_requirements_for_every_feat(self):
        with tempfile.TemporaryDirectory(dir=BOOK) as directory:
            path = Path(directory) / "requirements.typ"
            path.write_text('''#import "../helpers/feat_requirements.typ": featRequirements
#let result = (:)
#for section in json("../content/feat-sections.json").sections {
  for feat in json("../content/feats/" + section).feats {
    result.insert(feat.id, featRequirements(feat))
  }
}
#metadata(result)<requirements>
''')
            result = subprocess.run(["typst", "query", "--root", str(BOOK), str(path), "<requirements>", "--field", "value", "--one"], capture_output=True, text=True)
            self.assertEqual(0, result.returncode, result.stderr)
            expected = {key: value or None for key, value in self.catalog["requirementText"].items()}
            self.assertEqual(expected, json.loads(result.stdout))


if __name__ == "__main__":
    unittest.main()
