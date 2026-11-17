"""Controller source rules, acquisition exceptions and preparation table."""
import json
from pathlib import Path
import shutil
import tempfile
import unittest

from test_modern_classes import BOOK, classes


class ModernControllersTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.catalog = classes.catalog()
        cls.entries = {e["id"]: e for e in cls.catalog["entries"]}

    def named(self, title):
        return next(e for e in self.entries.values() if e["category"] == "FEATURE" and e["title"] == title)

    def test_all_controllers_preserve_local_reference_panels(self):
        self.assertEqual({e["title"] for e in self.entries.values() if e["category"] == "CLASS" and e["role"] == "CONTROLLER"}, {"Druid", "Invoker", "Wizard"})
        for name, main, hp_base, hp_level, surges in [("druid", "WISDOM", 17, 5, 7), ("invoker", "WISDOM", 16, 4, 6), ("wizard", "INTELLIGENCE", 16, 4, 6)]:
            with self.subTest(name=name):
                e = self.entries["modern4e.class." + name]
                self.assertEqual(e["abilities"]["main"], [main])
                self.assertEqual(e["statistics"]["health"], {"base": hp_base, "perLevel": hp_level, "constitutionMultiplier": 2})
                self.assertEqual(e["statistics"]["healingSurges"]["base"], surges)
                page = (BOOK / "classes" / (name + ".typ")).read_text(encoding="utf-8")
                self.assertIn("content.classReference(classData)", page)
                self.assertNotIn("#powers.power(", page)

    def test_druid_initial_choices_preserve_beast_form_bounds(self):
        modifier = self.named("Balance of Nature")["selectionModifiers"][0]
        self.assertEqual(modifier["choiceId"], "modern4e.choice.class-attack-at-will")
        self.assertEqual(modifier["count"], 3)
        self.assertIn({"type": "keywordCount", "keyword": "BEAST_FORM", "minimum": 1, "maximum": 2}, modifier["constraints"])
        self.assertEqual(len(self.named("Primal Aspect")["choices"][0]["source"]["entryIds"]), 4)
        shape = next(e for e in self.entries.values() if e["category"] == "POWER" and e["title"] == "Wild Shape")
        self.assertEqual(shape["activations"][0]["usage"]["limits"], [{"period": "ROUND", "maximum": {"base": 1}}])

    def test_wizard_stored_and_prepared_powers_are_separate_decisions(self):
        book = self.named("Spellbook")
        modifier = book["selectionModifiers"][0]
        self.assertEqual(modifier["count"], 4)
        self.assertEqual(modifier["replacement"], "FOLLOW_TARGET")
        choice = book["choices"][0]
        self.assertEqual(choice["count"]["byLevel"], [{"atLevel": 1, "count": 2}, {"atLevel": 5, "count": 3}])
        self.assertEqual(choice["requiresCollection"], modifier["collection"])
        self.assertNotEqual(choice["collection"], choice["requiresCollection"])
        self.assertEqual(self.named("Cantrips")["choices"][0]["count"], 4)
        self.assertEqual(len(self.named("Cantrips")["choices"][0]["source"]["entryIds"]), 9)
        self.assertEqual(len(self.named("Arcane Implement Mastery")["choices"][0]["source"]["entryIds"]), 6)

    def test_preparation_table_matches_all_original_thresholds(self):
        table = next(s for s in self.named("Spellbook")["sections"] if s["type"] == "table")
        self.assertEqual(table["columns"], ["Level", "Daily", "Utility"])
        self.assertEqual(table["rows"], [["1", "2", "-"], ["2-4", "2", "1"], ["5", "3", "1"], ["6-8", "3", "2"], ["9", "3", "2"], ["10-15", "3", "3"], ["16-21", "3", "4"], ["22-30", "3", "5"]])

    def test_invoker_covenants_share_channel_divinity_without_invented_attacks(self):
        self.assertEqual(len(self.named("Divine Covenant")["choices"][0]["source"]["entryIds"]), 3)
        powers = [e for e in self.entries.values() if e["category"] == "POWER" and e["source"]["entryId"] == "modern4e.class.invoker"]
        self.assertEqual(len(powers), 4)
        for power in powers:
            activation = power["activations"][0]
            self.assertEqual(activation["usage"]["limits"][0]["poolId"], "modern4e.resource.channel-divinity")
            if power["title"] != "Rebuke Undead":
                self.assertTrue(all(b["type"] != "attack" for b in activation["blocks"]))
                self.assertIn("without a defense", power["note"])

    def test_predeclared_controller_identities_are_retained(self):
        refs = classes.shared.load_json(BOOK / "content/feat-references.json")["entries"]
        matched = [k for k, v in refs.items() if v.get("source") in {"classes/" + n + ".typ" for n in ("druid", "invoker", "wizard")} and v["category"] in ("FEATURE", "POWER")]
        self.assertEqual(len(matched), 15)
        self.assertTrue(all(k in self.entries for k in matched))

    def test_malformed_preparation_table_fails_authoring_validation(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            shutil.copytree(classes.CONTENT, root, dirs_exist_ok=True)
            path = root / "wizard-features.json"
            data = classes.shared.load_json(path)
            book = next(e for e in data["features"] if e["title"] == "Spellbook")
            next(s for s in book["sections"] if s["type"] == "table")["rows"][0].pop()
            path.write_text(json.dumps(data), encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "table row width"):
                classes.catalog(root)


if __name__ == "__main__":
    unittest.main()
