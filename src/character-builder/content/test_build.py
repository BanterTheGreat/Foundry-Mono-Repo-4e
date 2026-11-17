"""Observable production behavior against source bytes and broken author inputs."""
import copy
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

import build


HERE = Path(__file__).resolve().parent


class ProductionTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.config = build.load_json(HERE / "proof.json")
        cls.assets = build.build(HERE / "proof.json")

    def configured(self, change):
        config = copy.deepcopy(self.config)
        change(config)
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "authored.json"
            path.write_bytes(build.serialize(config))
            return build.build(path)

    def reject(self, change, message):
        with self.assertRaisesRegex(ValueError, "authored.json:.*" + message):
            self.configured(change)

    def test_regeneration_and_reordering_are_byte_identical(self):
        other = self.configured(lambda c: c["packages"][0]["entries"].reverse())
        self.assertEqual(self.assets, other)
        for name, value in self.assets.items():
            self.assertEqual((HERE / "generated" / name).read_bytes(), build.serialize(value))
        result = subprocess.run([sys.executable, str(HERE / "build.py"), "--config", str(HERE / "proof.json"), "--check"], capture_output=True, text=True)
        self.assertEqual(0, result.returncode, result.stderr)

    def test_source_html_identity_publications_and_references_preserved(self):
        for package in ("modern4e.proof", "modern4e.proof.override"):
            manifest = self.assets[f"{package}/manifest.json"]
            for chunk in manifest["chunks"]:
                for entry in self.assets[f"{package}/{chunk}.json"]["entries"]:
                    source = build.SNAPSHOT / build.compendium.category(entry["id"])
                    batch = source / f"data{int(''.join(filter(str.isdigit, entry['id']))) % 20}.js"
                    before = hashlib.sha256(batch.read_bytes()).digest()
                    html = build.payload(batch)[-1][entry["id"]]
                    self.assertEqual(html, entry["presentation"]["description"])
                    self.assertTrue(entry["presentation"]["publications"])
                    self.assertIn("Published in", html)
                    self.assertEqual(before, hashlib.sha256(batch.read_bytes()).digest())
        parser = build.PresentationParser()
        parser.feed('<a href="https://iws.mx/dnd/?view=power1,power2&amp;x=y">two</a><a href="?view=feat3">one</a>')
        self.assertEqual(["power1", "power2", "feat3"], parser.references)

    def test_index_is_lightweight_and_maps_every_entry_once(self):
        for package in ("modern4e.proof", "modern4e.proof.override"):
            index = self.assets[f"{package}/index.json"]["entries"]
            self.assertEqual(len(index), len({e["id"] for e in index}))
            for metadata in index:
                self.assertEqual({"id", "category", "title", "chunkId"}, metadata.keys())
                entry = next(e for e in self.assets[f"{package}/{metadata['chunkId']}.json"]["entries"] if e["id"] == metadata["id"])
                self.assertEqual(metadata["title"], entry["presentation"]["title"])
                self.assertEqual(metadata["category"], entry["category"])

    def entries(self):
        return {e["id"]: e for name, chunk in self.assets.items() if name.startswith("modern4e.proof/") and name.split("/")[1].startswith("entries-") for e in chunk["entries"]}

    def test_authored_modern_mechanics_and_explicit_incomplete_coverage(self):
        entries = self.entries()
        self.assertEqual({"type": "abilityPoints", "ability": "STRENGTH", "minimum": 2}, entries["feat338"]["mechanics"]["prerequisites"][0])
        skills = entries["feat166"]["mechanics"]["choices"][0]["skills"]
        self.assertEqual(set(build.SKILLS), set(skills))
        self.assertFalse(set(skills) & {"HEAL", "HISTORY", "STREETWISE", "DUNGEONEERING"})
        self.assertEqual("unadapted", entries["feat261"]["mechanics"]["prerequisites"][0]["type"])
        self.assertEqual({}, entries["feat652"]["mechanics"])
        self.assertEqual("UNIMPLEMENTED", entries["feat652"]["coverage"]["status"])
        self.assertTrue(all(e["coverage"]["limitations"] for e in entries.values()))
        self.assertEqual("mainAbility", entries["class3"]["mechanics"]["choices"][0]["type"])

    def test_duplicate_entry_and_source_ids_and_json_keys_rejected(self):
        self.reject(lambda c: c["packages"][0]["entries"].append(c["packages"][0]["entries"][0]), "duplicate entry ID class3")
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory)
            (path / "catalog.js").write_text('od.reader.jsonp_catalog(1, {"class": 2})')
            (path / "class").mkdir()
            (path / "class/_listing.js").write_text('od.reader.jsonp_data_listing(1,"class",["ID","Name"],[["class1","A"],["class1","B"]])')
            with self.assertRaisesRegex(ValueError, r"_listing.js:rows\[1\].*duplicate source ID"):
                build.snapshot_catalog(path)
            (path / "duplicate.json").write_text('{"id":1,"id":2}')
            with self.assertRaisesRegex(ValueError, "duplicate JSON key id"):
                build.load_json(path / "duplicate.json")

    def test_jsonp_is_parsed_as_data_never_executed(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "malformed.js"
            for text in ('alert(1)', 'od.reader.jsonp_data(1, (() => 2)())', 'od.reader.jsonp_data(1,{"x":1}); evil()', 'od.reader.jsonp_data(1,"T>t<;encoded")', 'od.reader.jsonp_data()'):
                path.write_text(text)
                with self.subTest(text=text), self.assertRaisesRegex(ValueError, "malformed.js"):
                    build.payload(path)
            path.write_text("od.reader.jsonp_data(1,{key:'data',});")
            self.assertEqual({"key": "data"}, build.payload(path)[-1])

    def test_dependency_failures_and_cycles_have_source_locations(self):
        self.reject(lambda c: c["packages"][1]["dependencies"][0].update(packageId="absent"), "missing dependency")
        self.reject(lambda c: c["packages"][1]["dependencies"][0].update(revision="2"), "revision mismatch")
        self.reject(lambda c: c["packages"][0].update(dependencies=[{"packageId": "modern4e.proof.override", "revision": "1"}]), "dependency cycle")
        self.reject(lambda c: c["packages"][0].update(dependencies=[{"packageId": "modern4e.proof", "revision": "1"}]), "self dependency")

    def test_mechanical_references_must_be_local_or_declared_dependencies(self):
        def reference(config, entry_id):
            config["packages"][1]["entries"][0]["mechanics"]["grants"] = [{"type": "entry", "grantId": "test", "entryId": entry_id}]
        self.configured(lambda c: reference(c, "class3"))
        self.reject(lambda c: reference(c, "class999999"), "mechanical reference class999999")
        def undeclared(config):
            reference(config, "class3")
            config["packages"][1]["dependencies"] = []
        self.reject(undeclared, "declared dependencies")

    def test_mechanical_validation_rejects_unknown_or_vanilla_vocabulary(self):
        def mechanics(config):
            return config["packages"][0]["entries"][0]["mechanics"]
        self.reject(lambda c: mechanics(c).update(script="evil()"), "unknown fields")
        self.reject(lambda c: mechanics(c)["choices"][1].update(skills=["HEAL"]), "expected one of")
        self.reject(lambda c: mechanics(c)["choices"][1].update(count=True), "32-bit integer")
        self.reject(lambda c: mechanics(c)["choices"][1].update(count=20), "maximum")
        self.reject(lambda c: mechanics(c).update(progression=[{"level": 31}]), "maximum 30")
        self.reject(lambda c: mechanics(c).update(prerequisites=[{"type": "abilityScore", "minimum": 13}]), "expected one of")
        self.reject(lambda c: mechanics(c).update(modifiers=[{"target": {"statistic": "SKILL_CHECK"}, "operation": "ADD", "value": 1}]), "skill required")
        self.reject(lambda c: c["packages"][0]["entries"][3]["coverage"].update(status="SUPPORTED"), "unadapted prerequisite")
        self.reject(lambda c: c["packages"][0]["entries"][0]["coverage"].update(limitations=[]), "requires limitations")
        self.reject(lambda c: c["packages"][0]["entries"][4].update(coverage={"status": "SUPPORTED", "limitations": []}), "absent authored mechanics")

    def test_missing_source_unknown_fields_and_unsafe_package_names(self):
        self.reject(lambda c: c["packages"][0]["entries"][0].update(id="class999999"), "missing source entry")
        self.reject(lambda c: c["packages"][0].update(id="../escape"), "safe directory")
        self.reject(lambda c: c["packages"][0]["entries"][0].update(typo=True), "unknown fields")

    def test_missing_html_and_dangling_presentation_reference_are_actionable(self):
        with tempfile.TemporaryDirectory() as directory:
            snapshot = Path(directory)
            (snapshot / "catalog.js").write_text('od.reader.jsonp_catalog(1,{"class":1})')
            (snapshot / "class").mkdir()
            (snapshot / "class/_listing.js").write_text('od.reader.jsonp_data_listing(1,"class",["ID","Name"],[["class3","Fighter"]])')
            batch = snapshot / "class/data3.js"
            config = snapshot / "author.json"
            config.write_bytes(build.serialize({"packages": [{"id": "test", "revision": "1", "title": "test", "entries": [{"id": "class3"}]}]}))
            batch.write_text('od.reader.jsonp_data(1,"class",{})')
            with self.assertRaisesRegex(ValueError, "_listing.js:rows.*missing HTML class3"):
                build.build(config, snapshot)
            batch.write_text('od.reader.jsonp_data(1,"class",{"class3":"<a href=\\\"?view=power999\\\">missing</a>"})')
            with self.assertRaisesRegex(ValueError, "data3.js:class3.*dangling presentation reference power999"):
                build.build(config, snapshot)

    def test_check_detects_stale_bytes_and_unexpected_assets(self):
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory)
            args = [sys.executable, str(HERE / "build.py"), "--output", str(output)]
            result = subprocess.run(args, capture_output=True, text=True)
            self.assertEqual(0, result.returncode, result.stderr)
            manifest = output / "modern4e.proof/manifest.json"
            manifest.write_text("{}")
            result = subprocess.run(args + ["--check"], capture_output=True, text=True)
            self.assertNotEqual(0, result.returncode)
            self.assertIn("missing or stale generated asset", result.stderr)
            (output / "modern4e.proof/obsolete.json").write_text("{}")
            result = subprocess.run(args, capture_output=True, text=True)
            self.assertNotEqual(0, result.returncode)
            self.assertIn("unexpected stale assets", result.stderr)
            self.assertEqual("{}", manifest.read_text())

    def test_modifier_progression_and_reference_variants(self):
        mechanics = {
            "prerequisites": [{"type": "level", "minimum": 2}, {"type": "entry", "entryId": "feat1"}, {"type": "proficiency", "skill": "RELIGION"}],
            "grants": [{"type": "proficiency", "grantId": "medicine", "skill": "MEDICINE"}],
            "choices": [{"type": "entries", "id": "power", "count": 1, "entryIds": ["power1"]}],
            "progression": [{"level": 4, "grants": [{"type": "entry", "grantId": "feature", "entryId": "classfeature1"}], "modifiers": [{"target": {"statistic": "ABILITY_POINTS", "ability": "WISDOM"}, "operation": "ADD", "value": 1}]}]
        }
        self.assertEqual(["feat1", "power1", "classfeature1"], build.validate_mechanics(mechanics, "authored"))
        mechanics["progression"].append({"level": 4})
        with self.assertRaisesRegex(ValueError, "duplicate"):
            build.validate_mechanics(mechanics, "authored")

    def test_full_source_category_selection_keeps_every_entry_unimplemented(self):
        # Exercise category expansion using the real class listing, not a synthetic catalog.
        def categories(config):
            config["packages"] = [dict(config["packages"][0], sourceCategories=["class"], entries=[])]
        assets = self.configured(categories)
        index = assets["modern4e.proof/index.json"]["entries"]
        expected = build.payload(build.SNAPSHOT / "class/_listing.js")[-1]
        self.assertEqual({row[0] for row in expected}, {row["id"] for row in index})
        for name, value in assets.items():
            if "/entries-" in name:
                self.assertTrue(all(e["coverage"]["status"] == "UNIMPLEMENTED" for e in value["entries"]))


if __name__ == "__main__":
    unittest.main()
