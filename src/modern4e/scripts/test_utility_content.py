"""Utility migration: preserved printed rules, eligibility, safety and rendering."""
import copy
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

import utility_content as content

BOOK = content.CONTENT.parent


def rows(blocks):
    """Read the printed sequence, including attack-scoped outcomes."""
    result = []
    for block in blocks:
        result.append([block["label"], block["text"]])
        if block["type"] == "attack":
            for comparison in block["comparisons"]:
                for outcome in comparison["outcomes"].values():
                    result.extend(rows(outcome))
    return result


class UtilityContentTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.catalog, cls.entries = content.load()

    def test_preserves_all_legacy_presentation_and_ordered_rule_text(self):
        goldens = json.loads((BOOK / "scripts/fixtures/utilities/presentation-sha256.json").read_text())
        self.assertEqual(set(goldens), set(self.entries))
        for eid, power in self.entries.items():
            with self.subTest(power=eid):
                activation = power["activations"][0]
                geometry = activation["range"]
                value = {"title": power["title"], "flavor": power.get("flavor"),
                         "range": "Personal" if geometry["type"] == "PERSONAL" else geometry["text"],
                         "action": activation["action"], "frequency": activation["usage"]["frequency"],
                         "trigger": activation.get("trigger"), "requirement": activation.get("requirement"),
                         "target": activation["bindings"][activation["targets"]]["text"] if "targets" in activation else None,
                         "rows": rows(activation["blocks"])}
                digest = hashlib.sha256(json.dumps(value, sort_keys=True, ensure_ascii=False).encode()).hexdigest()
                self.assertEqual(digest, goldens[eid])

    def test_complete_sections_withheld_entries_and_variant_identity(self):
        self.assertEqual(len(self.entries), 1046)
        order = json.loads((BOOK / "scripts/fixtures/utilities/section-order-sha256.json").read_text())
        self.assertEqual({section["id"]: hashlib.sha256(json.dumps(section["powerIds"]).encode()).hexdigest() for section in self.catalog["sections"]}, order)
        sections = {s["id"]: s for s in self.catalog["sections"]}
        self.assertNotIn("class-deferred", sections)
        self.assertTrue(all(s["availability"] == "AVAILABLE" for s in sections.values()))
        self.assertEqual(len(sections["skill"]["powerIds"]), 41)
        self.assertEqual(sum(len(sections[s]["powerIds"]) for s in ("arcane", "martial", "divine", "primal")), 113)
        self.assertEqual(sum(len(s["powerIds"]) for s in sections.values() if s["kind"] == "CLASS" and s["availability"] == "AVAILABLE"), 826)
        variants = [p for p in self.entries.values() if p["source"]["entryId"] == "power4938"]
        self.assertEqual(len(variants), 2)
        self.assertNotEqual(variants[0]["id"], variants[1]["id"])
        self.assertNotEqual(variants[0]["access"], variants[1]["access"])
        # Formerly withheld utilities sit in their class sections, level-ordered, with off-slot levels kept.
        cleric = [self.entries[i] for i in sections["class-cleric"]["powerIds"]]
        self.assertEqual(18, sum(1 for p in cleric if p["level"] == 1))
        self.assertEqual([p["level"] for p in cleric], sorted(p["level"] for p in cleric))
        self.assertIn("modern4e.power.utility-class-deferred-power7643", sections["class-artificer"]["powerIds"])
        self.assertTrue(all(len(p["coverage"]["limitations"]) == 1 for i, p in self.entries.items() if "class-deferred" in i))
        removed = {"Prescient Knowledge", "Wolf Trip", "Eldritch Tactics", "Circle of Battle", "Project Vitality", "Verdant Surge"}
        self.assertFalse(removed & {p["title"] for p in self.entries.values()})

    def test_skill_prerequisites_pick_types_and_unresolved_requirements(self):
        power = self.entries["modern4e.power.utility-general-agile-recovery"]
        self.assertEqual(power["access"], {"type": "always"})
        self.assertEqual(power["prerequisites"], {"type": "allOf", "conditions": [{"type": "level", "minimum": 2}, {"type": "proficiency", "skill": "ACROBATICS"}]})
        sections = {s["id"]: s for s in self.catalog["sections"]}
        for s in sections.values():
            for eid, kinds in s["pickKinds"].items():
                if "COMBAT" in self.entries[eid]["keywords"] and "NON_COMBAT" in self.entries[eid]["keywords"]:
                    self.assertEqual(kinds, ["COMBAT", "NON_COMBAT"])
        rapscallion = "modern4e.power.utility-general-charming-rapscallion"
        self.assertEqual(sections["charismaLevel2NonCombat"]["pickKinds"][rapscallion], ["NON_COMBAT"])
        prerequisites = json.dumps([p["prerequisites"] for p in self.entries.values()])
        self.assertIn('"unresolved"', prerequisites)
        dispel = next(p for p in self.entries.values() if p["title"] == "Dispel Magic")
        attack = dispel["activations"][0]["blocks"][0]
        self.assertEqual(attack["type"], "attack")
        self.assertEqual(attack["comparisons"][0]["defense"], "WILL")
        self.assertEqual(attack["comparisons"][0]["outcomes"]["hit"][0]["label"], "Hit")

    def test_invalid_inventory_and_power_data_are_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            for filename in self.catalog["files"] + ["utilities/catalog.json", "classes/catalog.json"]:
                target = root / filename
                target.parent.mkdir(parents=True, exist_ok=True)
                shutil.copyfile(content.CONTENT / filename, target)
            for filename in json.loads((root / "classes/catalog.json").read_text())["files"]["classes"]:
                shutil.copyfile(content.CONTENT / "classes" / filename, root / "classes" / filename)
            path = root / "utilities/catalog.json"
            mutations = [lambda d: d.update(schemaVersion=True),
                         lambda d: d["files"].append(d["files"][0]),
                         lambda d: d["files"].append("../outside.json"),
                         lambda d: d["sections"][0]["powerIds"].append("missing"),
                         lambda d: d["sections"].pop(),
                         lambda d: d["sections"][0].update(classId="modern4e.class.wizard"),
                         lambda d: d["sections"][0].update(pickKinds={})]
            for mutate in mutations:
                with self.subTest(mutation=mutate):
                    data = copy.deepcopy(self.catalog)
                    mutate(data)
                    path.write_text(json.dumps(data))
                    with self.assertRaises(ValueError):
                        content.load(root)
            path.write_text(json.dumps(self.catalog))
            path = root / self.catalog["files"][0]
            original = json.loads(path.read_text())
            for mutate in [lambda d: d.update(schemaVersion=True),
                           lambda d: d["powers"].append(d["powers"][0]),
                           lambda d: d["powers"][0].update(rows=["Legacy"]),
                           lambda d: d["powers"][0]["activations"][0].update(targets="missing"),
                           lambda d: d["powers"][0].update(powerKind="ATTACK"),
                           lambda d: d["powers"][0].update(prerequisites={"type": "always"})]:
                data = copy.deepcopy(original)
                mutate(data)
                path.write_text(json.dumps(data))
                with self.assertRaises(ValueError):
                    content.load(root)

    def test_export_is_deterministic_and_cannot_overwrite_authoring(self):
        command = ["python3", str(BOOK / "scripts/utility_content.py")]
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "utilities.json"
            subprocess.run(command + ["--output", str(output)], check=True, capture_output=True)
            first = output.read_bytes()
            subprocess.run(command + ["--output", str(output), "--check"], check=True, capture_output=True)
            self.assertEqual(first, output.read_bytes())
            output.write_text("{}")
            self.assertNotEqual(subprocess.run(command + ["--output", str(output), "--check"], capture_output=True).returncode, 0)
        self.assertNotEqual(subprocess.run(command + ["--output", str(content.CONTENT / "utilities/catalog.json")], capture_output=True).returncode, 0)
        self.assertNotEqual(subprocess.run(command + ["--output", str(BOOK / "main.typ")], capture_output=True).returncode, 0)

    @unittest.skipUnless(shutil.which(os.environ.get("TYPST_BIN", "typst")), "Typst unavailable")
    def test_actual_typst_renderer_preserves_cards_and_blocks_withheld_section(self):
        source = '''#import "helpers/utility_content.typ" as u
#import "helpers/power_content.typ": powerCard
#metadata(u.inventory.sections.filter(s => s.availability == "AVAILABLE").map(s => repr(u.utilitySection(s.id))).join())
'''
        with tempfile.NamedTemporaryFile(mode="w", suffix=".typ", dir=BOOK, delete=False) as handle:
            handle.write(source)
            path = Path(handle.name)
        try:
            command = [os.environ.get("TYPST_BIN", "typst"), "query", "--root", str(BOOK), str(path), "metadata"]
            result = subprocess.check_output(command, text=True)
            rendered = json.loads(result)[0]["value"]
            for fragment in ("You stand up.", "you cannot use this power on them", "The conjuration or zone is destroyed", "Sustain Minor"):
                self.assertTrue(fragment in rendered, "Missing rendered fragment: " + fragment)
        finally:
            path.unlink()
        # No authored section is withheld now, so the guard is exercised on a copy with one section flipped.
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            shutil.copytree(BOOK / "helpers", root / "helpers")
            shutil.copytree(BOOK / "svgs", root / "svgs")
            shutil.copytree(content.CONTENT, root / "content", ignore=shutil.ignore_patterns("compendium"))
            data = copy.deepcopy(self.catalog)
            data["sections"][0]["availability"] = "DEFERRED"
            (root / "content/utilities/catalog.json").write_text(json.dumps(data))
            (root / "probe.typ").write_text('#import "helpers/utility_content.typ" as u\n#u.utilitySection("' + data["sections"][0]["id"] + '")')
            rejected = subprocess.run([os.environ.get("TYPST_BIN", "typst"), "query", "--root", str(root), str(root / "probe.typ"), "metadata"],
                                      text=True, capture_output=True)
            self.assertNotEqual(rejected.returncode, 0)
            self.assertIn("Withheld utility section", rejected.stderr)

    def test_legacy_importers_require_safe_scratch_output(self):
        for filename in ("import_class_utilities.py", "import_source_utilities.py"):
            command = ["python3", str(BOOK / "scripts" / filename)]
            result = subprocess.run(command, capture_output=True, text=True)
            self.assertNotEqual(result.returncode, 0)
            self.assertIn("--output", result.stderr)
            result = subprocess.run(command + ["--output", str(content.CONTENT)], capture_output=True, text=True)
            self.assertNotEqual(result.returncode, 0)
            self.assertIn("cannot overwrite", result.stderr)


if __name__ == "__main__":
    unittest.main()
