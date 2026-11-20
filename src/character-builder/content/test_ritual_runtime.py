"""Shared ritual rules and published formula variant regressions."""

from collections import Counter
import unittest

import build
import ritual_runtime
import runtime_common


class RitualRuntimeTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.entries = {entry["id"]: entry for entry in runtime_common.entries_of(ritual_runtime.build())}

    def test_every_rulebook_ritual_loads_with_its_complete_profile(self):
        cards = build.load_json(ritual_runtime.RITUALS)["rituals"]
        entries = [entry for key, entry in self.entries.items() if key.startswith("modern4e.ritual.")]
        self.assertEqual({card["id"] for card in cards}, {entry["id"] for entry in entries})
        self.assertEqual(
            {"Crafting": 12, "Arcane": 28, "Primal": 22, "Divine": 15, "Medical": 6},
            Counter(entry["sharedData"]["category"] for entry in entries),
        )
        for card in cards:
            with self.subTest(card=card["title"]):
                entry = self.entries[card["id"]]
                self.assertEqual(card["title"], entry["presentation"]["title"])
                self.assertTrue(entry["presentation"]["description"].strip())
                for field in ("level", "time", "duration", "marketPrice", "cost", "keywords", "focus"):
                    self.assertEqual(card.get(field), entry["sharedData"].get(field))

    def test_rich_cards_keep_table_rows_and_check_result_bullets(self):
        campsite = self.entries["modern4e.ritual.ward-campsite"]
        self.assertIn("3–5 | 25 gp", campsite["presentation"]["description"])
        self.assertIn("<b>Trap Level | Cost</b><br>3–5 | 25 gp", campsite["sharedData"]["rulesHtml"])
        self.assertIn("26–30 | 50,000 gp", campsite["sharedData"]["rulesHtml"])
        animal_messenger = self.entries["modern4e.ritual.animal-messenger"]
        self.assertIn("<li>19 or lower: 6 hours</li>", animal_messenger["sharedData"]["rulesHtml"])
        with self.assertRaises(ValueError):
            ritual_runtime.ritual_rules([{"table": [["a", "b"], ["c"]]}], "uneven table")

    def test_formula_groups_level_variants_and_preserves_published_item_rules(self):
        entries = {key: entry for key, entry in self.entries.items() if key.startswith("modern4e.formula.")}
        self.assertEqual(79, len(entries))
        self.assertEqual(len(entries), len({entry["presentation"]["title"] for entry in entries.values()}))
        acid = entries["modern4e.formula.item470"]
        self.assertEqual("Alchemist's Acid", acid["presentation"]["title"])
        data = acid["sharedData"]
        self.assertEqual("70 gp", data["formulaCost"])
        self.assertEqual("30 minutes", data["time"])
        self.assertEqual(1, data["level"])
        self.assertEqual([1, 6, 11, 16, 21, 26], [variant["level"] for variant in data["variants"]])
        self.assertEqual(["20 gp", "75 gp", "350 gp", "1,800 gp", "9,000 gp", "45,000 gp"],
                         [variant["cost"] for variant in data["variants"]])
        self.assertIn("Published in Adventurer's Vault", acid["presentation"]["description"])
        self.assertIn("Make an attack: Ranged 5/10", acid["presentation"]["description"])
        self.assertNotIn("class=", data["rulesHtml"])
        incomplete = entries["modern4e.formula.item2099"]["sharedData"]
        self.assertNotIn("formulaCost", incomplete)
        self.assertNotIn("time", incomplete)
        self.assertEqual(2, incomplete["variants"][0]["level"])
