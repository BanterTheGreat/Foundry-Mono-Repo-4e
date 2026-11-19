"""Theme authoring compiles to a lossless, deterministic mechanics-v2 runtime package."""
import json
from pathlib import Path
import tempfile
import unittest

import runtime_common
import theme_runtime


def entries_by_id(assets):
    """Compiled entries keyed by ID."""
    return {entry["id"]: entry for entry in runtime_common.entries_of(assets)}


class ThemeRuntimeTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.assets = theme_runtime.build()
        cls.entries = entries_by_id(cls.assets)
        cls.source = theme_runtime.load()

    def test_package_shape_counts_and_determinism(self):
        manifest = self.assets["modern4e.themes/manifest.json"]
        self.assertEqual(("modern4e.themes", "1", "Modern 4e shared themes", 2),
                         (manifest["id"], manifest["revision"], manifest["title"], manifest["formatVersion"]))
        self.assertEqual(self.assets, theme_runtime.build())
        self.assertEqual(json.dumps(self.assets, sort_keys=True), json.dumps(theme_runtime.build(), sort_keys=True))
        counts = {}
        for entry in self.entries.values():
            counts[entry["category"]] = counts.get(entry["category"], 0) + 1
        self.assertEqual({"THEME": 9, "FEATURE": 32, "POWER": 11}, counts)
        self.assertEqual(set(self.source), set(self.entries))
        self.assertEqual(len(self.entries), len(self.assets["modern4e.themes/index.json"]["entries"]))
        text = json.dumps(self.assets)
        self.assertNotIn("C:\\\\", text)
        self.assertNotIn("Users", text)

    def test_every_entry_matches_the_content_entry_contract(self):
        for entry_id, entry in self.entries.items():
            self.assertEqual(theme_runtime.category_of(entry_id), entry["category"])
            self.assertTrue(entry["presentation"]["title"])
            self.assertTrue(entry["presentation"]["description"])
            mechanics = entry["mechanics"]
            self.assertEqual(2, mechanics["version"])
            self.assertEqual({"type": "always"}, mechanics["access"])
            self.assertEqual([{"type": "always"}], mechanics["prerequisites"])
            self.assertEqual(1, mechanics["maximumSelections"])
            self.assertEqual([], mechanics["choices"])
            expected = "UNIMPLEMENTED" if entry["category"] == "POWER" else "PARTIAL"
            self.assertEqual(expected, entry["coverage"]["status"])
            self.assertTrue(entry["coverage"]["limitations"])
            self.assertTrue(all(text.strip() for text in entry["coverage"]["limitations"]))
            self.assertEqual(self.source[entry_id], entry["sharedData"])

    def test_theme_grants_mirror_authored_grants_with_levels(self):
        for theme_id, authored in self.source.items():
            if theme_runtime.category_of(theme_id) != "THEME":
                continue
            grants = self.entries[theme_id]["mechanics"]["grants"]
            self.assertEqual([(g["id"], g["entryId"], g["atLevel"]) for g in authored["grants"]],
                             [(g["grantId"], g["entryId"], g["atLevel"]) for g in grants])
            self.assertTrue(all(g["type"] == "entry" for g in grants))
            for key in ("role", "concept", "sections"):
                self.assertEqual(authored[key], self.entries[theme_id]["sharedData"][key])
        self.assertEqual([], self.entries["modern4e.feature.docker-level-1"]["mechanics"]["grants"])

    def test_grant_summary_role_keeps_skyseers_individual_power_grants(self):
        summary_id = "modern4e.feature.skyseer-level-1"
        power_ids = {"modern4e.power.skyseer-vision", "modern4e.power.look-skyward"}
        self.assertEqual("GRANT_SUMMARY", self.entries[summary_id]["presentation"]["grantDisplay"])
        theme = self.entries["modern4e.theme.skyseer"]
        level_one = {g["entryId"] for g in theme["mechanics"]["grants"] if g["atLevel"] == 1}
        self.assertEqual({summary_id} | power_ids, level_one)
        for power_id in power_ids:
            self.assertNotIn("grantDisplay", self.entries[power_id]["presentation"])

    def test_invalid_theme_feature_display_role_is_rejected(self):
        data = theme_runtime.authoring.shared.shared.load_json(theme_runtime.authoring.CONTENT)
        feature = data["features"][0]
        for role, message in [("HIDE", "grantDisplay: unknown value"), ("CHOICE_INTRODUCTION", "must own a choice")]:
            feature["grantDisplay"] = role
            with self.subTest(role=role), self.assertRaisesRegex(ValueError, message):
                theme_runtime.authoring.validate(data)

    def test_references_resolve_inside_the_package_and_all_content_is_granted_or_optioned(self):
        runtime_common.validate_references(self.assets)
        granted = {g["entryId"] for e in self.entries.values() for g in e["mechanics"]["grants"]}
        optioned = {o for e in self.source.values() for o in e.get("modifications", [])}
        leaves = {i for i, e in self.entries.items() if e["category"] != "THEME"}
        self.assertEqual(leaves, granted | optioned)

    def test_gunsmith_modifications_are_unsupported_not_dropped_or_granted(self):
        gunsmith = self.entries["modern4e.theme.gunsmith"]
        options = self.source["modern4e.theme.gunsmith"]["modifications"]
        self.assertEqual(5, len(options))
        self.assertEqual(options, gunsmith["sharedData"]["modifications"])
        self.assertTrue(gunsmith["mechanics"]["unsupported"])
        self.assertTrue(any("modification" in text for text in gunsmith["coverage"]["limitations"]))
        self.assertEqual([], gunsmith["mechanics"]["choices"])
        self.assertFalse({g["entryId"] for g in gunsmith["mechanics"]["grants"]} & set(options))
        for theme_id, entry in self.entries.items():
            if entry["category"] == "THEME" and theme_id != "modern4e.theme.gunsmith":
                self.assertEqual([], entry["mechanics"]["unsupported"])

    def test_theme_powers_never_enter_class_power_query_pools(self):
        powers = [e for e in self.entries.values() if e["category"] == "POWER"]
        self.assertEqual(11, len(powers))
        for power in powers:
            self.assertNotIn("powerProfile", power["mechanics"])
            self.assertNotIn("level", power["sharedData"])
            self.assertNotIn("powerKind", power["sharedData"])
            self.assertTrue(power["sharedData"]["activations"])

    def test_local_change_changes_output_and_invalid_source_fails(self):
        path = theme_runtime.authoring.CONTENT
        data = json.loads(path.read_text(encoding="utf-8"))
        data["themes"][0]["title"] += " Changed"
        with tempfile.TemporaryDirectory() as directory:
            changed_path = Path(directory) / "zeitgeist.json"
            changed_path.write_text(json.dumps(data), encoding="utf-8")
            changed = entries_by_id(theme_runtime.build(changed_path))
            self.assertNotEqual(self.entries[data["themes"][0]["id"]], changed[data["themes"][0]["id"]])
            data["themes"][0]["grants"][0]["entryId"] = "modern4e.feature.missing"
            changed_path.write_text(json.dumps(data), encoding="utf-8")
            with self.assertRaises(ValueError):
                theme_runtime.build(changed_path)
        with self.assertRaises(ValueError):
            theme_runtime.category_of("modern4e.class.fighter")


if __name__ == "__main__":
    unittest.main()
