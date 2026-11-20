"""Authoring-to-runtime contract for the shared Modern 4e equipment package."""
import copy
import json
from pathlib import Path
import tempfile
import unittest

import equipment_runtime
import runtime_common

PACKAGE = "modern4e.equipment"


class EquipmentRuntimeTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.catalog = equipment_runtime.authoring.catalog()
        cls.properties = {prop["id"]: prop for prop in cls.catalog["properties"]}
        cls.assets = equipment_runtime.build()
        cls.entries = {entry["id"]: entry for entry in runtime_common.entries_of(cls.assets)}
        cls.source = json.loads(equipment_runtime.authoring.CONTENT.read_text(encoding="utf-8"))

    def build_edited(self, change):
        data = copy.deepcopy(self.source)
        change(data)
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "equipment.json"
            path.write_text(json.dumps(data), encoding="utf-8")
            return equipment_runtime.build(path)

    def description(self, key):
        return self.entries[key]["presentation"]["description"]

    def test_package_shape_count_ids_and_categories(self):
        manifest = self.assets[f"{PACKAGE}/manifest.json"]
        self.assertEqual({"formatVersion": 2, "id": PACKAGE, "revision": "2",
                          "title": "Modern 4e shared equipment", "indexes": ["index"], "chunks": ["entries-0000"]}, manifest)
        authored = self.catalog["entries"]
        self.assertEqual(53, len(authored))
        self.assertEqual(60, len(runtime_common.entries_of(self.assets)))
        self.assertEqual({entry["id"] for entry in authored}, {key for key in self.entries if ".implement." not in key})
        self.assertTrue(all(entry["category"] == "ITEM" for entry in self.entries.values()))
        index = self.assets[f"{PACKAGE}/index.json"]["entries"]
        self.assertEqual(sorted(self.entries), [row["id"] for row in index])
        self.assertTrue(all(row["category"] == "ITEM" and row["chunkId"] == "entries-0000" for row in index))
        counts = {kind: sum(e["sharedData"]["equipment"]["kind"] == kind for e in self.entries.values())
                  for kind in ("WEAPON", "ARMOR", "SHIELD", "IMPLEMENT")}
        self.assertEqual({"WEAPON": 45, "ARMOR": 6, "SHIELD": 2, "IMPLEMENT": 7}, counts)

    def test_basic_implements_have_proficiencies_and_no_armor_rules(self):
        implements = [entry for entry in self.entries.values() if ".implement." in entry["id"]]
        self.assertEqual(set(equipment_runtime.BASIC_IMPLEMENT_TYPES),
                         {entry["sharedData"]["equipment"]["proficiencyKey"] for entry in implements})
        for entry in implements:
            self.assertNotIn("armorRules", entry["sharedData"])
            self.assertIn("Implement. Proficiency:", entry["presentation"]["description"])

    def test_output_is_deterministic_and_has_no_local_paths(self):
        again = equipment_runtime.build()
        self.assertEqual(self.assets, again)
        self.assertEqual(json.dumps(self.assets, sort_keys=True), json.dumps(again, sort_keys=True))
        self.assertNotIn(str(Path(__file__).resolve().parents[2]), json.dumps(self.assets))

    def test_mechanics_use_only_closed_v2_vocabulary_without_combat_modifiers(self):
        for entry in self.entries.values():
            self.assertEqual({"version": 2, "access": {"type": "always"}, "prerequisites": [{"type": "always"}],
                              "grants": [], "choices": [], "unsupported": [], "maximumSelections": None},
                             entry["mechanics"], entry["id"])
            kind = entry["sharedData"]["equipment"]["kind"]
            self.assertEqual("PARTIAL" if entry["coverage"]["limitations"] else "SUPPORTED", entry["coverage"]["status"])
            self.assertEqual({"id", "category", "presentation", "mechanics", "coverage", "sharedData"}, set(entry))
            self.assertEqual({"title", "description"}, set(entry["presentation"]))
            if kind == "WEAPON":
                authored = [text for text in entry["sharedData"]["coverage"]["limitations"]
                            if not text.startswith(runtime_common.OUT_OF_SCOPE_LIMITATIONS)]
                self.assertEqual(authored, entry["coverage"]["limitations"])
            elif kind != "IMPLEMENT":
                self.assertIn("contribute to", entry["coverage"]["limitations"][0])
                self.assertIn("remain descriptive", entry["coverage"]["limitations"][0])

    def test_shared_data_preserves_profile_properties_and_armor_rules(self):
        for authored in self.catalog["entries"]:
            shared = self.entries[authored["id"]]["sharedData"]
            self.assertEqual(authored["equipment"], shared["equipment"])
            for key in ("id", "category", "presentation", "coverage"):
                self.assertEqual(authored[key], shared[key])
            expected = [self.properties[prop["id"]] for prop in authored["equipment"].get("properties", [])]
            self.assertEqual(expected, shared["propertyDefinitions"])
            if authored["equipment"]["kind"] == "WEAPON":
                self.assertNotIn("armorRules", shared)
            else:
                self.assertEqual(self.catalog["armorRules"], shared["armorRules"])
        musket = self.entries["modern4e.weapon.musket"]["sharedData"]
        self.assertIsNone(musket["equipment"]["handsRequired"])
        self.assertIn({"id": "LOAD", "action": "STANDARD"}, musket["equipment"]["properties"])
        self.assertIsNone(self.entries["modern4e.weapon.unarmed-attack"]["sharedData"]["equipment"]["proficiencyBonus"])

    def test_descriptions_render_structured_fields_only(self):
        plate = self.description("modern4e.armor.plate")
        for text in ("Armor. Proficiency: Plate.", "Category: Heavy.", "Armor bonus: +9.", "Speed modifier: -1.",
                     "Armor check modifier: -1.", self.catalog["armorRules"]["armorCheckDescription"]):
            self.assertIn(text, plate)
        self.assertNotIn("Light armor ability", plate)
        self.assertIn("Light armor ability: Highest of Intelligence, Dexterity.", self.description("modern4e.armor.cloth"))
        shield = self.description("modern4e.shield.heavy-shield")
        self.assertIn("Shield bonus: +2.", shield)
        self.assertIn("Hands occupied: 1.", shield)
        dagger = self.description("modern4e.weapon.dagger")
        self.assertIn("Hands required: 1.", dagger)
        self.assertIn("Damage: 1d4.", dagger)
        self.assertIn("- Off Hand\n", dagger)
        self.assertIn("- Thrown:\n    " + self.properties["THROWN"]["description"].split("\n")[0], dagger)
        self.assertNotIn("squares", dagger)
        musket = self.description("modern4e.weapon.musket")
        self.assertIn("Hands required: not specified.", musket)
        self.assertIn("- Load (standard action)\n", musket)
        self.assertIn("- Ranged (range 20/40 squares)\n", musket)
        unarmed = self.description("modern4e.weapon.unarmed-attack")
        self.assertIn("Proficiency bonus: not specified.", unarmed)
        self.assertIn("Properties: none.", unarmed)
        self.assertTrue(all(entry["presentation"]["description"] for entry in self.entries.values()))

    def test_changed_authoring_changes_description_and_shared_definition(self):
        def edit(data):
            for prop in data["properties"]:
                if prop["id"] == "THROWN":
                    prop["description"] = "Changed local thrown rule."
            for entry in data["equipment"]:
                if entry["id"] == "modern4e.armor.plate":
                    entry["equipment"]["armorBonus"] = 11
        entries = {e["id"]: e for e in runtime_common.entries_of(self.build_edited(edit))}
        dagger = entries["modern4e.weapon.dagger"]
        self.assertIn("Changed local thrown rule.", dagger["presentation"]["description"])
        self.assertNotEqual(self.description("modern4e.weapon.dagger"), dagger["presentation"]["description"])
        self.assertEqual("Changed local thrown rule.", dagger["sharedData"]["propertyDefinitions"][1]["description"])
        self.assertIn("Armor bonus: +11.", entries["modern4e.armor.plate"]["presentation"]["description"])

    def test_missing_or_invalid_property_fails(self):
        def remove(data):
            data["properties"] = [prop for prop in data["properties"] if prop["id"] != "THROWN"]
        with self.assertRaises(ValueError):
            self.build_edited(remove)

        def invalid(data):
            data["equipment"][0]["equipment"]["properties"] = [{"id": "NOT_A_PROPERTY"}]
        with self.assertRaises(ValueError):
            self.build_edited(invalid)

        def missing_range(data):
            for entry in data["equipment"]:
                if entry["id"] == "modern4e.weapon.musket":
                    entry["equipment"]["properties"] = [{"id": "RANGED"}]
        with self.assertRaises(ValueError):
            self.build_edited(missing_range)

    def test_runtime_reference_validation_passes(self):
        runtime_common.validate_references(self.assets)


if __name__ == "__main__":
    unittest.main()
