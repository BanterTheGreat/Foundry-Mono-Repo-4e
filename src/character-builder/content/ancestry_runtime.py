"""Compile validated shared ancestry data into the mechanics-v2 runtime contract.

One package, ``modern4e.ancestries``, carries every ancestry with its traits and powers.
Structured language choices, entry-scoped damage decisions and qualification-only Past Life
facts are persisted by the shared engine. Explicit fact links connect Dragonborn Scales to
active Dragon Breath without conflating other ancestry damage facts. Combat/session effects,
base speed is the ancestry's only unconditional modifier; vision remains manual and visibly covered as partial or unimplemented.
"""
import copy
import importlib.util
import json
import sys
from pathlib import Path

import class_runtime
import runtime_common

SCRIPTS = Path(__file__).resolve().parents[2] / "modern4e/scripts"
PACKAGE = "modern4e.ancestries"
TITLE = "Modern 4e shared ancestries"
CATEGORIES = {"ancestry": "ANCESTRY", "feature": "FEATURE", "power": "POWER"}


def _load_authoring():
    """Load the ancestry validator; it imports its sibling power validator by name."""
    sys.path.insert(0, str(SCRIPTS))
    try:
        spec = importlib.util.spec_from_file_location("ancestry_authoring", SCRIPTS / "ancestry_content.py")
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
    finally:
        sys.path.remove(str(SCRIPTS))
    return module


authoring = _load_authoring()


def category(entry_id):
    """Entry category from the persistent ID kind (the loader does not add a category key)."""
    return CATEGORIES[entry_id.split(".")[1]]


def compile_choice(choice, entry_id=None):
    """Compile a finite power, scoped damage-type or qualification-only ancestry choice."""
    source = choice["source"]
    if "damageTypes" in source:
        return {"type": "values", "id": choice["id"], "count": choice["count"], "kind": "DAMAGE_TYPE",
                "targetId": entry_id, "options": [{"id": value, "title": value.title()} for value in source["damageTypes"]]}
    if "ancestriesExcept" in source:
        entries = authoring.load()
        return {"type": "values", "id": choice["id"], "count": choice["count"], "kind": "ANCESTRY_QUALIFICATION",
                "options": [{"id": entry["id"], "title": entry["title"]} for entry in entries.values()
                            if category(entry["id"]) == "ANCESTRY" and entry["id"] not in source["ancestriesExcept"]]}
    if "entryIds" not in source:
        return None
    return class_runtime.compile_choice({"id": choice["id"], "count": choice["count"], "atLevel": 1,
                                         "constraints": [],
                                         "source": {"type": "entries", "entryIds": source["entryIds"]}})


def unsupported_choice(choice):
    """Describe an unsupported authored decision without deleting its source data."""
    source = choice["source"]
    count = choice["count"]
    if "damageTypes" in source:
        return (f"Choice {choice['id']}: select {count} of the damage types {', '.join(source['damageTypes'])}; "
                "the closed vocabulary has no damage-type decision.")
    return (f"Choice {choice['id']}: select {count} ancestry other than {', '.join(source['ancestriesExcept'])} "
            "for ancestry qualification only; it never grants the chosen ancestry's traits and the "
            "closed vocabulary has no qualification-only ancestry decision.")


def compile_entry(entry):
    """Compile one ancestry, feature or power entry; the full authored entry stays in sharedData."""
    kind = category(entry["id"])
    shape = {**entry, "category": kind}
    shape.pop("choices", None)
    result = class_runtime.compile_entry(shape)
    mechanics = result["mechanics"]
    unsupported = []
    for choice in entry.get("choices", []):
        compiled = compile_choice(choice, entry["id"])
        if compiled:
            mechanics["choices"].append(compiled)
        else:
            unsupported.append(unsupported_choice(choice))
    if kind == "ANCESTRY":
        mechanics["size"] = entry["attributes"]["size"].upper()
        # Ancestry is the only base-speed source; the engine's SET starts a statistic that has no class base.
        mechanics["modifiers"] = [{"target": {"statistic": "SPEED"}, "operation": "SET", "value": entry["attributes"]["speed"]}]
        languages = entry["attributes"]["languages"]
        mechanics["facts"] = [{"kind": "LANGUAGE", "values": [value.upper().replace("-", "_").replace(" ", "_") for value in languages["fixed"]]}]
        picks = languages["choiceCount"]
        if picks:
            catalog = json.loads((SCRIPTS.parent / "content/languages.json").read_text(encoding="utf-8"))
            mechanics["choices"].append({"type": "values", "id": "languages", "count": picks, "kind": "LANGUAGE",
                                         "distinctScope": "CHARACTER", "options": [{"id": option["id"], "title": option["title"]} for option in catalog["languages"]]})
    if entry["id"] == "modern4e.power.dragon-breath":
        mechanics["factLinks"] = [{"kind": "DAMAGE_TYPE", "sourceTargetId": "modern4e.feature.dragonborn-dragonborn-scales",
                                    "targetId": entry["id"]}]
    mechanics["unsupported"] += unsupported
    limitations = list(unsupported)
    if "note" in entry:
        limitations.append("Authoring note: " + entry["note"])
    if kind == "ANCESTRY":
        limitations.append("Size and structured language choices supply build-time facts, and base speed is applied. Vision is preserved in sharedData and is not applied "
                           "as a modifier by the character builder.")
    elif kind == "FEATURE":
        limitations.append("Trait effects described in the text are not automated by the character builder.")
    else:
        limitations.append("Power execution is not automated; ancestry powers are never offered by class power queries.")
    status = "UNIMPLEMENTED" if kind == "POWER" else "PARTIAL"
    result["coverage"] = {"status": status, "limitations": limitations}
    result["sharedData"] = copy.deepcopy(entry)
    return result


def build(content=None):
    """Validate the ancestry catalog (optionally from another directory) and emit its package assets."""
    previous = authoring.CONTENT
    if content is not None:
        authoring.CONTENT = Path(content)
    try:
        source = authoring.load()
    finally:
        authoring.CONTENT = previous
    return runtime_common.package(PACKAGE, TITLE, [compile_entry(source[key]) for key in sorted(source)])
