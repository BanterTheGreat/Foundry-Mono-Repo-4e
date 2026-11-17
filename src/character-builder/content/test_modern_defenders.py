"""Defender class choices and local power rules survive shared JSON migration."""
import unittest

from test_modern_classes import BOOK, classes

DEFENDERS = ("fighter", "paladin", "swordmage", "warden")


class ModernDefendersTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.catalog = classes.catalog()
        cls.entries = {e["id"]: e for e in cls.catalog["entries"]}

    def named(self, category, title):
        return next(e for e in self.entries.values() if e["category"] == category and e["title"] == title)

    def test_complete_defender_roster_preserves_local_reference_panels(self):
        self.assertEqual(set(DEFENDERS), {e["id"].split(".")[-1] for e in self.entries.values() if e["category"] == "CLASS" and e["role"] == "DEFENDER"})
        expected = {
            "paladin": (["STRENGTH", "CHARISMA"], ["WISDOM"], [12, 12, 12], 20, 6, 10),
            "swordmage": (["INTELLIGENCE"], ["CONSTITUTION", "STRENGTH"], [11, 11, 13], 19, 6, 8),
            "warden": (["STRENGTH"], ["CONSTITUTION", "WISDOM"], [12, 11, 12], 20, 7, 9),
        }
        for name, (main, extra, defenses, base, per_level, surges) in expected.items():
            with self.subTest(name=name):
                entry = self.entries["modern4e.class." + name]
                self.assertEqual(entry["abilities"], {"main": main, "secondary": extra})
                stats = entry["statistics"]
                self.assertEqual([stats["defenses"][d] for d in ("FORTITUDE", "REFLEX", "WILL")], defenses)
                self.assertEqual(stats["health"], {"base": base, "perLevel": per_level, "constitutionMultiplier": 2})
                self.assertEqual(stats["healingSurges"], {"base": surges, "constitutionMultiplier": 1})
        self.assertEqual(self.entries["modern4e.class.swordmage"]["powerSources"], ["MARTIAL", "ARCANE"])
        self.assertEqual(self.entries["modern4e.class.paladin"]["proficiencies"]["shields"], ["LIGHT_SHIELD", "HEAVY_SHIELD"])
        self.assertEqual(self.entries["modern4e.class.warden"]["proficiencies"]["shields"], ["LIGHT_SHIELD", "HEAVY_SHIELD"])

    def test_predeclared_defender_reference_ids_are_preserved(self):
        refs = classes.shared.load_json(BOOK / "content/feat-references.json")["entries"]
        found = []
        for key, ref in refs.items():
            if ref.get("source") in {"classes/" + n + ".typ" for n in DEFENDERS[1:]} and ref["category"] in ("FEATURE", "POWER"):
                self.assertIn(key, self.entries)
                self.assertEqual(self.entries[key]["category"], ref["category"])
                found.append(key)
        self.assertEqual(len(found), 13)

    def test_paladin_fervor_and_grace_grant_only_the_chosen_option(self):
        fervor = self.named("FEATURE", "Paladin's Fervor")
        choice = fervor["choices"][0]
        self.assertEqual(choice["count"], 1)
        options = [self.entries[key] for key in choice["source"]["entryIds"]]
        self.assertEqual([len(option["grants"]) for option in options], [2, 1])
        self.assertNotIn("grants", fervor)
        grace = self.named("FEATURE", "Paladin's Grace")["choices"][0]
        self.assertEqual(grace["count"], 1)
        self.assertEqual(len(grace["source"]["entryIds"]), 3)
        self.assertEqual(grace["constraints"], [{"type": "distinct"}])

    def test_paladin_channel_choices_usage_and_smite_scaling(self):
        feature = self.entries["modern4e.feature.paladin-channel-divinity"]
        self.assertEqual(feature["choices"][0]["count"], 2)
        self.assertEqual(len(feature["choices"][0]["source"]["entryIds"]), 4)
        self.assertTrue(any("5, 11 and 21" in t for t in feature["coverage"]["limitations"]))
        for title in ("Divine Mettle", "Divine Strength", "Righteous Shield", "Smite the Condemned"):
            power = self.named("POWER", title)
            self.assertEqual(power["activations"][0]["usage"]["limits"], [{"period": "ENCOUNTER", "maximum": {"base": 1}, "poolId": "modern4e.resource.channel-divinity"}])
        attack = self.named("POWER", "Smite the Condemned")["activations"][0]["blocks"][0]
        self.assertEqual(attack["roll"]["statistic"], {"type": "RULES_TEXT", "text": "Strength or Charisma"})
        self.assertEqual([s["atLevel"] for s in attack["comparisons"][0]["outcomes"]["hit"][0]["scaling"]], [5, 9, 15, 19, 25, 29])
        self.assertEqual(attack["comparisons"][0]["outcomes"]["miss"][0]["text"], "Half damage.")

    def test_grace_costs_touch_range_and_dynamic_daily_limits_are_preserved(self):
        for title in ("Ardent Vow", "Lay On Hands", "Virtue's Touch"):
            power = self.named("POWER", title)
            activation = power["activations"][0]
            self.assertEqual(activation["usage"]["frequency"], "AT_WILL")
            self.assertEqual(activation["usage"]["limits"], [{"period": "ROUND", "maximum": {"base": 1}}])
            self.assertIn("Wisdom (minimum 1)", activation["usage"]["rules"][0])
            self.assertIn("Lose one", activation["usage"]["costs"][0])
            self.assertIn("healing surge", activation["requirement"])
            if title != "Ardent Vow":
                self.assertEqual(activation["range"], {"type": "MELEE", "distance": "TOUCH", "origin": "self"})

    def test_swordmage_aegis_and_warden_guardian_options_are_complete(self):
        for title, count in [("Spellwarden Aegis", 3), ("Guardian Might", 4)]:
            choice = self.named("FEATURE", title)["choices"][0]
            self.assertEqual(choice["count"], 1)
            self.assertEqual(len(choice["source"]["entryIds"]), count)
        shielding = self.entries["modern4e.power.aegis-of-shielding"]["activations"][0]
        self.assertIn("immediate interrupt", shielding["blocks"][0]["text"])
        fury = self.named("POWER", "Warden's Fury")["activations"][0]
        grasp = self.named("POWER", "Warden's Grasp")["activations"][0]
        self.assertEqual(fury["action"], "IMMEDIATE_INTERRUPT")
        self.assertEqual(grasp["action"], "IMMEDIATE_REACTION")
        self.assertEqual(fury["blocks"][0]["comparisons"][0]["defense"], "FORTITUDE")

    def test_defender_pages_consume_json_without_inline_rules_or_cards(self):
        for name in DEFENDERS[1:]:
            page = (BOOK / "classes" / (name + ".typ")).read_text(encoding="utf-8")
            self.assertIn("content.classReference(classData)", page)
            self.assertIn("content.initialPowerText(classData)", page)
            self.assertNotIn("#powers.power(", page)
            self.assertNotIn("#classes.defensesAndHealth(", page)
            for category in ("features", "powers"):
                data = (BOOK / "content/classes" / (name + "-" + category + ".json")).read_text(encoding="utf-8")
                self.assertNotRegex(data, r"#(?:powers|classes|theme)\.")


if __name__ == "__main__":
    unittest.main()
