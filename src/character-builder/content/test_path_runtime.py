"""Production path acquisition and higher-level pool regression coverage."""
import json
from pathlib import Path
import tempfile
import unittest

import build
import class_runtime
import path_runtime
import runtime_common
import samples

# Authored before the Artificer, Sorcerer and Druid pages listed them; their access now names those classes too.
SHARED_WITH_NEW_CLASSES = {"modern4e.path.paragonpath351", "modern4e.path.paragonpath692", "modern4e.path.paragonpath834"}
# Pack Lord's level 20 feature picks a druid summoning power; every Steadfast Sentinel card is a granted feature.
IRREGULAR_POWER_LEVELS = {"modern4e.path.paragonpath484": {11, 12}, "modern4e.path.paragonpath782": {12, 16, 20}}


def flatten(prerequisites):
    """Every leaf requirement, so one AND group equals the same requirements listed separately."""
    return [leaf for node in prerequisites for leaf in (flatten(node["conditions"]) if node["type"] == "allOf" else [node])]


def route_ids(access):
    """Class routes of an access condition: a single class or an any-of group of classes."""
    return {node["entryId"] for node in (access["conditions"] if access["type"] == "anyOf" else [access])}


class PathRuntimeTest(unittest.TestCase):
    def test_path_class_index_matches_access_before_loading_definitions(self):
        assets = path_runtime.build()
        entries = {entry["id"]: entry for entry in runtime_common.entries_of(assets)}
        index = assets[f"{path_runtime.PACKAGE}/index.json"]["entries"]
        self.assertEqual("3", assets[f"{path_runtime.PACKAGE}/manifest.json"]["revision"])
        owner_scope = {}
        for row in index:
            scopes = row.get("pathClassIds", [])
            entry = entries[row["id"]]
            if entry["category"] == "POWER":
                self.assertEqual(entry["mechanics"]["access"]["entryId"], row["classId"])
            else:
                self.assertNotIn("classId", row)
            if entry["category"] == "PARAGON_PATH" and entry["sharedData"].get("sourceEntryId"):
                self.assertEqual(sorted(route_ids(entry["mechanics"]["access"])), scopes)
            else:
                self.assertFalse(scopes)
            owner_scope[row["id"]] = tuple(scopes)
        self.assertTrue(any(row.get("pathClassIds") for row in index))
        # A path's granted features and powers share its chunks, so a class never loads another class's definitions.
        chunks = {}
        for row in index:
            entry = entries[row["id"]]
            access = entry["mechanics"]["access"]
            owner = access["entryId"] if entry["category"] in ("FEATURE", "POWER") and access["type"] == "entry" else row["id"]
            chunks.setdefault(row["chunkId"], set()).add(owner_scope[owner])
        self.assertTrue(all(len(scopes) == 1 for scopes in chunks.values()),
                        "Unrelated class path scopes must not share definition chunks")
        self.assertGreater(len({next(iter(scopes)) for scopes in chunks.values()}), 7)

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

    def test_class_paths_are_authored_with_level_gated_grants_and_no_unimplemented_summaries(self):
        data = path_runtime.authoring.load_class_paths()
        assets = path_runtime.build()
        entries = {entry["id"]: entry for entry in runtime_common.entries_of(assets)}
        old = json.loads((Path(__file__).parent / "fixtures/paths/class-path-summaries-revision-2.json").read_text(encoding="utf-8"))["paths"]
        index = {row["id"]: row for row in assets[f"{path_runtime.PACKAGE}/index.json"]["entries"]}
        self.assertEqual(205, len(data["paths"]))
        self.assertLessEqual(set(old), {path["id"] for path in data["paths"]})
        self.assertEqual([], path_runtime.summaries({path["id"] for path in data["paths"]}))
        for path in data["paths"]:
            actual = entries[path["id"]]
            self.assertEqual("PARAGON_PATH", actual["category"])
            self.assertNotIn("manual entry", json.dumps(actual["coverage"]))
            self.assertNotEqual("UNIMPLEMENTED", actual["coverage"]["status"])
            grants = actual["mechanics"]["grants"]
            self.assertEqual([(g["entryId"], g["atLevel"]) for g in path["grants"]], [(g["entryId"], g["atLevel"]) for g in grants])
            levels = {g["atLevel"] for g in grants if ".power." in g["entryId"]}
            self.assertEqual(IRREGULAR_POWER_LEVELS.get(path["id"], {11, 12, 20}), levels, path["id"])
            self.assertIn(16, {g["atLevel"] for g in grants}, path["id"])
            classes = sorted(route_ids(actual["mechanics"]["access"]))
            self.assertEqual(classes, index[path["id"]].get("pathClassIds"), path["id"])
            self.assertEqual(path["description"], actual["presentation"]["description"], path["id"])
            self.assertEqual(path["requirements"], actual["sharedData"]["requirements"], path["id"])
            if path["id"] not in old:
                continue
            # Eligibility inputs are exactly the old summaries'; a path later shared with another class only gains classes.
            expected = old[path["id"]]
            self.assertLessEqual(set(expected["pathClassIds"]), set(classes), path["id"])
            if path["id"] not in SHARED_WITH_NEW_CLASSES:
                self.assertEqual(expected["pathClassIds"], classes, path["id"])
            self.assertEqual(expected["title"], actual["presentation"]["title"])
            self.assertEqual(expected["description"], actual["presentation"]["description"])
            self.assertEqual(expected["requirements"], actual["sharedData"]["requirements"])
            self.assertEqual(sorted(json.dumps(node, sort_keys=True) for node in expected["prerequisites"]),
                             sorted(json.dumps(node, sort_keys=True) for node in flatten(actual["mechanics"]["prerequisites"])))
        runtime_common.validate_references(build.production())
        self.assertIn("modern4e.paths", samples.MODERN_PACKAGES)

    def test_class_path_powers_are_automatic_grants_never_selectable_or_in_class_pools(self):
        assets = path_runtime.build()
        entries = runtime_common.entries_of(assets)
        classes = runtime_common.entries_of(class_runtime.build())
        pooled = {entry["id"] for entry in classes}
        granted = [entry for entry in entries if entry["category"] == "POWER"
                   and entry["sharedData"]["access"]["entryId"].startswith("modern4e.path.paragonpath")]
        self.assertEqual(618, len(granted))
        for entry in granted:
            self.assertNotIn("powerProfile", entry["mechanics"], entry["id"])
            self.assertNotIn(entry["id"], pooled)
            self.assertEqual("entry", entry["mechanics"]["access"]["type"])
            # A published prerequisite line (a wild shape power) sits beside the level inside an AND group.
            level = next(leaf for leaf in flatten(entry["mechanics"]["prerequisites"]) if leaf["type"] == "level")
            self.assertEqual(entry["sharedData"]["level"], level["minimum"], entry["id"])
            self.assertEqual("SUPPORTED", entry["coverage"]["status"], entry["id"])
        by_id = {entry["id"]: entry for entry in granted}
        for row in assets[f"{path_runtime.PACKAGE}/index.json"]["entries"]:
            if row["id"] in by_id:
                # Reserved to its own path: no class's power query can list or preload it, and no class owns it.
                self.assertEqual(by_id[row["id"]]["sharedData"]["access"]["entryId"], row["classId"])
                self.assertFalse(row["classId"].startswith("modern4e.class."))

    def test_partial_coverage_reports_unenforced_published_prerequisites(self):
        entries = {entry["id"]: entry for entry in runtime_common.entries_of(path_runtime.build())}
        pack_master = entries["modern4e.path.paragonpath133"]
        self.assertEqual("PARTIAL", pack_master["coverage"]["status"])
        self.assertEqual(["Published prerequisite not enforced: Warlord class, good alignment."], pack_master["coverage"]["limitations"])
        self.assertEqual({"status": "SUPPORTED", "limitations": []}, entries["modern4e.path.paragonpath258"]["coverage"])
        self.assertEqual("PARTIAL", entries["modern4e.path.applied-astronomist"]["coverage"]["status"])

    def test_a_listed_class_path_without_authored_content_keeps_an_unimplemented_summary(self):
        data = json.loads(path_runtime.authoring.CLASS_CONTENT.read_text(encoding="utf-8"))
        victim = next(path for path in data["paths"] if path["id"] == "modern4e.path.paragonpath258")
        owned = {grant["entryId"] for grant in victim["grants"]}
        data["paths"].remove(victim)
        data["features"] = [e for e in data["features"] if e["id"] not in owned]
        data["powers"] = [e for e in data["powers"] if e["id"] not in owned]
        with tempfile.TemporaryDirectory() as directory:
            partial = Path(directory) / "class-paths.json"
            partial.write_text(json.dumps(data), encoding="utf-8")
            assets = path_runtime.build(class_content=partial)
        entries = {entry["id"]: entry for entry in runtime_common.entries_of(assets)}
        summary = entries["modern4e.path.paragonpath258"]
        self.assertEqual("UNIMPLEMENTED", summary["coverage"]["status"])
        self.assertNotIn("grants", summary["mechanics"])
        self.assertEqual([{"type": "entry", "entryId": "modern4e.class.barbarian"}], summary["mechanics"]["access"]["conditions"])
        self.assertNotIn("modern4e.feature.bear-warrior-bear-form", entries)
        self.assertEqual(1, len([e for e in entries.values() if e["coverage"]["status"] == "UNIMPLEMENTED"
                                 and e["category"] == "PARAGON_PATH"]))

    def test_every_class_page_path_is_class_scoped_in_the_index(self):
        """The Artificer through Warden pages' paths (and the older classes') browse only under their own class."""
        index = path_runtime.build()[f"{path_runtime.PACKAGE}/index.json"]["entries"]
        counts = {}
        for row in index:
            for class_id in row.get("pathClassIds", []):
                counts[class_id.rsplit(".", 1)[1]] = counts.get(class_id.rsplit(".", 1)[1], 0) + 1
        self.assertEqual({"artificer": 6, "avenger": 8, "barbarian": 6, "bard": 8, "cleric": 22, "druid": 16, "fighter": 16,
                          "invoker": 12, "paladin": 12, "ranger": 16, "rogue": 18, "runepriest": 4, "shaman": 12, "sorcerer": 13,
                          "swordmage": 7, "warden": 12, "warlock": 7, "warlord": 10, "wizard": 9}, counts)
        rows = {row["title"]: row for row in index}
        # Academy Master is shared by three classes and stays one entry; Fortune Blessed by the Avenger and the Paladin.
        self.assertEqual(["modern4e.class.artificer", "modern4e.class.sorcerer", "modern4e.class.wizard"],
                         sorted(rows["Academy Master"]["pathClassIds"]))
        self.assertEqual(["modern4e.class.avenger", "modern4e.class.paladin"], sorted(rows["Fortune Blessed"]["pathClassIds"]))
        self.assertEqual(1, len([row for row in index if row["title"] == "Fortune Blessed"]))

    def test_malformed_class_path_input_is_rejected_before_compilation(self):
        data = json.loads(path_runtime.authoring.CLASS_CONTENT.read_text(encoding="utf-8"))
        data["paths"][0]["access"] = {"type": "always"}
        with tempfile.TemporaryDirectory() as directory:
            broken = Path(directory) / "class-paths.json"
            broken.write_text(json.dumps(data), encoding="utf-8")
            with self.assertRaises(ValueError):
                path_runtime.build(class_content=broken)

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
