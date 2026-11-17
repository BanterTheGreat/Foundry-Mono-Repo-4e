"""Validate and export shared utility authoring; never infer runtime effects."""
import argparse
import json
from pathlib import Path

import class_content as shared
import power_content

CONTENT = Path(__file__).resolve().parents[1] / "content"


def load(content=CONTENT):
    """Load the explicit inventory, validate ordered powers and selection sections."""
    catalog = shared.shared.load_json(content / "utilities/catalog.json")
    shared.fields(catalog, ["schemaVersion", "files", "sections"], [], "utilities")
    shared.require(type(catalog["schemaVersion"]) is int and catalog["schemaVersion"] == 1, "utilities", "unsupported schemaVersion")
    power_content.strings(catalog["files"], "utilities.files", True)
    classes = {}
    class_inventory = shared.shared.load_json(content / "classes/catalog.json")
    for filename in class_inventory["files"]["classes"]:
        for entry in shared.shared.load_json(content / "classes" / filename)["classes"]:
            classes[entry["id"]] = entry
    entries = {}
    for filename in catalog["files"]:
        path = Path(filename)
        shared.require(not path.is_absolute() and ".." not in path.parts and path.suffix == ".json", filename, "expected relative JSON filename")
        shared.require(path.parent.as_posix() in ("class-utilities", "utilities") or filename in ("skill-utilities.json", "power-source-utilities.json"), filename, "outside utility inventory")
        data = shared.shared.load_json(content / filename)
        shared.fields(data, ["schemaVersion", "powers"], [], filename)
        shared.require(type(data["schemaVersion"]) is int and data["schemaVersion"] == 2, filename, "expected ordered power schema v2")
        shared.array(data["powers"], filename)
        for power in data["powers"]:
            eid = power.get("id")
            shared.string(eid, filename)
            shared.require(eid.startswith("modern4e.power.utility-"), filename, "invalid utility identity")
            shared.require(eid not in entries, filename, "duplicate utility identity")
            entries[eid] = power
    actual = {p.relative_to(content).as_posix() for folder in ("class-utilities", "utilities") for p in (content / folder).glob("*.json") if p.name != "catalog.json"}
    actual.update(("skill-utilities.json", "power-source-utilities.json"))
    shared.require(set(catalog["files"]) == actual, "utilities.files", "inventory must list every utility JSON exactly once")
    for eid, power in entries.items():
        power_content.validate_power(power, classes | entries)
        shared.require(power["rulesProfile"] == "MODERN4E" and power.get("powerKind") == "UTILITY" and "level" in power, eid, "expected leveled local utility")
    shared.array(catalog["sections"], "sections", True)
    seen, used = set(), set()
    for section in catalog["sections"]:
        shared.fields(section, ["id", "kind", "availability", "powerIds", "pickKinds"], ["classId", "powerSource"], "section")
        sid = section["id"]
        shared.string(sid, "section")
        shared.require(sid not in seen, sid, "duplicate section")
        seen.add(sid)
        shared.enum(section["kind"], ["CLASS", "SKILL", "SOURCE"], sid)
        shared.enum(section["availability"], ["AVAILABLE", "DEFERRED"], sid)
        power_content.strings(section["powerIds"], sid)
        shared.require(isinstance(section["pickKinds"], dict) and set(section["pickKinds"]) == set(section["powerIds"]), sid, "pick kinds must cover exactly the section powers")
        if section["kind"] == "CLASS":
            shared.require("classId" in section and "powerSource" not in section, sid, "class section requires classId")
            shared.require(section["classId"] in classes if section["availability"] == "AVAILABLE" else section["classId"] is None, sid, "invalid class section")
        elif section["kind"] == "SOURCE":
            shared.require("powerSource" in section and "classId" not in section, sid, "source section requires powerSource")
            shared.enum(section["powerSource"], shared.shared.SOURCES, sid)
        else:
            shared.require(not {"classId", "powerSource"} & section.keys(), sid, "unexpected access metadata")
        for eid in section["powerIds"]:
            shared.require(eid in entries, sid, "missing utility reference")
            shared.require(eid not in used, sid, "utility occurs in multiple sections")
            used.add(eid)
            shared.values(section["pickKinds"][eid], ["COMBAT", "NON_COMBAT"], eid, True)
            power = entries[eid]
            prerequisites = power["prerequisites"]
            required = prerequisites["conditions"] if prerequisites["type"] == "allOf" else [prerequisites]
            shared.require({"type": "level", "minimum": power["level"]} in required, eid, "missing minimum-level prerequisite")
            if section["kind"] == "SKILL":
                shared.require(any(node["type"] == "proficiency" for node in required), eid, "missing skill proficiency prerequisite")
            if section["kind"] == "CLASS" and section["classId"]:
                shared.require(power["access"] == {"type": "entry", "entryId": section["classId"]}, eid, "class access mismatch")
            if section["kind"] == "SOURCE":
                shared.require(power["access"] == {"type": "classPowerSource", "powerSource": section["powerSource"]}, eid, "source access mismatch")
            if section["kind"] == "SKILL":
                shared.require(power["access"] == {"type": "always"}, eid, "skill utility must have general access")
    shared.require(used == set(entries), "sections", "orphan utility power")
    return catalog, entries


def export(content=CONTENT):
    """Produce deterministic authoring data, including withheld entries and pick types."""
    catalog, entries = load(content)
    return {"schemaVersion": 1, "kind": "modern4e.utility-authoring", "sections": catalog["sections"], "powers": [entries[eid] for eid in sorted(entries)]}


def main():
    """Validate by default; optionally export without overwriting source data."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--content", type=Path, default=CONTENT)
    parser.add_argument("--output", type=Path)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    data = export(args.content)
    encoded = json.dumps(data, indent=2, sort_keys=True, ensure_ascii=False) + "\n"
    if args.output:
        shared.require(not args.output.resolve().is_relative_to(CONTENT.parent.resolve()) and not args.output.resolve().is_relative_to(args.content.resolve()), "output", "cannot overwrite authoring sources")
        if args.check:
            shared.require(args.output.is_file() and args.output.read_text() == encoded, "output", "export differs")
        else:
            args.output.write_text(encoded)
    else:
        shared.require(not args.check, "output", "--check requires --output")
    print(f"Validated {len(data['powers'])} utility powers; runtime coverage UNIMPLEMENTED")


if __name__ == "__main__":
    main()
