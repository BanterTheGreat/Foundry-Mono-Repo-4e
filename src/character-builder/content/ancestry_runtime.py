"""Compile validated shared ancestry data into the mechanics-v2 runtime contract.

One package, ``modern4e.ancestries``, carries every ancestry with its traits (features) and
ancestry powers. Size, speed, vision and languages stay in ``sharedData`` only. Decisions the
closed Mechanics vocabulary cannot express (damage types, ancestry exclusion, language picks)
are recorded in ``mechanics.unsupported`` and coverage limitations, never dropped or faked.
"""
import copy
import importlib.util
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


def compile_choice(choice):
    """Compile a finite power choice; return None for sources the vocabulary cannot express."""
    source = choice["source"]
    if "entryIds" not in source:
        return None
    return class_runtime.compile_choice({"id": choice["id"], "count": choice["count"], "atLevel": 1,
                                         "constraints": [],
                                         "source": {"type": "entries", "entryIds": source["entryIds"]}})


def unsupported_choice(choice):
    """Describe a decision (damage type, excluded-ancestry pick) that has no runtime vocabulary."""
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
        compiled = compile_choice(choice)
        if compiled:
            mechanics["choices"].append(compiled)
        else:
            unsupported.append(unsupported_choice(choice))
    if kind == "ANCESTRY":
        picks = entry["attributes"]["languages"]["choiceCount"]
        if picks:
            unsupported.append(f"Select {picks} additional language(s); the closed vocabulary has no language "
                               "decision and no complete language catalog is authored.")
    mechanics["unsupported"] += unsupported
    limitations = list(unsupported)
    if "note" in entry:
        limitations.append("Authoring note: " + entry["note"])
    if kind == "ANCESTRY":
        limitations.append("Size, speed, vision and languages are preserved in sharedData and are not applied "
                           "as modifiers by the character builder.")
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
