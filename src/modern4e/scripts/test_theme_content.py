"""Zeitgeist theme catalog, literal rendering and ordered-power regressions."""
import copy
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

import theme_content as content

BOOK = content.CONTENT.parents[2]


class ThemeContentTest(unittest.TestCase):
    def setUp(self):
        self.data = json.loads(content.CONTENT.read_text(encoding="utf-8"))
        self.entries = content.load()

    def test_complete_catalog_and_book_consumers(self):
        self.assertEqual([len(self.data[k]) for k in ("themes", "features", "powers")], [9, 32, 11])
        page = (BOOK / "glossary/zeitgeist_themes.typ").read_text(encoding="utf-8")
        self.assertNotIn("#themePower(", page)
        self.assertNotIn("powers.power(", page)
        for value in self.data["themes"]:
            self.assertIn('themes.entry("' + value["id"] + '").title', page)
            self.assertEqual([g["atLevel"] for g in value["grants"] if g["entryId"].startswith("modern4e.feature.")], [1, 5, 10])
            for section in value["sections"]:
                self.assertEqual(page.count('themes.prose("' + value["id"] + '", "' + section + '")'), 1)
            for grant in value["grants"]:
                method = "powerCard" if ".power." in grant["entryId"] else "benefit"
                self.assertEqual(page.count('themes.' + method + '("' + grant["entryId"] + '"'), 1)
            self.assertIn('images/zeitgeist-themes/' + value["id"].split(".")[-1] + '.jpg', page)
        for option in self.entries["modern4e.theme.gunsmith"]["modifications"]:
            self.assertEqual(page.count('themes.modification("' + option + '")'), 1)

    def test_local_rules_and_explicit_uncertainty(self):
        vision = self.entries["modern4e.power.skyseer-vision"]["activations"][0]
        self.assertEqual(vision["action"], "EXTENDED")
        self.assertEqual(vision["usage"]["frequency"], "DAILY")
        hands = self.entries["modern4e.power.hands-of-retribution"]["activations"][0]
        self.assertEqual(hands["range"], {"type": "RULES_TEXT", "text": "Burst radius unspecified in source; GM ruling required"})
        self.assertEqual(hands["usage"]["limits"][0]["maximum"]["byLevel"][-1], {"atLevel": 26, "value": 6})
        self.assertEqual(hands["usage"]["limits"][1], {"period": "ROUND", "maximum": {"base": 1}})
        guns = self.entries["modern4e.power.the-man-with-two-guns-is-god"]["activations"][0]
        self.assertEqual([b["type"] for b in guns["blocks"]], ["effect", "attack", "effect"])
        self.assertEqual(guns["blocks"][1]["comparisons"][0]["defense"], "AC")
        self.assertIn("Risur is 2 instead of 1", self.entries["modern4e.feature.yerasol-veteran-level-1"]["description"])
        self.assertIn("half your bloodied value", self.entries["modern4e.feature.technologist-level-5"]["description"])
        self.assertIn("Normal", self.entries["modern4e.power.speak-with-spirit"]["description"])

    def test_novice_skills_are_authored_in_level_one_benefits(self):
        expected = {
            "docker": ("Streetwise", "Culture"),
            "eschatologist": ("Culture", "Insight"),
            "gunsmith": ("Crafting", "Arcana"),
            "martial-scientist": ("Culture", "Athletics"),
            "skyseer": ("Nature", "Occultism"),
            "spirit-medium": ("Occultism", "Insight"),
            "technologist": ("Crafting", "Finesse"),
            "vekeshi-mystic": ("Religion", "Insight"),
            "yerasol-veteran": ("Endurance", "Command"),
        }
        for theme, (first, second) in expected.items():
            with self.subTest(theme=theme):
                benefit = self.entries[f"modern4e.feature.{theme}-level-1"]["description"]
                self.assertIn(f"*{first}* or *{second}*", benefit)
                self.assertIn("become Novice", benefit)
                self.assertIn("If you are already Trained in both, choose any Untrained skill instead.", benefit)
        self.assertNotIn("Society", self.entries["modern4e.feature.martial-scientist-level-1"]["description"])

    def test_rejects_invalid_catalog_and_ordered_powers(self):
        mutations = [
            lambda d: d.update(schemaVersion=True),
            lambda d: d["themes"].append(copy.deepcopy(d["themes"][0])),
            lambda d: d["themes"][0].update(role="TANK"),
            lambda d: d["themes"][0]["grants"][0].update(entryId="missing"),
            lambda d: d["themes"][0]["grants"][0].update(entryId=d["themes"][0]["id"]),
            lambda d: d["themes"][0]["grants"][0].update(atLevel=True),
            lambda d: d["features"][0].update(script="execute()"),
            lambda d: d["features"].pop(),
            lambda d: d["powers"][0]["activations"][0].update(targets="missing"),
            lambda d: d["powers"][0]["activations"][0].update(action="SCRIPT"),
            lambda d: d["powers"][0].update(keywords=["AUGMENTABLE"]),
            lambda d: d["themes"][2]["modifications"].append(d["themes"][2]["modifications"][0]),
        ]
        for mutate in mutations:
            with self.subTest(mutation=mutate):
                data = copy.deepcopy(self.data)
                mutate(data)
                with self.assertRaises(ValueError):
                    content.validate(data)

    @unittest.skipUnless(shutil.which(os.environ.get("TYPST_BIN", "typst")), "Typst unavailable")
    def test_actual_typst_renderer_and_literal_prose(self):
        source = r'''#import "helpers/theme_content.typ" as t
#import "helpers/class_text.typ": classText
#import "helpers/power_content.typ" as powers
#import "helpers/powers.typ" as cards
#let rendered = t.catalog.powers.map(p => t.powerCard(p.id)).join()
#metadata(repr(rendered) + repr(classText("#panic(\"must stay literal\")")) + cards.actionType.extended + powers.rangeText(t.entry("modern4e.power.hands-of-retribution").activations.first().range))
'''
        with tempfile.NamedTemporaryFile(mode="w", suffix=".typ", dir=BOOK, delete=False, encoding="utf-8") as handle:
            handle.write(source)
            path = Path(handle.name)
        try:
            output = subprocess.check_output([os.environ.get("TYPST_BIN", "typst"), "query", "--root", str(BOOK), str(path), "metadata"], text=True, encoding="utf-8")
            rendered = json.loads(output)[0]["value"]
            for fragment in ["Extended Action", "Main Ability vs. AC", "GM ruling required", "must stay literal", "Ask three questions"]:
                self.assertIn(fragment, rendered)
        finally:
            path.unlink()


if __name__ == "__main__":
    unittest.main()
