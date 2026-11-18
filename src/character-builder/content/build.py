"""Deterministic, offline content production; never executes compendium JavaScript."""
import argparse
import importlib.util
import json
from html.parser import HTMLParser
from pathlib import Path
import re
import sys
from urllib.parse import parse_qs, urlparse

ROOT = Path(__file__).resolve().parents[3]
spec = importlib.util.spec_from_file_location("compendium", ROOT / "src/modern4e/scripts/compendium.py")
compendium = importlib.util.module_from_spec(spec)
spec.loader.exec_module(compendium)
SNAPSHOT = ROOT / "src/modern4e/content/compendium"
CATEGORIES = dict(zip(
    "class race background theme feat classfeature power paragonpath epicdestiny item".split(),
    "CLASS ANCESTRY BACKGROUND THEME FEAT FEATURE POWER PARAGON_PATH EPIC_DESTINY ITEM".split()))
CATEGORIES.update({"weapon": "ITEM", "armor": "ITEM", "implement": "ITEM"})
ABILITIES = "STRENGTH DEXTERITY CONSTITUTION INTELLIGENCE WISDOM CHARISMA".split()
SKILLS = "ATHLETICS ACROBATICS STEALTH THIEVERY ENDURANCE ARCANA CRAFTING SOCIETY MEDICINE INSIGHT NATURE PERCEPTION RELIGION BLUFF DIPLOMACY INTIMIDATE".split()
STATISTICS = "ABILITY_POINTS SKILL_CHECK HIT_POINTS HEALING_SURGES AC FORTITUDE REFLEX WILL ATTACK DAMAGE SPEED".split()


def require(condition, where, message):
    if not condition:
        raise ValueError(f"{where}: {message}")


def object_fields(value, required, optional, where):
    require(isinstance(value, dict), where, "expected object")
    require(set(required) <= value.keys(), where, f"required fields: {', '.join(required)}")
    require(value.keys() <= set(required) | set(optional), where, f"unknown fields: {sorted(value.keys() - set(required) - set(optional))}")


def string(value, where):
    require(isinstance(value, str) and bool(value.strip()), where, "expected nonblank string")


def integer(value, where, minimum=None, maximum=None):
    require(type(value) is int and -(2**31) <= value < 2**31, where, "expected 32-bit integer")
    require(minimum is None or value >= minimum, where, f"minimum {minimum}")
    require(maximum is None or value <= maximum, where, f"maximum {maximum}")


def enum(value, values, where):
    require(isinstance(value, str) and value in values, where, f"expected one of {values}, got {value!r}")


def array(value, where):
    require(isinstance(value, list), where, "expected array")
    return value


def unique(values, where):
    require(len(values) == len(set(values)), where, "duplicate identifiers/values")


def load_json(path):
    def pairs(items):
        result = {}
        for key, value in items:
            require(key not in result, path, f"duplicate JSON key {key}")
            result[key] = value
        return result
    try:
        return json.loads(path.read_text(encoding="utf-8"), object_pairs_hook=pairs)
    except (ValueError, OSError) as error:
        raise ValueError(f"{path}: {error}") from error


def payload(path):
    try:
        return compendium.payload(path)
    except (ValueError, IndexError, OSError) as error:
        raise ValueError(f"{path}: {error}") from error


class PresentationParser(HTMLParser):
    """Extract links and attribution without rewriting a single description byte."""
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.references = []
        self.text = []

    def handle_starttag(self, tag, attrs):
        if tag == "a":
            href = dict(attrs).get("href", "")
            view = parse_qs(urlparse(href).query).get("view", [""])[0]
            for entry_id in view.split(","):
                if re.fullmatch(r"[A-Za-z]+\d+", entry_id):
                    self.references.append(entry_id)

    def handle_data(self, data):
        self.text.append(data)


def snapshot_catalog(snapshot):
    """Index all source IDs, including categories outside the builder contract."""
    rows = {}
    for category in sorted(payload(snapshot / "catalog.js")[-1]):
        path = snapshot / category / "_listing.js"
        args = payload(path)
        columns = args[-2]
        require(isinstance(columns, list) and "ID" in columns and "Name" in columns, path, "missing listing columns")
        for index, values in enumerate(args[-1]):
            where = f"{path}:rows[{index}]"
            require(isinstance(values, list) and len(values) == len(columns), where, "listing column count mismatch")
            row = dict(zip(columns, values))
            entry_id = row["ID"]
            require(isinstance(entry_id, str) and re.fullmatch(r"[A-Za-z]+\d+", entry_id), where, "invalid source ID")
            require(entry_id not in rows, where, f"duplicate source ID {entry_id}")
            rows[entry_id] = (category, row, where)
    return rows


def validate_mechanics(value, where):
    """Validate the existing Kotlin v1 closed vocabulary; return referenced IDs."""
    object_fields(value, [], ["prerequisites", "grants", "choices", "modifiers", "progression"], where)
    refs = []
    for field in ("prerequisites", "grants", "choices", "modifiers", "progression"):
        array(value.get(field, []), f"{where}.{field}")
    for i, p in enumerate(value.get("prerequisites", [])):
        loc = f"{where}.prerequisites[{i}]"
        require(isinstance(p, dict), loc, "expected object")
        kind = p.get("type")
        fields = {"level": ["minimum"], "entry": ["entryId"], "abilityPoints": ["ability", "minimum"], "proficiency": ["skill"], "unadapted": ["sourceText"]}
        enum(kind, fields, loc)
        object_fields(p, ["type"] + fields[kind], [], loc)
        if kind == "level":
            integer(p["minimum"], loc, 1, 30)
        elif kind == "abilityPoints":
            enum(p["ability"], ABILITIES, loc)
            integer(p["minimum"], loc, -1)
        elif kind == "proficiency":
            enum(p["skill"], SKILLS, loc)
        elif kind == "entry":
            string(p["entryId"], loc)
            refs.append(p["entryId"])
        else:
            string(p["sourceText"], loc)
    for field in ("grants", "choices"):
        identifiers = []
        for i, item in enumerate(value.get(field, [])):
            loc = f"{where}.{field}[{i}]"
            require(isinstance(item, dict), loc, "expected object")
            kind = item.get("type")
            variants = {"entry": ["grantId", "entryId"], "proficiency": ["grantId", "skill"]} if field == "grants" else {"entries": ["id", "count", "entryIds"], "proficiencies": ["id", "count", "skills"], "mainAbility": ["id", "abilities"]}
            enum(kind, variants, loc)
            object_fields(item, ["type"] + variants[kind], [], loc)
            key = "grantId" if field == "grants" else "id"
            string(item[key], loc)
            identifiers.append(item[key])
            if kind == "entry":
                string(item["entryId"], loc)
                refs.append(item["entryId"])
            elif kind == "proficiency":
                enum(item["skill"], SKILLS, loc)
            else:
                key = {"entries": "entryIds", "proficiencies": "skills", "mainAbility": "abilities"}[kind]
                options = array(item[key], loc)
                for option in options:
                    string(option, loc)
                    if kind != "entries":
                        enum(option, SKILLS if kind == "proficiencies" else ABILITIES, loc)
                unique(options, loc)
                if kind == "entries":
                    refs.extend(options)
                integer(item.get("count", 1), loc, 1, len(options))
        unique(identifiers, f"{where}.{field}")
    for i, modifier in enumerate(value.get("modifiers", [])):
        loc = f"{where}.modifiers[{i}]"
        object_fields(modifier, ["target", "operation", "value"], ["bonusType"], loc)
        enum(modifier["operation"], ["ADD", "SET", "MINIMUM"], loc)
        enum(modifier.get("bonusType", "UNTYPED"), ["UNTYPED", "FEAT", "ITEM", "POWER", "PROFICIENCY", "ENHANCEMENT"], loc)
        integer(modifier["value"], loc)
        target = modifier["target"]
        object_fields(target, ["statistic"], ["ability", "skill"], loc)
        enum(target["statistic"], STATISTICS, loc)
        for qualifier, statistic, values in (("ability", "ABILITY_POINTS", ABILITIES), ("skill", "SKILL_CHECK", SKILLS)):
            require((target.get(qualifier) is not None) == (target["statistic"] == statistic), loc, f"{qualifier} required only for {statistic}")
            if target.get(qualifier) is not None:
                enum(target[qualifier], values, loc)
    levels = []
    for i, progression in enumerate(value.get("progression", [])):
        loc = f"{where}.progression[{i}]"
        object_fields(progression, ["level"], ["grants", "choices", "modifiers"], loc)
        integer(progression["level"], loc, 1, 30)
        levels.append(progression["level"])
        refs.extend(validate_mechanics({k: v for k, v in progression.items() if k != "level"}, loc))
    unique(levels, f"{where}.progression")
    return refs


def coverage(value, mechanics, where):
    object_fields(value, ["status", "limitations"], [], where)
    enum(value["status"], ["SUPPORTED", "PARTIAL", "UNIMPLEMENTED"], where)
    for limitation in array(value["limitations"], where):
        string(limitation, where)
    if value["status"] != "SUPPORTED":
        require(bool(value["limitations"]), where, "incomplete coverage requires limitations")
    if any(p["type"] == "unadapted" for p in mechanics.get("prerequisites", [])):
        require(value["status"] != "SUPPORTED", where, "unadapted prerequisite cannot be SUPPORTED")


def modern_feats(content=ROOT / "src/modern4e/content"):
    """Compile shared local definitions, preserving conditions without lossy v1 lowering.

    This authoring catalog is the migration input for the runtime package compiler,
    not a v1 PackageManifest. No compendium entry or published prose is consulted.
    """
    spec = importlib.util.spec_from_file_location("modern_feats", ROOT / "src/modern4e/scripts/feats.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return {"modern4e.feats/catalog.json": module.catalog(content)}


def build(config_path, snapshot=SNAPSHOT, *, exclude_classes=False):
    """Return relative asset paths and JSON values, validating everything before IO."""
    config = load_json(config_path)
    if exclude_classes:
        # Imported non-class content retains its explicit IDs and authored mechanics.
        # Published class presentation/mechanics are never a production fallback.
        for package in config["packages"]:
            package["entries"] = [entry for entry in package["entries"]
                                  if not re.fullmatch(r"class\d+", entry["id"])]
            package["sourceCategories"] = [category for category in package.get("sourceCategories", []) if category != "class"]
            package["revision"] = "2"
            for dependency in package.get("dependencies", []):
                dependency["revision"] = "2"
        config["packages"] = [package for package in config["packages"] if package["entries"] or package["sourceCategories"]]
    object_fields(config, ["packages"], [], config_path)
    catalog = snapshot_catalog(snapshot)
    packages = {}
    batches = {}
    for n, package in enumerate(array(config["packages"], config_path)):
        loc = f"{config_path}:packages[{n}]"
        object_fields(package, ["id", "revision", "title", "entries"], ["dependencies", "chunkSize", "sourceCategories"], loc)
        for key in ("id", "revision", "title"):
            string(package[key], f"{loc}.{key}")
        require(re.fullmatch(r"[a-zA-Z0-9._-]+", package["id"]) and package["id"] not in (".", ".."), loc, "package ID must be a safe directory name")
        require(package["id"] not in packages, loc, "duplicate package ID")
        integer(package.get("chunkSize", 100), loc, 1, 10000)
        entries = {}
        references = []
        authored_entries = array(package["entries"], loc)
        selected_categories = array(package.get("sourceCategories", []), loc)
        for category in selected_categories:
            enum(category, CATEGORIES, loc)
        unique(selected_categories, loc)
        explicit_ids = [entry.get("id") for entry in authored_entries if isinstance(entry, dict)]
        authored_entries = authored_entries + [{"id": key} for key, (category, _, _) in sorted(catalog.items()) if category in selected_categories and key not in explicit_ids]
        for i, authored in enumerate(authored_entries):
            source = f"{loc}.entries[{i}]"
            object_fields(authored, ["id"], ["mechanics", "coverage"], source)
            entry_id = authored["id"]
            string(entry_id, source)
            require(entry_id in catalog, source, f"missing source entry {entry_id}")
            require(entry_id not in entries, source, f"duplicate entry ID {entry_id}")
            category, row, row_loc = catalog[entry_id]
            string(row["Name"], row_loc)
            require(category in CATEGORIES, source, f"source category {category} is outside v1 EntryCategory")
            batch = snapshot / category / f"data{int(re.search(r'\d+$', entry_id)[0]) % 20}.js"
            if batch not in batches:
                batches[batch] = payload(batch)[-1]
            require(entry_id in batches[batch], row_loc, f"missing HTML {entry_id} in {batch}")
            html = batches[batch][entry_id]
            require(isinstance(html, str), batch, f"{entry_id}: expected HTML string")
            parser = PresentationParser()
            parser.feed(html)
            for ref in parser.references:
                require(ref in catalog, f"{batch}:{entry_id}", f"dangling presentation reference {ref}")
            publications = re.findall(r"Published in\s+(.+?)(?=$|Published in)", "".join(parser.text), re.S)
            fallback = row.get("SourceBook", "")
            if not publications and fallback:
                publications = fallback if isinstance(fallback, list) else [fallback]
            mechanics = authored.get("mechanics", {})
            references.extend((ref, source) for ref in validate_mechanics(mechanics, f"{source}.mechanics"))
            automation = authored.get("coverage", {"status": "UNIMPLEMENTED", "limitations": ["Source presentation only; mechanics and prerequisites have not been adapted to Modern 4e."]})
            coverage(automation, mechanics, f"{source}.coverage")
            require("mechanics" not in authored or "coverage" in authored, source, "authored mechanics require explicit coverage")
            require("mechanics" in authored or automation["status"] == "UNIMPLEMENTED", source, "absent authored mechanics must be UNIMPLEMENTED")
            entries[entry_id] = {"id": entry_id, "category": CATEGORIES[category], "presentation": {"title": row["Name"], "description": html, "publications": [p.strip() for p in publications], "references": sorted(set(parser.references))}, "mechanics": mechanics, "coverage": automation}
        dependencies = array(package.get("dependencies", []), loc)
        for dependency in dependencies:
            object_fields(dependency, ["packageId", "revision"], [], loc)
            string(dependency["packageId"], loc)
            string(dependency["revision"], loc)
            require(dependency["packageId"] != package["id"], loc, "self dependency")
        unique([d["packageId"] for d in dependencies], loc)
        packages[package["id"]] = (package, entries, references, loc)
    def available(package_id, visiting=()):
        require(package_id not in visiting, config_path, f"dependency cycle: {visiting + (package_id,)}")
        package, entries, _, loc = packages[package_id]
        ids = set(entries)
        for dependency in package.get("dependencies", []):
            other = dependency["packageId"]
            require(other in packages, loc, f"missing dependency package {other}")
            require(packages[other][0]["revision"] == dependency["revision"], loc, f"dependency revision mismatch: {other}")
            ids.update(available(other, visiting + (package_id,)))
        return ids
    output = {}
    for package_id, (package, entries, refs, loc) in sorted(packages.items()):
        ids = available(package_id)
        for ref, source in refs:
            require(ref in ids, source, f"mechanical reference {ref} absent from package and declared dependencies")
        size = package.get("chunkSize", 100)
        ordered = [entries[key] for key in sorted(entries)]
        chunks = []
        index = []
        for start in range(0, len(ordered), size):
            chunk_id = f"entries-{start // size:04d}"
            chunks.append(chunk_id)
            chunk = ordered[start:start + size]
            output[f"{package_id}/{chunk_id}.json"] = {"id": chunk_id, "entries": chunk}
            index.extend({"id": e["id"], "category": e["category"], "title": e["presentation"]["title"], "chunkId": chunk_id} for e in chunk)
        output[f"{package_id}/index.json"] = {"entries": index}
        output[f"{package_id}/manifest.json"] = {"formatVersion": 1, "id": package_id, "revision": package["revision"], "title": package["title"], "dependencies": package.get("dependencies", []), "indexes": ["index"], "chunks": chunks}
    return output


def serialize(value):
    return (json.dumps(value, ensure_ascii=False, sort_keys=True, indent=2) + "\n").encode("utf-8")


def production(content=None, snapshot=SNAPSHOT, campaign=None):
    """Compile authoritative classes first; retain explicitly imported other categories."""
    import ancestry_runtime
    import campaign_profiles
    import class_runtime
    import equipment_runtime
    import feat_runtime
    import runtime_common
    import theme_runtime
    import utility_runtime
    classes = class_runtime.build() if content is None else class_runtime.build(content)
    modern = dict(classes)
    for compiler in (ancestry_runtime, theme_runtime, feat_runtime, utility_runtime, equipment_runtime):
        package = compiler.build()
        require(not modern.keys() & package.keys(), "production", "duplicate package assets")
        modern |= package
    # Grants, finite choices and entry conditions may cross authored packages, never dangle.
    runtime_common.validate_references(modern)
    return campaign_profiles.apply(modern, campaign)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--config", type=Path, help="explicit legacy/imported source fixture configuration")
    parser.add_argument("--snapshot", type=Path, default=SNAPSHOT)
    mode.add_argument("--modern-feats", action="store_true", help="compile the shared Modern 4e feat authoring catalog (not a v1 runtime package)")
    mode.add_argument("--modern-equipment", action="store_true", help="compile shared equipment authoring data (not a v1 runtime package)")
    mode.add_argument("--modern-classes-runtime", action="store_true", help="compile shared class mechanics-v2 runtime package")
    parser.add_argument("--output", type=Path)
    parser.add_argument("--check", action="store_true", help="validate and compare without writing")
    args = parser.parse_args()
    if args.output is None:
        directory = "modern-classes-runtime-generated" if args.modern_classes_runtime else "modern-equipment-generated" if args.modern_equipment else "modern-feats-generated" if args.modern_feats else "generated" if args.config else "production-generated"
        args.output = Path(__file__).with_name(directory)
    if args.modern_feats or args.modern_equipment or args.modern_classes_runtime:
        require(not args.output.resolve().is_relative_to((ROOT / "src/modern4e/content").resolve()), args.output, "output must not overwrite shared authoring content")
    if args.modern_equipment or args.modern_classes_runtime or not args.config and not args.modern_feats:
        require(not args.output.resolve().is_relative_to((ROOT / "src/modern4e").resolve()), args.output, "output must not overwrite rulebook authoring sources")
    require(not args.output.resolve().is_relative_to(args.snapshot.resolve()), args.output, "output must not overwrite source snapshot")
    if args.modern_classes_runtime:
        import class_runtime
        assets = class_runtime.build()
    elif args.modern_equipment:
        spec = importlib.util.spec_from_file_location("equipment_content", ROOT / "src/modern4e/scripts/equipment_content.py")
        equipment = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(equipment)
        assets = {"modern4e.equipment-authoring/catalog.json": equipment.catalog()}
    else:
        assets = modern_feats() if args.modern_feats else build(args.config, args.snapshot) if args.config else production(snapshot=args.snapshot)
    for name in assets:
        require(not (args.output / name).resolve().is_relative_to(args.snapshot.resolve()), args.output / name, "generated asset would overwrite source snapshot")
    if args.output.exists():
        extra = sorted(str(p.relative_to(args.output)).replace("\\", "/") for p in args.output.glob("*/*.json") if str(p.relative_to(args.output)).replace("\\", "/") not in assets)
        require(not extra, args.output, f"unexpected stale assets {extra}; use an empty output directory for changed package/chunk layouts")
    for name, value in assets.items():
        path = args.output / name
        data = serialize(value)
        if args.check:
            require(path.exists() and path.read_bytes() == data, path, "missing or stale generated asset; regenerate")
        else:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(data)
    print(f"{'Checked' if args.check else 'Generated'} {len(assets)} deterministic JSON assets")


if __name__ == "__main__":
    try:
        main()
    except (ValueError, OSError) as error:
        sys.exit(str(error))
