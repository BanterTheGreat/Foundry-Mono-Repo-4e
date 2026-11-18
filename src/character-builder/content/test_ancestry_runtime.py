"""Observable authoring-to-runtime contract for the shared ancestry package."""
import json
from pathlib import Path
import shutil
import tempfile
import unittest

import ancestry_runtime
import runtime_common

PACKAGE = "modern4e.ancestries"


def entries_by_id(assets=None):
    assets = assets or ancestry_runtime.build()
    return {entry["id"]: entry for entry in runtime_common.entries_of(assets)}


class AncestryRuntimeTest(unittest.TestCase):
    def test_package_shape_counts_and_determinism(self):
        assets = ancestry_runtime.build()
        self.assertEqual(assets, ancestry_runtime.build())
        manifest = assets[f"{PACKAGE}/manifest.json"]
        self.assertEqual((2, PACKAGE, "1", "Modern 4e shared ancestries"),
                         (manifest["formatVersion"], manifest["id"], manifest["revision"], manifest["title"]))
        entries = runtime_common.entries_of(assets)
        counts = {}
        for entry in entries:
            counts[entry["category"]] = counts.get(entry["category"], 0) + 1
        self.assertEqual({"ANCESTRY": 13, "FEATURE": 41, "POWER": 15}, counts)
        self.assertEqual(sorted(entry["id"] for entry in entries), [entry["id"] for entry in entries])
        self.assertEqual(len(entries), len(assets[f"{PACKAGE}/index.json"]["entries"]))
        text = json.dumps(assets)
        self.assertNotIn("Users", text)
        self.assertNotIn("timestamp", text.lower())

    def test_entries_match_contract_and_preserve_complete_authored_data(self):
        source = ancestry_runtime.authoring.load()
        entries = entries_by_id()
        self.assertEqual(set(source), set(entries))
        for key, authored in source.items():
            entry = entries[key]
            self.assertEqual(authored, entry["sharedData"])
            self.assertEqual({"title": authored["title"], "description": authored["description"]}, entry["presentation"])
            mechanics = entry["mechanics"]
            self.assertEqual(2, mechanics["version"])
            self.assertEqual({"type": "always"}, mechanics["access"])
            self.assertEqual([{"type": "always"}], mechanics["prerequisites"])
            self.assertEqual(1, mechanics["maximumSelections"])
            self.assertEqual("UNIMPLEMENTED" if entry["category"] == "POWER" else "PARTIAL", entry["coverage"]["status"])
            self.assertTrue(entry["coverage"]["limitations"])
            self.assertTrue(all(text.strip() for text in entry["coverage"]["limitations"]))
            self.assertEqual([(g["id"], g["entryId"]) for g in authored.get("grants", [])],
                             [(g["grantId"], g["entryId"]) for g in mechanics["grants"]])
            self.assertTrue(all(grant["atLevel"] == 1 for grant in mechanics["grants"]))

    def test_all_thirteen_ancestries_grant_traits_and_keep_attributes_in_shared_data_only(self):
        entries = entries_by_id()
        ancestries = [e for e in entries.values() if e["category"] == "ANCESTRY"]
        self.assertEqual(13, len(ancestries))
        for entry in ancestries:
            self.assertTrue(entry["mechanics"]["grants"])
            self.assertEqual({"size", "speed", "vision", "languages"}, set(entry["sharedData"]["attributes"]))
            self.assertEqual(entry["sharedData"]["attributes"]["size"].upper(), entry["mechanics"]["size"])
            self.assertEqual([{"target": {"statistic": "SPEED"}, "operation": "SET",
                               "value": entry["sharedData"]["attributes"]["speed"]}], entry["mechanics"]["modifiers"])
            self.assertEqual([], entry["mechanics"]["conditionalModifiers"])
            self.assertTrue(any("sharedData" in text for text in entry["coverage"]["limitations"]))
        deva = entries["modern4e.ancestry.deva"]
        self.assertEqual("normal", deva["sharedData"]["attributes"]["size"])
        self.assertTrue(any(text.startswith("Authoring note:") for text in deva["coverage"]["limitations"]))

    def test_language_choices_and_fixed_grants_use_reviewed_structured_ids(self):
        for entry in entries_by_id().values():
            if entry["category"] != "ANCESTRY":
                continue
            source = entry["sharedData"]["attributes"]["languages"]
            self.assertEqual([value.upper().replace("-", "_").replace(" ", "_") for value in source["fixed"]], entry["mechanics"]["facts"][0]["values"])
            choices = entry["mechanics"]["choices"]
            self.assertEqual(1 if source["choiceCount"] else 0, len(choices))
            if choices:
                self.assertEqual(source["choiceCount"], choices[0]["count"])
                self.assertEqual("CHARACTER", choices[0]["distinctScope"])
                self.assertEqual(10, len(choices[0]["options"]))

    def test_dragonborn_and_elf_power_choices_are_finite_entry_choices(self):
        entries = entries_by_id()
        expected = {"modern4e.feature.dragonborn-dragonborn-powers": ["modern4e.power.dragon-breath", "modern4e.power.dragonfear"],
                    "modern4e.feature.elf-elf-powers": ["modern4e.power.elven-accuracy", "modern4e.power.subtle-step"]}
        for key, power_ids in expected.items():
            choices = entries[key]["mechanics"]["choices"]
            self.assertEqual(1, len(choices))
            self.assertEqual({"type": "entries", "id": "ancestry-power", "count": 1, "atLevel": 1, "distinct": False,
                              "entryIds": power_ids}, choices[0])
            self.assertEqual([], entries[key]["mechanics"]["unsupported"])
            self.assertEqual([], entries[key]["mechanics"]["grants"])
            for power_id in power_ids:
                self.assertEqual("POWER", entries[power_id]["category"])

    def test_damage_choices_are_entry_scoped_and_only_dragonborn_links_to_breath(self):
        entries = entries_by_id()
        for key in ("modern4e.feature.dragonborn-dragonborn-scales", "modern4e.feature.kobold-kobold-scales"):
            entry = entries[key]
            choice = entry["mechanics"]["choices"][0]
            self.assertEqual("DAMAGE_TYPE", choice["kind"])
            self.assertEqual(key, choice["targetId"])
            self.assertEqual(7, len(choice["options"]))
            self.assertEqual([], entry["mechanics"]["unsupported"])
        self.assertEqual([{"kind": "DAMAGE_TYPE", "sourceTargetId": "modern4e.feature.dragonborn-dragonborn-scales", "targetId": "modern4e.power.dragon-breath"}],
                         entries["modern4e.power.dragon-breath"]["mechanics"]["factLinks"])

    def test_revenant_past_life_is_qualification_only_and_grants_nothing(self):
        entries = entries_by_id()
        past = entries["modern4e.feature.revenant-past-life"]
        self.assertEqual("ANCESTRY_QUALIFICATION", past["mechanics"]["choices"][0]["kind"])
        self.assertNotIn("modern4e.ancestry.revenant", [option["id"] for option in past["mechanics"]["choices"][0]["options"]])
        self.assertEqual([], past["mechanics"]["grants"])
        self.assertEqual([], past["mechanics"]["unsupported"])
        self.assertEqual({"ancestriesExcept": ["modern4e.ancestry.revenant"]}, past["sharedData"]["choices"][0]["source"])
        # No entry other than the Revenant ancestry itself references Past Life or another ancestry's traits.
        for entry in entries.values():
            for ref in runtime_common.referenced_ids(entry):
                if ref == past["id"]:
                    self.assertEqual("modern4e.ancestry.revenant", entry["id"])
                if entry["id"] == past["id"]:
                    self.fail("Past Life must not reference any entry")

    def test_ancestry_powers_have_no_power_profile_and_never_enter_query_pools(self):
        entries = entries_by_id()
        powers = [e for e in entries.values() if e["category"] == "POWER"]
        self.assertEqual(15, len(powers))
        for power in powers:
            self.assertNotIn("powerProfile", power["mechanics"])
            self.assertNotIn("level", power["sharedData"])
            self.assertNotIn("powerKind", power["sharedData"])
            self.assertEqual("UNIMPLEMENTED", power["coverage"]["status"])
        self.assertFalse(any("powerProfile" in e["mechanics"] for e in entries.values()))
        self.assertFalse(any("query" in choice for e in entries.values() for choice in e["mechanics"]["choices"]))

    def test_references_resolve_inside_the_package_and_closed_keys_only(self):
        assets = ancestry_runtime.build()
        runtime_common.validate_references(assets)
        allowed = {"version", "access", "prerequisites", "grants", "choices", "unsupported", "maximumSelections",
                   "conditionalModifiers", "weaponAbilities", "size", "facts", "factLinks", "modifiers"}
        for entry in runtime_common.entries_of(assets):
            self.assertEqual(set(), set(entry["mechanics"]) - allowed)
            self.assertEqual({"id", "category", "presentation", "mechanics", "coverage", "sharedData"}, set(entry))

    def test_local_change_changes_output_and_malformed_source_fails(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory) / "ancestries"
            shutil.copytree(ancestry_runtime.authoring.CONTENT, root)
            path = root / "dragonborn.json"
            data = json.loads(path.read_text(encoding="utf-8"))
            data["ancestries"][0]["attributes"]["speed"] = 7
            path.write_text(json.dumps(data), encoding="utf-8")
            entries = entries_by_id(ancestry_runtime.build(root))
            self.assertEqual(7, entries["modern4e.ancestry.dragonborn"]["sharedData"]["attributes"]["speed"])
            self.assertEqual(7, entries["modern4e.ancestry.dragonborn"]["mechanics"]["modifiers"][0]["value"])
            self.assertEqual(6, entries_by_id()["modern4e.ancestry.dragonborn"]["sharedData"]["attributes"]["speed"])
            data["ancestries"][0]["grants"][0]["entryId"] = "modern4e.feature.missing"
            path.write_text(json.dumps(data), encoding="utf-8")
            with self.assertRaises(ValueError):
                ancestry_runtime.build(root)
        # A failed build must not leave the default content location redirected.
        self.assertEqual(13, len([e for e in entries_by_id().values() if e["category"] == "ANCESTRY"]))


if __name__ == "__main__":
    unittest.main()
