"""Defender, Controller, Striker and Leader attacks use reviewed local JSON, with published provenance retained."""
import json
from pathlib import Path
import re
import sys
import unittest
from unittest.mock import patch

import class_runtime
import runtime_common

SCRIPTS = Path(__file__).resolve().parents[2] / "modern4e/scripts"
sys.path.insert(0, str(SCRIPTS))
import compendium
import import_class_attacks as migration

# Barbarian's revised attacks and Fighter's are authored and covered separately.
CLASSES = ("Paladin", "Swordmage", "Warden", "Druid", "Invoker", "Wizard", "Avenger", "Ranger", "Rogue",
           "Sorcerer", "Warlock", "Artificer", "Bard", "Cleric", "Runepriest", "Shaman", "Warlord")
STOCK_TERMS = re.compile(r"\b(?:Dungeoneering|Streetwise|Heal check|(?:Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma) modifiers?)\b")


class ClassAttacksTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.powers = {}
        for name in CLASSES:
            path = class_runtime.authoring.CONTENT / f"{name.lower()}-attack-powers.json"
            cls.powers[name] = json.loads(path.read_text(encoding="utf-8"))["powers"]

    def test_complete_level_fifteen_boundary_and_independent_identities(self):
        everything = [p for powers in self.powers.values() for p in powers]
        self.assertEqual(len(everything), len({p["id"] for p in everything}))
        for name, powers in self.powers.items():
            with self.subTest(name):
                rows = migration.importable_rows(name)
                self.assertEqual(len(rows), len(powers))
                self.assertEqual({row["ID"] for row in rows}, {p["source"]["entryId"] for p in powers})
                self.assertTrue(all(1 <= p["level"] <= 15 for p in powers))
                self.assertEqual({"AT_WILL", "ENCOUNTER", "DAILY"},
                                 {p["activations"][0]["usage"]["frequency"] for p in powers})
                for power in powers:
                    self.assertEqual(f"modern4e.power.{name.lower()}-{power['source']['entryId']}", power["id"])
                    self.assertEqual({"type": "entry", "entryId": f"modern4e.class.{name.lower()}"}, power["access"])
                    self.assertEqual("ATTACK", power["powerKind"])
                    self.assertEqual(f"{name} Attack {power['level']}", power["subtitle"])
                    self.assertNotEqual("SUPPORTED", power["coverage"]["status"])
                    self.assertEqual({"type": "level", "minimum": power["level"]},
                                     power["prerequisites"]["conditions"][0] if power["prerequisites"]["type"] == "allOf"
                                     else power["prerequisites"])

    def test_source_rules_retained_and_reviewed_text_uses_local_rules(self):
        cache = {}
        for name, powers in self.powers.items():
            for power in powers:
                source_id = power["source"]["entryId"]
                path = compendium.batch_path("power", source_id)
                if path not in cache:
                    cache[path] = compendium.payload(path)[-1]
                self.assertEqual(migration.text(cache[path][source_id]), power["source"]["rulesText"], power["id"])
                reviewed = json.dumps(power["activations"], ensure_ascii=False) + power["description"]
                self.assertIsNone(STOCK_TERMS.search(reviewed), power["id"])

    def test_every_activation_has_action_range_and_ordered_blocks(self):
        for powers in self.powers.values():
            for power in powers:
                activation = power["activations"][0]
                self.assertTrue(activation["range"]["text"].strip(), power["id"])
                self.assertTrue(activation["blocks"], power["id"])
        wizard = {p["source"]["entryId"]: p for p in self.powers["Wizard"]}
        # A source power with no printed range keeps its minor action and a personal range.
        self.assertEqual("Personal", wizard["power7429"]["activations"][0]["range"]["text"])
        self.assertEqual("MINOR", wizard["power7429"]["activations"][0]["action"])

    def test_skill_prerequisites_become_selection_gates_and_other_prerequisites_stay_explicit(self):
        rogue = {p["source"]["entryId"]: p for p in self.powers["Rogue"]}
        gated = rogue["power10732"]
        self.assertIn({"type": "proficiency", "skill": "ACROBATICS"}, gated["prerequisites"]["conditions"])
        self.assertNotIn("unresolved", json.dumps(gated["prerequisites"]))
        avenger = {p["source"]["entryId"]: p for p in self.powers["Avenger"]}
        godsworn = avenger["power11635"]["prerequisites"]["conditions"]
        self.assertEqual("unresolved", godsworn[1]["type"])
        self.assertEqual("Godsworn Alacrity", godsworn[1]["text"])

    def test_authored_modern_powers_win_over_published_duplicates(self):
        warlock = {p["title"] for p in self.powers["Warlock"]}
        for title in ("Eldritch Blast", "Hellish Rebuke", "Eyebite", "Eldritch Strike"):
            self.assertNotIn(title, warlock)
            self.assertIn(title, {r["Name"] for r in migration.source_rows("Warlock")})

    def test_follow_up_powers_become_granted_activations_without_stealing_the_parents_rules(self):
        warden = {p["source"]["entryId"]: p for p in self.powers["Warden"]}["power9825"]
        parent, follow = warden["activations"]
        self.assertEqual(("ENTRY", "MINOR", "Personal"), (parent["availability"], parent["action"], parent["range"]["text"]))
        self.assertEqual(("GRANTED", "STANDARD", "Close burst 1"), (follow["availability"], follow["action"], follow["range"]["text"]))
        self.assertNotIn("requirement", parent)
        self.assertIn("must be active", follow["requirement"])
        self.assertEqual([follow["id"]], [b["activationId"] for b in parent["blocks"] if b["type"] == "grant"])
        # A follow-up that follows an errata note is kept, and the note itself is not rules text.
        artificer = {p["source"]["entryId"]: p for p in self.powers["Artificer"]}["power10191"]
        self.assertEqual(2, len(artificer["activations"]))
        for powers in self.powers.values():
            for power in powers:
                self.assertNotRegex(json.dumps(power["activations"]), r"Revision \(|Update \(|Deletion \(|Addition \(")
        # A secondary attack is part of its parent's use, never a separately usable power.
        acid = {p["source"]["entryId"]: p for p in self.powers["Wizard"]}["power464"]
        self.assertEqual(1, len(acid["activations"]))
        self.assertIn("Area burst 1", json.dumps(acid["activations"][0]["blocks"]))

    def test_attack_statistics_stay_faithful_to_the_source_line(self):
        ranger = {p["source"]["entryId"]: p for p in self.powers["Ranger"]}
        attack = next(b for b in ranger["power4374"]["activations"][0]["blocks"] if b["type"] == "attack")
        self.assertEqual({"type": "RULES_TEXT", "text": "Strength vs. AC (melee) or Dexterity vs. AC (ranged)"},
                         attack["roll"]["statistic"])
        three = next(b for b in ranger["power878"]["activations"][0]["blocks"] if b["type"] == "attack")
        self.assertEqual(3, three["roll"]["count"])
        prismatic = {p["source"]["entryId"]: p for p in self.powers["Sorcerer"]}["power3044"]
        defenses = [b["comparisons"][0]["defense"] for b in prismatic["activations"][0]["blocks"] if b["type"] == "attack"]
        self.assertEqual(["FORTITUDE", "REFLEX", "WILL"], defenses)
        paladin = next(p for p in self.powers["Paladin"] if p["source"]["entryId"] == "power3275")
        secondary = [b for b in paladin["activations"][0]["blocks"] if b["type"] == "attack"][-1]
        self.assertNotEqual("Melee weapon", secondary["range"]["text"])

    def test_powers_needing_builds_modern_4e_lacks_resolve_by_id_but_are_not_selectable(self):
        assets = class_runtime.build()
        entries = {e["id"]: e for e in runtime_common.entries_of(assets)}
        deferred = [p for powers in self.powers.values() for p in powers
                    if any(c["type"] == "unresolved" for c in p["prerequisites"].get("conditions", []))]
        self.assertGreater(len(deferred), 100)
        for power in deferred:
            mechanics = entries[power["id"]]["mechanics"]
            self.assertNotIn("powerProfile", mechanics, power["id"])
            self.assertTrue(any("Unresolved prerequisite" in text for text in mechanics["unsupported"]), power["id"])
        godsworn = {p["source"]["entryId"]: p for p in self.powers["Avenger"]}["power11635"]
        self.assertIn("Godsworn Alacrity", json.dumps(godsworn["prerequisites"]))
        self.assertIn("modern4e.power.avenger-power11635", entries)
        selectable = [p for powers in self.powers.values() for p in powers if p not in deferred]
        self.assertTrue(all("powerProfile" in entries[p["id"]]["mechanics"] for p in selectable))

    def test_runtime_compiles_exact_local_profiles_without_compendium(self):
        with patch.object(compendium, "payload", side_effect=AssertionError("Production must not read source classes/powers")):
            assets = class_runtime.build()
        entries = {e["id"]: e for e in runtime_common.entries_of(assets)}
        for name, powers in self.powers.items():
            for power in powers:
                runtime = entries[power["id"]]
                profile = runtime["mechanics"].get("powerProfile")
                if profile is None:
                    continue
                self.assertEqual(power["level"], profile["level"], power["id"])
                self.assertEqual(power["activations"][0]["usage"]["frequency"], profile["usage"], power["id"])
                self.assertEqual("ATTACK", profile["powerKind"])
                self.assertEqual(power, {k: v for k, v in runtime["sharedData"].items() if k != "category"})
                self.assertEqual("UNIMPLEMENTED", runtime["coverage"]["status"])
        wizard = class_runtime.build(class_ids=["modern4e.class.wizard"])
        wizard_powers = {e["id"] for e in runtime_common.entries_of(wizard) if e["id"].startswith("modern4e.power.wizard-power")}
        self.assertEqual({p["id"] for p in self.powers["Wizard"]}, wizard_powers)

    def test_package_is_chunked_and_indexed_consistently(self):
        assets = class_runtime.build()
        manifest = assets["modern4e.classes/manifest.json"]
        self.assertEqual("3", manifest["revision"])
        self.assertGreater(len(manifest["chunks"]), 1)
        self.assertNotIn("modern4e.classes/entries.json", assets)
        chunked = {c: {e["id"] for e in assets[f"modern4e.classes/{c}.json"]["entries"]} for c in manifest["chunks"]}
        for row in assets["modern4e.classes/index.json"]["entries"]:
            self.assertIn(row["id"], chunked[row["chunkId"]])
        self.assertEqual(sum(map(len, chunked.values())), len(assets["modern4e.classes/index.json"]["entries"]))


if __name__ == "__main__":
    unittest.main()
