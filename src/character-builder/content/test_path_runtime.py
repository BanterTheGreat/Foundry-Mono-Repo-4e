"""Production path acquisition and higher-level pool regression coverage."""
import unittest
import json

import build
import class_runtime
import path_runtime
import runtime_common
import samples


class PathRuntimeTest(unittest.TestCase):
    def test_path_class_index_matches_access_before_loading_definitions(self):
        assets = path_runtime.build()
        entries = {entry["id"]: entry for entry in runtime_common.entries_of(assets)}
        index = assets[f"{path_runtime.PACKAGE}/index.json"]["entries"]
        self.assertEqual("2", assets[f"{path_runtime.PACKAGE}/manifest.json"]["revision"])
        chunks = {}
        for row in index:
            self.assertNotIn("classId", row)
            scopes = row.get("pathClassIds", [])
            entry = entries[row["id"]]
            if entry["category"] == "PARAGON_PATH" and entry["sharedData"].get("sourceEntryId"):
                expected = sorted({node["entryId"] for node in entry["mechanics"]["access"]["conditions"]})
                self.assertEqual(expected, scopes)
            else:
                self.assertFalse(scopes)
            chunks.setdefault(row["chunkId"], set()).add(tuple(scopes))
        self.assertTrue(any(row.get("pathClassIds") for row in index))
        self.assertTrue(all(len(scopes) == 1 for scopes in chunks.values()),
                        "Unrelated class path scopes must not share definition chunks")

    def test_path_class_scope_keeps_shared_routes_and_unrestricted_alternatives(self):
        fighter = {"type": "entry", "entryId": "modern4e.class.fighter"}
        warlord = {"type": "entry", "entryId": "modern4e.class.warlord"}
        theme = {"type": "entry", "entryId": "modern4e.theme.docker"}
        level = {"type": "level", "minimum": 11}
        self.assertEqual({fighter["entryId"], warlord["entryId"]}, path_runtime.class_access_ids(
            {"type": "anyOf", "conditions": [fighter, warlord]}))
        self.assertEqual({fighter["entryId"]}, path_runtime.class_access_ids(
            {"type": "allOf", "conditions": [fighter, level]}))
        for alternative in (theme, {"type": "unresolved"}, {"type": "always"}):
            self.assertFalse(path_runtime.class_access_ids(
                {"type": "anyOf", "conditions": [fighter, alternative]}))
        self.assertFalse(path_runtime.class_access_ids({}))

    def test_every_class_has_paragon_attack_candidates(self):
        for path in class_runtime.authoring.CONTENT.glob("*-attack-powers.json"):
            powers = json.loads(path.read_text(encoding="utf-8"))["powers"]
            with self.subTest(path=path.name):
                self.assertTrue({13, 15, 17, 19} <= {power["level"] for power in powers})
                for power in powers:
                    if power["level"] >= 17:
                        self.assertIn("entryId", power["source"])
                        self.assertIn("rulesText", power["source"])
                        self.assertNotIn(" modifier", json.dumps(power["activations"]))

    def test_complete_authored_paths_and_level_gated_grants_are_preserved(self):
        data = path_runtime.authoring.load()
        entries = {entry["id"]: entry for entry in runtime_common.entries_of(path_runtime.build())}
        for path in data["paths"]:
            actual = entries[path["id"]]
            self.assertEqual("PARAGON_PATH", actual["category"])
            self.assertEqual(path["prerequisites"], actual["mechanics"]["prerequisites"][0])
            grants = actual["mechanics"]["grants"]
            for grant in path["grants"]:
                self.assertIn({"type": "entry", "grantId": grant["id"], "entryId": grant["entryId"],
                               "atLevel": grant["atLevel"]}, grants)
            for rule_id in path["ruleIds"]:
                self.assertIn(rule_id, {grant["entryId"] for grant in grants})
                self.assertTrue(entries[rule_id]["presentation"]["description"])
        for power in data["powers"]:
            actual = entries[power["id"]]
            self.assertNotIn("powerProfile", actual["mechanics"])
            self.assertEqual(power, actual["sharedData"])
            self.assertIn("/", actual["presentation"]["description"])

    def test_class_path_summaries_keep_missing_automation_visible(self):
        entries = runtime_common.entries_of(path_runtime.build())
        summaries = [entry for entry in entries if entry["sharedData"].get("sourceEntryId")]
        self.assertTrue(summaries)
        for entry in summaries:
            self.assertEqual("UNIMPLEMENTED", entry["coverage"]["status"])
            self.assertNotIn("grants", entry["mechanics"])
            self.assertIn("manual entry", entry["coverage"]["limitations"][0])
            self.assertEqual(11, entry["mechanics"]["prerequisites"][0]["minimum"])
            self.assertTrue(entry["mechanics"]["access"]["conditions"])
        runtime_common.validate_references(build.production())
        self.assertIn("modern4e.paths", samples.MODERN_PACKAGES)

    def test_higher_acquisitions_preserve_slot_identity_and_ambiguous_encounter_kind(self):
        catalog = class_runtime.authoring.catalog()
        choices = class_runtime.advancement_choices(catalog)
        self.assertEqual(catalog["advancement"]["powerChoices"], choices[:9])
        extra = {choice["id"]: class_runtime.compile_choice(choice) for choice in choices[9:]}
        self.assertEqual({"modern4e.choice.class-attack-encounter-13", "modern4e.choice.class-utility-17",
                          "modern4e.choice.class-encounter-17"}, set(extra))
        encounter = extra["modern4e.choice.class-encounter-17"]
        self.assertEqual({"category": "POWER", "usage": "ENCOUNTER", "levelMaximum": 17}, encounter["query"])
        self.assertEqual("UTILITY", extra["modern4e.choice.class-utility-17"]["query"]["powerKind"])
        self.assertEqual(len(choices), len({choice["id"] for choice in choices}))
