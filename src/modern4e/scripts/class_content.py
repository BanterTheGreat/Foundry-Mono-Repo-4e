"""Validated class authoring catalog. No compendium reads or runtime evaluation.

The shared condition/entry-selection validators remain owned by their existing
modules. Class-specific choice and power data extend that vocabulary, rather
than inferring rules from titles, descriptions or printed placement.
"""
import argparse
from functools import lru_cache
import importlib.util
import json
from pathlib import Path

_spec = importlib.util.spec_from_file_location("shared_conditions", Path(__file__).with_name("feats.py"))
shared = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(shared)
fields, require, string = shared.fields, shared.require, shared.string
CONTENT = Path(__file__).resolve().parents[1] / "content/classes"
ABILITIES = shared.ABILITIES
USAGES = ["AT_WILL", "ENCOUNTER", "DAILY"]
ARMOR = "LIGHT HEAVY CLOTH LEATHER HIDE CHAINMAIL SCALE PLATE".split()
SHIELDS = ["LIGHT_SHIELD", "HEAVY_SHIELD"]
WEAPONS = "SIMPLE_MELEE SIMPLE_RANGED MILITARY_MELEE MILITARY_RANGED SUPERIOR_MELEE SUPERIOR_RANGED DAGGER QUARTERSTAFF HAND_CROSSBOW SHORT_SWORD SLING STAFF MILITARY_LIGHT_BLADE MILITARY_HEAVY_BLADE".split()
IMPLEMENTS = "HOLY_SYMBOL ORB STAFF WAND TOME ROD DAGGER TOTEM LIGHT_BLADE HEAVY_BLADE".split()
GROUPS = "AXE FLAIL HAMMER HEAVY_BLADE LIGHT_BLADE MACE PICK POLEARM SPEAR STAFF".split()
KEYWORDS = shared.SOURCES + "WEAPON IMPLEMENT BEAST_FORM HEALING CONJURATION POLYMORPH SPIRIT ELEMENTAL VARIES ILLUSION SUMMONING RELIABLE INVIGORATING BARD".split()
CATEGORIES = {"classes": "CLASS", "features": "FEATURE", "powers": "POWER", "rules": "RULE"}
ACTIONS = "STANDARD MOVE MINOR FREE REACTION NO_ACTION IMMEDIATE_INTERRUPT IMMEDIATE_REACTION OPPORTUNITY".split()


def integer(value, where, minimum=0, maximum=2**31 - 1):
    require(type(value) is int and minimum <= value <= maximum, where, f"expected integer {minimum}..{maximum}")


def array(value, where, nonempty=False):
    require(isinstance(value, list) and (bool(value) or not nonempty), where, "expected nonempty array" if nonempty else "expected array")


def enum(value, allowed, where):
    require(isinstance(value, str) and value in allowed, where, f"unknown value {value!r}")


def values(value, allowed, where, nonempty=False):
    array(value, where, nonempty)
    for item in value:
        enum(item, allowed, where)
    require(len(value) == len(set(value)), where, "duplicate values")


def coverage(value, where):
    fields(value, ["status", "limitations"], [], where)
    enum(value["status"], ["SUPPORTED", "PARTIAL", "UNIMPLEMENTED"], where)
    array(value["limitations"], where, value["status"] != "SUPPORTED")
    for limitation in value["limitations"]:
        string(limitation, where)
    require(value["status"] != "SUPPORTED" or not value["limitations"], where, "supported coverage cannot hide limitations")


def condition(node, references, entries, where):
    shared.validate_condition(node, references, set(entries), where)


def reference(key, categories, entries, references, where, resolved=False):
    string(key, where)
    target = entries.get(key, references.get(key))
    require(target is not None, where, f"undeclared reference {key}")
    require(target["category"] in categories, where, "reference category mismatch")
    require(not resolved or key in entries, where, f"reference must resolve locally: {key}")


def constraints(rules, where):
    array(rules, where)
    seen = set()
    for i, rule in enumerate(rules):
        loc = f"{where}[{i}]"
        require(isinstance(rule, dict), loc, "expected constraint object")
        kind = rule.get("type")
        if kind == "distinct":
            fields(rule, ["type"], [], loc)
        elif kind == "keywordCount":
            fields(rule, ["type", "keyword", "minimum", "maximum"], [], loc)
            enum(rule["keyword"], KEYWORDS, loc)
            integer(rule["minimum"], loc)
            integer(rule["maximum"], loc, rule["minimum"])
        else:
            raise ValueError(f"{loc}: unknown selection-set constraint")
        encoded = kind + (":" + rule["keyword"] if kind == "keywordCount" else "")
        require(encoded not in seen, loc, "duplicate constraint")
        seen.add(encoded)


def validate_set_limits(rules, count, source, entries, references, where):
    """Check collection constraints are meaningful for the selected entry pool."""
    counts = [count] if type(count) is int else [step["count"] for step in count["byLevel"]]
    for rule in rules:
        if rule["type"] == "keywordCount":
            require(rule["minimum"] <= min(counts) and rule["maximum"] <= max(counts), where, "keyword limits exceed selection count")
            if source["type"] == "query":
                require(source["category"] == "POWER", where, "keyword constraints need a power pool")
            else:
                for key in source["entryIds"]:
                    reference(key, ["POWER"], entries, references, where)


def choice_count(value, where):
    """A fixed count or a step table; each threshold replaces the earlier count."""
    if type(value) is int:
        integer(value, where, 1)
        return
    fields(value, ["byLevel"], [], where)
    array(value["byLevel"], where, True)
    levels = []
    for step in value["byLevel"]:
        fields(step, ["atLevel", "count"], [], where)
        integer(step["atLevel"], where, 1, 30)
        integer(step["count"], where, 1)
        levels.append(step["atLevel"])
    require(levels[0] == 1 and levels == sorted(set(levels)), where, "count thresholds must start at 1 and be unique and ordered")


def choice(value, entries, references, where):
    fields(value, ["id", "title", "kind", "atLevel", "count", "source", "constraints"], ["collection", "requiresCollection"], where)
    shared.identity(value["id"], "CHOICE", where)
    string(value["title"], where)
    enum(value["kind"], ["ENTRY"], where)
    integer(value["atLevel"], where, 1, 30)
    choice_count(value["count"], where)
    source = value["source"]
    require(isinstance(source, dict), where, "expected choice source")
    if source.get("type") == "entries":
        fields(source, ["type", "entryIds"], [], where)
        array(source["entryIds"], where, True)
        for key in source["entryIds"]:
            reference(key, list(CATEGORIES.values()) + ["FEAT", "TECHNIQUE", "ANCESTRY"], entries, references, where)
        require(len(set(source["entryIds"])) == len(source["entryIds"]), where, "duplicate options")
        counts = [value["count"]] if type(value["count"]) is int else [step["count"] for step in value["count"]["byLevel"]]
        require(max(counts) <= len(source["entryIds"]), where, "insufficient distinct options")
    elif source.get("type") == "query":
        fields(source, ["type", "category", "filters"], [], where)
        enum(source["category"], ["POWER", "FEATURE", "FEAT", "TECHNIQUE"], where)
        filters = source["filters"]
        fields(filters, [], ["usage", "powerKind", "levelMaximum", "access", "keywords"], where)
        require(bool(filters), where, "query must declare filters")
        for key, v in filters.items():
            if key == "usage":
                enum(v, USAGES, where)
            elif key == "powerKind":
                enum(v, ["ATTACK", "UTILITY"], where)
            elif key == "levelMaximum":
                if isinstance(v, str):
                    enum(v, ["CHARACTER", "SLOT"], where)
                else:
                    integer(v, where, 1, 30)
            elif key == "access":
                enum(v, ["CHARACTER"], where)
            else:
                values(v, KEYWORDS, where, True)
    else:
        raise ValueError(f"{where}: unknown choice source")
    constraints(value["constraints"], where + ".constraints")
    validate_set_limits(value["constraints"], value["count"], source, entries, references, where)
    if type(value["count"]) is not int:
        require(value["count"]["byLevel"][0]["atLevel"] <= value["atLevel"], where, "count must be defined at acquisition")
    for key in ("collection", "requiresCollection"):
        if key in value:
            shared.identity(value[key], "COLLECTION", where)


def catalog(content=CONTENT):
    """Validate and normalize authoring data without changing persisted identities.

    Returns an authoring catalog, deliberately not a v1 runtime PackageManifest.
    Normalized entries add category only in the output, keeping authored envelopes
    consistent with feat files. Reference declarations never become eligibility.
    """
    content = Path(content)
    inventory = shared.load_json(content / "catalog.json")
    fields(inventory, ["schemaVersion", "files", "references"], [], "catalog.json")
    require(type(inventory["schemaVersion"]) is int and inventory["schemaVersion"] == 2, "catalog.json", "unsupported schema version")
    fields(inventory["files"], list(CATEGORIES), [], "catalog.json.files")
    references = inventory["references"]
    require(isinstance(references, dict), "catalog.json.references", "expected object")
    for key, ref in references.items():
        fields(ref, ["category", "title", "status"], ["source"], key)
        enum(ref["category"], list(CATEGORIES.values()) + ["FEAT", "ANCESTRY", "TECHNIQUE"], key)
        shared.identity(key, ref["category"], key)
        string(ref["title"], key)
        enum(ref["status"], ["PENDING_MIGRATION", "UNAVAILABLE"], key)
        if "source" in ref:
            string(ref["source"], key)
    entries, locations, sections = {}, {}, {}
    paths = []
    for envelope, category in CATEGORIES.items():
        declared = inventory["files"][envelope]
        array(declared, "catalog.json.files." + envelope)
        for filename in declared:
            string(filename, "catalog.json.files")
            require(Path(filename).name == filename and filename.endswith(".json"), filename, "expected local JSON filename")
            require(filename not in paths, filename, "duplicate inventory file")
            paths.append(filename)
            data = shared.load_json(content / filename)
            fields(data, ["schemaVersion", envelope], [], filename)
            expected_version = 2 if envelope == "powers" else 1
            require(type(data["schemaVersion"]) is int and data["schemaVersion"] == expected_version, filename, "unsupported schema version")
            array(data[envelope], filename, True)
            sections[filename] = []
            for i, entry in enumerate(data[envelope]):
                loc = f"{filename}:{envelope}[{i}]"
                require(isinstance(entry, dict) and "id" in entry, loc, "expected entry object with id")
                shared.identity(entry["id"], category, loc)
                require(entry["id"] not in entries and entry["id"] not in references, loc, "duplicate entry ID or conflicting reference declaration")
                entries[entry["id"]] = dict(entry, category=category)
                locations[entry["id"]] = loc
                sections[filename].append(entry["id"])
    actual = {p.name for p in content.glob("*.json")} - {"catalog.json", "advancement.json"}
    require(set(paths) == actual, "catalog.json.files", "inventory must list every entry JSON exactly once")
    require(any(e["category"] == "CLASS" for e in entries.values()), content, "no class definitions")
    advancement = shared.load_json(content / "advancement.json")
    fields(advancement, ["schemaVersion", "id", "coverage", "powerChoices"], [], "advancement.json")
    require(type(advancement["schemaVersion"]) is int and advancement["schemaVersion"] == 1, "advancement.json", "unsupported schema version")
    shared.identity(advancement["id"], "ADVANCEMENT", "advancement.json")
    coverage(advancement["coverage"], "advancement.json.coverage")
    array(advancement["powerChoices"], "advancement.json.powerChoices", True)
    choices = {}
    for i, ch in enumerate(advancement["powerChoices"]):
        loc = f"advancement.json.powerChoices[{i}]"
        choice(ch, entries, references, loc)
        require(ch["id"] not in choices, loc, "duplicate choice ID")
        choices[ch["id"]] = ch
    collections = {}
    for key, entry in entries.items():
        loc = locations[key]
        if entry["category"] == "POWER":
            validate_ordered_power(entry, entries, references)
            continue
        optional = ["source", "note", "grants", "choices", "selectionModifiers", "collections"]
        extra = {"CLASS": ["flavor", "role", "powerSources", "abilities", "proficiencies", "statistics", "ruleIds"], "FEATURE": [], "POWER": ["usage", "action", "keywords", "range", "rows"], "RULE": []}[entry["category"]]
        more = {"CLASS": [], "FEATURE": ["weaponAbilities", "sections"], "POWER": ["trigger", "target", "requirement", "attack", "flavor", "level", "powerKind"], "RULE": []}[entry["category"]]
        fields(entry, ["id", "category", "title", "description", "access", "prerequisites", "selection", "coverage"] + extra, optional + more, loc)
        for name in ("title", "description", "source", "note"):
            if name in entry:
                string(entry[name], f"{loc}.{name}")
        condition(entry["access"], references, entries, loc + ".access")
        condition(entry["prerequisites"], references, entries, loc + ".prerequisites")
        # Reuse the existing entry limit contract. Cross-occurrence configuration
        # constraints remain unsupported for these categories until implemented.
        shared.selection_rules.validate(entry["selection"], [], references, {}, loc)
        require(not entry["selection"]["constraints"], loc, "class-content entry selection constraints are not implemented")
        coverage(entry["coverage"], loc + ".coverage")
        grants = entry.get("grants", [])
        array(grants, loc + ".grants")
        grant_ids = set()
        for i, g in enumerate(grants):
            at = f"{loc}.grants[{i}]"
            fields(g, ["id", "entryId", "atLevel"], [], at)
            string(g["id"], at)
            require(g["id"] not in grant_ids, at, "duplicate grant ID")
            grant_ids.add(g["id"])
            reference(g["entryId"], ["FEATURE", "POWER", "FEAT", "RULE", "TECHNIQUE"], entries, references, at)
            integer(g["atLevel"], at, 1, 30)
        array(entry.get("choices", []), loc + ".choices")
        for i, ch in enumerate(entry.get("choices", [])):
            at = f"{loc}.choices[{i}]"
            choice(ch, entries, references, at)
            require(ch["id"] not in choices, at, "duplicate choice ID")
            choices[ch["id"]] = ch
        array(entry.get("collections", []), loc + ".collections")
        for c in entry.get("collections", []):
            fields(c, ["id", "title", "capacity"], [], loc + ".collections")
            shared.identity(c["id"], "COLLECTION", loc)
            string(c["title"], loc)
            integer(c["capacity"], loc, 1)
            require(c["id"] not in collections, loc, "duplicate collection ID")
            collections[c["id"]] = c
        if entry["category"] == "CLASS":
            validate_class(entry, entries, references, loc)
        if "weaponAbilities" in entry:
            array(entry["weaponAbilities"], loc, True)
            groups = []
            for row in entry["weaponAbilities"]:
                fields(row, ["weaponGroup", "ability"], [], loc)
                enum(row["weaponGroup"], GROUPS, loc)
                enum(row["ability"], ABILITIES, loc)
                groups.append(row["weaponGroup"])
            require(len(set(groups)) == len(groups), loc, "duplicate weapon group")
        if "sections" in entry:
            array(entry["sections"], loc, True)
            linked_grants, linked_choices = [], []
            for section in entry["sections"]:
                require(isinstance(section, dict), loc, "expected feature section")
                kind = section.get("type")
                key = {"text": "text", "heading": "title", "grant": "grantId", "choice": "choiceId"}.get(kind)
                require(key is not None, loc, "unknown feature section")
                fields(section, ["type", key], [], loc)
                string(section[key], loc)
                if kind == "grant":
                    linked_grants.append(section[key])
                if kind == "choice":
                    linked_choices.append(section[key])
            require(sorted(linked_grants) == sorted(g["id"] for g in grants), loc, "sections must reference each grant exactly once")
            require(sorted(linked_choices) == sorted(ch["id"] for ch in entry.get("choices", [])), loc, "sections must reference each choice exactly once")
    for ch in choices.values():
        for field in ("collection", "requiresCollection"):
            if field in ch:
                require(ch[field] in collections, ch["id"], "undeclared collection")
    for key, entry in entries.items():
        loc = locations[key]
        modifiers = entry.get("selectionModifiers", [])
        array(modifiers, loc + ".selectionModifiers")
        targets = set()
        for modifier in modifiers:
            fields(modifier, ["choiceId", "count", "constraints"], ["collection", "replacement"], loc + ".selectionModifiers")
            target = modifier["choiceId"]
            require(isinstance(target, str) and target in choices, loc, "unknown target choice")
            require(target not in targets, loc, "duplicate selection modifier target")
            targets.add(target)
            choice_count(modifier["count"], loc)
            if "collection" in modifier:
                require(isinstance(modifier["collection"], str) and modifier["collection"] in collections, loc, "undeclared collection")
            if "replacement" in modifier:
                enum(modifier["replacement"], ["FOLLOW_TARGET"], loc)
            constraints(modifier["constraints"], loc)
            validate_set_limits(modifier["constraints"], modifier["count"], choices[target]["source"], entries, references, loc)
        for ch in ([] if entry["category"] == "POWER" else entry.get("choices", [])):
            for field in ("collection", "requiresCollection"):
                if field in ch:
                    require(ch[field] in collections, loc, "undeclared collection")
    validate_graph(entries, locations)
    limitations = {}
    for key, entry in entries.items():
        gaps = list(entry["coverage"]["limitations"])
        for field in ("access", "prerequisites"):
            gaps += shared.unresolved_conditions(entry[field], references)
        targets = [g["entryId"] for g in entry.get("grants", [])] + entry.get("ruleIds", [])
        for ch in ([] if entry["category"] == "POWER" else entry.get("choices", [])):
            if ch["source"]["type"] == "entries":
                targets += ch["source"]["entryIds"]
            else:
                gaps.append(f"Choice {ch['id']}: query pool must be resolved by the runtime catalog.")
        gaps += [f"{target}: {references[target]['status']}" for target in targets if target in references]
        require(not gaps or entry["coverage"]["status"] != "SUPPORTED", locations[key], "unresolved or unimplemented content cannot claim SUPPORTED")
        limitations[key] = gaps
    return {"schemaVersion": 2, "kind": "modern4e.class-authoring", "entries": [entries[k] for k in sorted(entries)], "references": references, "sections": sections, "advancement": advancement, "limitations": limitations}


def validate_ordered_power(entry, entries, references):
    """Use the shared ordered-power validator without interpreting combat rules."""
    module = ordered_power_validator()
    authored = {key: value for key, value in entry.items() if key != "category"}
    module.validate_power(authored, {**references, **entries})
    require(authored["rulesProfile"] == "MODERN4E", entry["id"], "class catalog requires authored Modern4e rules")


@lru_cache(maxsize=1)
def ordered_power_validator():
    """Load the power contract once; the import stays lazy to avoid a cycle."""
    spec = importlib.util.spec_from_file_location("ordered_power_content", Path(__file__).with_name("power_content.py"))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def validate_class(entry, entries, references, loc):
    flavor = entry["flavor"]
    fields(flavor, ["quote", "introduction", "gameplay"], [], loc + ".flavor")
    for key in ("quote", "gameplay"):
        string(flavor[key], loc)
    array(flavor["introduction"], loc, True)
    for paragraph in flavor["introduction"]:
        string(paragraph, loc)
    enum(entry["role"], ["DEFENDER", "STRIKER", "LEADER", "CONTROLLER"], loc)
    values(entry["powerSources"], shared.SOURCES, loc, True)
    fields(entry["abilities"], ["main", "secondary"], [], loc)
    values(entry["abilities"]["main"], ABILITIES, loc, True)
    values(entry["abilities"]["secondary"], ABILITIES, loc)
    fields(entry["proficiencies"], ["armor", "shields", "weapons", "implements"], [], loc)
    for key, allowed in [("armor", ARMOR), ("shields", SHIELDS), ("weapons", WEAPONS), ("implements", IMPLEMENTS)]:
        values(entry["proficiencies"][key], allowed, loc + ".proficiencies." + key)
    stats = entry["statistics"]
    fields(stats, ["defenses", "health", "healingSurges"], [], loc)
    for name, keys in [("defenses", ["FORTITUDE", "REFLEX", "WILL"]), ("health", ["base", "perLevel", "constitutionMultiplier"]), ("healingSurges", ["base", "constitutionMultiplier"])]:
        fields(stats[name], keys, [], loc + ".statistics." + name)
        for v in stats[name].values():
            integer(v, loc + ".statistics." + name)
    array(entry["ruleIds"], loc)
    for key in entry["ruleIds"]:
        reference(key, ["RULE"], entries, references, loc)
    require(len(set(entry["ruleIds"])) == len(entry["ruleIds"]), loc, "duplicate rule reference")


def validate_graph(entries, locations):
    """Reject recursive acquisition, including cycles through selectable children."""
    done, visiting = set(), set()
    def visit(key):
        if key in done or key not in entries:
            return
        require(key not in visiting, locations[key], "recursive grant/choice cycle")
        visiting.add(key)
        entry = entries[key]
        targets = [g["entryId"] for g in entry.get("grants", [])]
        targets += [k for ch in ([] if entry["category"] == "POWER" else entry.get("choices", [])) if ch["source"]["type"] == "entries" for k in ch["source"]["entryIds"]]
        for target in targets:
            visit(target)
        visiting.remove(key)
        done.add(key)
    for key in entries:
        visit(key)


def main():
    """Validate or export an authoring catalog; runtime package conversion is #35."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--content", type=Path, default=CONTENT)
    parser.add_argument("--output", type=Path)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    try:
        result = catalog(args.content)
        encoded = json.dumps(result, ensure_ascii=False, sort_keys=True, indent=2) + "\n"
        if args.output:
            target = args.output.resolve()
            protected = [args.content.resolve(), Path(__file__).resolve().parents[1]]
            require(not any(p == target or p in target.parents for p in protected), target, "output must not overwrite rulebook authoring sources")
            if args.check:
                require(target.is_file() and target.read_bytes() == encoded.encode("utf-8"), target, "stale or missing class authoring export")
            else:
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes(encoded.encode("utf-8"))
        else:
            require(not args.check, "--check", "requires --output")
        print(f"Validated {len(result['entries'])} shared class entries")
    except (ValueError, OSError) as error:
        parser.exit(1, f"{error}\n")


if __name__ == "__main__":
    main()
