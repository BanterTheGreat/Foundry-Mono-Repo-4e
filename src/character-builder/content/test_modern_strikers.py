"""Striker feature packages, revised Barbarian attacks and literal rules tables."""
import json
from pathlib import Path
import shutil
import tempfile
import unittest

from test_modern_classes import BOOK, classes

STRIKERS = ("avenger", "barbarian", "ranger", "rogue", "sorcerer", "warlock")


class ModernStrikersTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.catalog = classes.catalog()
        cls.entries = {e["id"]: e for e in cls.catalog["entries"]}

    def feature(self, title, class_name):
        data = classes.shared.load_json(classes.CONTENT / (class_name + "-features.json"))
        return next(f for f in data["features"] if f["title"] == title and any(g["entryId"] == f["id"] for g in self.entries["modern4e.class." + class_name]["grants"]))

    def test_all_six_strikers_and_all_local_classes_are_migrated(self):
        self.assertEqual(set(STRIKERS), {e["id"].split(".")[-1] for e in self.entries.values() if e["category"] == "CLASS" and e["role"] == "STRIKER"})
        self.assertEqual(19, len([e for e in self.entries.values() if e["category"] == "CLASS"]))
        expected = {
            "avenger": (["WISDOM"], 18, 6, 7), "barbarian": (["STRENGTH"], 19, 6, 8),
            "ranger": (["STRENGTH", "DEXTERITY"], 17, 5, 6), "rogue": (["DEXTERITY"], 17, 5, 6),
            "sorcerer": (["CHARISMA"], 17, 5, 6), "warlock": (["CHARISMA", "CONSTITUTION"], 17, 5, 6),
        }
        for name, (abilities, base, per_level, surges) in expected.items():
            with self.subTest(name=name):
                e = self.entries["modern4e.class." + name]
                self.assertEqual(e["abilities"]["main"], abilities)
                self.assertEqual(e["statistics"]["health"], {"base": base, "perLevel": per_level, "constitutionMultiplier": 2})
                self.assertEqual(e["statistics"]["healingSurges"]["base"], surges)
        self.assertEqual(self.entries["modern4e.class.rogue"]["proficiencies"]["shields"], ["LIGHT_SHIELD"])

    def test_barbarian_and_ranger_have_one_power_source_each(self):
        self.assertEqual(self.entries["modern4e.class.barbarian"]["powerSources"], ["PRIMAL"])
        self.assertEqual(self.entries["modern4e.class.ranger"]["powerSources"], ["MARTIAL"])

    def test_feature_choice_counts_and_package_grants(self):
        expected = [("avenger", "Vindicator’s Censure", 3), ("barbarian", "Feral Might", 4), ("ranger", "Fighting Style", 4), ("ranger", "Hunter’s Specialization", 2), ("rogue", "Rogue Tactics", 4), ("rogue", "Rogue Weapon Talent", 2), ("sorcerer", "Spell Source", 4), ("warlock", "Eldritch Attack", 2), ("warlock", "Eldritch Pact", 5)]
        for name, title, count in expected:
            with self.subTest(title=title):
                choice = self.feature(title, name)["choices"][0]
                self.assertEqual(choice["count"], 1)
                self.assertEqual(len(choice["source"]["entryIds"]), count)
        pact = self.feature("Eldritch Pact", "warlock")["choices"][0]
        packages = [self.entries[key] for key in pact["source"]["entryIds"]]
        self.assertEqual([len(p["grants"]) for p in packages], [2, 2, 2, 3, 2])

    def test_warlock_granted_at_wills_disable_standard_selectable_slot(self):
        feature = self.feature("Eldritch Attack", "warlock")
        self.assertEqual(feature["selectionModifiers"], [{"choiceId": "modern4e.choice.class-attack-at-will", "count": 0, "constraints": []}])
        self.assertEqual(self.entries["modern4e.rule.warlock-initial-powers"]["description"], "You may choose 1 Encounter and 2 Daily Warlock Powers.")
        for title in ("Warlock's Curse", "Soul Pyre"):
            power = next(e for e in self.entries.values() if e["category"] == "POWER" and e["title"] == title)
            self.assertEqual(power["activations"][0]["usage"]["limits"], [{"period": "TURN", "maximum": {"base": 1}}])
        soul = next(e for e in self.entries.values() if e["category"] == "POWER" and e["title"] == "Soul Pyre")
        self.assertIn("on the triggering enemy", soul["activations"][0]["range"]["text"])

    def test_all_96_revised_barbarian_powers_are_selectable_not_granted(self):
        all_powers = classes.shared.load_json(classes.CONTENT / "barbarian-attack-powers.json")["powers"]
        powers = [p for p in all_powers if p["level"] <= 9]
        self.assertEqual({1, 3, 5, 7, 9, 13, 15, 17, 19}, {p["level"] for p in all_powers})
        self.assertEqual(len(powers), 96)
        self.assertEqual(len({p["id"] for p in powers}), 96)
        self.assertEqual({p["level"] for p in powers}, {1, 3, 5, 7, 9})
        self.assertEqual({p["activations"][0]["usage"]["frequency"] for p in powers}, {"AT_WILL", "ENCOUNTER", "DAILY"})
        for p in powers:
            self.assertEqual(p["access"], {"type": "entry", "entryId": "modern4e.class.barbarian"})
            self.assertEqual(p["subtitle"], "Level " + str(p["level"]))
            self.assertEqual(p["powerKind"], "ATTACK")
        self.assertFalse({p["id"] for p in powers} & {g["entryId"] for g in self.entries["modern4e.class.barbarian"]["grants"]})
        source = (BOOK / "classes/barbarian-primal-powers.typ").read_text(encoding="utf-8")
        self.assertEqual(source.count("#content.powerCard("), 96)
        self.assertNotIn("#powers.power(", source)

    def test_barbarian_pre_attack_effect_and_secondary_attack_are_scoped(self):
        pressing = next(e for e in self.entries.values() if e["category"] == "POWER" and e["title"] == "Pressing Strike")
        blocks = pressing["activations"][0]["blocks"]
        self.assertEqual([b["type"] for b in blocks], ["effect", "attack"])
        self.assertIn("Before the attack", blocks[0]["text"])
        self.assertEqual(blocks[1]["comparisons"][0]["outcomes"]["hit"][0]["scaling"][0]["atLevel"], 11)
        roaring = next(e for e in self.entries.values() if e["category"] == "POWER" and e["title"] == "Roaring Challenge")
        attacks = [b for b in roaring["activations"][0]["blocks"] if b["type"] == "attack"]
        self.assertEqual(len(attacks), 2)
        self.assertEqual(attacks[1]["range"], {"type": "CLOSE_BLAST", "size": {"base": 3}, "origin": "self"})
        self.assertEqual(attacks[1]["roll"]["statistic"]["ability"], "CHARISMA")

    def test_sneak_attack_and_damage_type_tables_preserve_local_values(self):
        sneak = self.feature("Sneak Attack", "rogue")
        table = next(s for s in sneak["sections"] if s["type"] == "table")
        self.assertEqual([row[1] for row in table["rows"]], ["2d6", "3d6", "5d6"])
        for filename, title, rows in [("sorcerer-features.json", "Wild Magic", 10), ("warlock-features.json", "Elemental Pact", 5)]:
            entry = next(e for e in classes.shared.load_json(classes.CONTENT / filename)["features"] if e["title"] == title)
            table = next(s for s in entry["sections"] if s["type"] == "table")
            self.assertEqual(len(table["rows"]), rows)
            self.assertEqual(table["style"], "COMPACT")

    def test_predeclared_identities_and_no_typst_programs_in_rules(self):
        refs = classes.shared.load_json(BOOK / "content/feat-references.json")["entries"]
        keys = [k for k, v in refs.items() if v.get("source") in {"classes/" + n + ".typ" for n in STRIKERS} and v["category"] in ("FEATURE", "POWER")]
        self.assertTrue(all(k in self.entries for k in keys))
        for name in STRIKERS:
            source = (BOOK / "classes" / (name + ".typ")).read_text(encoding="utf-8")
            self.assertIn("content.classReference(classData)", source)
            self.assertNotIn("#powers.power(", source)
        for e in self.entries.values():
            self.assertNotRegex(json.dumps(e), r"#(?:powers|classes|theme|table|block)\b")

    def test_zero_modifier_is_valid_but_zero_player_choice_is_not(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            shutil.copytree(classes.CONTENT, root, dirs_exist_ok=True)
            path = root / "warlock-features.json"
            data = classes.shared.load_json(path)
            feature = next(f for f in data["features"] if f["title"] == "Eldritch Attack")
            feature["choices"][0]["count"] = 0
            path.write_text(json.dumps(data), encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "expected integer"):
                classes.catalog(root)


if __name__ == "__main__":
    unittest.main()
