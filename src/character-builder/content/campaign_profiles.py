"""Explicit build-time campaign policy; retain excluded definitions and saved identities."""
import copy
from pathlib import Path

import build
import runtime_common

CONTENT = Path(__file__).with_name("campaign-profiles.json")


def load(path=CONTENT):
    """Validate the closed policy shape without inventing campaign availability."""
    data = build.load_json(path)
    build.object_fields(data, ["schemaVersion", "defaultProfile", "profiles"], [], path)
    build.require(type(data["schemaVersion"]) is int and data["schemaVersion"] == 1,
                  path, "unsupported campaign policy version")
    build.require(isinstance(data["profiles"], dict) and data["profiles"], path, "expected profiles")
    for name, profile in data["profiles"].items():
        where = f"{path}/{name}"
        build.string(name, where)
        build.object_fields(profile, ["enabled", "limitations", "excludedEntries"], [], where)
        build.require(type(profile["enabled"]) is bool, where, "enabled must be boolean")
        for note in build.array(profile["limitations"], where):
            build.string(note, where)
        build.require(profile["enabled"] or profile["limitations"], where, "disabled profile needs explanation")
        build.require(isinstance(profile["excludedEntries"], dict), where, "expected excludedEntries object")
        for entry_id, reason in profile["excludedEntries"].items():
            build.string(entry_id, where)
            build.string(reason, where)
    build.string(data["defaultProfile"], path)
    build.require(data["defaultProfile"] in data["profiles"], path, "unknown default profile")
    build.require(data["profiles"][data["defaultProfile"]]["enabled"], path, "default profile must be enabled")
    return data


def apply(assets, profile=None, policy=None):
    """Gate known exclusions as ineligible, keeping all authored data and references intact."""
    policy = load() if policy is None else policy
    name = policy["defaultProfile"] if profile is None else profile
    build.require(name in policy["profiles"], "campaign", f"unknown campaign profile {name}")
    selected = policy["profiles"][name]
    build.require(selected["enabled"], "campaign", f"{name} is unavailable: {' '.join(selected['limitations'])}")
    result = copy.deepcopy(assets)
    entries = {entry["id"]: entry for entry in runtime_common.entries_of(result)}
    for entry_id, reason in selected["excludedEntries"].items():
        build.require(entry_id in entries, "campaign", f"excluded entry {entry_id} does not exist")
        entry = entries[entry_id]
        gate = {"type": "unavailable", "text": f"Unavailable in {name}", "reason": reason}
        access = entry["mechanics"].get("access", {"type": "always"})
        entry["mechanics"]["access"] = {"type": "allOf", "conditions": [access, gate]}
        entry["sharedData"]["campaignAvailability"] = {"profile": name, "available": False, "reason": reason}
        entry["coverage"]["limitations"].append(reason)
    return result
