"""Validate authoritative Zeitgeist themes and ordered powers; no runtime effects."""
import json
from pathlib import Path

import class_content as shared
import power_content

CONTENT = Path(__file__).resolve().parents[1] / "content/themes/zeitgeist.json"
BASE = "id title description access prerequisites selection coverage".split()


def validate(data):
    """Reject unknown fields, duplicate identities and broken theme grants/options."""
    shared.fields(data, ["schemaVersion", "themes", "features", "powers"], [], "themes")
    shared.require(type(data["schemaVersion"]) is int and data["schemaVersion"] == 1, "themes", "unsupported schemaVersion")
    entries = {}
    categories = {}
    for category in ("themes", "features", "powers"):
        shared.array(data[category], category, True)
        for value in data[category]:
            shared.string(value.get("id"), category)
            eid = value["id"]
            shared.require(eid.startswith("modern4e." + {"themes": "theme", "features": "feature", "powers": "power"}[category] + "."), eid, "invalid identity")
            shared.require(eid not in entries, eid, "duplicate identity")
            entries[eid] = value
            categories[eid] = category
    for eid, value in entries.items():
        category = categories[eid]
        if category == "powers":
            power_content.validate_power(value, entries)
            shared.require(value["rulesProfile"] == "MODERN4E", eid, "expected local rules")
            continue
        shared.fields(value, BASE + (["role", "concept", "sections", "grants"] if category == "themes" else []), ["modifications"] if category == "themes" else [], eid)
        for key in ("title", "description"):
            shared.string(value[key], eid)
        for key in ("access", "prerequisites"):
            shared.require(value[key] == {"type": "always"}, eid, "unsupported condition")
        shared.require(value["selection"] == {"maximum": 1, "constraints": []}, eid, "unsupported selection")
        shared.coverage(value["coverage"], eid)
        shared.require(value["coverage"]["status"] == "UNIMPLEMENTED", eid, "runtime themes unimplemented")
        if category != "themes":
            continue
        shared.enum(value["role"], ["DEFENDER", "STRIKER", "LEADER", "CONTROLLER"], eid)
        shared.string(value["concept"], eid)
        shared.require(isinstance(value["sections"], dict) and bool(value["sections"]), eid, "missing prose sections")
        for key, prose in value["sections"].items():
            shared.string(key, eid)
            shared.string(prose, eid)
        shared.array(value["grants"], eid, True)
        grant_ids, targets = set(), set()
        for grant in value["grants"]:
            shared.fields(grant, ["id", "entryId", "atLevel"], [], eid)
            shared.string(grant["id"], eid)
            shared.require(grant["id"] not in grant_ids, eid, "duplicate grant identity")
            grant_ids.add(grant["id"])
            shared.require(categories.get(grant["entryId"]) in ("features", "powers"), eid, "missing or wrong-category grant")
            shared.require(grant["entryId"] not in targets, eid, "duplicate grant target")
            targets.add(grant["entryId"])
            shared.integer(grant["atLevel"], eid, 1, 30)
        options = value.get("modifications", [])
        shared.array(options, eid)
        shared.require(len(options) == len(set(options)), eid, "duplicate modification")
        for option in options:
            shared.require(categories.get(option) == "features" and option not in targets, eid, "invalid modification option")
    used = {g["entryId"] for t in data["themes"] for g in t["grants"]}
    used.update(o for t in data["themes"] for o in t.get("modifications", []))
    shared.require(used == {eid for eid in entries if categories[eid] != "themes"}, "themes", "orphan feature or power")
    return entries


def load():
    """Read strict JSON with duplicate-key rejection before validating references."""
    return validate(shared.shared.load_json(CONTENT))


if __name__ == "__main__":
    print(f"Validated {len(load())} Zeitgeist theme, feature and power entries")
