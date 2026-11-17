"""Leader/Fighter migration, stable identity and actual printed-content checks."""
from collections import Counter
import copy
import importlib.util
import json
from pathlib import Path
import re
import shutil
import subprocess
import tempfile
import unittest

from test_modern_classes import BOOK, TYPST, classes

LEADERS = ("artificer", "bard", "cleric", "runepriest", "shaman", "warlord")
FIXTURES = Path(__file__).with_name("fixtures") / "classes"


class ModernLeadersTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.catalog = classes.catalog()
        cls.entries = {entry["id"]: entry for entry in cls.catalog["entries"]}

    def named(self, category, title):
        return next(e for e in self.entries.values() if e["category"] == category and e["title"] == title)

    def test_all_six_local_classes_and_statistics_are_migrated(self):
        expected = {
            "artificer": (["INTELLIGENCE"], ["WISDOM", "CONSTITUTION"], [12, 11, 12], 6),
            "bard": (["CHARISMA"], ["CONSTITUTION", "INTELLIGENCE"], [11, 12, 12], 7),
            "cleric": (["STRENGTH", "WISDOM"], ["INTELLIGENCE", "CHARISMA"], [11, 11, 13], 7),
            "runepriest": (["STRENGTH"], ["CONSTITUTION", "WISDOM"], [11, 11, 13], 7),
            "shaman": (["WISDOM"], ["CONSTITUTION", "INTELLIGENCE"], [12, 11, 12], 7),
            "warlord": (["STRENGTH"], ["INTELLIGENCE", "CHARISMA"], [12, 12, 11], 7),
        }
        self.assertEqual(set(LEADERS), {e["id"].split(".")[-1] for e in self.entries.values() if e["category"] == "CLASS" and e["role"] == "LEADER"})
        for name, (main, secondary, defenses, surges) in expected.items():
            with self.subTest(name=name):
                entry = self.entries["modern4e.class." + name]
                self.assertEqual(entry["abilities"], {"main": main, "secondary": secondary})
                self.assertEqual([entry["statistics"]["defenses"][d] for d in ["FORTITUDE", "REFLEX", "WILL"]], defenses)
                hp = entry["statistics"]["health"]
                self.assertEqual(hp, {"base": 17, "perLevel": 5, "constitutionMultiplier": 2})
                self.assertEqual(entry["statistics"]["healingSurges"], {"base": surges, "constitutionMultiplier": 1})
                self.assertTrue(entry["flavor"]["introduction"])

    def test_existing_feat_reference_identities_are_reused(self):
        refs = classes.shared.load_json(BOOK / "content/feat-references.json")["entries"]
        matched = []
        for key, ref in refs.items():
            if ref.get("source") in {"classes/" + name + ".typ" for name in LEADERS} and ref["category"] in ("FEATURE", "POWER"):
                self.assertIn(key, self.entries)
                self.assertEqual(self.entries[key]["category"], ref["category"])
                matched.append(key)
        self.assertEqual(19, len(matched))

    def test_all_class_features_and_granted_powers_are_reachable(self):
        reached = set()
        def visit(key):
            if key in reached:
                return
            reached.add(key)
            entry = self.entries[key]
            for grant in entry.get("grants", []):
                visit(grant["entryId"])
            if entry["category"] != "POWER":
                for choice in entry.get("choices", []):
                    for child in choice["source"].get("entryIds", []):
                        visit(child)
        for entry in self.entries.values():
            if entry["category"] == "CLASS":
                visit(entry["id"])
        expected = {e["id"] for e in self.entries.values() if e["category"] in ("CLASS", "FEATURE", "POWER") and not (e["category"] == "POWER" and e.get("powerKind") == "ATTACK" and "level" in e)}
        self.assertEqual(expected, reached)
        self.assertEqual(26, len([e for e in self.entries.values() if e["category"] == "POWER" and e["source"]["entryId"] in {"modern4e.class." + name for name in (*LEADERS, "fighter")}]))

    def test_shaman_choices_are_complete_distinct_and_do_not_grant_all_powers(self):
        companion = self.named("FEATURE", "Companion Spirit")
        attunement = self.named("FEATURE", "Primal Attunement")
        for feature, count, options in [(companion, 1, 4), (attunement, 3, 5)]:
            choice = feature["choices"][0]
            self.assertEqual(choice["count"], count)
            self.assertEqual(len(choice["source"]["entryIds"]), options)
            self.assertEqual(choice["constraints"], [{"type": "distinct"}])
        self.assertEqual([g["entryId"] for g in companion["grants"]], ["modern4e.power.shaman-call-spirit-companion"])
        world = self.entries["modern4e.feature.world-speaker-spirit"]
        power = self.entries[world["grants"][0]["entryId"]]
        activation = power["activations"][0]
        self.assertEqual(activation["range"]["origin"], "spirit")
        self.assertEqual([b["type"] for b in activation["blocks"]], ["attack", "effect"])
        self.assertEqual(activation["blocks"][0]["roll"]["statistic"]["ability"], "WISDOM")

    def test_channel_divinity_choices_and_shared_pool_survive(self):
        channel = self.entries["modern4e.feature.cleric-channel-divinity"]
        self.assertEqual(len(channel["grants"]), 1)
        self.assertEqual(channel["choices"][0]["count"], 1)
        self.assertEqual(len(channel["choices"][0]["source"]["entryIds"]), 3)
        punish = self.named("FEATURE", "Punish the Profane")
        self.assertEqual(len(punish["grants"]), 2)
        for title in ("Favor of the Gods", "Punish the Profane", "Turn Undead", "Healer's Mercy"):
            activation = self.named("POWER", title)["activations"][0]
            self.assertEqual(activation["usage"]["limits"][0]["poolId"], "modern4e.resource.channel-divinity")

    def test_healing_limits_are_shared_but_source_ambiguities_are_not_resolved(self):
        for title in ("Healing Infusion: Curative Admixture", "Healing Infusion: Resistive Formula"):
            activation = self.named("POWER", title)["activations"][0]
            limits = activation["usage"]["limits"]
            self.assertTrue(all(l["poolId"] == "modern4e.resource.artificer-healing-infusion" for l in limits))
            self.assertEqual(limits[0]["maximum"]["byLevel"], [{"atLevel": 16, "value": 3}])
            self.assertEqual(limits[1]["maximum"], {"base": 1})
        word = self.named("POWER", "Healing Word")
        self.assertEqual(word["activations"][0]["usage"]["limits"], [])
        self.assertTrue(any("three uses per round" in l for l in word["coverage"]["limitations"]))
        self.assertTrue(any("Intelligence-based" in l for l in self.entries["modern4e.class.warlord"]["coverage"]["limitations"]))

    def test_local_source_prose_has_not_become_typst_code(self):
        for entry in self.entries.values():
            self.assertNotRegex(json.dumps(entry), r"#(?:powers|classes|theme)\.")
        for name in LEADERS:
            page = (BOOK / "classes" / (name + ".typ")).read_text(encoding="utf-8")
            self.assertIn("content.classReference(classData)", page)
            self.assertIn("content.initialPowerText(classData)", page)
            self.assertNotIn("#powers.power(", page)
            self.assertNotIn("#classes.defensesAndHealth(", page)
        data = (BOOK / "helpers/class_data.typ").read_text(encoding="utf-8")
        self.assertNotIn("Artificers treat mastery", data)
        self.assertNotIn("Warlords draw from", data)

    def test_feature_sections_reject_missing_duplicate_or_wrong_links(self):
        for mode in ("missing", "duplicate", "unknown"):
            with self.subTest(mode=mode), tempfile.TemporaryDirectory() as directory:
                root = Path(directory)
                shutil.copytree(classes.CONTENT, root, dirs_exist_ok=True)
                path = root / "artificer-features.json"
                document = classes.shared.load_json(path)
                feature = next(f for f in document["features"] if f["title"] == "Healing Infusion")
                if mode == "missing":
                    feature["sections"] = [s for s in feature["sections"] if s["type"] != "grant"]
                elif mode == "duplicate":
                    feature["sections"].append(copy.deepcopy(feature["sections"][-1]))
                else:
                    feature["sections"][-1] = {"type": "execute", "text": "script()"}
                path.write_text(json.dumps(document), encoding="utf-8")
                with self.assertRaisesRegex(ValueError, "sections must reference|unknown feature section"):
                    classes.catalog(root)

    @unittest.skipUnless(TYPST and importlib.util.find_spec("pypdf"), "Printed-content regression requires Typst and pypdf")
    def test_full_book_preserves_printed_rules_and_renderer_block_order(self):
        from pypdf import PdfReader
        def words(value):
            value = re.sub(r"(?m)^\s*\d+\s+v[\d.]+\s*$", "", value)
            value = re.sub(r"(?m)^(?:Leaders|Controllers|Strikers|Defenders)[ \t]+[^\n]+\n", "", value)
            value = re.sub(r"\bon page\s+\d+\b", "on page", value)
            value = re.sub(r"(?m)^\s*\d+\s*$", "", value)
            value = re.sub(r"\b(\d+)(?:st|nd|rd|th)\b", r"\1", value.lower())
            value = re.sub(r"\btwo\b", "2", value)
            value = re.sub(r"\bthree\b", "3", value)
            value = re.sub(r"\bfour\b", "4", value)
            return Counter(re.findall(r"[a-z0-9]+", value))
        golden = classes.shared.load_json(FIXTURES / "rendered-before.json")
        with tempfile.TemporaryDirectory(dir=BOOK) as directory:
            output = Path(directory) / "book.pdf"
            result = subprocess.run([TYPST, "compile", str(BOOK / "main.typ"), str(output)], capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertNotIn("warning:", result.stderr)
            text = [p.extract_text() for p in PdfReader(output).pages]
            for name, before in golden.items():
                with self.subTest(name=name):
                    start = next(i for i, t in enumerate(text) if re.search(r"CLASS REFERENCE\s+" + name + r"\b", t))
                    end = next(i for i in range(start, len(text)) if "Heroic " + name + " Feats" in text[i])
                    self.assertFalse(words(before) - words("\n".join(text[start:end])))
            # A pre-attack effect must print before Attack; a following sibling prints after Hit.
            fixture = classes.shared.load_json(BOOK / "scripts/fixtures/powers/catalog.json")["powers"][0]
            fixture["activations"][0]["blocks"].append({"id": "after", "type": "effect", "label": "Effect", "text": "AfterMarker"})
            fixture["activations"][0]["blocks"][0]["text"] = "BeforeMarker"
            data_path = Path(directory) / "power.json"
            data_path.write_text(json.dumps(fixture), encoding="utf-8")
            source = Path(directory) / "power.typ"
            source.write_text('#import "../helpers/power_content.typ" as p\n#set page(width: 230mm, height: 277mm)\n#p.powerCard(json("power.json"))', encoding="utf-8")
            result = subprocess.run([TYPST, "compile", "--root", str(BOOK), str(source), str(output)], capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stderr)
            rendered = "\n".join(p.extract_text() for p in PdfReader(output).pages)
            self.assertLess(rendered.index("BeforeMarker"), rendered.index("Attack:"))
            self.assertLess(rendered.index("Hit:"), rendered.index("AfterMarker"))


if __name__ == "__main__":
    unittest.main()
