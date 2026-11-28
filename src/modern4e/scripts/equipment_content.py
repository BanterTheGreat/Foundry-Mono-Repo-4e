"""Validate shared equipment authoring data for Typst and builder compilation.

This exports an authoring catalog, not an enabled Kotlin v1 runtime package.
Weapon properties are closed data, never expressions or executable source.
"""
import argparse
import importlib.util
import json
from pathlib import Path
import re

_spec = importlib.util.spec_from_file_location("equipment_shared", Path(__file__).with_name("class_content.py"))
shared = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(shared)
fields, require, string = shared.fields, shared.require, shared.string
integer, enum, array, values = shared.integer, shared.enum, shared.array, shared.values
CONTENT = Path(__file__).resolve().parents[1] / "content/equipment/equipment.json"
PROPERTY_IDS = "BALANCED BRUTAL DEFENSIVE IMPLEMENT SEVERE HIGH_CRIT INNOCUOUS THROWN VERSATILE OFF_HAND REACH RANGED LOAD".split()
GROUPS = "UNARMED CLUB LIGHT_BLADE AXE SPEAR HAMMER STAFF FIREARM SLING CROSSBOW FLAIL HEAVY_BLADE SHIELD POLEARM BOW".split()


def property_usage(prop, where):
    """Validate property parameters without guessing missing source values."""
    require(isinstance(prop, dict), where, "expected property object")
    key = prop.get("id")
    enum(key, PROPERTY_IDS, where)
    required, optional = ["id"], []
    if key == "LOAD":
        required += ["action"]
    elif key == "RANGED":
        required += ["range"]
    elif key == "THROWN":
        optional += ["range"]
    elif key == "BRUTAL":
        optional += ["value"]
    fields(prop, required, optional, where)
    if "action" in prop:
        enum(prop["action"], ["FREE", "MINOR", "STANDARD"], where)
    if "range" in prop:
        distance = prop["range"]
        fields(distance, ["normal", "long"], [], where)
        integer(distance["normal"], where, 1)
        integer(distance["long"], where, distance["normal"])
    if "value" in prop:
        integer(prop["value"], where, 1)


def validate_entry(entry, where):
    """Validate a discriminated weapon, armor or shield profile."""
    fields(entry, ["id", "category", "presentation", "equipment", "coverage"], [], where)
    enum(entry["category"], ["ITEM"], where)
    string(entry["id"], where)
    fields(entry["presentation"], ["title", "description"], [], where)
    string(entry["presentation"]["title"], where)
    require(isinstance(entry["presentation"]["description"], str), where, "description must be text")
    shared.coverage(entry["coverage"], where)
    # An authoring migration must not advertise runtime combat support.
    require(entry["coverage"]["status"] == "UNIMPLEMENTED", where, "equipment runtime is unimplemented")
    profile = entry["equipment"]
    require(isinstance(profile, dict), where, "expected equipment profile")
    kind = profile.get("kind")
    enum(kind, ["WEAPON", "ARMOR", "SHIELD"], where)
    require(re.fullmatch(r"modern4e\." + kind.lower() + r"\.[a-z0-9]+(?:-[a-z0-9]+)*", entry["id"]), where, "invalid persistent equipment ID")
    if kind == "WEAPON":
        fields(profile, ["kind", "proficiencyCategory", "attackCategory", "handsRequired", "groups", "proficiencyBonus", "damage", "properties"], [], where)
        enum(profile["proficiencyCategory"], ["IMPROVISED", "SIMPLE", "MILITARY", "SUPERIOR"], where)
        enum(profile["attackCategory"], ["MELEE", "RANGED"], where)
        if profile["handsRequired"] is not None:
            integer(profile["handsRequired"], where, 1, 2)
        if profile["proficiencyBonus"] is not None:
            integer(profile["proficiencyBonus"], where, 0)
        values(profile["groups"], GROUPS, where, True)
        fields(profile["damage"], ["diceCount", "dieSize"], [], where)
        integer(profile["damage"]["diceCount"], where, 1)
        integer(profile["damage"]["dieSize"], where, 2)
        array(profile["properties"], where)
        keys = []
        for prop in profile["properties"]:
            property_usage(prop, where)
            keys.append(prop["id"])
        require(len(keys) == len(set(keys)), where, "duplicate weapon property")
    else:
        common = ["kind", "proficiencyKey", "speedModifier", "armorCheckModifier"]
        specific = ["armorCategory", "armorBonus"] if kind == "ARMOR" else ["handsOccupied", "shieldBonus"]
        if kind == "ARMOR" and profile.get("armorCategory") == "LIGHT":
            specific.append("acAbilityCap")
            integer(profile.get("acAbilityCap"), where)
        fields(profile, common + specific, [], where)
        integer(profile["speedModifier"], where, -30, 0)
        integer(profile["armorCheckModifier"], where, -30, 0)
        enum(profile["proficiencyKey"], shared.ARMOR[2:] if kind == "ARMOR" else shared.SHIELDS, where)
        if kind == "ARMOR":
            enum(profile["armorCategory"], ["LIGHT", "HEAVY"], where)
            integer(profile["armorBonus"], where)
        else:
            integer(profile["handsOccupied"], where, 1, 1)
            integer(profile["shieldBonus"], where)


def catalog(content=CONTENT):
    """Return validated data with stable IDs and explicit printed ordering."""
    data = shared.shared.load_json(content)
    fields(data, ["schemaVersion", "sections", "properties", "armorRules", "equipment"], [], content)
    require(type(data["schemaVersion"]) is int and data["schemaVersion"] == 1, content, "unsupported equipment schema version")
    array(data["equipment"], content, True)
    entries = {}
    for entry in data["equipment"]:
        where = f"{content}: {entry.get('id', '<entry>')}" if isinstance(entry, dict) else str(content)
        validate_entry(entry, where)
        require(entry["id"] not in entries, where, "duplicate equipment ID")
        entries[entry["id"]] = entry
    array(data["properties"], content, True)
    properties = []
    for prop in data["properties"]:
        fields(prop, ["id", "title", "description", "printRule"], [], content)
        enum(prop["id"], PROPERTY_IDS, content)
        string(prop["title"], content)
        require(type(prop["printRule"]) is bool, content, "printRule must be boolean")
        require(isinstance(prop["description"], str), content, "property description must be text")
        if prop["printRule"]:
            string(prop["description"], content)
        properties.append(prop["id"])
    require(len(properties) == len(set(properties)), content, "duplicate property definition")
    for entry in entries.values():
        for prop in entry["equipment"].get("properties", []):
            require(prop["id"] in properties, entry["id"], "missing property definition")
    array(data["sections"], content, True)
    placed, section_ids = [], []
    for section in data["sections"]:
        fields(section, ["id", "title", "kind", "entryIds"], [], content)
        string(section["id"], content)
        string(section["title"], content)
        enum(section["kind"], ["WEAPON", "ARMOR", "SHIELD"], content)
        array(section["entryIds"], content, True)
        section_ids.append(section["id"])
        for key in section["entryIds"]:
            string(key, content)
            require(key in entries, content, f"unresolved section entry {key}")
            require(entries[key]["equipment"]["kind"] == section["kind"], key, "section kind mismatch")
            placed.append(key)
    require(len(section_ids) == len(set(section_ids)), content, "duplicate section ID")
    require(len(placed) == len(set(placed)) and set(placed) == set(entries), content, "each equipment entry must appear in exactly one section")
    rules = data["armorRules"]
    fields(rules, ["lightArmorAbilities", "lightArmorAbilityOperation", "armorCheckAbilities", "armorCheckDescription"], [], content)
    values(rules["lightArmorAbilities"], shared.ABILITIES, content, True)
    enum(rules["lightArmorAbilityOperation"], ["HIGHEST"], content)
    values(rules["armorCheckAbilities"], shared.ABILITIES, content, True)
    string(rules["armorCheckDescription"], content)
    return {"kind": "modern4e.equipment-authoring", "schemaVersion": 1,
            "entries": [entries[key] for key in sorted(entries)],
            "sections": data["sections"], "properties": data["properties"], "armorRules": rules}


def main():
    """Validate or export without modifying authoring sources."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--content", type=Path, default=CONTENT)
    parser.add_argument("--output", type=Path)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    try:
        result = catalog(args.content)
        encoded = (json.dumps(result, ensure_ascii=False, sort_keys=True, indent=2) + "\n").encode("utf-8")
        if args.output:
            target = args.output.resolve()
            book = Path(__file__).resolve().parents[1]
            require(not target.is_relative_to(book) and target != args.content.resolve(), target, "output must not overwrite rulebook authoring sources")
            if args.check:
                require(target.is_file() and target.read_bytes() == encoded, target, "stale or missing equipment authoring export")
            else:
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes(encoded)
        else:
            require(not args.check, "--check", "requires --output")
        print(f"Validated {len(result['entries'])} shared equipment entries")
    except (ValueError, OSError) as error:
        parser.exit(1, f"{error}\n")


if __name__ == "__main__":
    main()
