"""Zeitgeist paragon-path catalog, literal rendering and ordered-power regressions."""
import copy
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest

import path_content as content

BOOK = content.CONTENT.parents[2]


def strings(value):
    """Yield every string in a nested JSON value."""
    if isinstance(value, str):
        yield value
    elif isinstance(value, list):
        for item in value:
            yield from strings(item)
    elif isinstance(value, dict):
        for item in value.values():
            yield from strings(item)


class PathContentTest(unittest.TestCase):
    def setUp(self):
        self.data = json.loads(content.CONTENT.read_text(encoding="utf-8"))
        self.entries = {value["id"]: value for category in content.CATEGORIES for value in self.data[category]}

    def test_complete_catalog_and_book_consumers(self):
        self.assertEqual([len(self.data[k]) for k in ("paths", "features", "rules", "powers")], [9, 32, 27, 26])
        content.load()
        page = (BOOK / "glossary/zeitgeist_paths.typ").read_text(encoding="utf-8")
        self.assertNotIn("pathPower(", page)
        self.assertNotIn("powers.power(", page)
        for value in self.data["paths"]:
            self.assertEqual(page.count('paths.flavor("' + value["id"] + '")'), 1)
            self.assertEqual(page.count('paths.prerequisite("' + value["id"] + '")'), 1)
            self.assertIn('paths.entry("' + value["id"] + '").title', page)
            for grant in value["grants"]:
                method = "powerCard" if ".power." in grant["entryId"] else "feature"
                self.assertEqual(page.count('paths.' + method + '("' + grant["entryId"] + '"'), 1)
            for rule in value["ruleIds"]:
                self.assertEqual(page.count('paths.rule("' + rule + '")'), 1)
        self.assertEqual(page.count("paths.feature(") + page.count("paths.rule(") + page.count("paths.powerCard("), 85)

    def test_grants_preserve_level_and_ownership(self):
        for value in self.data["paths"]:
            levels = [grant["atLevel"] for grant in value["grants"]]
            self.assertEqual(levels, sorted(levels), value["id"])
            self.assertEqual(len({grant["entryId"] for grant in value["grants"]}), len(value["grants"]))
            powers = sum(".power." in grant["entryId"] for grant in value["grants"])
            self.assertEqual(powers, 2 if value["title"] == "Polyhistor" else 3, value["id"])
        for value in self.data["powers"]:
            self.assertEqual(value["access"]["type"], "entry")
            self.assertEqual(self.entries[value["access"]["entryId"]]["id"], value["access"]["entryId"])

    def test_printed_text_is_literal_and_typographic(self):
        for text in strings(self.data):
            self.assertNotIn("'", text, "straight apostrophe would print differently from the typeset book")
        self.assertIn("Defensive Shield (11)", self.entries["modern4e.feature.steamsuit-pilot-defensive-shield"]["title"])
        self.assertIn("Player’s Guide", self.data["document"]["source"])

    def test_local_rules_and_explicit_uncertainty(self):
        hyper = self.entries["modern4e.power.path-hyper-beam"]["activations"][0]
        self.assertIn("does not state the action required", hyper["blocks"][0]["text"])
        beam = self.entries["modern4e.power.path-beam-shot"]["activations"][0]
        self.assertEqual(beam["bindings"]["targets"]["text"], "Target selection unspecified in source; GM ruling required")
        attack = beam["blocks"][1]
        self.assertEqual(attack["comparisons"][0]["defense"], "AC")
        self.assertEqual([b["label"] for b in attack["comparisons"][0]["outcomes"]["hit"]], ["Freeze Ray", "Shrink Ray", "Wave Beam"])
        srasama = self.entries["modern4e.power.path-aspect-of-srasama"]["activations"][0]
        self.assertEqual(srasama["range"], {"type": "RULES_TEXT", "text": "Summoning range unspecified in source; GM ruling required"})
        self.assertEqual(self.entries["modern4e.power.path-power-fist"]["activations"][0]["blocks"][0]["comparisons"][0]["defense"], "REFLEX")
        for value in self.data["paths"]:
            self.assertEqual(value["coverage"]["status"], "UNIMPLEMENTED")

    def test_rejects_invalid_catalog_and_ordered_powers(self):
        mutations = [
            lambda d: d.update(schemaVersion=True),
            lambda d: d["paths"].append(copy.deepcopy(d["paths"][0])),
            lambda d: d["paths"][0].update(themeId="missing"),
            lambda d: d["paths"][0].update(role="TANK"),
            lambda d: d["paths"][0]["grants"][0].update(entryId="missing"),
            lambda d: d["paths"][0]["grants"][0].update(entryId=d["paths"][0]["id"]),
            lambda d: d["paths"][0]["grants"][0].update(atLevel=True),
            lambda d: d["paths"][0]["grants"][0].update(atLevel=13),
            lambda d: d["paths"][0]["grants"].append(copy.deepcopy(d["paths"][0]["grants"][0])),
            lambda d: d["paths"][0]["ruleIds"].append(d["paths"][0]["ruleIds"][0]),
            lambda d: d["paths"][1]["ruleIds"].append(d["paths"][0]["ruleIds"][0]),
            lambda d: d["paths"][0]["prerequisites"]["conditions"].pop(0),
            lambda d: d["features"][0].update(script="execute()"),
            lambda d: d["features"].pop(),
            lambda d: d["rules"].pop(),
            lambda d: d["rules"][0]["sections"][0].update(type="script"),
            lambda d: d["powers"][0]["activations"][0].update(targets="missing"),
            lambda d: d["powers"][0]["activations"][0].update(action="SCRIPT"),
            lambda d: d["powers"][0].update(level=12),
            lambda d: d["powers"][0].update(rulesProfile="DND4E"),
        ]
        themes = {value["id"]: value for value in content.shared.shared.load_json(content.CONTENT.parents[1] / "themes/zeitgeist.json")["themes"]}
        for mutate in mutations:
            with self.subTest(mutation=mutate):
                data = copy.deepcopy(self.data)
                mutate(data)
                with self.assertRaises(ValueError):
                    content.validate(data, themes)

    def test_class_path_catalog_loads_beside_zeitgeist_without_changing_it(self):
        classes = content.load_class_paths()
        self.assertEqual([len(classes[k]) for k in ("paths", "features", "rules", "powers")], [205, 635, 0, 618])
        zeitgeist = content.load()
        self.assertEqual([len(zeitgeist[k]) for k in ("paths", "features", "rules", "powers")], [9, 32, 27, 26])
        shared_ids = {v["id"] for k in content.CATEGORIES for v in classes[k]} & {v["id"] for k in content.CATEGORIES for v in zeitgeist[k]}
        self.assertFalse(shared_ids, "the two catalogs share one runtime package, so identities must not collide")
        # The Typst rulebook still reads only the Zeitgeist catalog and the older class summaries.
        for path in (BOOK / "helpers/path_content.typ", BOOK / "glossary/zeitgeist_paths.typ"):
            self.assertNotIn("class-paths", path.read_text(encoding="utf-8"))

    def test_rejects_invalid_class_path_catalog(self):
        data = json.loads(content.CLASS_CONTENT.read_text(encoding="utf-8"))
        classes = content.class_ids()
        content.validate(copy.deepcopy(data), {}, classes)
        planeshifter = next(i for i, v in enumerate(data["paths"]) if v["title"] == "Planeshifter")
        glorious = next(i for i, v in enumerate(data["paths"]) if v["title"] == "Glorious Myrmidon")
        mutations = [
            lambda d: d["paths"][0].update(access={"type": "always"}),
            lambda d: d["paths"][0].update(access={"type": "entry", "entryId": "modern4e.class.missing"}),
            lambda d: d["paths"][planeshifter]["access"]["conditions"].pop(),
            lambda d: d["paths"][planeshifter]["access"]["conditions"][0].update(entryId="modern4e.path.paragonpath223"),
            lambda d: d["paths"][0].update(prerequisites={"type": "level", "minimum": 12}),
            lambda d: d["paths"][glorious].update(requirements=None),
            lambda d: d["paths"][glorious]["prerequisites"]["conditions"].pop(),
            lambda d: d["paths"][0].update(ruleIds=["modern4e.rule.invented"]),
            lambda d: d["paths"][0].update(id="modern4e.path.paragonpath999"),
            lambda d: d["paths"][0].pop("sourceEntryId"),
            lambda d: d["paths"][0].update(themeId="modern4e.theme.docker"),
            lambda d: d["paths"][0]["grants"][0].update(atLevel=13),
            lambda d: d["paths"][0]["grants"][0].update(entryId=d["paths"][1]["grants"][0]["entryId"]),
            lambda d: d["paths"][0]["grants"].pop(),
            lambda d: d["features"].pop(),
            lambda d: d["powers"][0].update(access={"type": "entry", "entryId": "modern4e.class.fighter"}),
            lambda d: d["powers"][0].update(level=19),
            lambda d: d["powers"][0].update(rulesProfile="PUBLISHED_REFERENCE"),
            lambda d: d["powers"][0]["activations"][0].update(action="SCRIPT"),
            lambda d: d["features"][0].update(script="execute()"),
            lambda d: d["rules"].append({"id": "modern4e.rule.extra"}),
            lambda d: d.update(schemaVersion=2),
        ]
        for mutate in mutations:
            with self.subTest(mutation=mutate):
                mutated = copy.deepcopy(data)
                mutate(mutated)
                with self.assertRaises(ValueError):
                    content.validate(mutated, {}, classes)

    def test_class_path_export_is_deterministic_and_protects_sources(self):
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "class-paths-export.json"
            args = [sys.executable, "-X", "utf8", str(Path(content.__file__)), "--class-paths", "--output", str(output)]
            subprocess.check_call(args, stdout=subprocess.DEVNULL)
            subprocess.check_call([*args, "--check"], stdout=subprocess.DEVNULL)
            self.assertEqual(json.loads(output.read_text(encoding="utf-8"))["kind"], "modern4e.path-authoring")
            rejected = subprocess.call([*args[:-1], str(content.CLASS_CONTENT)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            self.assertNotEqual(rejected, 0)

    def test_export_is_deterministic_and_protects_sources(self):
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "paths.json"
            args = ["python3", str(Path(content.__file__)), "--output", str(output)]
            subprocess.check_call(args, stdout=subprocess.DEVNULL)
            subprocess.check_call([*args, "--check"], stdout=subprocess.DEVNULL)
            self.assertEqual(json.loads(output.read_text(encoding="utf-8"))["kind"], "modern4e.path-authoring")
            output.write_text("{}", encoding="utf-8")
            self.assertNotEqual(subprocess.call([*args, "--check"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL), 0)
            rejected = subprocess.call(["python3", str(Path(content.__file__)), "--output", str(content.CONTENT)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            self.assertNotEqual(rejected, 0)

    @unittest.skipUnless(shutil.which(os.environ.get("TYPST_BIN", "typst")), "Typst unavailable")
    def test_actual_typst_renderer_and_literal_prose(self):
        source = r'''#import "helpers/path_content.typ" as p
#import "helpers/class_text.typ": classText
#let rendered = p.catalog.powers.map(power => p.powerCard(power.id)).join() + p.catalog.features.map(feature => p.feature(feature.id)).join() + p.catalog.rules.map(rule => p.rule(rule.id)).join()
#metadata(repr(rendered) + repr(classText("#panic(\"must stay literal\")")) + repr(p.overview()) + repr(p.introduction()))
'''
        with tempfile.NamedTemporaryFile(mode="w", suffix=".typ", dir=BOOK, delete=False, encoding="utf-8") as handle:
            handle.write(source)
            path = Path(handle.name)
        try:
            output = subprocess.check_output([os.environ.get("TYPST_BIN", "typst"), "query", "--root", str(BOOK), str(path), "metadata"], text=True, encoding="utf-8")
            rendered = json.loads(output)[0]["value"]
            for fragment in ["must stay literal", "Main Ability vs. AC", "Defensive Shield (11)", "Freeze Ray", "does not state the action required", "Skyseer", "Planar Connections"]:
                self.assertIn(fragment, rendered)
        finally:
            path.unlink()


if __name__ == "__main__":
    unittest.main()
