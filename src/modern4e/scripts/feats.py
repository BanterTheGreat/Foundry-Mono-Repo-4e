"""Shared Modern 4e feat authoring contract; no inference from titles or prose."""
import json
import importlib.util
from pathlib import Path
import re
import unicodedata


CONTENT = Path(__file__).resolve().parents[1] / "content"
ABILITIES = "STRENGTH CONSTITUTION DEXTERITY INTELLIGENCE WISDOM CHARISMA".split()
SKILLS = "ATHLETICS ACROBATICS STEALTH THIEVERY ENDURANCE ARCANA CRAFTING SOCIETY MEDICINE INSIGHT NATURE PERCEPTION RELIGION BLUFF DIPLOMACY INTIMIDATE".split()
SOURCES = "ARCANE DIVINE MARTIAL PRIMAL PSIONIC SHADOW".split()
SIZES = "TINY SMALL MEDIUM LARGE HUGE GARGANTUAN".split()
EQUIPMENT = "CLOTH LEATHER HIDE CHAINMAIL SCALE PLATE SHIELD LIGHT_SHIELD HEAVY_SHIELD".split()
EQUIPMENT_NAMES = {key: key.lower() + " armor" for key in EQUIPMENT[:6]}
EQUIPMENT_NAMES.update(SHIELD="shields", LIGHT_SHIELD="light shields", HEAVY_SHIELD="heavy shields")
_selection_spec = importlib.util.spec_from_file_location("entry_selection", Path(__file__).with_name("entry_selection.py"))
selection_rules = importlib.util.module_from_spec(_selection_spec)
_selection_spec.loader.exec_module(selection_rules)
DAMAGE_TYPES = "ACID COLD FIRE FORCE LIGHTNING NECROTIC POISON PSYCHIC RADIANT THUNDER".split()


def require(condition, where, message):
    if not condition:
        raise ValueError(f"{where}: {message}")


def load_json(path):
    """Reject duplicate keys rather than silently losing authored rules."""
    def pairs(items):
        result = {}
        for key, value in items:
            require(key not in result, path, f"duplicate JSON key {key}")
            result[key] = value
        return result
    return json.loads(Path(path).read_text(encoding="utf-8"), object_pairs_hook=pairs)


def fields(value, required, optional, where):
    require(isinstance(value, dict), where, "expected object")
    require(set(required) <= value.keys(), where, f"missing fields {sorted(set(required) - value.keys())}")
    require(value.keys() <= set(required + optional), where, f"unknown fields {sorted(value.keys() - set(required + optional))}")


def string(value, where):
    require(isinstance(value, str) and bool(value.strip()), where, "expected nonblank string")


def slug(title):
    """Suggest an initial ID only. Builds validate stored IDs, never regenerate them."""
    text = unicodedata.normalize("NFKD", title).encode("ascii", "ignore").decode().lower()
    text = re.sub(r"['’]", "", text)
    return re.sub(r"[^a-z0-9]+", "-", text).strip("-")


def identity(value, category, where):
    require(isinstance(value, str) and re.fullmatch(r"modern4e\." + category.lower() + r"\.[a-z0-9]+(?:[.-][a-z0-9]+)*", value), where, f"expected stable modern4e.{category.lower()} ID")


def validate_condition(node, references, feat_ids, where, depth=0):
    """Validate the closed condition tree, including explicit unresolved conditions."""
    require(depth <= 16, where, "condition nesting exceeds 16")
    require(isinstance(node, dict), where, "expected condition object")
    kind = node.get("type")
    variants = {
        "always": [], "allOf": ["conditions"], "anyOf": ["conditions"],
        "level": ["minimum"], "abilityPoints": ["ability", "minimum"],
        "proficiency": ["skill"], "equipmentProficiency": ["equipment"],
        "entry": ["entryId"], "classPowerSource": ["powerSource"],
        "size": ["size"], "selected": ["category", "filters"],
        "unresolved": ["text", "reason"],
    }
    require(isinstance(kind, str) and kind in variants, where, f"unknown condition type {kind}")
    fields(node, ["type"] + variants[kind], [], where)
    if kind in ("allOf", "anyOf"):
        require(isinstance(node["conditions"], list) and len(node["conditions"]) >= 2, where, "groups need at least two conditions")
        require(len({json.dumps(n, sort_keys=True) for n in node["conditions"]}) == len(node["conditions"]), where, "duplicate conditions")
        for i, child in enumerate(node["conditions"]):
            validate_condition(child, references, feat_ids, f"{where}.conditions[{i}]", depth + 1)
    elif kind in ("level", "abilityPoints"):
        minimum, maximum = (1, 30) if kind == "level" else (-1, 2**31 - 1)
        require(type(node["minimum"]) is int and minimum <= node["minimum"] <= maximum, where, "invalid minimum")
        if kind == "abilityPoints":
            require(node["ability"] in ABILITIES, where, "unknown ability")
    elif kind == "proficiency":
        require(node["skill"] in SKILLS, where, "unknown Modern 4e skill")
    elif kind == "equipmentProficiency":
        require(node["equipment"] in EQUIPMENT, where, "unknown equipment proficiency")
    elif kind == "entry":
        require(isinstance(node["entryId"], str) and node["entryId"] in (set(references) | feat_ids), where, f"undeclared reference {node['entryId']}")
    elif kind == "classPowerSource":
        require(node["powerSource"] in SOURCES, where, "unknown power source")
    elif kind == "size":
        require(node["size"] in SIZES, where, "unknown size")
    elif kind == "selected":
        require(node["category"] in ("FEAT", "POWER"), where, "unsupported selected category")
        filters = node["filters"]
        allowed = ["multiclass", "classSpecific"] if node["category"] == "FEAT" else ["usage", "hasLevel"]
        fields(filters, allowed, [], where)
        if node["category"] == "FEAT":
            require(filters == {"multiclass": True, "classSpecific": True}, where, "unsupported feat query")
        else:
            require(filters == {"usage": "ENCOUNTER", "hasLevel": True}, where, "unsupported power query")
    elif kind == "unresolved":
        string(node["text"], where)
        string(node["reason"], where)


def condition_text(node, references, feat_titles, nested=False):
    """Canonical printed requirements; labels never decide eligibility."""
    kind = node["type"]
    if kind == "always":
        return ""
    if kind in ("allOf", "anyOf"):
        separator = ", " if kind == "allOf" else " or "
        value = separator.join(condition_text(n, references, feat_titles, True) for n in node["conditions"])
        return f"({value})" if nested else value
    if kind == "level":
        level = node["minimum"]
        suffix = "th" if 10 <= level % 100 <= 20 else {1: "st", 2: "nd", 3: "rd"}.get(level % 10, "th")
        return f"{level}{suffix} level"
    if kind == "abilityPoints":
        return f"{node['minimum']} {node['ability'].title()}"
    if kind == "proficiency":
        return node["skill"].title()
    if kind == "equipmentProficiency":
        return "Proficiency with " + EQUIPMENT_NAMES[node["equipment"]]
    if kind == "entry":
        return references[node["entryId"]]["title"] if node["entryId"] in references else feat_titles[node["entryId"]]
    if kind == "classPowerSource":
        return f"Any {node['powerSource'].title()} class"
    if kind == "size":
        return f"Size {node['size'].title()}"
    if kind == "selected":
        return "Any class-specific multiclass feat" if node["category"] == "FEAT" else "Any encounter power with a level"
    return node["text"]


def unresolved_conditions(node, references):
    """Return explicit gaps, including references not migrated to shared definitions."""
    if node["type"] in ("allOf", "anyOf"):
        return [gap for child in node["conditions"] for gap in unresolved_conditions(child, references)]
    if node["type"] == "unresolved":
        return [node["reason"]]
    if node["type"] == "entry" and node["entryId"] in references:
        ref = references[node["entryId"]]
        return [f"{node['entryId']}: {ref['status']}"]
    return []


def catalog(content=CONTENT):
    """Resolve book sections into a deterministic shared catalog, independent of paths."""
    content = Path(content)
    vocabulary = load_json(content / "feat-references.json")
    fields(vocabulary, ["schemaVersion", "entries"], [], "feat-references.json")
    require(type(vocabulary["schemaVersion"]) is int and vocabulary["schemaVersion"] == 1, "feat-references.json", "unsupported schema version")
    references = vocabulary["entries"]
    require(isinstance(references, dict), "feat-references.json", "expected entries object")
    for key, ref in references.items():
        fields(ref, ["title", "category", "status"], ["source"], key)
        require(ref["category"] in ("CLASS", "ANCESTRY", "FEATURE", "POWER"), key, "unknown reference category")
        identity(key, ref["category"], key)
        string(ref["title"], key)
        require(ref["status"] in ("PENDING_MIGRATION", "UNAVAILABLE"), key, "external reference must declare unresolved status")
        if "source" in ref:
            string(ref["source"], key)
    sections = {}
    entries = {}
    locations = {}
    inventory = load_json(content / "feat-sections.json")
    fields(inventory, ["schemaVersion", "sections"], [], "feat-sections.json")
    require(type(inventory["schemaVersion"]) is int and inventory["schemaVersion"] == 1, "feat-sections.json", "unsupported schema version")
    declared = inventory["sections"]
    require(isinstance(declared, list) and all(isinstance(s, str) for s in declared), "feat-sections.json", "expected section paths")
    actual = {p.relative_to(content / "feats").as_posix() for p in (content / "feats").rglob("*.json")}
    require(len(set(declared)) == len(declared) and set(declared) == actual, "feat-sections.json", "sections must list every feat JSON exactly once")
    for section in declared:
        path = content / "feats" / section
        data = load_json(path)
        fields(data, ["schemaVersion", "feats"], [], path)
        require(type(data["schemaVersion"]) is int and data["schemaVersion"] == 2, path, "unsupported schema version")
        require(isinstance(data["feats"], list), path, "expected feats array")
        sections[section] = []
        for i, feat in enumerate(data["feats"]):
            where = f"{path}:feats[{i}]"
            if "ref" in feat:
                fields(feat, ["ref"], [], where)
                identity(feat["ref"], "FEAT", where)
                sections[section].append(feat["ref"])
                continue
            fields(feat, ["id", "title", "access", "prerequisites", "selection", "description"], ["source", "note", "multiclassFor", "tags", "choices"], where)
            identity(feat["id"], "FEAT", where)
            for key in ("title", "description", "source", "note"):
                if key in feat:
                    string(feat[key], f"{where}.{key}")
            require(feat["id"] not in entries, where, f"duplicate feat ID {feat['id']}")
            entries[feat["id"]] = feat
            locations[feat["id"]] = where
            sections[section].append(feat["id"])
    require(bool(entries), content, "no feat definitions")
    for section, ids in sections.items():
        require(len(ids) == len(set(ids)), section, "duplicate section feat reference")
        for entry_id in ids:
            require(entry_id in entries, section, f"unknown section feat reference {entry_id}")
    titles = {key: feat["title"] for key, feat in entries.items()}
    for key, feat in entries.items():
        where = locations[key]
        for field in ("access", "prerequisites"):
            validate_condition(feat[field], references, set(entries), f"{where}.{field}")
        validate_access(feat["access"], references, f"{where}.access")
        selection_rules.validate(feat["selection"], feat.get("choices", []), references,
                                 {"SKILL": SKILLS, "DAMAGE_TYPE": DAMAGE_TYPES}, where)
        if "multiclassFor" in feat:
            require(isinstance(feat["multiclassFor"], str) and feat["multiclassFor"] in references and references[feat["multiclassFor"]]["category"] == "CLASS", where, "multiclassFor must reference a declared class")
            require("MULTICLASS" in feat.get("tags", []), where, "multiclassFor requires the MULTICLASS tag")
        if "tags" in feat:
            require(feat["tags"] == ["MULTICLASS"], where, "unknown or duplicate feat tags")
    return {"schemaVersion": 2, "entries": [entries[key] for key in sorted(entries)],
            "references": references, "sections": sections,
            "requirementText": {key: condition_text(entries[key]["prerequisites"], references, titles) for key in sorted(entries)},
            "selectionText": {key: selection_rules.special_text(entries[key], references, noun="feat") for key in sorted(entries)},
            "limitations": {key: unresolved_conditions(entries[key]["access"], references) + unresolved_conditions(entries[key]["prerequisites"], references) + selection_rules.limitations(entries[key], references) for key in sorted(entries)}}


def validate_access(node, references, where):
    """Access records general, class and ancestry curation, not benefit conditions."""
    if node["type"] in ("allOf", "anyOf"):
        for child in node["conditions"]:
            validate_access(child, references, where)
    elif node["type"] == "entry":
        require(node["entryId"] in references and references[node["entryId"]]["category"] in ("CLASS", "ANCESTRY"), where, "access must reference a class or ancestry")
    else:
        require(node["type"] == "always", where, "access supports only general/class/ancestry conditions")
