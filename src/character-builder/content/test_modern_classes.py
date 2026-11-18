"""Authoring behavior, exceptional class shapes and actual Typst consumption."""
import copy
import importlib.util
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

BOOK = Path(__file__).resolve().parents[2] / "modern4e"
SPEC = importlib.util.spec_from_file_location("class_content", BOOK / "scripts/class_content.py")
classes = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(classes)
FIXTURE = Path(__file__).with_name("fixtures") / "classes/exceptional-features.json"
TYPST = os.environ.get("TYPST_BIN") or shutil.which("typst")


class ModernClassesTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.catalog = classes.catalog()
        cls.entries = {e["id"]: e for e in cls.catalog["entries"]}

    def edited(self, edit):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory) / "classes"
            shutil.copytree(classes.CONTENT, root)
            edit(root)
            return classes.catalog(root)

    def file_edit(self, root, filename, edit):
        path = root / filename
        data = classes.shared.load_json(path)
        edit(data)
        path.write_text(json.dumps(data), encoding="utf-8")

    def add_exceptional(self, root):
        fixture = classes.shared.load_json(FIXTURE)
        refs = fixture.pop("references")
        (root / "exceptional.json").write_text(json.dumps(fixture), encoding="utf-8")
        def change(inventory):
            inventory["files"]["features"].append("exceptional.json")
            inventory["references"].update(refs)
        self.file_edit(root, "catalog.json", change)

    def test_fighter_preserves_complete_flavor_and_local_statistics(self):
        fighter = self.entries["modern4e.class.fighter"]
        intro = fighter["flavor"]["introduction"]
        self.assertEqual(3, len(intro))
        self.assertTrue(intro[0].startswith("Fighters crash into the teeth of enemy forces"))
        self.assertIn("calculating mercenaries", intro[1])
        self.assertTrue(intro[2].endswith("those who favor heavy blades."))
        self.assertEqual("You’ll have to deal with me first, dragon!", fighter["flavor"]["quote"])
        self.assertIn("king of the opportunity attack", fighter["flavor"]["gameplay"])
        stats = fighter["statistics"]
        for level, constitution, expected in [(1, 2, 29), (2, 3, 38), (1, -1, 23)]:
            self.assertEqual(expected, stats["health"]["base"] + stats["health"]["perLevel"] * level + stats["health"]["constitutionMultiplier"] * constitution)
        self.assertEqual({"FORTITUDE": 13, "REFLEX": 11, "WILL": 11}, stats["defenses"])
        self.assertEqual(["STRENGTH"], fighter["abilities"]["main"])
        self.assertEqual(["MARTIAL"], fighter["powerSources"])

    def test_independent_build_choices_and_multiple_granted_powers(self):
        root = self.entries["modern4e.class.fighter"]
        features = [self.entries[g["entryId"]] for g in root["grants"]]
        choices = [c for f in features for c in f.get("choices", [])]
        self.assertEqual([2, 3], [len(c["source"]["entryIds"]) for c in choices])
        self.assertEqual([1, 1], [c["count"] for c in choices])
        powers = self.entries["modern4e.feature.combat-reactivity"]["grants"]
        self.assertEqual(["modern4e.power.combat-reactivity", "modern4e.power.combat-reactivity-followup"], [g["entryId"] for g in powers])
        self.assertEqual(3, len([e for e in self.entries.values() if e["category"] == "POWER" and e["source"]["entryId"] == "modern4e.class.fighter"]))
        self.assertNotIn("choices", root)  # Shared power advancement is not duplicated per class.
        self.assertEqual([2, 1, 2], [c["count"] for c in self.catalog["advancement"]["powerChoices"] if c["atLevel"] == 1])
        self.assertEqual("PARTIAL", self.catalog["advancement"]["coverage"]["status"])

    def test_weapon_mapping_scaling_and_unresolved_rule_survive_export(self):
        rows = self.entries["modern4e.feature.melee-weapon-mastery"]["weaponAbilities"]
        self.assertEqual(10, len(rows))
        self.assertEqual("WISDOM", next(r["ability"] for r in rows if r["weaponGroup"] == "POLEARM"))
        power = self.entries["modern4e.power.combat-reactivity-followup"]
        attack = power["activations"][0]["blocks"][0]
        self.assertEqual({"type": "ABILITY", "ability": "STRENGTH"}, attack["roll"]["statistic"])
        self.assertEqual("AC", attack["comparisons"][0]["defense"])
        self.assertEqual(21, attack["comparisons"][0]["outcomes"]["hit"][0]["scaling"][0]["atLevel"])
        self.assertTrue(any("unresolved" in gap for gap in self.catalog["limitations"]["modern4e.feature.combat-superiority"]))
        partial = {key for key, entry in self.entries.items() if entry["coverage"]["status"] == "PARTIAL"}
        self.assertEqual({"modern4e.feature.artificer-techniques", "modern4e.feature.wizard-arcane-techniques"}, partial)
        for key, entry in self.entries.items():
            self.assertEqual("PARTIAL" if key in partial else "UNIMPLEMENTED", entry["coverage"]["status"])
            if key in partial:
                self.assertTrue(any("remain manual" in limitation for limitation in entry["coverage"]["limitations"]))

    def test_renaming_and_moving_do_not_change_identity_or_access(self):
        def edit(root):
            self.file_edit(root, "fighter.json", lambda d: d["classes"][0].update(title="Renamed Fighter"))
            (root / "fighter.json").rename(root / "renamed.json")
            self.file_edit(root, "catalog.json", lambda d: d["files"].update(classes=["renamed.json" if name == "fighter.json" else name for name in d["files"]["classes"]]))
        catalog = self.edited(edit)
        entry = next(e for e in catalog["entries"] if e["id"] == "modern4e.class.fighter")
        self.assertEqual("Renamed Fighter", entry["title"])
        self.assertEqual(self.entries[entry["id"]]["access"], entry["access"])

    def test_exceptional_classes_are_data_not_class_name_branches(self):
        result = self.edited(self.add_exceptional)
        entries = {e["id"]: e for e in result["entries"]}
        balance = entries["modern4e.feature.fixture-balance-of-nature"]["selectionModifiers"][0]
        self.assertEqual(3, balance["count"])
        self.assertEqual({"type": "keywordCount", "keyword": "BEAST_FORM", "minimum": 1, "maximum": 2}, balance["constraints"][1])
        book = entries["modern4e.feature.fixture-spellbook"]
        self.assertEqual(4, book["selectionModifiers"][0]["count"])
        self.assertEqual("FOLLOW_TARGET", book["selectionModifiers"][0]["replacement"])
        prepared = book["choices"][0]
        self.assertNotEqual(prepared["collection"], prepared["requiresCollection"])
        self.assertEqual([2, 3], [step["count"] for step in prepared["count"]["byLevel"]])
        self.assertEqual(4, entries["modern4e.feature.fixture-cantrips"]["choices"][0]["count"])
        self.assertTrue(any("PENDING_MIGRATION" in gap for gap in result["limitations"]["modern4e.feature.fixture-elemental-spirit"]))

    def test_strict_fields_versions_numbers_and_reference_categories(self):
        cases = [
            ("fighter.json", lambda d: d["classes"][0].update(script="evil"), "unknown fields"),
            ("fighter.json", lambda d: d.update(schemaVersion=True), "unsupported schema"),
            ("fighter.json", lambda d: d["classes"][0]["statistics"]["health"].update(base=True), "expected integer"),
            ("fighter.json", lambda d: d["classes"][0]["abilities"].update(main=["HEAL"]), "unknown value"),
            ("fighter.json", lambda d: d["classes"][0]["grants"][0].update(entryId="modern4e.feature.missing"), "undeclared reference"),
            ("fighter.json", lambda d: d["classes"][0]["ruleIds"].append("modern4e.power.combat-challenge"), "category mismatch"),
            ("fighter-features.json", lambda d: d["features"][0].update(id="feat123"), "expected stable"),
            ("fighter-features.json", lambda d: d["features"].append(copy.deepcopy(d["features"][0])), "duplicate entry ID"),
            ("fighter-features.json", lambda d: d["features"][0]["grants"][0].update(atLevel=31), "expected integer"),
            ("fighter-powers.json", lambda d: d["powers"][0]["activations"][0]["usage"].update(frequency="ATWILL"), "unknown value"),
            ("fighter-powers.json", lambda d: d["powers"][2]["activations"][0]["blocks"][0]["comparisons"][0]["outcomes"]["hit"][0]["scaling"].append({"atLevel":21,"text":"Duplicate"}), "unique and ascending"),
        ]
        for filename, change, message in cases:
            with self.subTest(filename=filename, message=message), self.assertRaisesRegex(ValueError, message):
                self.edited(lambda root: self.file_edit(root, filename, change))

    def test_choice_ids_options_and_cycles_are_validated(self):
        cases = [
            (lambda d: d["features"][2]["choices"][0].update(count=3), "insufficient distinct options"),
            (lambda d: d["features"][2]["choices"][0]["source"]["entryIds"].append("modern4e.feature.combat-reactivity"), "duplicate options"),
            (lambda d: d["features"][2]["choices"][0]["source"].update(entryIds=["modern4e.feature.fighter-reactivity"]), "recursive grant/choice cycle"),
            (lambda d: d["features"][2]["choices"].append(copy.deepcopy(d["features"][2]["choices"][0])), "duplicate choice ID"),
            (lambda d: d["features"][0]["grants"].append(copy.deepcopy(d["features"][0]["grants"][0])), "duplicate grant ID"),
        ]
        for change, message in cases:
            with self.subTest(message=message), self.assertRaisesRegex(ValueError, message):
                self.edited(lambda root: self.file_edit(root, "fighter-features.json", change))

    def test_exceptional_constraints_reject_invalid_or_unknown_data(self):
        cases = [
            (lambda d: d["features"][0]["selectionModifiers"][0].update(choiceId="missing"), "unknown target choice"),
            (lambda d: d["features"][0]["selectionModifiers"][0]["constraints"][1].update(minimum=3, maximum=2), "expected integer"),
            (lambda d: d["features"][0]["selectionModifiers"][0]["constraints"][1].update(maximum=4), "exceed selection count"),
            (lambda d: d["features"][1]["choices"][0].update(requiresCollection="modern4e.collection.missing"), "undeclared collection"),
            (lambda d: d["features"][1]["choices"][0]["count"]["byLevel"].reverse(), "unique and ordered"),
            (lambda d: d["features"][1]["selectionModifiers"][0].update(replacement="DELETE_ALL"), "unknown value"),
            (lambda d: d["features"][2].update(coverage={"status":"SUPPORTED","limitations":[]}), "cannot claim SUPPORTED"),
        ]
        for change, message in cases:
            def edit(root):
                self.add_exceptional(root)
                self.file_edit(root, "exceptional.json", change)
            with self.subTest(message=message), self.assertRaisesRegex(ValueError, message):
                self.edited(edit)

    def test_conditions_use_the_shared_closed_vocabulary(self):
        node = {"type":"allOf","conditions":[{"type":"level","minimum":2},{"type":"anyOf","conditions":[{"type":"abilityPoints","ability":"WISDOM","minimum":2},{"type":"entry","entryId":"modern4e.feature.combat-superiority"}]}]}
        result = self.edited(lambda root: self.file_edit(root,"fighter-features.json",lambda d:d["features"][0].update(prerequisites=node)))
        self.assertEqual(node, next(e for e in result["entries"] if e["id"] == "modern4e.feature.combat-challenge")["prerequisites"])
        for node in [{"type":"script","expression":"true"},{"type":"entry","entryId":"missing"}]:
            with self.subTest(node=node), self.assertRaisesRegex(ValueError, "fighter-features.json:features\\[0\\].prerequisites"):
                self.edited(lambda root:self.file_edit(root,"fighter-features.json",lambda d:d["features"][0].update(prerequisites=node)))

    def test_pending_feat_or_technique_choices_preserve_their_gaps(self):
        def edit(root):
            self.file_edit(root, "catalog.json", lambda d: d["references"].update({
                "modern4e.feat.fixture-technique-master": {"category": "FEAT", "title": "Technique Master", "status": "PENDING_MIGRATION"},
                "modern4e.technique.fixture-magic": {"category": "TECHNIQUE", "title": "Magic Technique", "status": "PENDING_MIGRATION"},
            }))
            self.file_edit(root, "fighter-features.json", lambda d: d["features"][2]["choices"][0]["source"].update(entryIds=["modern4e.feat.fixture-technique-master", "modern4e.technique.fixture-magic"]))
        result = self.edited(edit)
        gaps = result["limitations"]["modern4e.feature.fighter-reactivity"]
        self.assertEqual(2, len([gap for gap in gaps if "PENDING_MIGRATION" in gap]))

    def test_inventory_and_duplicate_json_keys_fail_without_output(self):
        with self.assertRaisesRegex(ValueError,"inventory must list"):
            self.edited(lambda root:(root/"unlisted.json").write_text("{}"))
        with self.assertRaisesRegex(ValueError,"duplicate JSON key"):
            self.edited(lambda root:(root/"fighter.json").write_text('{"classes":[],"classes":[]}'))
        with tempfile.TemporaryDirectory() as directory:
            output=Path(directory)/"catalog.json"
            command=["python3",str(BOOK/"scripts/class_content.py"),"--output",str(output)]
            for extra in [[],["--check"]]:
                result=subprocess.run(command+extra,capture_output=True,text=True)
                self.assertEqual(0,result.returncode,result.stderr)
            self.assertEqual(self.catalog,json.loads(output.read_text(encoding="utf-8")))
            output.write_text("{}")
            result=subprocess.run(command+["--check"],capture_output=True,text=True)
            self.assertNotEqual(0,result.returncode)
            self.assertIn("stale",result.stderr)
        result=subprocess.run(["python3",str(BOOK/"scripts/class_content.py"),"--output",str(classes.CONTENT/"fighter.json")],capture_output=True,text=True)
        self.assertNotEqual(0,result.returncode)
        self.assertIn("must not overwrite",result.stderr)

    @unittest.skipUnless(TYPST, "Typst is not on this process PATH and TYPST_BIN is unset")
    def test_typst_reads_the_same_entries_and_shared_power_counts(self):
        with tempfile.TemporaryDirectory(dir=BOOK) as directory:
            path=Path(directory)/"class-query.typ"
            path.write_text('''#import "../helpers/class_content.typ" as c
#metadata(c.entries)<classes>
#metadata(c.initialPowerText(c.entry("modern4e.class.fighter")))<power-text>
''')
            result=subprocess.run([TYPST,"query","--root",str(BOOK),str(path),"<classes>","--field","value","--one"],capture_output=True,text=True)
            self.assertEqual(0,result.returncode,result.stderr)
            actual=json.loads(result.stdout)
            self.assertEqual({key:{k:v for k,v in e.items() if k!="category"} for key,e in self.entries.items()},actual)
            result=subprocess.run([TYPST,"query","--root",str(BOOK),str(path),"<power-text>","--field","value","--one"],capture_output=True,text=True)
            self.assertEqual(0,result.returncode,result.stderr)
            self.assertIn("2 At-Will, 1 Encounter",result.stdout)


if __name__ == "__main__":
    unittest.main()
