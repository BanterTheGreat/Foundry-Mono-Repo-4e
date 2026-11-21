"""Class paragon-path importer: odd source formats, and mechanical checks of the reviewed class-paths.json."""
import json
from pathlib import Path
import re
import subprocess
import sys
import tempfile
import unittest

import compendium
import import_class_attacks as attacks
import import_class_paths as importer
import path_content

STUDENT_OF_CAIPHON = "modern4e.path.paragonpath156"
# Authored before the Artificer, Sorcerer and Druid pages listed them; their access now names those classes too.
# Published cards that do not follow the 11 attack / 12 utility / 20 daily pattern: Pack Lord's level 20 feature picks a
# druid summoning power instead of printing a card; every Steadfast Sentinel card is a granted feature.
IRREGULAR_POWER_LEVELS = {"modern4e.path.paragonpath484": [11, 12], "modern4e.path.paragonpath782": [12, 16, 20]}
LEVEL_TWENTY_FREQUENCY = {"modern4e.path.paragonpath153": "ENCOUNTER"}
SHARED_WITH_NEW_CLASSES = {"modern4e.path.paragonpath351", "modern4e.path.paragonpath692", "modern4e.path.paragonpath834"}
# Class paragon paths per class page, including paths a class shares with another class.
PATHS_PER_CLASS = {"artificer": 6, "avenger": 8, "barbarian": 6, "bard": 8, "cleric": 22, "druid": 16, "fighter": 16, "invoker": 12,
                   "paladin": 12, "ranger": 16, "rogue": 18, "runepriest": 4, "shaman": 12, "sorcerer": 13, "swordmage": 7,
                   "warden": 12, "warlock": 7, "warlord": 10, "wizard": 9}


def html(*lines):
    """Minimal compendium-style HTML: one paragraph per printed line."""
    return "".join(f"<p>{line}</p>" for line in lines)


def lost_lines(power):
    """Adapted printed rules lines of one power that appear nowhere in its structured activations."""
    lines = power["source"]["rulesText"].splitlines()
    start = next(i for i, line in enumerate(lines) if re.match(r"^(At-Will|Encounter|Daily)(?:\s|$)", line))
    body = lines[start + 2:]
    body = attacks.strip_notes(body[:next((i for i, line in enumerate(body) if line.startswith("Published in ")), len(body))])
    skipped = set()
    for header in (i for i in range(len(body)) if attacks.is_header(body, i)):
        skipped |= set(range(attacks.title_at(body, header), header + 2))
    dump = json.dumps(power["activations"] + [power["prerequisites"]], ensure_ascii=False)
    lost = []
    for i, line in enumerate(body):
        label, colon, value = line.partition(":")
        label, value = (label.strip(), importer.localize(attacks.adapt(value.strip()))) if colon else ("Rule", importer.localize(attacks.adapt(line)))
        value = re.sub(r"\bvs\s+(?=[A-Z])", "vs. ", value.replace("Relfex", "Reflex"))
        if i in skipped or not value or label in attacks.ACTIONS:
            continue
        found = json.dumps(value, ensure_ascii=False)[1:-1] in dump
        if not found and label == "Prerequisite":
            skill = re.fullmatch(r"You must be proficient in (\w+)\.?", value)
            found = bool(skill) and skill[1].upper() in dump
        if not found and re.fullmatch(r"(?:Primary |Secondary |Tertiary )?Attack(?: \(\w+\))?", label):
            split = re.match(r"^(\w+ vs\. \w+)\.?\s*(.*)$", value, re.S)
            found = bool(split) and all(json.dumps(part, ensure_ascii=False)[1:-1] in dump for part in split.groups() if part)
        if not found and label == "Rule" and attacks.SCALE_21.fullmatch(value):
            found = json.dumps(attacks.SCALE_21.fullmatch(value)[1], ensure_ascii=False)[1:-1] in dump
        if not found:
            lost.append((label, value[:90]))
    return lost


def labels(blocks):
    """Every block label, descending into attack outcomes."""
    for block in blocks:
        yield block["label"]
        for comparison in block.get("comparisons", []):
            for children in comparison["outcomes"].values():
                yield from labels(children)


class ParseOddFormatsTest(unittest.TestCase):
    NAMES = ["Mauling Bear"]

    def parse(self, *lines):
        return importer.parse_path(html("Bear Warrior", *lines, "Mauling BearBear Warrior Attack 11", "Encounter ✦ Primal"), self.NAMES)

    def test_levels_names_with_parentheses_and_continuation_paragraphs_are_kept(self):
        parsed = self.parse(
            '"A bear roars."', "Prerequisite: Barbarian, Rampage class feature", "Prose.", "BEAR WARRIOR PATH FEATURES",
            "Sacrificial Action (Sainted General) (11th level): First.", "Tail paragraph that belongs to the feature.",
            "1 or 2: A list row.", "Summon the Pack (12th level): You gain the summon the pack power.", "Tainted (20th level): Late.",
            "Wild Push (16th level): Pushes.")
        self.assertEqual("Barbarian, Rampage class feature", parsed["prerequisite"])
        self.assertEqual([("Sacrificial Action (Sainted General)", 11), ("Summon the Pack", 12), ("Tainted", 20), ("Wild Push", 16)],
                         [(f["name"], f["level"]) for f in parsed["features"]])
        self.assertEqual(["First.", "Tail paragraph that belongs to the feature.", "1 or 2: A list row."], parsed["features"][0]["paragraphs"])

    def test_repeated_flavor_quote_is_dropped_but_other_quotes_survive(self):
        parsed = self.parse('"We are bathed."', "Prerequisite: Shaman", "BEAR WARRIOR PATH FEATURES", "“We are bathed.”",
                            "Fountain (11th level): Heals.", "“A quote inside the feature.”")
        self.assertEqual(["Heals.", "“A quote inside the feature.”"], parsed["features"][0]["paragraphs"])

    def test_text_before_the_first_feature_is_not_silently_ignored(self):
        with self.assertRaises(ValueError):
            self.parse('"Quote."', "Prerequisite: Barbarian", "BEAR WARRIOR PATH FEATURES", "Orphan line without a level.")

    def test_rules_printed_before_the_first_feature_lead_that_feature(self):
        parsed = self.parse('"Quote."', "Prerequisite: Paladin", "BEAR WARRIOR PATH FEATURES", "Powers gain the keyword of your class.",
                            "Rage (11th level): Rages.", "Wild Push (16th level): Pushes.")
        self.assertEqual(["Powers gain the keyword of your class.", "Rages."], parsed["features"][0]["paragraphs"])
        self.assertEqual(["Pushes."], parsed["features"][1]["paragraphs"])

    def test_a_power_card_ends_the_feature_section(self):
        parsed = self.parse('"Quote."', "Prerequisite: Barbarian", "BEAR WARRIOR PATH FEATURES", "Rage (11th level): Rages.")
        self.assertEqual(1, len(parsed["features"]))

    def test_path_only_wording_never_touches_published_source_text(self):
        self.assertEqual("2[W] + ability damage", importer.localize("2[W] + ability modifier damage"))
        self.assertEqual("your primary ability", importer.localize("your primary ability modifier"))
        self.assertEqual("Strength", importer.localize(attacks.adapt("Strength modifier")))
        kept = importer.localize({"source": {"rulesText": "ability modifier"}, "text": "ability modifier"})
        self.assertEqual({"source": {"rulesText": "ability modifier"}, "text": "ability"}, kept)

    def test_prerequisite_remainders_distinguish_class_names_from_unenforced_text(self):
        classes = ["modern4e.class.warlock", "modern4e.class.wizard"]
        self.assertIsNone(importer.unenforced_prerequisite("Warlock class or Wizard class", None, classes))
        self.assertIsNone(importer.unenforced_prerequisite("Warlock class, fey pact", "Fey Pact", classes))
        self.assertEqual("Warlock class, good alignment", importer.unenforced_prerequisite("Warlock class, good alignment", None, classes))
        self.assertEqual("Shaman, call spirit companion power",
                         importer.unenforced_prerequisite("Shaman, call spirit companion power", None, ["modern4e.class.shaman"]))

    def test_identifier_clashes_prefer_the_qualifier_then_a_number(self):
        taken = {"modern4e.power.path-strike"}
        self.assertEqual("modern4e.power.path-strike-kensei", importer.unique("modern4e.power.path-strike", taken, "kensei"))
        self.assertEqual("modern4e.power.path-strike-kensei-2", importer.unique("modern4e.power.path-strike", taken, "kensei"))
        self.assertEqual("plain", importer.unique("plain", taken))


class ConvertOddPowersTest(unittest.TestCase):
    """The importer binds converted powers to their path; level scaling and feature cards stay structured."""

    def convert(self, row_type, level, *lines, name="Odd Power"):
        row = {"ID": "power1", "Name": name, "Level": level, "Type": row_type, "SourceBook": "Book"}
        card = html(f"{name}Odd Path Attack {level}", "Flavor sentence.", *lines, "Published in Book, page(s) 1.")
        return importer.convert_power(row, card, "Odd Path", "modern4e.path.paragonpath1", "modern4e.power.path-odd-power")

    def test_levelless_at_will_feature_card_is_granted_at_eleven_as_a_utility(self):
        power = self.convert("At-Will Feature", "", "At-Will ✦ Fire, Primal", "Free Action Close burst 10",
                             "Trigger: A critical hit.", "Target: The triggering creature", "Effect: Gains +2 speed.")
        self.assertEqual((11, "UTILITY", "Odd Path Feature"), (power["level"], power["powerKind"], power["subtitle"]))
        self.assertEqual({"type": "level", "minimum": 11}, power["prerequisites"])
        self.assertEqual([], power["activations"][0]["usage"]["limits"])
        self.assertEqual({"type": "entry", "entryId": "modern4e.path.paragonpath1"}, power["access"])

    def test_a_card_without_keywords_has_a_bare_usage_header(self):
        power = self.convert("Enc. Attack", "11", "Encounter", "Standard Action Close burst 5", "Target: One ally in the burst",
                             "Effect: The target makes a charge attack.")
        self.assertEqual([{"period": "ENCOUNTER", "maximum": {"base": 1}}], power["activations"][0]["usage"]["limits"])
        self.assertEqual("STANDARD", power["activations"][0]["action"])
        self.assertEqual([], power["keywords"])

    def test_usage_limits_follow_the_printed_frequency(self):
        encounter = self.convert("Enc. Attack", "11", "Encounter ✦ Martial, Weapon", "Standard Action Melee weapon",
                                 "Target: One creature", "Attack: Strength vs. AC", "Hit: 2[W] + Strength modifier damage.")
        self.assertEqual([{"period": "ENCOUNTER", "maximum": {"base": 1}}], encounter["activations"][0]["usage"]["limits"])
        daily = self.convert("Daily Utility", "20", "Daily ✦ Primal", "Minor Action Personal", "Effect: You heal.")
        self.assertEqual(("UTILITY", 20, "Odd Path Utility 20"), (daily["powerKind"], daily["level"], daily["subtitle"]))
        self.assertEqual([{"period": "DAY", "maximum": {"base": 1}}], daily["activations"][0]["usage"]["limits"])

    def test_attack_bonus_scaling_at_twenty_first_level_attaches_to_its_attack(self):
        power = self.convert("Enc. Attack", "11", "Encounter ✦ Martial", "Immediate Interrupt Melee 1", "Trigger: An enemy shifts.",
                             "Target: The triggering enemy", "Attack: Strength + 4 vs. Fortitude",
                             "Increase to Strength + 6 vs. Fortitude at 21st level.", "Hit: The target is stunned.")
        attack = power["activations"][0]["blocks"][0]
        self.assertEqual("attack", attack["type"])
        self.assertEqual([{"atLevel": 21, "text": "Strength + 6 vs. Fortitude"}], attack["scaling"])
        self.assertNotIn("Rule", list(labels(power["activations"][0]["blocks"])))

    def test_damage_scaling_special_and_multi_attack_cards_keep_every_line(self):
        power = self.convert("Daily Attack", "20", "Daily ✦ Primal, Rage, Weapon", "Standard Action Melee weapon",
                             "Special: Shift before attacking.", "Primary Target: One creature", "Primary Attack: Strength vs. AC",
                             "Hit: 3[W] + Strength modifier damage.", "Increase damage to 4[W] + Strength modifier at 21st level.",
                             "Secondary Target: A different creature", "Secondary Attack: Strength vs. AC",
                             "Hit: 2[W] + Strength modifier damage.", "Sustain Minor: The rage persists.")
        self.assertEqual([], lost_lines(power))
        names = list(labels(power["activations"][0]["blocks"]))
        self.assertEqual(["Special", "Primary Attack", "Hit", "Secondary Target", "Secondary Attack", "Hit", "Sustain Minor"], names)

    def test_follow_up_cards_and_revision_notes(self):
        power = self.convert("Enc. Attack", "11", "Encounter ✦ Arcane, Conjuration", "Standard Action Ranged 10",
                             "Effect: You conjure a gateway.", "Revision (10/14/2009)", "Replace a word.",
                             "Odd Power Attack", "Flavor again.", "Encounter ✦ Arcane, Conjuration", "Opportunity Action Close burst 1",
                             "Requirement: The gateway must be active.", "Trigger: A creature enters.", "Target: The triggering creature",
                             "Attack: Intelligence vs. Reflex", "Hit: 3d6 + Intelligence modifier damage.")
        parent, follow = power["activations"]
        self.assertEqual(("ENTRY", "GRANTED"), (parent["availability"], follow["availability"]))
        self.assertEqual([follow["id"]], [b["activationId"] for b in parent["blocks"] if b["type"] == "grant"])
        self.assertNotIn("Revision", json.dumps(power["activations"]))
        self.assertEqual([{"period": "ENCOUNTER", "maximum": {"base": 1}}], parent["usage"]["limits"])
        self.assertEqual([], follow["usage"]["limits"])

    def test_class_attack_importer_scaling_is_backward_compatible(self):
        for text, scaled in (("Increase damage to 2[W] + Strength modifier at 21st level.", "2[W] + Strength modifier"),
                             ("Increase to Strength + 6 vs. Fortitude at 21st level", "Strength + 6 vs. Fortitude")):
            self.assertEqual(scaled, attacks.SCALE_21.fullmatch(text)[1])
        self.assertIsNone(attacks.SCALE_21.fullmatch("Increase this bonus to +3 at 11th level and +4 at 21st level."))


class ReviewedClassPathsTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.data = path_content.load_class_paths()
        cls.entries = {e["id"]: e for key in path_content.CATEGORIES for e in cls.data[key]}
        cls.old = json.loads((Path(__file__).resolve().parents[2] / "character-builder/content/fixtures/paths/"
                              "class-path-summaries-revision-2.json").read_text(encoding="utf-8"))["paths"]

    def test_importer_reproduces_the_reviewed_file_exactly(self):
        """The committed JSON is the importer's output: nothing was hand edited and nothing drifted."""
        self.assertEqual(self.data, importer.build())

    def test_authored_counts_ids_and_the_one_level_twenty_utility(self):
        self.assertEqual([205, 635, 0, 618], [len(self.data[k]) for k in ("paths", "features", "rules", "powers")])
        self.assertLessEqual(set(self.old), {p["id"] for p in self.data["paths"]})
        daily_twenty = {}
        for path in self.data["paths"]:
            powers = [self.entries[g["entryId"]] for g in path["grants"] if ".power." in g["entryId"]]
            by_level = {}
            for power in powers:
                by_level.setdefault(power["level"], []).append(power)
            if path["id"] in IRREGULAR_POWER_LEVELS:
                self.assertEqual(IRREGULAR_POWER_LEVELS[path["id"]], sorted(by_level), path["id"])
                continue
            self.assertEqual([11, 12, 20], sorted(by_level), path["id"])
            self.assertEqual(["ENCOUNTER"], [p["activations"][0]["usage"]["frequency"] for p in by_level[11] if p["powerKind"] == "ATTACK"], path["id"])
            self.assertEqual(1, len([p for p in by_level[12] if p["powerKind"] == "UTILITY"]), path["id"])
            twenty = by_level[20]
            self.assertEqual(1, len(twenty), path["id"])
            # Luckbringer of Tymora prints an encounter power at level 20 (a published oddity kept as printed).
            self.assertEqual(LEVEL_TWENTY_FREQUENCY.get(path["id"], "DAILY"), twenty[0]["activations"][0]["usage"]["frequency"], path["id"])
            daily_twenty[path["id"]] = twenty[0]["powerKind"]
        # The only path whose level 20 card is a utility power (a published source gap, not an importer loss).
        self.assertEqual([STUDENT_OF_CAIPHON], [i for i, kind in daily_twenty.items() if kind != "ATTACK"])
        self.assertEqual("Caiphon's Hungry Mercy", self.entries[next(g["entryId"] for g in self.entries[STUDENT_OF_CAIPHON]["grants"] if g["atLevel"] == 20)]["title"])

    def test_every_feature_is_granted_once_at_its_printed_level(self):
        owned = set()
        for path in self.data["paths"]:
            levels = [g["atLevel"] for g in path["grants"]]
            self.assertEqual(levels, sorted(levels), path["id"])
            for grant in path["grants"]:
                self.assertNotIn(grant["entryId"], owned)
                owned.add(grant["entryId"])
                if ".feature." in grant["entryId"]:
                    self.assertIn(grant["atLevel"], (11, 12, 16, 20))
                    self.assertTrue(self.entries[grant["entryId"]]["description"].strip())
        self.assertEqual(owned, {e["id"] for key in ("features", "powers") for e in self.data[key]})
        # A feature line that grants a power (Soulfire, Summon the Shadow Pack) keeps its own printed level.
        levels = {e["title"]: next(g["atLevel"] for p in self.data["paths"] for g in p["grants"] if g["entryId"] == e["id"])
                  for e in self.data["features"] if e["title"] in ("Summon the Shadow Pack", "Tainted Predator", "Wild Push")}
        self.assertEqual({"Summon the Shadow Pack": 12, "Tainted Predator": 20, "Wild Push": 16}, levels)

    def test_features_match_the_published_feature_lines_including_trailing_prose(self):
        total = 0
        for path in self.data["paths"]:
            lines = attacks.text(compendium.payload(compendium.batch_path("paragonpath", path["sourceEntryId"]))[-1][path["sourceEntryId"]]).splitlines()
            published = [m for m in (importer.FEATURE_LINE.match(line) for line in lines) if m]
            granted = [self.entries[g["entryId"]] for g in path["grants"] if ".feature." in g["entryId"]]
            self.assertEqual(len(published), len(granted), path["title"])
            total += len(granted)
            texts = " ".join(f["description"] for f in granted)
            for found in published:
                self.assertIn(attacks.adapt(found["text"])[:40].replace("  ", " "), importer.localize(texts), path["title"])
        self.assertEqual(635, total)
        dreadnought = self.entries["modern4e.feature.dreadnought-unfailing-resources"]["description"]
        self.assertIn("As a minor action, you can take 10 damage to save automatically", dreadnought)
        patron = self.entries["modern4e.feature.feytouched-patrons-favor"]["description"]
        for row in ("1 or 2: ", "3: ", "4: ", "5: ", "6: "):
            self.assertIn(row, patron)
        self.assertNotIn("We are bathed", self.entries["modern4e.feature.scion-of-renewal-fountain-of-life"]["description"])

    def test_every_published_rules_line_of_every_power_survives_in_the_blocks(self):
        for power in self.data["powers"]:
            with self.subTest(power=power["id"]):
                self.assertEqual([], lost_lines(power))

    def test_hit_miss_and_effect_line_counts_match_the_published_cards(self):
        for power in self.data["powers"]:
            lines = power["source"]["rulesText"].splitlines()
            start = next(i for i, line in enumerate(lines) if re.match(r"^(At-Will|Encounter|Daily)(?:\s|$)", line))
            body = lines[start + 2:]
            body = attacks.strip_notes(body[:next((i for i, line in enumerate(body) if line.startswith("Published in ")), len(body))])
            printed = [line.partition(":")[0].strip() for line in body if ":" in line]
            produced = [label for activation in power["activations"] for label in labels(activation["blocks"])]
            for label in ("Hit", "Miss", "Effect"):
                # Follow-up cards re-state their own labels; either way no printed outcome line may be lost or invented.
                self.assertEqual(printed.count(label), produced.count(label), (power["id"], label))

    def test_power_text_uses_local_rules_and_source_text_is_unchanged(self):
        stock = re.compile(r"\b(?:Dungeoneering|Streetwise|Heal check|(?:Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma|primary ability|ability) modifiers?)\b")
        for power in self.data["powers"]:
            source_id = power["source"]["entryId"]
            self.assertEqual(attacks.text(compendium.payload(compendium.batch_path("power", source_id))[-1][source_id]),
                             power["source"]["rulesText"], power["id"])
            self.assertIsNone(stock.search(json.dumps(power["activations"], ensure_ascii=False) + power["description"]), power["id"])
        for feature in self.data["features"]:
            self.assertIsNone(stock.search(feature["description"]), feature["id"])

    def test_granted_powers_tie_to_their_path_and_are_never_selectable(self):
        for power in self.data["powers"]:
            path = self.entries[power["access"]["entryId"]]
            self.assertEqual("modern4e.path.paragonpath", path["id"][:25])
            level = {"type": "level", "minimum": power["level"]}
            prerequisites = power["prerequisites"]
            # A published "Prerequisite:" line (a wild shape power, a skill) is kept beside the level as a condition.
            self.assertEqual(level, prerequisites if prerequisites["type"] == "level" else prerequisites["conditions"][0], power["id"])
            self.assertTrue(prerequisites["type"] == "level" or prerequisites["type"] == "allOf", power["id"])
            self.assertIn(power["id"], [g["entryId"] for g in path["grants"]])
            self.assertEqual({"maximum": 1, "constraints": []}, power["selection"])
            self.assertNotIn("class", power["id"])

    def test_path_summaries_eligibility_and_class_access_are_unchanged(self):
        flatten = lambda node: [node] if node["type"] != "allOf" else [c for child in node["conditions"] for c in flatten(child)]
        for path in self.data["paths"]:
            if path["id"] not in self.old:
                continue
            old = self.old[path["id"]]
            for key in ("title", "description", "link", "requirements"):
                self.assertEqual(old[key], path[key] if key != "title" else path["title"], (path["id"], key))
            self.assertEqual(old["description"], path["flavor"])
            access = path["access"]
            classes = sorted(n["entryId"] for n in (access["conditions"] if access["type"] == "anyOf" else [access]))
            # A path shared with a later class (Academy Master, Master of Flame, Nocturnal) only gains classes.
            self.assertLessEqual(set(old["pathClassIds"]), set(classes), path["id"])
            if path["id"] not in SHARED_WITH_NEW_CLASSES:
                self.assertEqual(old["pathClassIds"], classes, path["id"])
            self.assertEqual(sorted(json.dumps(n, sort_keys=True) for n in old["prerequisites"]),
                             sorted(json.dumps(n, sort_keys=True) for n in flatten(path["prerequisites"])), path["id"])

    def test_every_class_page_lists_its_authored_paths_and_nothing_else(self):
        """Each class JSON the book prints is exactly the set of catalog paths whose access names that class."""
        by_class = {}
        for path in self.data["paths"]:
            access = path["access"]
            for node in access["conditions"] if access["type"] == "anyOf" else [access]:
                by_class.setdefault(node["entryId"].rsplit(".", 1)[1], set()).add(path["sourceEntryId"])
        self.assertEqual(PATHS_PER_CLASS, {name: len(ids) for name, ids in sorted(by_class.items())})
        for name in PATHS_PER_CLASS:
            printed = json.loads((importer.PATHS / f"{name}.json").read_text(encoding="utf-8"))["paths"]
            self.assertEqual(by_class[name], {p["link"].rsplit("=", 1)[1] for p in printed}, name)
            self.assertEqual(len(printed), len({p["title"] for p in printed}), name)

    def test_a_shared_published_name_keeps_each_paths_own_powers(self):
        """Hammer of Vengeance exists for the Invoker (PH2) and the Runepriest (PH3) under one title."""
        paths = {p["sourceEntryId"]: p for p in self.data["paths"]}
        invoker, runepriest = paths["paragonpath273"], paths["paragonpath603"]
        self.assertEqual(("Hammer of Vengeance",) * 2, (invoker["title"], runepriest["title"]))
        self.assertEqual(["modern4e.class.invoker"], [invoker["access"]["entryId"]])
        self.assertEqual(["modern4e.class.runepriest"], [runepriest["access"]["entryId"]])
        owned = lambda path: {g["entryId"] for g in path["grants"] if ".power." in g["entryId"]}
        self.assertEqual(3, len(owned(invoker)))
        self.assertEqual(3, len(owned(runepriest)))
        self.assertFalse(owned(invoker) & owned(runepriest))

    def test_coverage_is_explicit_and_never_claims_published_prerequisites_are_enforced(self):
        notes = [n for p in self.data["paths"] for n in p["coverage"]["limitations"]]
        self.assertTrue(any("Published prerequisite not enforced: Warlord class, good alignment" in n for n in notes))
        for entry in self.entries.values():
            self.assertEqual("UNIMPLEMENTED", entry["coverage"]["status"])
            self.assertTrue(entry["coverage"]["limitations"])

    def test_importer_refuses_authoritative_and_existing_output_directories(self):
        script = Path(importer.__file__)
        with tempfile.TemporaryDirectory() as directory:
            for target in (Path(directory), importer.PATHS / "scratch-never-written"):
                result = subprocess.run([sys.executable, "-X", "utf8", str(script), "--output-dir", str(target)],
                                        capture_output=True, text=True)
                self.assertNotEqual(0, result.returncode, target)
                self.assertFalse((importer.PATHS / "scratch-never-written").exists())

    def test_single_path_import_writes_review_json_to_a_new_directory(self):
        with tempfile.TemporaryDirectory() as directory:
            target = Path(directory) / "review"
            subprocess.check_call([sys.executable, "-X", "utf8", str(Path(importer.__file__)), "--output-dir", str(target),
                                   "--path", "paragonpath258"], stdout=subprocess.DEVNULL)
            written = json.loads((target / "class-paths.json").read_text(encoding="utf-8"))
            self.assertEqual(["modern4e.path.paragonpath258"], [p["id"] for p in written["paths"]])
            self.assertEqual(["Bear Form", "Bear's Toughness", "Wild Push"], [f["title"] for f in written["features"]])
            self.assertEqual(["Mauling Bear", "Bestial Vigor", "Rampaging Bear"], [p["title"] for p in written["powers"]])


if __name__ == "__main__":
    unittest.main()
