"""Compile reviewed Zeitgeist and class paragon paths, their grants and supplementary rules."""
import copy
import importlib.util
import json
from urllib.parse import parse_qs, urlparse
from pathlib import Path
import sys

import class_runtime
import runtime_common

SCRIPTS = Path(__file__).resolve().parents[2] / "modern4e/scripts"
sys.path.insert(0, str(SCRIPTS))
try:
    spec = importlib.util.spec_from_file_location("path_authoring", SCRIPTS / "path_content.py")
    authoring = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(authoring)
finally:
    sys.path.remove(str(SCRIPTS))

PACKAGE = "modern4e.paths"
REVISION = "3"
# Large enough that the biggest class path group (Fighter: 14 paths with their features and powers) fills one chunk.
CHUNK_SIZE = 128


def class_access_ids(condition):
    """Conservatively bound access to classes, leaving unrestricted OR routes unscoped.

    An AND may include other requirements without opening its class restriction.
    An OR is bounded only when every alternative requires an explicit class.
    This is candidate indexing, not an eligibility result.
    """
    if condition.get("type") == "entry":
        entry_id = condition["entryId"]
        return {entry_id} if entry_id.startswith("modern4e.class.") else set()
    children = condition.get("conditions", [])
    if condition.get("type") not in ("allOf", "anyOf") or not children:
        return set()
    routes = [class_access_ids(child) for child in children]
    if condition["type"] == "anyOf" and any(not route for route in routes):
        return set()
    return set().union(*routes)


def package(entries):
    """Put independently scoped path sets in separate chunks and expose list metadata."""
    scopes = {entry["id"]: sorted(class_access_ids(entry["mechanics"].get("access") or {}))
              for entry in entries if entry["category"] == "PARAGON_PATH"}

    def group(entry):
        """A path's granted features and powers share its chunks, so one class never loads another's.

        A picker or an owned path then reads one chunk per class instead of one for definitions and others for grants.
        """
        access = entry["mechanics"].get("access") or {}
        owner = access["entryId"] if entry["category"] in ("FEATURE", "POWER") and access.get("type") == "entry" else entry["id"]
        return "|".join(scopes.get(owner, [])) or None

    # The common assembler groups a scalar scope. This internal group key can
    # represent several class routes; the public index exposes the original list.
    assets = runtime_common.package(PACKAGE, "Modern 4e paragon paths", entries, revision=REVISION, scope=group, chunk_size=CHUNK_SIZE)
    by_id = {entry["id"]: entry for entry in entries}
    for row in assets[f"{PACKAGE}/index.json"]["entries"]:
        row.pop("classId", None)
        if scopes.get(row["id"]):
            row["pathClassIds"] = scopes[row["id"]]
        entry = by_id[row["id"]]
        access = entry["mechanics"].get("access") or {}
        if entry["category"] == "POWER" and access.get("type") == "entry":
            # A path power is granted, never selected from a pool. Reserving it to its own path keeps
            # every class's power queries from loading or listing it; ownership still resolves it by ID.
            row["classId"] = access["entryId"]
    return assets


def compile_catalog(data):
    """Compile one authored path catalog (paths, features, supplementary rules, granted powers)."""
    entries = []
    for group, category in (("paths", "PARAGON_PATH"), ("features", "FEATURE"),
                            ("rules", "FEATURE"), ("powers", "POWER")):
        for source in data[group]:
            working = {**copy.deepcopy(source), "category": category}
            if group == "paths":
                working["grants"] += [{"id": f"supplement-{index}", "entryId": rule_id, "atLevel": 11}
                                      for index, rule_id in enumerate(source["ruleIds"])]
            if group == "rules":
                working["description"] = "\n\n".join(section.get("text", section.get("title", ""))
                                                     for section in source["sections"])
            if group == "powers":
                working["source"] = {**source.get("source", {}), "rulesText": True}
                working["activations"] = [
                    {**activation, "range": {**activation["range"], "text": "Personal"}}
                    if activation["range"]["type"] == "PERSONAL" else activation
                    for activation in source["activations"]]
            entry = class_runtime.compile_entry(working)
            entry["sharedData"] = copy.deepcopy(source)
            entry["mechanics"].pop("powerProfile", None)
            entry["coverage"] = runtime_common.coverage([
                note for note in entry["coverage"]["limitations"]
                if note != "Authoring and printed rules only; runtime path effects and progression are unimplemented."])
            entries.append(entry)
    return entries


def summaries(authored):
    """Fallback for a class-catalog path without authored content: a selectable, explicitly unimplemented summary.

    Every current class path is authored, so this is normally empty; it keeps a newly listed path selectable
    until its features and powers are imported.
    """
    result = {}
    for path in sorted(authoring.CONTENT.parent.glob("*.json")):
        if path.name in (authoring.CONTENT.name, authoring.CLASS_CONTENT.name):
            continue
        class_id = "modern4e.class." + path.stem
        for source in json.loads(path.read_text(encoding="utf-8"))["paths"]:
            source_id = parse_qs(urlparse(source["link"]).query)["view"][0]
            entry_id = "modern4e.path." + source_id
            if entry_id in authored:
                continue
            if entry_id not in result:
                requirements = [{"type": "level", "minimum": 11}]
                if source.get("requirements"):
                    requirements.append({"type": "unresolved", "text": source["requirements"],
                                         "reason": "Class path prerequisite has not been structurally adapted."})
                result[entry_id] = {"id": entry_id, "category": "PARAGON_PATH",
                    "presentation": {"title": source["title"], "description": source["description"]},
                    "mechanics": {"version": 2, "access": {"type": "anyOf", "conditions": []},
                                  "prerequisites": requirements, "maximumSelections": 1},
                    "coverage": {"status": "UNIMPLEMENTED", "limitations": [
                        "Reviewed local class-path summary only. Path features and granted powers require manual entry; no adapted stat blocks are available."]},
                    "sharedData": {**source, "sourceEntryId": source_id}}
            result[entry_id]["mechanics"]["access"]["conditions"].append({"type": "entry", "entryId": class_id})
    return list(result.values())


def build(content=None, class_content=None):
    """Keep stable authored identities and absolute acquisition levels.

    Supplementary rules are granted as readable features so the path's complete
    rules remain available without pretending their combat effects are automated.
    Granted path powers have no selectable profile and never enter class pools.
    Class paths come from their own reviewed catalog; a class-page path absent from
    it keeps an unimplemented summary.
    """
    data = authoring.load() if content is None else authoring.load(content)
    classes = authoring.load_class_paths() if class_content is None else authoring.load_class_paths(class_content)
    entries = compile_catalog(data) + compile_catalog(classes)
    entries += summaries({path["id"] for path in classes["paths"]})
    return package(entries)
