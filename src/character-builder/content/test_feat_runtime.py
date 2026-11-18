"""Authoring-to-engine contract for the shared feat package (modern4e.feats)."""
import unittest

import class_runtime
import feat_runtime
import runtime_common

PACKAGE = "modern4e.feats"


def leaves(node):
    """All non-group conditions of a compiled tree."""
    if node["type"] in ("allOf", "anyOf"):
        return [leaf for child in node["conditions"] for leaf in leaves(child)]
    return [node]


class FeatRuntimeTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.available = feat_runtime.available_ids()
        cls.assets = feat_runtime.build(available=cls.available)
        cls.catalog = feat_runtime.feats.catalog()
        cls.source = {entry["id"]: entry for entry in cls.catalog["entries"]}
        cls.entries = {entry["id"]: entry for entry in runtime_common.entries_of(cls.assets)}

    def test_every_authored_feat_is_emitted_once_in_chunks(self):
        self.assertEqual(798, len(self.source))
        self.assertEqual(set(self.source), set(self.entries))
        self.assertEqual(798, len(runtime_common.entries_of(self.assets)))
        manifest = self.assets[f"{PACKAGE}/manifest.json"]
        self.assertEqual(
            {"formatVersion": 2, "id": PACKAGE, "revision": "1", "title": "Modern 4e shared feats",
             "indexes": ["index"], "chunks": [f"entries-{i:04d}" for i in range(8)]}, manifest)
        self.assertEqual(798, len(self.assets[f"{PACKAGE}/index.json"]["entries"]))
        self.assertEqual({"FEAT"}, {entry["category"] for entry in self.entries.values()})

    def test_output_is_deterministic(self):
        self.assertEqual(self.assets, feat_runtime.build(available=self.available))

    def test_feat_browse_groups_follow_authored_access_only(self):
        index = self.assets[f"{PACKAGE}/index.json"]["entries"]
        counts = {group: sum(row["featGroup"] == group for row in index)
                  for group in ("GENERAL", "ANCESTRY", "CLASS")}
        self.assertEqual({"GENERAL": 148, "ANCESTRY": 199, "CLASS": 451}, counts)
        for metadata in index:
            self.assertEqual(feat_runtime.feat_group(self.source[metadata["id"]], self.catalog["references"]),
                             metadata["featGroup"])
        references = {"a": {"category": "ANCESTRY"}, "c": {"category": "CLASS"}}
        entry = {"id": "misleading.class.id", "title": "Class Feat", "access": {"type": "always"},
                 "prerequisites": {"type": "entry", "entryId": "c"}}
        self.assertEqual("GENERAL", feat_runtime.feat_group(entry, references))
        entry["access"] = {"type": "anyOf", "conditions": [{"type": "entry", "entryId": "a"}]}
        self.assertEqual("ANCESTRY", feat_runtime.feat_group(entry, references))
        entry["access"] = {"type": "allOf", "conditions": [{"type": "entry", "entryId": "c"}]}
        self.assertEqual("CLASS", feat_runtime.feat_group(entry, references))
        entry["access"]["conditions"].append({"type": "entry", "entryId": "a"})
        self.assertEqual("ANCESTRY", feat_runtime.feat_group(entry, references))

    def test_authored_entry_description_and_selection_are_preserved(self):
        for key, entry in self.entries.items():
            authored = self.source[key]
            self.assertEqual(authored["title"], entry["presentation"]["title"])
            self.assertEqual(authored["description"], entry["presentation"]["description"])
            self.assertEqual(authored["selection"]["maximum"], entry["mechanics"]["maximumSelections"])
            self.assertEqual(2, entry["mechanics"]["version"])
            automated = key == "modern4e.feat.alchemist" or bool(entry["mechanics"]["choices"]) or bool(entry["mechanics"].get("multiclassFor")) or bool(entry["mechanics"].get("armorAdvancement"))
            self.assertEqual("PARTIAL" if automated else "UNIMPLEMENTED", entry["coverage"]["status"])
            self.assertTrue(entry["coverage"]["limitations"])
            shared = {k: v for k, v in entry["sharedData"].items() if not k.startswith("runtime")}
            self.assertEqual(authored, shared)

    def test_pending_reference_becomes_unresolved_not_an_entry_condition(self):
        pending = {key for key, ref in self.catalog["references"].items() if key not in self.available}
        self.assertIn("modern4e.feature.orc-resilience", pending)
        for entry in self.entries.values():
            trees = [entry["mechanics"]["access"]] + entry["mechanics"]["prerequisites"]
            for leaf in (leaf for tree in trees for leaf in leaves(tree)):
                if leaf["type"] == "entry":
                    self.assertNotIn(leaf["entryId"], pending)
        gaps = [leaf for entry in self.entries.values() for tree in entry["mechanics"]["prerequisites"]
                for leaf in leaves(tree) if leaf["type"] == "unresolved"]
        self.assertTrue(any("modern4e.feature.orc-resilience" in leaf["reason"] for leaf in gaps))
        self.assertTrue(all(leaf["text"] and leaf["reason"] for leaf in gaps))

    def test_unresolved_gap_is_reflected_in_coverage(self):
        key = next(key for key, entry in self.source.items()
                   if any(leaf["type"] == "entry" and leaf["entryId"] == "modern4e.feature.orc-resilience"
                          for leaf in leaves(entry["prerequisites"])))
        limitations = self.entries[key]["coverage"]["limitations"]
        self.assertTrue(any(text.startswith("Prerequisite not evaluated:") and "orc-resilience" in text
                            for text in limitations))

    def test_class_and_ancestry_references_stay_entry_conditions(self):
        access = [leaf for entry in self.entries.values() for leaf in leaves(entry["mechanics"]["access"])]
        entry_ids = {leaf["entryId"] for leaf in access if leaf["type"] == "entry"}
        self.assertTrue(any(key.startswith("modern4e.class.") for key in entry_ids))
        self.assertTrue(any(key.startswith("modern4e.ancestry.") for key in entry_ids))
        self.assertTrue(entry_ids <= self.available)
        fighter = self.entries["modern4e.feat.deep-gash"]["mechanics"]["access"]
        self.assertEqual({"type": "entry", "entryId": "modern4e.class.fighter"}, fighter)

    def test_feat_to_feat_prerequisites_stay_entry_conditions(self):
        feat_refs = [(key, leaf["entryId"]) for key, entry in self.entries.items()
                     for leaf in leaves(entry["mechanics"]["prerequisites"][0])
                     if leaf["type"] == "entry" and leaf["entryId"].startswith("modern4e.feat.")]
        self.assertEqual(7, len(feat_refs))
        self.assertTrue(all(target in self.entries for _, target in feat_refs))

    def test_access_and_prerequisite_grouping_is_preserved(self):
        for key, entry in self.entries.items():
            authored = self.source[key]
            for field, compiled in (("access", entry["mechanics"]["access"]),
                                    ("prerequisites", entry["mechanics"]["prerequisites"][0])):
                # An unavailable reference replaces a leaf, never a group.
                self.assertEqual(self.group_shape(authored[field]), self.group_shape(compiled), key)
        any_of = [entry for entry in self.source.values()
                  if any(node["type"] == "anyOf" for node in self.walk(entry["prerequisites"]))]
        self.assertTrue(any_of)
        for authored in any_of:
            compiled = self.entries[authored["id"]]["mechanics"]["prerequisites"][0]
            self.assertTrue(any(node["type"] == "anyOf" for node in self.walk(compiled)))

    def test_or_is_never_flattened_into_and(self):
        authored = {"type": "allOf", "conditions": [
            {"type": "level", "minimum": 11},
            {"type": "anyOf", "conditions": [{"type": "abilityPoints", "ability": "CONSTITUTION", "minimum": 3},
                                             {"type": "abilityPoints", "ability": "DEXTERITY", "minimum": 3}]}]}
        context = {"references": {}, "feat_ids": set(), "titles": {}, "available": set()}
        self.assertEqual(authored, feat_runtime.condition(authored, context))

    def test_size_and_selected_conditions_preserve_authored_predicates(self):
        context = {"references": self.catalog["references"], "feat_ids": set(), "titles": {}, "available": set()}
        size = feat_runtime.condition({"type": "size", "size": "SMALL"}, context)
        self.assertEqual({"type": "size", "size": "SMALL"}, size)
        selected = feat_runtime.condition({"type": "selected", "category": "FEAT",
                                           "filters": {"multiclass": True, "classSpecific": True}}, context)
        self.assertEqual({"type": "selected", "category": "FEAT",
                          "filters": {"multiclass": True, "classSpecific": True}}, selected)
        for node in ({"type": "level", "minimum": 2}, {"type": "always"}):
            self.assertEqual(node, feat_runtime.condition(node, context))
        with self.assertRaises(ValueError):
            feat_runtime.condition({"type": "entry", "entryId": "modern4e.feature.undeclared"}, context)

    def test_every_authored_condition_type_compiles_to_engine_vocabulary(self):
        allowed = {"always", "level", "entry", "abilityPoints", "proficiency", "classPowerSource",
                   "equipmentProficiency", "unresolved", "size", "selected"}
        for entry in self.entries.values():
            trees = [entry["mechanics"]["access"]] + entry["mechanics"]["prerequisites"]
            self.assertLessEqual({leaf["type"] for tree in trees for leaf in leaves(tree)}, allowed)

    def test_skill_training_grants_skill_proficiency_choice(self):
        entry = self.entries["modern4e.feat.skill-training"]
        choice = entry["mechanics"]["choices"][0]
        self.assertEqual("proficiencies", choice["type"])
        self.assertEqual(2, choice["count"])
        self.assertEqual(16, len(choice["skills"]))
        self.assertTrue(choice["distinctAgainstCharacter"])
        self.assertEqual([], entry["mechanics"]["unsupported"])
        self.assertIsNone(entry["mechanics"]["maximumSelections"])

    def test_multiclass_qualification_requires_both_tag_and_explicit_target(self):
        for key, entry in self.entries.items():
            authored = self.source[key]
            expected = authored.get('multiclassFor') if 'MULTICLASS' in authored.get('tags', []) else None
            self.assertEqual(expected, entry['mechanics'].get('multiclassFor'), key)
        self.assertTrue(any(entry['mechanics'].get('multiclassFor') for entry in self.entries.values()))
        context = {'references': {}, 'feat_ids': set(), 'titles': {}, 'available': set()}
        source = {'id': 'modern4e.feat.example', 'title': 'Example', 'description': 'Example',
                  'access': {'type': 'always'}, 'prerequisites': {'type': 'always'},
                  'selection': {'maximum': 1, 'constraints': []}, 'multiclassFor': 'modern4e.class.wizard'}
        self.assertNotIn('multiclassFor', feat_runtime.compile_feat(source, context, '', '')['mechanics'])
        source['tags'] = ['MULTICLASS']
        self.assertEqual('modern4e.class.wizard',
                         feat_runtime.compile_feat(source, context, '', '')['mechanics']['multiclassFor'])

    def test_unsupported_choices_and_constraints_are_recorded_not_faked(self):
        linguist = self.entries["modern4e.feat.linguist"]
        self.assertEqual(["LANGUAGE", "SKILL_BONUS"], [choice["kind"] for choice in linguist["mechanics"]["choices"]])
        self.assertEqual([], linguist["mechanics"]["unsupported"])
        languages, bonus = linguist["mechanics"]["choices"]
        self.assertEqual(3, languages["count"])
        self.assertEqual("CHARACTER", languages["distinctScope"])
        self.assertEqual((2, 3, True), (bonus["bonus"], bonus["epicBonus"], bonus["allowRepeatWhenExhausted"]))
        catalog = linguist["sharedData"]["runtimeChoiceCatalogs"]["LANGUAGE"]
        self.assertEqual(self.catalog["optionCatalogs"]["LANGUAGE"], catalog)
        self.assertEqual(10, len(catalog["languages"]))
        weapon = self.entries["modern4e.feat.weapon-proficiency"]["mechanics"]["choices"][0]
        self.assertEqual(10, len(weapon["options"]))
        self.assertEqual("ENTRY", weapon["distinctScope"])
        self.assertEqual(["SIMPLE_MELEE", "SIMPLE_RANGED", "MILITARY_MELEE", "MILITARY_RANGED"], weapon["options"][-1]["grants"])
        breath = self.entries["modern4e.feat.adaptable-breath"]["mechanics"]["choices"][0]
        self.assertEqual(("POWER", "modern4e.power.dragon-breath"), (breath["distinctScope"], breath["targetId"]))
        retired = {"modern4e.feat.feral-companion", "modern4e.feat.fey-charge",
                   "modern4e.feat.combat-opening", "modern4e.feat.elusive-hexer"}
        self.assertTrue(retired.isdisjoint(self.entries))
        for entry in self.entries.values():
            constraints = entry["sharedData"]["selection"]["constraints"]
            enforced = len(constraints)
            self.assertGreaterEqual(len(entry["mechanics"]["unsupported"]), len(constraints) - enforced)
            for text in entry["mechanics"]["unsupported"]:
                self.assertIn(text, entry["coverage"]["limitations"])
            if not entry["sharedData"].get("choices") and not constraints:
                self.assertEqual([], entry["mechanics"]["unsupported"])
        armor = self.entries["modern4e.feat.armor-proficiency"]
        self.assertEqual([], armor["mechanics"]["unsupported"])
        self.assertEqual({"order": ["CLOTH", "LEATHER", "HIDE", "CHAINMAIL", "SCALE", "PLATE"], "steps": 1},
                         armor["mechanics"]["armorAdvancement"])
        self.assertEqual(5, sum(1 for entry in self.entries.values()
                                if entry["mechanics"]["maximumSelections"] is None))

    def test_requirement_and_selection_text_is_generated_data_not_authored_description(self):
        self.assertEqual(self.catalog["requirementText"]["modern4e.feat.deep-gash"],
                         self.entries["modern4e.feat.deep-gash"]["sharedData"].get("runtimeRequirementText"))
        self.assertEqual(self.catalog["selectionText"]["modern4e.feat.skill-training"],
                         self.entries["modern4e.feat.skill-training"]["sharedData"]["runtimeSelectionText"])

    def test_cross_references_validate_with_class_and_ancestry_stubs(self):
        stubs = {f"stub/entries-{i}.json": {"id": f"entries-{i}", "entries": [
            {"id": key, "category": "CLASS", "presentation": {"title": key},
             "mechanics": {"version": 2}, "coverage": {"status": "PARTIAL", "limitations": []}}]}
            for i, key in enumerate(sorted(self.available))}
        runtime_common.validate_references({**self.assets, **stubs})
        with self.assertRaises(ValueError):
            runtime_common.validate_references(self.assets)

    def test_classes_package_resolves_every_class_reference(self):
        classes = {entry["id"] for entry in class_runtime.build()["modern4e.classes/entries.json"]["entries"]}
        for entry in self.entries.values():
            for tree in [entry["mechanics"]["access"]] + entry["mechanics"]["prerequisites"]:
                for leaf in leaves(tree):
                    if leaf["type"] == "entry" and leaf["entryId"].startswith(("modern4e.class.", "modern4e.power.",
                                                                                 "modern4e.feature.")):
                        if leaf["entryId"].startswith("modern4e.class."):
                            self.assertIn(leaf["entryId"], classes)

    def walk(self, node):
        """All nodes of a condition tree, groups included."""
        result = [node]
        for child in node.get("conditions", []):
            result += self.walk(child)
        return result

    def group_shape(self, node):
        """Group structure with every leaf collapsed, so entry -> unresolved swaps compare equal."""
        if node["type"] in ("allOf", "anyOf"):
            return (node["type"], [self.group_shape(child) for child in node["conditions"]])
        return "leaf"


if __name__ == "__main__":
    unittest.main()
