"""Observable authoring/export behavior for entry limits and distinct choices."""
import copy
import json
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

from test_modern_feats import BOOK, feats


class FeatSelectionTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.catalog = feats.catalog()
        cls.entries = {entry["title"]: entry for entry in cls.catalog["entries"]}

    def validate(self, entry):
        feats.selection_rules.validate(entry["selection"], entry.get("choices", []),
                                       self.catalog["references"],
                                       {"SKILL": feats.SKILLS, "DAMAGE_TYPE": feats.DAMAGE_TYPES}, "example")

    def test_explicit_limits_and_repeatable_exceptions(self):
        repeatable = {e["title"] for e in self.catalog["entries"] if e["selection"]["maximum"] is None}
        self.assertEqual({"Armor Proficiency", "Weapon Proficiency", "Skill Training", "Linguist", "Adaptable Breath"}, repeatable)
        for entry in self.catalog["entries"]:
            if entry["title"] not in repeatable:
                self.assertEqual({"maximum": 1, "constraints": []}, entry["selection"])
        self.assertEqual(2, self.catalog["schemaVersion"])

    def test_skill_training_uses_character_proficiencies_not_just_previous_feat_picks(self):
        entry = self.entries["Skill Training"]
        choice = entry["choices"][0]
        self.assertEqual(2, choice["count"])
        self.assertEqual(set(feats.SKILLS), set(choice["source"]["values"]))
        self.assertEqual({"scope": "CHARACTER", "fact": "SKILL_PROFICIENCY"}, entry["selection"]["constraints"][0]["against"])
        self.assertEqual("BLOCK", entry["selection"]["constraints"][0]["whenExhausted"])
        self.assertIn("not already proficient", self.catalog["selectionText"][entry["id"]])

    def test_linguist_exhaustion_exception_applies_only_to_the_bonus_skill(self):
        entry = self.entries["Linguist"]
        languages, skill = entry["choices"]
        self.assertEqual((3, "LANGUAGE"), (languages["count"], languages["source"]["catalog"]))
        self.assertEqual(["DIPLOMACY", "SOCIETY", "INSIGHT"], skill["source"]["values"])
        first, second = entry["selection"]["constraints"]
        self.assertEqual({"scope": "CHARACTER", "fact": "LANGUAGE"}, first["against"])
        self.assertEqual("BLOCK", first["whenExhausted"])
        self.assertEqual({"scope": "ENTRY"}, second["against"])
        self.assertEqual("ALLOW_REPEAT", second["whenExhausted"])
        self.assertIn("language", " ".join(self.catalog["limitations"][entry["id"]]).lower())

    def test_breath_excludes_all_existing_power_damage_types_and_preserves_local_pool(self):
        entry = self.entries["Adaptable Breath"]
        self.assertEqual(["ACID", "COLD", "FIRE", "LIGHTNING", "POISON", "NECROTIC", "RADIANT"], entry["choices"][0]["source"]["values"])
        self.assertEqual({"scope": "POWER", "fact": "DAMAGE_TYPE", "entryId": "modern4e.power.dragon-breath"}, entry["selection"]["constraints"][0]["against"])
        self.assertEqual("BLOCK", entry["selection"]["constraints"][0]["whenExhausted"])
        self.assertIn("Dragon Breath", self.catalog["selectionText"][entry["id"]])

    def test_armor_advances_existing_proficiency_and_stops_at_plate(self):
        entry = self.entries["Armor Proficiency"]
        self.assertNotIn("choices", entry)
        self.assertEqual([{"type": "advance", "fact": "ARMOR_PROFICIENCY", "order": ["CLOTH", "LEATHER", "HIDE", "CHAINMAIL", "SCALE", "PLATE"], "steps": 1}], entry["selection"]["constraints"])
        self.assertIn("up to Plate", self.catalog["selectionText"][entry["id"]])

    def test_weapon_bundle_and_superior_weapon_options_are_pending_not_invented(self):
        entry = self.entries["Weapon Proficiency"]
        self.assertEqual({"type": "catalog", "catalog": "WEAPON", "filters": {"proficiencyCategory": "SUPERIOR"}, "bundles": [{"id": "simple-and-military", "proficiencyCategories": ["SIMPLE", "MILITARY"]}]}, entry["choices"][0]["source"])
        self.assertEqual({"scope": "ENTRY"}, entry["selection"]["constraints"][0]["against"])
        self.assertIn("all simple and military weapons", entry["description"])
        self.assertIn("pending migration", " ".join(self.catalog["limitations"][entry["id"]]))

    def test_granted_slot_replacement_and_benefit_conditions_remain_separate(self):
        alchemist = self.entries["Alchemist"]
        self.assertEqual(1, alchemist["selection"]["maximum"])
        self.assertIn("instead of the Technique Master", alchemist["description"])
        shield = self.entries["Distracting Shield"]
        self.assertEqual([], shield["selection"]["constraints"])
        self.assertIn("shield equipped", shield["description"])

    def test_special_text_is_derived_without_feat_ids_and_supports_bounded_counts(self):
        entry = copy.deepcopy(self.entries["Skill Training"])
        entry.update(id="modern4e.power.example", title="Example")
        entry["selection"]["maximum"] = 3
        self.validate(entry)
        text = feats.selection_rules.special_text(entry, self.catalog["references"], noun="power")
        self.assertIn("this power up to 3 times", text)
        self.assertNotIn("feat", text)

    def test_invalid_limits_choices_and_constraints_are_rejected(self):
        changes = [
            (lambda e: e["selection"].update(maximum=True), "positive integer"),
            (lambda e: e["selection"].update(maximum=0), "positive integer"),
            (lambda e: e["selection"].update(maximum=-1), "positive integer"),
            (lambda e: e["selection"].update(maximum=1.5), "positive integer"),
            (lambda e: e["selection"].update(script="true"), "unknown fields"),
            (lambda e: e["selection"].update(constraints={}), "constraint array"),
            (lambda e: e["choices"].append(copy.deepcopy(e["choices"][0])), "duplicate choice ID"),
            (lambda e: e["choices"][0].update(count=True), "positive integer"),
            (lambda e: e["choices"][0].update(count=17), "insufficient distinct options"),
            (lambda e: e["choices"][0]["source"]["values"].append("HEAL"), "unknown option"),
            (lambda e: e["choices"][0]["source"]["values"].append("NATURE"), "duplicate options"),
            (lambda e: e["choices"][0].update(source={"type": "script"}), "unknown choice source"),
            (lambda e: e["choices"][0].update(source={"type": "catalog", "catalog": "LANGUAGE"}), "catalog must match"),
            (lambda e: e["selection"]["constraints"][0].update(choiceId="missing"), "unknown choiceId"),
            (lambda e: e["selection"]["constraints"].append(copy.deepcopy(e["selection"]["constraints"][0])), "duplicate distinct"),
            (lambda e: e["selection"]["constraints"][0].update(whenExhausted="IGNORE"), "exhaustion policy"),
            (lambda e: e["selection"]["constraints"][0]["against"].update(fact="LANGUAGE"), "fact must match"),
            (lambda e: e["selection"]["constraints"][0].update(against={"scope": "UNKNOWN"}), "unknown distinctness scope"),
        ]
        for change, message in changes:
            entry = copy.deepcopy(self.entries["Skill Training"])
            change(entry)
            with self.subTest(message=message), self.assertRaisesRegex(ValueError, "example.*" + message):
                self.validate(entry)
        for target in ["modern4e.class.fighter", "modern4e.power.missing"]:
            entry = copy.deepcopy(self.entries["Adaptable Breath"])
            entry["selection"]["constraints"][0]["against"]["entryId"] = target
            with self.assertRaisesRegex(ValueError, "declared power"):
                self.validate(entry)
        for change in [lambda r: r.update(steps=True), lambda r: r["order"].reverse()]:
            entry = copy.deepcopy(self.entries["Armor Proficiency"])
            change(entry["selection"]["constraints"][0])
            with self.assertRaises(ValueError):
                self.validate(entry)

    @unittest.skipUnless(shutil.which("typst"), "Typst is not installed")
    def test_typst_and_export_render_the_same_selection_rules_for_every_feat(self):
        with tempfile.TemporaryDirectory(dir=BOOK) as directory:
            path = Path(directory) / "selection.typ"
            path.write_text('''#import "../helpers/feat_selection.typ": selectionSpecial
#import "../helpers/feat_requirements.typ": resolveFeat
#let result = (:)
#for section in json("../content/feat-sections.json").sections {
  for feat in json("../content/feats/" + section).feats.map(resolveFeat) {
    result.insert(feat.id, selectionSpecial(feat))
  }
}
#metadata(result)<selection>
''')
            result = subprocess.run(["typst", "query", "--root", str(BOOK), str(path), "<selection>", "--field", "value", "--one"], capture_output=True, text=True)
            self.assertEqual(0, result.returncode, result.stderr)
            self.assertEqual(self.catalog["selectionText"], json.loads(result.stdout))


if __name__ == "__main__":
    unittest.main()
