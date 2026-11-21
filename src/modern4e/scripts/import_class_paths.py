"""Explicit offline migration aid for class paragon paths; production reads reviewed JSON, never this importer.

Each class-catalog path (``content/paths/<class>.json``, consumed by Typst) is joined to its published
compendium entry. The path keeps its stable ``modern4e.path.paragonpathNNN`` identity, summary text, requirements
and class access. Its features become separate FEATURE entries with absolute grant levels, and its level 11
encounter attack, level 12 utility and level 20 daily are converted to ordered-rules powers granted by the path.
"""
import argparse
import json
import re
from pathlib import Path
from urllib.parse import parse_qs, urlparse

import compendium
import import_class_attacks as attacks

PATHS = compendium.ROOT / "content/paths"
ZEITGEIST = PATHS / "zeitgeist.json"
# Zeitgeist data and this importer's own reviewed output are never class-catalog sources.
EXCLUDED = ("zeitgeist.json", "class-paths.json")
FEATURE_LINE = re.compile(r"^(?P<name>[^:]+?) \((?P<level>\d+)(?:st|nd|rd|th) level\): (?P<text>.+)$")
POWER_TITLE = re.compile(r"(?:(?:Attack|Utility) \d+|Feature)$")
KINDS = {"Attack": "ATTACK", "Utility": "UTILITY", "Feature": "UTILITY"}
USAGE_LIMITS = {"ENCOUNTER": "ENCOUNTER", "DAILY": "DAY"}
LIMITATION = ("Combat/session effects (conditional weapon benefits, secondary actions, sustain rules and "
              "summoned creatures) are printed rules and require manual resolution.")


def slug(value):
    """Stable lowercase identifier fragment; apostrophes disappear rather than split a word."""
    return re.sub(r"[^a-z0-9]+", "-", re.sub(r"[’']", "", value.lower())).strip("-")


def localize(value):
    """Path-only wording on top of adapt(): a bare "ability modifier" is a direct ability point here too.

    Applied to every authored string except preserved source text, so it never rewrites published rules.
    """
    if isinstance(value, str):
        return re.sub(r"\b((?:primary |main |key )?ability) modifiers?\b", r"\1", value)
    if isinstance(value, list):
        return [localize(item) for item in value]
    if isinstance(value, dict):
        return {key: item if key == "source" else localize(item) for key, item in value.items()}
    return value


def quotes(value):
    """Fold typographic quotes so a repeated flavor line compares equal."""
    return value.replace("“", '"').replace("”", '"').replace("’", "'")


def class_catalog():
    """Class-page path summaries keyed by stable ID, in the old compiler's class-file order."""
    paths = {}
    for path in sorted(PATHS.glob("*.json")):
        if path.name in EXCLUDED:
            continue
        class_id = "modern4e.class." + path.stem
        for source in json.loads(path.read_text(encoding="utf-8"))["paths"]:
            source_id = parse_qs(urlparse(source["link"]).query)["view"][0]
            entry = paths.setdefault("modern4e.path." + source_id, {**source, "sourceEntryId": source_id, "classIds": []})
            entry["classIds"].append(class_id)
    return paths


def published_names():
    """Published path names keyed by entry ID; they differ from class-catalog titles when a name is shared (PH2/PH3)."""
    listing = compendium.payload(compendium.DATA / "paragonpath/_listing.js")
    return {row[0]: row[1] for row in listing[-1]}


def power_rows():
    """Published power rows grouped by the path title they belong to (ClassName)."""
    listing = compendium.payload(compendium.DATA / "power/_listing.js")
    groups = {}
    for values in listing[-1]:
        row = dict(zip(listing[-2], values))
        groups.setdefault(row["ClassName"], []).append(row)
    return groups


def parse_path(html, power_names):
    """Split a published path entry into flavor quote, printed prerequisite and feature paragraphs.

    Features are ``Name (Nth level): text`` lines. Any other line before the first power card (list rows,
    trailing rules paragraphs) belongs to the feature above it. A line repeating the flavor quote is dropped.
    """
    lines = attacks.text(html).splitlines()
    flavor = next((line for line in lines[1:3] if line[:1] in "\"“"), None)
    prerequisite = next((line.partition(": ")[2] for line in lines if line.startswith("Prerequisite:")), None)
    start = next(i for i, line in enumerate(lines) if line.endswith(" PATH FEATURES"))
    end = next((i for i in range(start + 1, len(lines))
                if POWER_TITLE.search(lines[i]) and any(lines[i].startswith(name) for name in power_names)), len(lines))
    features, preamble = [], []
    for line in lines[start + 1:end]:
        if flavor and quotes(line) == quotes(flavor):
            continue
        found = FEATURE_LINE.match(line)
        if found:
            features.append({"name": found["name"].strip(), "level": int(found["level"]), "paragraphs": [found["text"]]})
        elif features:
            features[-1]["paragraphs"].append(line)
        else:
            preamble.append(line)
    # Rules printed before the first feature (the Son of Mercy keyword rule) lead the first feature's text.
    if preamble and not features:
        raise ValueError(f"Unrecognized path feature line: {preamble[0]!r}")
    if preamble:
        features[0]["paragraphs"] = preamble + features[0]["paragraphs"]
    return {"flavor": flavor, "prerequisite": prerequisite, "features": features}


def convert_power(row, html, path_title, path_id, power_id):
    """Convert one published path power through the class-attack importer, then bind it to its path."""
    kind = row["Type"].split()[-1]
    # An at-will "Feature" card has no level; it is granted with the level 11 feature that names it.
    level = row["Level"] or "11"
    power = localize(attacks.convert({**row, "Level": level}, html, path_title))
    power.update(id=power_id, access={"type": "entry", "entryId": path_id}, powerKind=KINDS[kind],
                 subtitle=f"{path_title} {kind}" + ("" if kind == "Feature" else f" {level}"))
    # The converter's selectable-attack wording does not apply: a path grants this power automatically.
    power["coverage"]["limitations"][0] = LIMITATION
    for activation in power["activations"]:
        period = USAGE_LIMITS.get(activation["usage"]["frequency"])
        if period and activation["availability"] == "ENTRY":
            activation["usage"]["limits"] = [{"period": period, "maximum": {"base": 1}}]
    return power


def unenforced_prerequisite(printed, requirement, class_ids):
    """The part of a published prerequisite that neither class access nor the class-catalog requirement covers."""
    remainder = printed
    for word in [class_id.rsplit(".", 1)[1] for class_id in class_ids] + ["class", requirement or ""]:
        if word:
            remainder = re.sub(re.escape(word), "", remainder, flags=re.I)
    remainder = re.sub(r"\b(?:or|and)\b", "", remainder, flags=re.I)
    return printed if re.search(r"[A-Za-z0-9]", remainder) else None


def unique(base, taken, qualifier=None):
    """Claim a readable identifier; on a clash prefer the qualifier, then a number."""
    candidate, number = base, 2
    if candidate in taken and qualifier:
        base = candidate = f"{base}-{qualifier}"
    while candidate in taken:
        candidate = f"{base}-{number}"
        number += 1
    taken.add(candidate)
    return candidate


def build(selected=None):
    """Return the reviewed-authoring shape (paths, features, rules, powers) for every class path."""
    catalog = class_catalog()
    groups = power_rows()
    names = published_names()
    cache = {}

    def html_of(category, entry_id):
        path = compendium.batch_path(category, entry_id)
        if path not in cache:
            cache[path] = compendium.payload(path)[-1]
        return cache[path][entry_id]

    paths, features, powers = [], [], []
    # Identities already used by the Zeitgeist catalog are reserved so the two never collide in one package.
    taken_ids = {entry["id"] for group in ("paths", "features", "rules", "powers")
                 for entry in json.loads(ZEITGEIST.read_text(encoding="utf-8"))[group]}
    for path_id, source in catalog.items():
        if selected and source["sourceEntryId"] not in selected:
            continue
        title = source["title"]
        rows = sorted(groups[names[source["sourceEntryId"]]], key=lambda row: (int(row["Level"] or 11), row["ID"]))
        parsed = parse_path(html_of("paragonpath", source["sourceEntryId"]), [row["Name"] for row in rows])
        requirement = source.get("requirements")
        prerequisites = {"type": "level", "minimum": 11}
        limitations = ["Authoring and printed rules only; runtime path effects and progression are unimplemented."]
        if requirement:
            prerequisites = {"type": "allOf", "conditions": [prerequisites, {
                "type": "unresolved", "text": requirement,
                "reason": "Class path prerequisite has not been structurally adapted."}]}
            limitations.append(f"Class path prerequisite has not been structurally adapted: {requirement}.")
        printed = parsed["prerequisite"] or ""
        extra = unenforced_prerequisite(printed, requirement, source["classIds"])
        if extra:
            limitations.append(f"Published prerequisite not enforced: {extra}.")
        grants, taken = [], set()
        for feature in parsed["features"]:
            feature_id = unique(f"modern4e.feature.{slug(title)}-{slug(feature['name'])}", taken_ids)
            features.append({
                "id": feature_id, "title": feature["name"], "description": localize(attacks.adapt("\n\n".join(feature["paragraphs"]))),
                "access": {"type": "entry", "entryId": path_id}, "prerequisites": {"type": "always"},
                "selection": {"maximum": 1, "constraints": []},
                "coverage": {"status": "UNIMPLEMENTED", "limitations": [
                    "Authoring and printed rules only; runtime path effects and progression are unimplemented."]}})
            grants.append({"id": unique(slug(feature["name"]), taken), "entryId": feature_id, "atLevel": feature["level"]})
        for row in rows:
            power_id = unique(f"modern4e.power.path-{slug(row['Name'])}", taken_ids, slug(title))
            power = convert_power(row, html_of("power", row["ID"]), title, path_id, power_id)
            powers.append(power)
            grants.append({"id": unique(slug(row["Name"]), taken), "entryId": power_id, "atLevel": power["level"]})
        grants.sort(key=lambda grant: grant["atLevel"])
        description = source["description"]
        paths.append({
            "id": path_id, "title": title, "description": description,
            "access": ({"type": "entry", "entryId": source["classIds"][0]} if len(source["classIds"]) == 1 else
                       {"type": "anyOf", "conditions": [{"type": "entry", "entryId": class_id} for class_id in source["classIds"]]}),
            "prerequisites": prerequisites, "selection": {"maximum": 1, "constraints": []},
            "coverage": {"status": "UNIMPLEMENTED", "limitations": limitations},
            "flavor": description, "prerequisiteText": printed or "None", "grants": grants, "ruleIds": [],
            "sourceEntryId": source["sourceEntryId"], "link": source["link"], "requirements": requirement})
    return {"schemaVersion": 1, "document": {
                "title": "Class Paragon Paths",
                "introduction": "At level 11, you choose a paragon path. These class paths grant features at 11th and 16th "
                                "level and an encounter attack, a utility power and a daily power at 11th, 12th and 20th level.",
                "source": "Published D&D 4e paragon paths, adapted to Modern 4e wording; combat effects remain manual."},
            "paths": paths, "features": features, "rules": [], "powers": powers}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output-dir", type=Path, required=True, help="New scratch directory for class-paths.json")
    parser.add_argument("--path", nargs="*", metavar="paragonpathNNN", help="Limit the import to these published path IDs")
    args = parser.parse_args()
    if args.output_dir.exists() or args.output_dir.resolve().is_relative_to(PATHS.resolve()):
        parser.error("Use a new scratch directory; never overwrite reviewed authoritative paths")
    data = build(set(args.path or []))
    args.output_dir.mkdir(parents=True)
    (args.output_dir / "class-paths.json").write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Exported {len(data['paths'])} paths, {len(data['features'])} features and {len(data['powers'])} powers for review")


if __name__ == "__main__":
    main()
