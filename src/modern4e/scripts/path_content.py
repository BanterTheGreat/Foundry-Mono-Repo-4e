"""Validate and export authoritative paragon-path authoring: the Zeitgeist paths and the class paths."""
import argparse
import json
from pathlib import Path

import class_content as shared
import power_content

CONTENT = Path(__file__).resolve().parents[1] / "content/paths/zeitgeist.json"
CLASS_CONTENT = CONTENT.with_name("class-paths.json")
BASE = "id title description access prerequisites selection coverage".split()
CATEGORIES = {"paths": "path", "features": "feature", "rules": "rule", "powers": "power"}


def validate_class_path(value, eid, classes):
    """Class paths keep their class-catalog access and may only add one explicit unresolved requirement."""
    for key in ("flavor", "prerequisiteText", "sourceEntryId", "link"):
        shared.string(value[key], eid)
    shared.require(value["ruleIds"] == [], eid, "class paths have no supplementary rules")
    shared.require(eid == "modern4e.path." + value["sourceEntryId"], eid, "path identity must follow its published entry")
    shared.require(value["requirements"] is None or isinstance(value["requirements"], str), eid, "invalid requirements")
    access = value["access"]
    shared.require(access["type"] in ("entry", "anyOf"), eid, "class path access must name only classes")
    routes = access["conditions"] if access["type"] == "anyOf" else [access]
    shared.require(all(node["type"] == "entry" and node["entryId"] in classes for node in routes), eid,
                   "class path access must name only classes")
    level = {"type": "level", "minimum": 11}
    prerequisites = value["prerequisites"]
    if value["requirements"] is None:
        shared.require(prerequisites == level, eid, "expected the level-11 prerequisite")
    else:
        shared.require(prerequisites.get("type") == "allOf" and prerequisites["conditions"][:1] == [level]
                       and len(prerequisites["conditions"]) == 2 and prerequisites["conditions"][1].get("type") == "unresolved"
                       and prerequisites["conditions"][1].get("text") == value["requirements"], eid,
                       "expected level 11 and the unresolved class-path requirement")


def validate(data, themes, classes=None):
    """Reject malformed entries, unresolved grants, orphan rules and invalid powers.

    ``classes`` (class entry IDs) validates the class-path catalog instead of the Zeitgeist theme paths.
    """
    shared.fields(data, ["schemaVersion", "document", *CATEGORIES], [], "paths")
    shared.require(type(data["schemaVersion"]) is int and data["schemaVersion"] == 1, "paths", "unsupported schemaVersion")
    shared.fields(data["document"], ["title", "introduction", "source"], [], "document")
    for text in data["document"].values():
        shared.string(text, "document")
    entries, categories = {}, {}
    for category, prefix in CATEGORIES.items():
        shared.array(data[category], category, classes is None or category != "rules")
        for value in data[category]:
            eid = value.get("id")
            shared.string(eid, category)
            shared.require(eid.startswith("modern4e." + prefix + "."), eid, "invalid identity")
            shared.require(eid not in entries and eid not in themes, eid, "duplicate identity")
            entries[eid], categories[eid] = value, category
    references = entries | themes | dict.fromkeys(classes or ())
    owned = set()
    for eid, value in entries.items():
        category = categories[eid]
        if category == "powers":
            power_content.validate_power(value, references)
            shared.require(value["rulesProfile"] == "MODERN4E" and "level" in value and "powerKind" in value, eid, "expected leveled local power")
            continue
        extra = {"paths": ["themeId", "flavor", "prerequisiteText", "grants", "ruleIds"] if classes is None else
                 ["flavor", "prerequisiteText", "grants", "ruleIds", "sourceEntryId", "link", "requirements"],
                 "features": [], "rules": ["sections"]}[category]
        shared.fields(value, BASE + extra, [], eid)
        for key in ("title", "description"):
            shared.string(value[key], eid)
        for key in ("access", "prerequisites"):
            shared.shared.validate_condition(value[key], references, set(entries), eid)
        shared.require(value["selection"] == {"maximum": 1, "constraints": []}, eid, "unsupported selection")
        shared.coverage(value["coverage"], eid)
        shared.require(value["coverage"]["status"] == "UNIMPLEMENTED", eid, "runtime paths unimplemented")
        if category == "rules":
            shared.array(value["sections"], eid, True)
            for section in value["sections"]:
                shared.enum(section.get("type"), ["text", "heading"], eid)
                shared.fields(section, ["type", "text"] if section["type"] == "text" else ["type", "level", "title"], [], eid)
                shared.string(section.get("text", section.get("title")), eid)
                if section["type"] == "heading":
                    shared.integer(section["level"], eid, 1, 2)
        if category != "paths":
            continue
        for key in ("flavor", "prerequisiteText"):
            shared.string(value[key], eid)
        if classes is not None:
            validate_class_path(value, eid, classes)
        else:
            shared.require(value["access"] == {"type": "always"}, eid, "campaign availability is separate from access")
            shared.require(value["themeId"] in themes, eid, "missing associated theme")
            prerequisites = value["prerequisites"]
            shared.require(prerequisites.get("type") == "allOf" and {"type": "level", "minimum": 11} in prerequisites["conditions"], eid, "missing level-11 prerequisite")
            routes = [node for node in prerequisites["conditions"] if node["type"] == "anyOf"]
            shared.require(len(routes) == 1 and {"type": "entry", "entryId": value["themeId"]} in routes[0]["conditions"] and len(routes[0]["conditions"]) == 2, eid, "expected theme or alternative qualification")
        shared.array(value["grants"], eid, True)
        grant_ids = set()
        for grant in value["grants"]:
            shared.fields(grant, ["id", "entryId", "atLevel"], [], eid)
            shared.string(grant["id"], eid)
            shared.require(grant["id"] not in grant_ids, eid, "duplicate grant ID")
            grant_ids.add(grant["id"])
            target = grant["entryId"]
            shared.require(categories.get(target) in ("features", "powers") and target not in owned, eid, "missing, duplicate or wrong-category grant")
            owned.add(target)
            shared.integer(grant["atLevel"], eid, 11, 20)
            shared.require(grant["atLevel"] in (11, 12, 16, 20), eid, "unsupported grant level")
            shared.require(entries[target]["access"] == {"type": "entry", "entryId": eid}, target, "path access mismatch")
            if categories[target] == "powers":
                shared.require(grant["atLevel"] == entries[target]["level"], target, "power grant level mismatch")
        power_content.strings(value["ruleIds"], eid)
        for target in value["ruleIds"]:
            shared.require(categories.get(target) == "rules" and target not in owned, eid, "missing, duplicate or wrong-category rule")
            owned.add(target)
    shared.require(owned == {eid for eid in entries if categories[eid] != "paths"}, "paths", "orphan feature, rule or power")
    return entries


def load(content=CONTENT):
    """Read strict local JSON and resolve associated themes from the shared catalog."""
    themes = shared.shared.load_json(CONTENT.parents[1] / "themes/zeitgeist.json")["themes"]
    data = shared.shared.load_json(content)
    validate(data, {theme["id"]: theme for theme in themes})
    return data


def class_ids():
    """Authoritative class identities that class-path access may name."""
    return {entry["id"] for entry in shared.catalog()["entries"] if entry["category"] == "CLASS"}


def load_class_paths(content=CLASS_CONTENT):
    """Read the class-path catalog; its access routes must be authoritative classes."""
    data = shared.shared.load_json(content)
    validate(data, {}, class_ids())
    return data


def main():
    """Validate by default and optionally write a deterministic authoring export."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--content", type=Path)
    parser.add_argument("--class-paths", action="store_true", help="Validate the class-path catalog instead of Zeitgeist")
    parser.add_argument("--output", type=Path)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    if args.class_paths:
        args.content = args.content or CLASS_CONTENT
        data = load_class_paths(args.content)
    else:
        args.content = args.content or CONTENT
        data = load(args.content)
    export = {"kind": "modern4e.path-authoring", **data}
    encoded = json.dumps(export, indent=2, sort_keys=True, ensure_ascii=False) + "\n"
    if args.output:
        shared.require(not args.output.resolve().is_relative_to(CONTENT.parents[2].resolve()) and args.output.resolve() != args.content.resolve(), "output", "cannot overwrite rulebook sources")
        if args.check:
            shared.require(args.output.is_file() and args.output.read_text() == encoded, "output", "export differs")
        else:
            args.output.write_text(encoded)
    else:
        shared.require(not args.check, "output", "--check requires --output")
    print(f"Validated {len(data['paths'])} paths, {len(data['features'])} features, {len(data['rules'])} supplementary rules and {len(data['powers'])} powers")


if __name__ == "__main__":
    main()
