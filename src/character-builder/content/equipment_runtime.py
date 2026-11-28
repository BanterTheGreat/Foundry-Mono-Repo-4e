"""Compile validated shared equipment authoring into the mechanics-v2 runtime contract.

The package lets the builder store, display and equip the authored weapons, armor,
shields and basic implement types. The defense engine reads armor and shield data directly from the authored
profiles in ``sharedData``, alongside the matching property definitions and armor rules.
Descriptions are rendered only from those structured fields; no prose is parsed.
"""
import importlib.util
from pathlib import Path

import runtime_common

SPEC = importlib.util.spec_from_file_location(
    "equipment_authoring", Path(__file__).resolve().parents[2] / "modern4e/scripts/equipment_content.py")
authoring = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(authoring)

PACKAGE = "modern4e.equipment"
TITLE = "Modern 4e shared equipment"
KIND_LABELS = {"WEAPON": "Weapon", "ARMOR": "Armor", "SHIELD": "Shield", "IMPLEMENT": "Implement"}
BASIC_IMPLEMENT_TYPES = ("HOLY_SYMBOL", "ORB", "ROD", "STAFF", "TOME", "TOTEM", "WAND")
ACTIONS = {"FREE": "free action", "MINOR": "minor action", "STANDARD": "standard action"}
LIMITATIONS = {
    "WEAPON": ["Weapon proficiency, hands, groups, damage dice and property rules are preserved for display only; "
               "they do not change attack, damage or defense totals and no proficiency is granted by equipping."],
    "ARMOR": ["Armor and proficiency contribute to defense totals. Speed and skill penalties remain descriptive."],
    "SHIELD": ["Proficient shields contribute to AC and Reflex. Hand occupancy, speed and skill penalties remain descriptive."],
    "IMPLEMENT": ["Records the equipped implement type. Attack and damage calculations remain descriptive."],
    "NECK": ["Records the equipped neck enhancement for Fortitude, Reflex and Will. Other item properties remain manual."],
}


def label(key):
    """Readable form of a closed identifier such as LIGHT_BLADE."""
    return key.replace("_", " ").title()


def signed(value):
    """Explicit sign for bonuses and penalties; zero stays plain."""
    return f"+{value}" if value > 0 else str(value)


def distance(prop):
    """Optional normal/long range of a Thrown or Ranged usage."""
    if "range" not in prop:
        return ""
    return f" (range {prop['range']['normal']}/{prop['range']['long']} squares)"


def property_label(prop):
    """Property title plus only the parameters this usage authored."""
    text = label(prop["id"])
    if "action" in prop:
        text += f" ({ACTIONS[prop['action']]})"
    if "value" in prop:
        text += f" {prop['value']}"
    return text + distance(prop)


def describe(entry, definitions, rules):
    """Render a deterministic description from structured fields only."""
    profile = entry["equipment"]
    kind = profile["kind"]
    lines = []
    if kind == "WEAPON":
        hands = profile["handsRequired"]
        bonus = profile["proficiencyBonus"]
        damage = profile["damage"]
        lines += [
            (f"Improvised weapon, {profile['attackCategory'].lower()} attack. Anyone can use it."
             if profile["proficiencyCategory"] == "IMPROVISED"
             else f"Weapon. {label(profile['proficiencyCategory'])} proficiency, {profile['attackCategory'].lower()} attack."),
            "Hands required: " + ("not specified." if hands is None else f"{hands}."),
            "Groups: " + ", ".join(label(group) for group in profile["groups"]) + ".",
            "Proficiency bonus: " + ("not specified." if bonus is None else f"{signed(bonus)}."),
            f"Damage: {damage['diceCount']}d{damage['dieSize']}.",
        ]
        if profile["properties"]:
            lines.append("Properties:")
            for prop in profile["properties"]:
                text = definitions[prop["id"]]["description"]
                lines.append(f"- {property_label(prop)}" + (":" if text else ""))
                if text:
                    lines += ["    " + row if row else "" for row in text.split("\n")]
        else:
            lines.append("Properties: none.")
    elif kind == "IMPLEMENT":
        lines.append(f"{KIND_LABELS[kind]}. Proficiency: {label(profile['proficiencyKey'])}.")
    elif kind == "NECK":
        lines.append("The equipped enhancement adds to Fortitude, Reflex and Will.")
    else:
        lines.append(f"{KIND_LABELS[kind]}. Proficiency: {label(profile['proficiencyKey'])}.")
        if kind == "ARMOR":
            lines.append(f"Category: {label(profile['armorCategory'])}.")
            lines.append(f"Armor bonus: {signed(profile['armorBonus'])}.")
            if profile["armorCategory"] == "LIGHT":
                abilities = ", ".join(label(ability) for ability in rules["lightArmorAbilities"])
                cap = signed(profile["acAbilityCap"])
                lines.append(f"Light armor ability: {label(rules['lightArmorAbilityOperation'])} of {abilities}, up to {cap}.")
        else:
            lines.append(f"Hands occupied: {profile['handsOccupied']}.")
            lines.append(f"Shield bonus: {signed(profile['shieldBonus'])}.")
        lines.append(f"Speed modifier: {signed(profile['speedModifier'])}.")
        lines.append(f"Armor check modifier: {signed(profile['armorCheckModifier'])}.")
        lines.append(rules["armorCheckDescription"])
    return "\n".join(lines)


def compile_entry(entry, definitions, rules):
    """Map one authored equipment entry; preserve the whole source for later consumers."""
    profile = entry["equipment"]
    kind = profile["kind"]
    used = []
    for prop in profile.get("properties", []):
        if prop["id"] not in definitions:
            raise ValueError(f"{entry['id']}: missing property definition {prop['id']}")
        used.append(definitions[prop["id"]])
    shared = {**entry, "propertyDefinitions": used}
    if kind in ("ARMOR", "SHIELD"):
        shared["armorRules"] = rules
    limitations = LIMITATIONS[kind]
    if kind == "WEAPON":
        limitations = list(dict.fromkeys(entry["coverage"]["limitations"] + limitations))
    return {"id": entry["id"], "category": entry["category"],
            "presentation": {"title": entry["presentation"]["title"],
                             "description": describe(entry, definitions, rules)},
            "mechanics": {"version": 2, "access": {"type": "always"}, "prerequisites": [{"type": "always"}],
                          "grants": [], "choices": [], "unsupported": [], "maximumSelections": None},
            "coverage": runtime_common.coverage(limitations),
            "sharedData": shared}


def build(content=None):
    """Validate the authoring file, then emit a deterministic, independently loadable package."""
    catalog = authoring.catalog(content or authoring.CONTENT)
    definitions = {prop["id"]: prop for prop in catalog["properties"]}
    entries = [compile_entry(entry, definitions, catalog["armorRules"]) for entry in catalog["entries"]]
    # These basic choices represent class implement proficiency types without adding magic item rules.
    for key in BASIC_IMPLEMENT_TYPES:
        implement = {"id": "modern4e.implement." + key.lower().replace("_", "-"), "category": "ITEM",
                     "presentation": {"title": label(key)}, "equipment": {"kind": "IMPLEMENT", "proficiencyKey": key}}
        entries.append(compile_entry(implement, definitions, catalog["armorRules"]))
    neck = {"id": "modern4e.neck.item", "category": "ITEM",
            "presentation": {"title": "Neck Item"}, "equipment": {"kind": "NECK"}}
    entries.append(compile_entry(neck, definitions, catalog["armorRules"]))
    return runtime_common.package(PACKAGE, TITLE, entries, revision="2")
