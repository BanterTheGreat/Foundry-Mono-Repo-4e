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
            shutil.copytree(BOOK / "content/equipment", content / "equipment")
            for name in ("feat-references.json", "feat-sections.json", "languages.json"):
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
        self.assertEqual(798, len(self.entries))
        self.assertEqual(93, len(self.catalog["sections"]))
        for section, ids in self.catalog["sections"].items():
            authored = feats.load_json(BOOK / "content/feats" / section)["feats"]
            self.assertEqual([entry.get("ref", entry.get("id")) for entry in authored], ids)
        self.assertTrue(all("requirements" not in entry for entry in self.entries.values()))
        self.assertEqual("modern4e.feat.deep-gash", self.named("Deep Gash")[0]["id"])

    def test_initial_slug_is_convenience_not_identity(self):
        self.assertEqual("hunters-advantage", feats.slug("Hunter’s Advantage"))
        original = self.named("Deep Gash")[0]["id"]
        changed = self.edited(lambda c: self.edit_file(c, "heroic/fighter.json", lambda d: d["feats"][0].update(title="A Different Name")))
        self.assertEqual("A Different Name", next(e for e in changed["entries"] if e["id"] == original)["title"])

    def test_corrected_titles_keep_stable_ids_and_removed_tier_variants_are_absent(self):
        self.assertEqual(1, len(self.named("Bloodthirsty Visage")))
        self.assertEqual("modern4e.feat.bloodthirsty-visage-paragon-barbarian", self.named("Bloodthirsty Visage")[0]["id"])
        self.assertEqual("modern4e.feat.double-lunge-heroic-barbarian", self.named("Double Lunge")[0]["id"])
        self.assertEqual("modern4e.feat.armor-of-burning-wrath-vulnerability", self.named("Scouring Wrath")[0]["id"])
        self.assertEqual(1, len(self.named("Armor of Burning Wrath")))

    def test_shared_class_feats_have_one_definition_and_two_printed_placements(self):
        for title, classes in [("Dirty Fighting", {"fighter", "rogue"}), ("Elusive Movement", {"ranger", "rogue"}),
                               ("Phalanx Warrior", {"fighter", "warlord"}), ("Warding Shield", {"cleric", "paladin"})]:
            entry, = self.named(title)
            self.assertEqual({"modern4e.class." + name for name in classes},
                             {node["entryId"] for node in entry["access"]["conditions"]})
            self.assertEqual(2, sum(entry["id"] in ids for ids in self.catalog["sections"].values()))
            if title in ("Phalanx Warrior", "Warding Shield"):
                self.assertEqual({"LIGHT_SHIELD", "HEAVY_SHIELD"},
                                 {node["equipment"] for node in entry["prerequisites"]["conditions"][1]["conditions"]})
        self.assertEqual({"type": "always"}, self.named("War Wizardry")[0]["access"])

    def test_relaxed_prerequisites_and_ancestry_only_placements(self):
        for title in ("Ruthless Killer", "Patient Hunter", "Unstoppable Beast"):
            self.assertEqual({"type": "always"}, self.named(title)[0]["prerequisites"])
        self.assertEqual({"type": "entry", "entryId": "modern4e.class.swordmage"}, self.named("Valenar Weapon Warding")[0]["prerequisites"])
        for title, ancestry in [("Hunter's Advantage", "elf"), ("Prime Slayer", "elf"),
                                ("Infernal Sneak Attack", "tiefling"), ("Wrathful Hunter", "tiefling")]:
            entry, = self.named(title)
            self.assertEqual([f"ancestries/{ancestry}/paragon-class-combo.json"],
                             [section for section, ids in self.catalog["sections"].items() if entry["id"] in ids])

    def test_section_references_reject_missing_targets_overrides_and_duplicates(self):
        for reference, error in [({"ref": "modern4e.feat.missing"}, "unknown section feat reference"),
                                 ({"ref": "modern4e.feat.deep-gash", "title": "Override"}, "unknown fields"),
                                 ({"ref": "modern4e.feat.deep-gash"}, "duplicate section feat reference")]:
            with self.subTest(reference=reference), self.assertRaisesRegex(ValueError, error):
                self.edited(lambda c: self.edit_file(c, "heroic/fighter.json", lambda d: d["feats"].append(reference)))

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

    def test_retired_feral_and_unavailable_ancestry_options_are_absent_without_substitutions(self):
        retired = {"modern4e.feat.feral-companion", "modern4e.feat.fey-charge",
                   "modern4e.feat.combat-opening", "modern4e.feat.elusive-hexer"}
        self.assertTrue(retired.isdisjoint(self.entries))
        self.assertTrue(retired.isdisjoint(key for ids in self.catalog["sections"].values() for key in ids))
        self.assertNotIn("modern4e.ancestry.eladrin", self.catalog["references"])
        self.assertNotIn("modern4e.ancestry.half-elf", self.catalog["references"])
        for entry in self.entries.values():
            requirements = json.dumps([entry["access"], entry["prerequisites"]])
            self.assertNotIn("modern4e.ancestry.eladrin", requirements)
            self.assertNotIn("modern4e.ancestry.half-elf", requirements)
            self.assertNotIn('"type": "unresolved"', requirements)

    def test_reviewed_language_catalog_has_ten_stable_options_and_source_scripts(self):
        catalog = self.catalog["optionCatalogs"]["LANGUAGE"]
        self.assertEqual({"COMMON", "DEEP_SPEECH", "DRACONIC", "DWARVEN", "ELVEN", "GIANT",
                          "GOBLIN", "PRIMORDIAL", "SUPERNAL", "ABYSSAL"}, {x["id"] for x in catalog["languages"]})
        self.assertEqual(10, len(catalog["languages"]))
        self.assertEqual("https://iws.mx/dnd/?view=glossary623", catalog["source"]["url"])
        self.assertEqual(("Rules Compendium", 69), (catalog["source"]["publication"], catalog["source"]["page"]))
        self.assertEqual("Iokharic", next(x["script"] for x in catalog["languages"] if x["id"] == "DRACONIC"))
        self.assertEqual("Deep Speech", next(x["title"] for x in catalog["languages"] if x["id"] == "DEEP_SPEECH"))
        self.assertFalse(any("LANGUAGE option catalog is pending" in text
                             for text in self.catalog["limitations"][self.named("Linguist")[0]["id"]]))

    def test_weapon_catalog_uses_only_authoritative_superior_identities(self):
        weapons = self.catalog["optionCatalogs"]["WEAPON"]["weapons"]
        self.assertEqual({"bastard-sword", "double-bladed-dagger", "parrying-dagger", "fullblade",
                          "execution-axe", "spiked-chain", "recurve-bow", "repeating-heavy-crossbow", "musket"},
                         {weapon["id"].removeprefix("modern4e.weapon.") for weapon in weapons})
        self.assertTrue(all(weapon["proficiencyCategory"] == "SUPERIOR" for weapon in weapons))
        self.assertEqual("Execution Axe", next(w["title"] for w in weapons if w["id"].endswith(".execution-axe")))
        self.assertFalse(any("WEAPON option catalog is pending" in limitation
                             for limitation in self.catalog["limitations"][self.named("Weapon Proficiency")[0]["id"]]))

    def test_weapon_catalog_rejects_ambiguous_or_invalid_equipment(self):
        for mutate, message in [(lambda d: d["equipment"].append(copy.deepcopy(d["equipment"][0])), "duplicate"),
                                (lambda d: d["equipment"][0]["equipment"].update(proficiencyCategory="UNKNOWN"), "unknown value")]:
            def change(content):
                path = content / "equipment/equipment.json"
                data = feats.load_json(path)
                mutate(data)
                path.write_text(json.dumps(data), encoding="utf-8")
            with self.subTest(message=message), self.assertRaisesRegex(ValueError, message):
                self.edited(change)

    def test_language_catalog_rejects_ambiguous_or_malformed_identities(self):
        cases = [(lambda d: d["languages"].append(d["languages"][0]), "duplicate language identity"),
                 (lambda d: d["languages"][0].update(id="Common"), "stable language identity"),
                 (lambda d: d["languages"][0].update(script=""), "nonblank"),
                 (lambda d: d["languages"][0].update(grant=True), "unknown fields"),
                 (lambda d: d.update(schemaVersion=True), "unsupported schema")]
        for edit, message in cases:
            def change(content):
                path = content / "languages.json"
                data = feats.load_json(path)
                edit(data)
                path.write_text(json.dumps(data), encoding="utf-8")
            with self.subTest(message=message), self.assertRaisesRegex(ValueError, message):
                self.edited(change)

    def test_retired_missing_feature_feats_are_absent_from_all_sections(self):
        retired = {"modern4e.feat.astral-elixir", "modern4e.feat.elven-beast-mastery",
                   "modern4e.feat.human-beast-mastery", "modern4e.feat.fiendish-companion",
                   "modern4e.feat.prophetic-preparation"}
        self.assertTrue(retired.isdisjoint(self.entries))
        self.assertTrue(retired.isdisjoint(entry_id for ids in self.catalog["sections"].values() for entry_id in ids))
        for entry in self.entries.values():
            text = json.dumps(entry["prerequisites"]).lower()
            self.assertFalse(any(term in text for term in ("shielding elixir", "beast mastery", "vistani heritage")))

    def test_improved_fate_threshold_uses_two_points_in_either_ability(self):
        entry = self.named("Improved Fate of the Void")[0]
        threshold, pact = entry["prerequisites"]["conditions"]
        self.assertEqual({"type": "anyOf", "conditions": [
            {"type": "abilityPoints", "ability": "CONSTITUTION", "minimum": 2},
            {"type": "abilityPoints", "ability": "CHARISMA", "minimum": 2}]}, threshold)
        self.assertEqual({"type": "entry", "entryId": "modern4e.feature.star-pact"}, pact)
        self.assertIn("(2 Constitution or 2 Charisma)", self.catalog["requirementText"][entry["id"]])

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
            path.write_text('''#import "../helpers/feat_requirements.typ": featRequirements, resolveFeat
#let result = (:)
#for section in json("../content/feat-sections.json").sections {
  for feat in json("../content/feats/" + section).feats.map(resolveFeat) {
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
