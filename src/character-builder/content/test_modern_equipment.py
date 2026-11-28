"""Equipment migration goldens, strict authoring and real Typst consumption."""
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
SPEC = importlib.util.spec_from_file_location("equipment_content", BOOK / "scripts/equipment_content.py")
equipment = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(equipment)
FIXTURE = Path(__file__).with_name("fixtures") / "equipment/original-tables.json"
BUILD = Path(__file__).with_name("build.py")
TYPST = os.environ.get("TYPST_BIN", "typst")


class ModernEquipmentTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.catalog = equipment.catalog()
        cls.entries = {entry["id"]: entry for entry in cls.catalog["entries"]}
        cls.source = json.loads(equipment.CONTENT.read_text())
        cls.golden = json.loads(FIXTURE.read_text())

    def edited(self, change):
        data = copy.deepcopy(self.source)
        change(data)
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "equipment.json"
            path.write_text(json.dumps(data))
            return equipment.catalog(path)

    def test_complete_inventory_order_and_unimplemented_runtime(self):
        counts = {kind: sum(e["equipment"]["kind"] == kind for e in self.entries.values()) for kind in ["WEAPON", "ARMOR", "SHIELD"]}
        self.assertEqual({"WEAPON": 45, "ARMOR": 6, "SHIELD": 2}, counts)
        self.assertEqual([s["title"] for s in self.golden["sections"]], [s["title"] for s in self.catalog["sections"]])
        for section, original in zip(self.catalog["sections"], self.golden["sections"]):
            self.assertEqual([r[0] for r in original["rows"]], [self.entries[key]["presentation"]["title"] for key in section["entryIds"]])
        self.assertTrue(all(e["coverage"]["status"] == "UNIMPLEMENTED" for e in self.entries.values()))
        self.assertEqual(self.golden["properties"], [p for p in self.catalog["properties"] if p["printRule"]])

    def test_local_values_and_missing_source_data_are_not_vanilla_defaults(self):
        profile = lambda key: self.entries["modern4e." + key]["equipment"]
        self.assertEqual({"diceCount": 1, "dieSize": 10}, profile("weapon.battleaxe")["damage"])
        self.assertEqual(3, profile("weapon.warhammer")["proficiencyBonus"])
        self.assertEqual(7, profile("armor.plate")["armorBonus"])
        self.assertEqual(0, profile("armor.hide")["armorCheckModifier"])
        self.assertEqual([{"id": "OFF_HAND"}, {"id": "THROWN"}], profile("weapon.dagger")["properties"])
        self.assertIsNone(profile("weapon.musket")["handsRequired"])
        self.assertIsNone(profile("weapon.unarmed-attack")["proficiencyBonus"])
        self.assertEqual(2, profile("weapon.quarterstaff")["handsRequired"])
        self.assertIn({"id": "VERSATILE"}, profile("weapon.quarterstaff")["properties"])
        self.assertEqual(["INTELLIGENCE", "DEXTERITY"], self.catalog["armorRules"]["lightArmorAbilities"])
        self.assertEqual(["STRENGTH", "DEXTERITY", "CONSTITUTION"], self.catalog["armorRules"]["armorCheckAbilities"])
        self.assertEqual(
            {"modern4e.armor.cloth": 3, "modern4e.armor.leather": 3, "modern4e.armor.hide": 3,
             "modern4e.armor.chainmail": 0, "modern4e.armor.scale": 0, "modern4e.armor.plate": 0},
            {key: entry["equipment"]["acAbilityCap"] for key, entry in self.entries.items()
             if "acAbilityCap" in entry["equipment"]},
        )

    def test_renames_preserve_persisted_identity(self):
        result = self.edited(lambda d: d["equipment"][0]["presentation"].update(title="Renamed Unarmed Attack"))
        self.assertEqual(set(self.entries), {e["id"] for e in result["entries"]})

    def test_invalid_profiles_references_and_versions_are_rejected(self):
        changes = [
            ("version", lambda d: d.update(schemaVersion=2)),
            ("boolean version", lambda d: d.update(schemaVersion=True)),
            ("duplicate ID", lambda d: d["equipment"].append(copy.deepcopy(d["equipment"][0]))),
            ("unknown field", lambda d: d["equipment"][0]["equipment"].update(acAbility="DEXTERITY")),
            ("invalid dice", lambda d: d["equipment"][0]["equipment"]["damage"].update(diceCount=0)),
            ("boolean number", lambda d: d["equipment"][0]["equipment"].update(handsRequired=True)),
            ("unknown property", lambda d: d["equipment"][0]["equipment"].update(properties=[{"id": "SCRIPT"}])),
            ("bad range", lambda d: d["equipment"][0]["equipment"].update(properties=[{"id": "THROWN", "range": {"normal": 10, "long": 5}}])),
            ("required range", lambda d: d["equipment"][0]["equipment"].update(properties=[{"id": "RANGED"}])),
            ("duplicate property", lambda d: d["equipment"][0]["equipment"].update(properties=[{"id": "REACH"}, {"id": "REACH"}])),
            ("property parameter", lambda d: d["equipment"][0]["equipment"].update(properties=[{"id": "REACH", "value": 2}])),
            ("missing definition", lambda d: d.update(properties=[p for p in d["properties"] if p["id"] != "THROWN"])),
            ("bad section reference", lambda d: d["sections"][0]["entryIds"].append("modern4e.weapon.missing")),
            ("duplicate placement", lambda d: d["sections"][0]["entryIds"].append(d["sections"][0]["entryIds"][0])),
            ("missing placement", lambda d: d["sections"][1]["entryIds"].pop()),
            ("section kind", lambda d: d["sections"][0].update(kind="ARMOR")),
            ("duplicate section", lambda d: d["sections"][1].update(id=d["sections"][0]["id"])),
            ("invented support", lambda d: d["equipment"][0].update(coverage={"status": "SUPPORTED", "limitations": []})),
        ]
        for name, change in changes:
            with self.subTest(name=name), self.assertRaises(ValueError):
                self.edited(change)

    def test_duplicate_json_keys_are_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "bad.json"
            path.write_text('{"schemaVersion":1,"schemaVersion":1}')
            with self.assertRaisesRegex(ValueError, "duplicate JSON key"):
                equipment.catalog(path)

    def test_builder_export_is_deterministic_complete_and_checks_staleness(self):
        with tempfile.TemporaryDirectory() as directory:
            command = ["python3", str(BUILD), "--modern-equipment", "--output", directory]
            result = subprocess.run(command, capture_output=True, text=True)
            self.assertEqual(0, result.returncode, result.stderr)
            path = Path(directory) / "modern4e.equipment-authoring/catalog.json"
            self.assertEqual(self.catalog, json.loads(path.read_text()))
            before = path.read_bytes()
            subprocess.run(command, check=True, capture_output=True)
            self.assertEqual(before, path.read_bytes())
            subprocess.run(command + ["--check"], check=True, capture_output=True)
            path.write_text("{}")
            result = subprocess.run(command + ["--check"], capture_output=True, text=True)
            self.assertNotEqual(0, result.returncode)
            self.assertIn("stale", result.stderr)
        result = subprocess.run(["python3", str(BOOK / "scripts/equipment_content.py"), "--output", str(equipment.CONTENT)], capture_output=True, text=True)
        self.assertNotEqual(0, result.returncode)
        self.assertIn("must not overwrite", result.stderr)

    @unittest.skipUnless(shutil.which(TYPST), "Typst is not installed")
    def test_typst_uses_shared_entries_and_prints_current_armor(self):
        # Query actual Typst functions rather than a second Python renderer.
        with tempfile.TemporaryDirectory(dir=BOOK) as directory:
            path = Path(directory) / "equipment-query.typ"
            path.write_text('''#import "../helpers/equipment.typ" as e
#metadata((entries: e.catalog.equipment, sections: e.catalog.sections.map(section => (
  title: section.title, rows: section.entryIds.map(id => {
    let entry = e.entries.at(id)
    if entry.equipment.kind == "WEAPON" { e.weaponRow(entry) } else { e.armorRow(entry) }
  }),
))))<equipment>
''')
            result = subprocess.run([TYPST, "query", "--root", str(BOOK), str(path), "<equipment>", "--field", "value", "--one"], capture_output=True, text=True)
            self.assertEqual(0, result.returncode, result.stderr)
            actual = json.loads(result.stdout)
            self.assertEqual(self.source["equipment"], actual["entries"])
            self.assertEqual(len(self.golden["sections"]), len(actual["sections"]))
            for section, original in zip(actual["sections"], self.golden["sections"]):
                self.assertEqual(original["title"], section["title"])
                self.assertEqual(len(original["rows"]), len(section["rows"]))
                for row, expected in zip(section["rows"], original["rows"]):
                    expected = expected.copy()
                    # Cosmetic cleanup only: omit redundant None before Implement,
                    # and consistently capitalize property labels.
                    if original["kind"] == "weapon":
                        expected[3] = expected[3].replace("None, ", "").lower()
                        row[3] = row[3].lower()
                    elif original["title"] != "Shields":
                        expected = {
                            "Cloth": ["Cloth", "+0", "-", "-0"],
                            "Leather": ["Leather", "+2", "-", "-0"],
                            "Hide": ["Hide", "+3", "-", "-0"],
                            "Chainmail": ["Chainmail", "+5", "-1", "-0"],
                            "Scale": ["Scale", "+6", "-1", "-0"],
                            "Plate": ["Plate", "+7", "-1", "-1"],
                        }[row[0]]
                    self.assertEqual(expected, row)

    @unittest.skipUnless(shutil.which(TYPST), "Typst is not installed")
    def test_equipment_chapter_keeps_heading_depth_and_literal_property_text(self):
        with tempfile.TemporaryDirectory(dir=BOOK) as directory:
            path = Path(directory) / "equipment-page.typ"
            literal = json.dumps('#panic("Equipment text executed")\n- `[W]` stays literal')
            path.write_text('''#set heading(offset: 2)
#import "../glossary/equipment.typ": equipmentPage
#import "../helpers/equipment.typ": propertyRule
#equipmentPage()
''' + '#propertyRule(' + literal + ')\n' + '''
#context [#metadata(query(heading.where(level: 4, depth: 2)).len())<equipment-headings>]
''')
            result = subprocess.run([TYPST, "query", "--root", str(BOOK), str(path), "<equipment-headings>", "--field", "value", "--one"], capture_output=True, text=True)
            self.assertEqual(0, result.returncode, result.stderr)
            self.assertEqual(24, json.loads(result.stdout))


if __name__ == "__main__":
    unittest.main()
