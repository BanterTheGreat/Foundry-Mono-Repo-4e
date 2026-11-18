"""Campaign exclusions cannot become unknown prerequisites or remove saved identities."""
import copy
import json
from pathlib import Path
import tempfile
import unittest

import build
import campaign_profiles
import runtime_common


class CampaignProfilesTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.assets = build.production()

    def test_zeitgeist_retains_revenant_but_explicitly_excludes_selection(self):
        entries = {e["id"]: e for e in runtime_common.entries_of(self.assets)}
        revenant = entries["modern4e.ancestry.revenant"]
        gate = revenant["mechanics"]["access"]["conditions"][-1]
        self.assertEqual("unavailable", gate["type"])
        self.assertIn("ZEITGEIST", gate["text"])
        self.assertFalse(revenant["sharedData"]["campaignAvailability"]["available"])
        self.assertIn("modern4e.feature.revenant-past-life", entries)
        runtime_common.validate_references(self.assets)
        for entry in entries.values():
            if entry["category"] == "ANCESTRY" and entry["id"] != revenant["id"]:
                self.assertNotIn("campaignAvailability", entry["sharedData"])

    def test_unknown_disabled_profiles_and_unknown_exclusions_fail(self):
        with self.assertRaisesRegex(ValueError, "unknown campaign profile"):
            campaign_profiles.apply(self.assets, "MISSING")
        with self.assertRaisesRegex(ValueError, "HOMEBREW is unavailable"):
            campaign_profiles.apply(self.assets, "HOMEBREW")
        policy = copy.deepcopy(campaign_profiles.load())
        policy["profiles"]["ZEITGEIST"]["excludedEntries"]["missing"] = "Not available"
        with self.assertRaisesRegex(ValueError, "does not exist"):
            campaign_profiles.apply(self.assets, policy=policy)

    def test_policy_shape_and_duplicate_keys_are_strict(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "policy.json"
            data = campaign_profiles.load()
            data["profiles"]["ZEITGEIST"]["extra"] = True
            path.write_text(json.dumps(data), encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "unknown fields"):
                campaign_profiles.load(path)
            path.write_text('{"schemaVersion":1,"schemaVersion":1}', encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "duplicate JSON key"):
                campaign_profiles.load(path)


if __name__ == "__main__":
    unittest.main()
