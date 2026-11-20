"""Observable authoring-to-runtime contract for the shared `modern4e.utilities` package."""
import json
import unittest

import class_runtime
import runtime_common
import utility_runtime


def classes():
    """Every authored class ID, as the lead's combined catalog would define them."""
    catalog = class_runtime.authoring.catalog()
    return [entry["id"] for entry in catalog["entries"] if entry["category"] == "CLASS"]


class UtilityRuntimeTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.assets = utility_runtime.build()
        cls.class_ids = classes()
        cls.catalog, cls.powers = utility_runtime.authoring.load()
        cls.entries = {entry["id"]: entry for entry in runtime_common.entries_of(cls.assets)}
        cls.sections = {power_id: section for section in cls.catalog["sections"] for power_id in section["powerIds"]}

    def test_package_contains_every_authored_utility_in_hundred_entry_chunks(self):
        self.assertEqual(1046, len(self.powers))
        self.assertEqual(set(self.powers), set(self.entries))
        entries = runtime_common.entries_of(self.assets)
        self.assertEqual(len(self.powers), len(entries))
        self.assertEqual(len(self.powers), len({entry["id"] for entry in entries}))
        manifest = self.assets["modern4e.utilities/manifest.json"]
        self.assertEqual(("modern4e.utilities", "3", "Modern 4e shared utility powers", 2),
                         (manifest["id"], manifest["revision"], manifest["title"], manifest["formatVersion"]))
        # Each class's utilities fill their own chunks (19 classes), plus unscoped skill/power-source utilities.
        self.assertEqual(22, len(manifest["chunks"]))
        rows = self.assets["modern4e.utilities/index.json"]["entries"]
        for chunk in manifest["chunks"]:
            self.assertEqual(1, len({row.get("classId") for row in rows if row["chunkId"] == chunk}), chunk)
        self.assertEqual(19, len({row["classId"] for row in rows if "classId" in row}))
        self.assertTrue(all(len(self.assets[f"modern4e.utilities/{name}.json"]["entries"]) <= 100 for name in manifest["chunks"]))
        self.assertEqual(1046, len(self.assets["modern4e.utilities/index.json"]["entries"]))
        self.assertTrue(all(entry["category"] == "POWER" for entry in entries))

    def test_output_is_deterministic_and_contains_no_local_paths(self):
        self.assertEqual(self.assets, utility_runtime.build())
        encoded = json.dumps(self.assets, sort_keys=True)
        self.assertNotIn("C:\\\\", encoded)
        self.assertNotIn("Foundry Mono Repo", encoded)
        self.assertNotIn("/Workspace/", encoded)

    def test_available_sections_become_selectable_pool_members(self):
        available = [power_id for power_id, section in self.sections.items() if section["availability"] == "AVAILABLE"]
        self.assertEqual(1046, len(available))
        for power_id in available:
            profile = self.entries[power_id]["mechanics"]["powerProfile"]
            self.assertEqual("UTILITY", profile["powerKind"])
            self.assertEqual(self.powers[power_id]["level"], profile["level"])
            self.assertEqual(self.sections[power_id]["pickKinds"][power_id], profile["pickKinds"])
            self.assertIn(profile["usage"], ("AT_WILL", "ENCOUNTER", "DAILY"))
            self.assertEqual([], self.entries[power_id]["mechanics"]["unsupported"])
        fighter = next(section for section in self.catalog["sections"] if section.get("classId") == "modern4e.class.fighter")
        entry = self.entries[fighter["powerIds"][0]]
        source = self.powers[entry["id"]]
        self.assertEqual(source["activations"][0]["usage"]["frequency"], entry["mechanics"]["powerProfile"]["usage"])
        self.assertEqual(source["keywords"], entry["mechanics"]["powerProfile"]["keywords"])

    def test_no_authored_utility_is_withheld(self):
        self.assertEqual([], [power_id for power_id, section in self.sections.items() if section["availability"] != "AVAILABLE"])

    def test_formerly_withheld_utilities_join_their_class_pools_at_their_own_level(self):
        cases = {"modern4e.power.utility-class-deferred-power7643": ("modern4e.class.artificer", 2),
                 "modern4e.power.utility-class-deferred-power4148": ("modern4e.class.artificer", 10)}
        levels = {entry["sharedData"]["title"]: entry["mechanics"]["powerProfile"]["level"]
                  for entry in self.entries.values() if entry["id"].startswith("modern4e.power.utility-class-deferred-")}
        self.assertEqual(36, len(levels))
        # Cleric's off-slot utilities are level 1; earlier-level powers stay in every later level's pool.
        self.assertEqual({1}, {levels[title] for title in ("Create Water", "True Strike", "Soothing Light")})
        self.assertEqual({8}, {levels["Shield Block"], levels["Spirit of the Virtuous Charger"]})
        self.assertEqual(5, levels["Reactive Shift"])
        self.assertEqual(4, levels["Lesser Planar Ally"])
        for power_id, (class_id, level) in cases.items():
            entry = self.entries[power_id]
            self.assertEqual({"type": "entry", "entryId": class_id}, entry["mechanics"]["access"])
            self.assertEqual(level, entry["mechanics"]["powerProfile"]["level"])
            self.assertEqual(class_id, self.sections[power_id]["classId"])
            # The review reasons are resolved; only the generic runtime limitation remains in the authored data.
            self.assertEqual(1, len(self.powers[power_id]["coverage"]["limitations"]))
            # Play-time effects are out of scope, so the runtime entry carries no limitation.
            self.assertEqual("SUPPORTED", self.entries[power_id]["coverage"]["status"])

    def test_withheld_sections_resolve_but_are_excluded_from_pools(self):
        power = self.powers["modern4e.power.utility-class-deferred-power7643"]
        section = {**self.sections[power["id"]], "availability": "DEFERRED"}
        entry = utility_runtime.compile_utility(power, section, known=set(self.powers) | set(self.class_ids))
        self.assertNotIn("powerProfile", entry["mechanics"])
        self.assertIn(utility_runtime.WITHHELD, entry["mechanics"]["unsupported"])
        self.assertEqual("PARTIAL", entry["coverage"]["status"])
        self.assertIn(utility_runtime.WITHHELD, entry["coverage"]["limitations"])
        self.assertEqual("DEFERRED", entry["sharedData"]["utilitySection"]["availability"])
        # Withheld rules text is not presented; the unreviewed description is unchanged.
        self.assertEqual(power["description"], entry["presentation"]["description"])

    def test_access_and_prerequisites_are_preserved_structurally(self):
        for power_id, power in self.powers.items():
            mechanics = self.entries[power_id]["mechanics"]
            self.assertEqual(power["access"], mechanics["access"])
            prerequisites = mechanics["prerequisites"][0]
            required = prerequisites["conditions"] if prerequisites["type"] == "allOf" else [prerequisites]
            self.assertIn({"type": "level", "minimum": power["level"]}, required)
            section = self.sections[power_id]
            if section["kind"] == "SKILL":
                self.assertEqual({"type": "always"}, mechanics["access"])
                self.assertEqual("allOf", prerequisites["type"])
                self.assertTrue(any(node["type"] == "proficiency" for node in required))
            elif section["kind"] == "SOURCE":
                self.assertEqual({"type": "classPowerSource", "powerSource": section["powerSource"]}, mechanics["access"])
            else:
                self.assertEqual("entry", mechanics["access"]["type"])
                self.assertIn(mechanics["access"]["entryId"], self.class_ids)

    def test_unresolved_prerequisites_remain_explicit(self):
        unresolved = [entry for entry in self.entries.values() if "unresolved" in json.dumps(entry["mechanics"]["prerequisites"])]
        self.assertTrue(unresolved)
        for entry in unresolved:
            self.assertEqual([self.powers[entry["id"]]["prerequisites"]], entry["mechanics"]["prerequisites"])

    def test_section_metadata_travels_in_shared_data(self):
        for power_id, entry in self.entries.items():
            section = self.sections[power_id]
            metadata = entry["sharedData"]["utilitySection"]
            self.assertEqual((section["id"], section["kind"], section["availability"], section["pickKinds"][power_id]),
                             (metadata["id"], metadata["kind"], metadata["availability"], metadata["pickKinds"]))
            authored = {key: value for key, value in entry["sharedData"].items() if key not in ("utilitySection", "category")}
            self.assertEqual(self.powers[power_id], authored)
        kinds = {tuple(entry["sharedData"]["utilitySection"]["pickKinds"]) for entry in self.entries.values()}
        self.assertEqual({("COMBAT",), ("NON_COMBAT",), ("COMBAT", "NON_COMBAT")}, kinds)
        sources = [entry for entry in self.entries.values() if entry["sharedData"]["utilitySection"]["kind"] == "SOURCE"]
        self.assertTrue(all("powerSource" in entry["sharedData"]["utilitySection"] for entry in sources))

    def test_available_description_renders_local_rules_and_coverage_stays_honest(self):
        for power_id, entry in self.entries.items():
            limitations = entry["coverage"]["limitations"]
            self.assertEqual("PARTIAL" if limitations else "SUPPORTED", entry["coverage"]["status"])
            self.assertEqual(self.sections[power_id]["availability"] != "AVAILABLE", bool(limitations) and utility_runtime.WITHHELD in limitations)
            self.assertEqual(1, entry["mechanics"]["maximumSelections"])
            if self.sections[power_id]["availability"] == "AVAILABLE":
                self.assertTrue(entry["presentation"]["description"].startswith(self.powers[power_id]["description"]))
                self.assertIn(self.powers[power_id]["activations"][0]["blocks"][0]["text"], entry["presentation"]["description"])
                self.assertNotIn("rulesText", entry["sharedData"].get("source", {}))

    def test_every_mechanical_reference_resolves_against_the_class_catalog(self):
        stubs = {f"modern4e.classes/stub-{index}.json": {"id": f"stub-{index}", "entries": [
            {"id": class_id, "category": "CLASS", "mechanics": {}}]} for index, class_id in enumerate(self.class_ids)}
        runtime_common.validate_references({**self.assets, **{name + "/entries": value for name, value in stubs.items()}})
        broken = json.loads(json.dumps(self.assets))
        next(iter(runtime_common.entries_of(broken)))["mechanics"]["access"] = {"type": "entry", "entryId": "modern4e.class.missing"}
        with self.assertRaisesRegex(ValueError, "absent from the production catalog"):
            runtime_common.validate_references({**broken, **{name + "/entries": value for name, value in stubs.items()}})

    def test_unknown_entry_references_become_unresolved(self):
        node = {"type": "allOf", "conditions": [{"type": "entry", "entryId": "known"}, {"type": "entry", "entryId": "nowhere"},
                                                  {"type": "level", "minimum": 2}]}
        resolved = utility_runtime.resolve(node, {"known"})
        self.assertEqual({"type": "entry", "entryId": "known"}, resolved["conditions"][0])
        self.assertEqual("unresolved", resolved["conditions"][1]["type"])
        self.assertEqual({"type": "level", "minimum": 2}, resolved["conditions"][2])
        power = next(power for power in self.powers.values() if power["access"]["type"] == "entry")
        entry = utility_runtime.compile_utility(power, self.sections[power["id"]], known=set())
        self.assertEqual("unresolved", entry["mechanics"]["access"]["type"])
        self.assertEqual(power["access"], entry["sharedData"]["access"])


if __name__ == "__main__":
    unittest.main()
