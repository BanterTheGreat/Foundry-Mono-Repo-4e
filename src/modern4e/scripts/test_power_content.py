"""Source-backed scenarios and malformed-authoring regressions for power blocks."""
import copy
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

import compendium
import power_content as content


class PowerContentTest(unittest.TestCase):
    def setUp(self):
        self.data = content.shared.shared.load_json(content.DEFAULT)

    def power(self, slug):
        return next(p for p in self.data["powers"] if p["id"] == "fixture.power." + slug)

    def activation(self, slug):
        return self.power(slug)["activations"][0]

    def rejects(self, mutate, message):
        mutate(self.data)
        with self.assertRaisesRegex(ValueError, message):
            content.validate(self.data)

    def test_all_fixtures_validate_without_mutation(self):
        before = copy.deepcopy(self.data)
        content.validate(self.data)
        self.assertEqual(self.data, before)
        self.assertEqual(len(self.data["powers"]), 16)

    def test_published_rules_are_preserved_verbatim_and_exclusions_hold(self):
        for power in self.data["powers"]:
            with self.subTest(power=power["title"]):
                source = power["source"]
                args = compendium.payload(compendium.batch_path("power", source["entryId"]))
                html = next(a[source["entryId"]] for a in args if isinstance(a, dict) and source["entryId"] in a)
                reader = compendium.PlainText()
                reader.feed(html)
                self.assertEqual(source["rulesText"], reader.text())
                self.assertIn(source["publication"], reader.text())
                self.assertNotRegex(reader.text(), r"\bPsionic\b|Full Discipline|Monk (Attack|Utility|Feature)")
                self.assertEqual(power["rulesProfile"], "PUBLISHED_REFERENCE")
                self.assertEqual(power["coverage"]["status"], "UNIMPLEMENTED")

    def test_pre_attack_and_conditional_followup_are_not_flattened(self):
        blocks = self.activation("rope-the-mark")["blocks"]
        self.assertEqual([b["id"] for b in blocks], ["advance", "strike"])
        self.assertEqual(blocks[1]["comparisons"][0]["outcomes"]["hit"][1]["type"], "choice")
        self.assertNotIn("miss", blocks[1]["comparisons"][0]["outcomes"])
        self.assertEqual([b["id"] for b in self.activation("hurl-the-spark")["blocks"]], ["primary", "followup", "secondary"])

    def test_one_roll_has_independent_defense_comparisons(self):
        attack = self.activation("prismatic-spray")["blocks"][0]
        self.assertEqual(attack["roll"]["count"], 1)
        self.assertEqual(attack["roll"]["sharing"], "PER_TARGET")
        self.assertEqual([c["defense"] for c in attack["comparisons"]], ["FORTITUDE", "REFLEX", "WILL"])
        effects = [c["outcomes"]["hit"][0]["text"] for c in attack["comparisons"]]
        self.assertIn("poison", effects[0])
        self.assertIn("fire", effects[1])
        self.assertIn("stunned", effects[2])

    def test_aggregate_result_links_to_multiple_rolls(self):
        blocks = self.activation("driving-assault")["blocks"]
        self.assertEqual(blocks[0]["roll"]["count"], 2)
        self.assertEqual(blocks[1]["when"]["attackId"], blocks[0]["id"])
        self.assertEqual(blocks[1]["when"]["count"], 2)

    def test_acquisition_choice_and_activation_geometry_stay_distinct(self):
        power = self.power("familiar-surge")
        self.assertEqual(power["choices"][0]["timing"], "ACQUISITION")
        attack = power["activations"][0]["blocks"][0]
        self.assertEqual(attack["roll"]["statistic"]["choiceId"], power["choices"][0]["id"])
        self.assertEqual(attack["range"]["type"], "CHOICE")
        self.assertTrue(all(o["origin"] == "familiar" for o in attack["range"]["options"]))

    def test_independent_limits_and_non_damage_scaling(self):
        activation = self.activation("inspiring-word")
        limits = {l["period"]: l["maximum"] for l in activation["usage"]["limits"]}
        self.assertEqual(limits["ENCOUNTER"], {"base": 2, "byLevel": [{"atLevel": 16, "value": 3}]})
        self.assertEqual(limits["ROUND"], {"base": 1})
        self.assertEqual(activation["range"]["size"]["byLevel"][-1], {"atLevel": 21, "value": 15})
        self.assertEqual(self.activation("fate-rolls-on")["usage"]["limits"][0]["poolId"], "channel-divinity")

    def test_commands_triggers_and_temporary_powers_are_separate(self):
        summon = self.power("summon-savage-tiger")
        self.assertEqual(summon["activations"][1]["availability"], "GRANTED")
        self.assertEqual(summon["activations"][1]["bindings"]["self"]["kind"], "ENTITY")
        self.assertEqual(summon["activations"][0]["blocks"][0]["blocks"][1]["type"], "trigger")
        secondary = self.power("memory-of-blades")["activations"][1]
        self.assertEqual(secondary["action"], "IMMEDIATE_REACTION")
        self.assertIn("trigger", secondary)
        self.assertIn("requirement", secondary)

    def test_attack_actor_origin_statistic_and_targets_are_independent(self):
        companion = self.activation("distracting-team")["blocks"][2]
        self.assertEqual(companion["actor"], "beast")
        self.assertEqual(companion["range"]["origin"], "beast")
        self.assertEqual(companion["roll"]["statistic"]["type"], "RULES_TEXT")
        summon_attack = self.power("summon-savage-tiger")["activations"][1]["blocks"][0]
        self.assertIn("summoner", summon_attack["roll"]["statistic"]["text"])
        for slug in ("frozen-heart", "oath-of-consuming-light"):
            self.assertEqual(self.activation(slug)["blocks"][0]["range"], {"type": "RANGED", "distance": {"base": 10}, "origin": "self"})
        attacks = self.activation("hurl-the-spark")["blocks"]
        self.assertNotEqual(attacks[0]["targets"], attacks[2]["targets"])

    def test_aftereffect_remains_inside_hit_branch(self):
        attack = self.activation("oath-of-consuming-light")["blocks"][0]
        ongoing = attack["comparisons"][0]["outcomes"]["hit"][1]
        self.assertEqual(ongoing["blocks"][0]["id"], "aftereffect")
        self.assertEqual(len(self.activation("oath-of-consuming-light")["blocks"]), 1)

    def test_random_table_and_repeat_are_nested_not_immediate(self):
        zone = self.activation("reality-distortion")["blocks"][0]
        table = zone["blocks"][0]["blocks"][0]
        self.assertEqual(table["type"], "table")
        self.assertEqual([r["faces"] for r in table["results"]], [[n] for n in range(1, 7)])
        chain = self.activation("tempest-of-triumph")["blocks"][0]["comparisons"][0]["outcomes"]["hit"][1]
        self.assertEqual(chain["type"], "repeat")
        self.assertEqual(chain["while"]["type"], "RULES_TEXT")

    def test_missing_and_wrong_kind_attack_links_fail(self):
        for target in ("missing", "both-hit"):
            with self.subTest(target=target):
                self.setUp()
                self.rejects(lambda _: self.activation("driving-assault")["blocks"][1]["when"].update(attackId=target), "attack reference")

    def test_impossible_aggregate_result_fails(self):
        self.rejects(lambda _: self.activation("driving-assault")["blocks"][1]["when"].update(count=3), "count exceeds")

    def test_wrong_origin_binding_fails(self):
        self.rejects(lambda _: self.activation("prismatic-spray")["blocks"][0]["range"].update(origin="targets"), "wrong-kind binding")

    def test_secondary_area_projects_primary_target_without_inventing_range(self):
        activation = self.activation("hurl-the-spark")
        self.assertEqual(activation["bindings"]["impact"]["fromAttack"], {"attackId": "primary", "part": "TARGETS"})
        self.assertNotIn("distance", activation["blocks"][2]["range"])
        self.rejects(lambda _: activation["bindings"]["impact"]["fromAttack"].update(attackId="missing"), "binding attack reference")

    def test_missing_defense_comparison_fails(self):
        self.rejects(lambda _: self.activation("driving-assault")["blocks"][1]["when"].update(comparisonId="will"), "comparison reference")

    def test_undeclared_acquisition_choice_fails(self):
        self.rejects(lambda _: self.power("familiar-surge").update(choices=[]), "unknown acquisition")

    def test_duplicate_blocks_fail_even_in_separate_outcomes(self):
        def mutate(_):
            attack = self.activation("hurl-the-spark")["blocks"][0]
            attack["comparisons"][0]["outcomes"]["miss"][0]["id"] = "primary-ac-hit"
        self.rejects(mutate, "duplicate block")

    def test_orphan_and_cyclic_grants_fail(self):
        self.rejects(lambda _: self.activation("memory-of-blades")["blocks"][0].update(blocks=[{"id": "empty", "type": "effect", "label": "Effect", "text": "No grant."}]), "orphan")
        self.setUp()
        def cycle(_):
            child = self.power("memory-of-blades")["activations"][1]
            child["blocks"].append({"id": "cycle", "type": "grant", "label": "Grant", "text": "Recursive grant.", "activationId": "reaction", "duration": "While active."})
        self.rejects(cycle, "cyclic")

    def test_table_gaps_and_overlaps_fail(self):
        for face in (1, 7):
            self.setUp()
            table = self.activation("reality-distortion")["blocks"][0]["blocks"][0]["blocks"][0]
            table["results"][-1]["faces"] = [face]
            with self.assertRaises(ValueError):
                content.validate(self.data)

    def test_invalid_limits_scaling_unknown_fields_and_excluded_keywords(self):
        mutations = [
            (lambda _: self.activation("inspiring-word")["usage"]["limits"][0]["maximum"].update(base=True), "expected integer"),
            (lambda _: self.activation("inspiring-word")["range"]["size"]["byLevel"].reverse(), "ascending"),
            (lambda _: self.power("familiar-surge").update(execute="script()"), "unknown fields"),
            (lambda _: self.power("familiar-surge").update(keywords=["PSIONIC"]), "out of scope"),
            (lambda _: self.power("familiar-surge")["coverage"].update(status="SUPPORTED", limitations=[]), "no runtime support"),
        ]
        for mutate, message in mutations:
            self.setUp()
            with self.subTest(message=message):
                self.rejects(mutate, message)

    def test_duplicate_json_keys_fail(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "duplicate.json"
            path.write_text('{"schemaVersion":1,"schemaVersion":1}', encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "duplicate JSON key"):
                content.shared.shared.load_json(path)

    def test_cli_validates_without_rewriting_fixture(self):
        before = content.DEFAULT.read_bytes()
        result = subprocess.run([sys.executable, str(Path(content.__file__))], capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("Validated 16", result.stdout)
        self.assertEqual(content.DEFAULT.read_bytes(), before)


if __name__ == "__main__":
    unittest.main()
