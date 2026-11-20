"""Compile the shared utility power authoring into the mechanics-v2 `modern4e.utilities` package.

Every authored utility (class, skill and power-source sections) is emitted so entry IDs resolve,
but only entries in AVAILABLE sections receive a ``powerProfile`` and therefore join query pools.
Entries in DEFERRED (withheld) sections keep their access and prerequisites yet carry no profile,
an explicit ``unsupported`` note and an unreviewed plain description. Section metadata (kind,
availability, pick kinds) travels in ``sharedData.utilitySection``; nothing is parsed from prose.
"""
import importlib.util
import json
from pathlib import Path
import sys

import class_runtime
import runtime_common

PACKAGE = "modern4e.utilities"
TITLE = "Modern 4e shared utility powers"
SCRIPTS = Path(__file__).resolve().parents[2] / "modern4e/scripts"
WITHHELD = "Withheld pending review (DEFERRED section); excluded from query pools."


def _load_authoring():
    """Load the utility authoring loader, which imports its sibling scripts by module name."""
    sys.path.insert(0, str(SCRIPTS))
    try:
        spec = importlib.util.spec_from_file_location("utility_authoring", SCRIPTS / "utility_content.py")
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        return module
    finally:
        sys.path.remove(str(SCRIPTS))


authoring = _load_authoring()


def resolve(node, known):
    """Replace entry conditions that reference unknown IDs with explicit unresolved conditions."""
    if node["type"] in ("allOf", "anyOf"):
        return {**node, "conditions": [resolve(child, known) for child in node["conditions"]]}
    if node["type"] == "entry" and node["entryId"] not in known:
        return {"type": "unresolved", "text": json.dumps(node, ensure_ascii=False, sort_keys=True),
                "reason": "Referenced entry is not defined by any authored catalog."}
    return node


def section_metadata(section, power_id):
    """Runtime-relevant selection metadata for one power, copied from its authoring section."""
    result = {"id": section["id"], "kind": section["kind"], "availability": section["availability"],
              "pickKinds": section["pickKinds"][power_id]}
    for key in ("classId", "powerSource"):
        if key in section:
            result[key] = section[key]
    return result


def compile_utility(power, section, known):
    """Compile one authored utility; only AVAILABLE sections produce selectable pool members."""
    authored = {**power, "category": "POWER"}
    available = section["availability"] == "AVAILABLE"
    # Utility powers carry reviewed local rules in their ordered blocks and no transcript, so the
    # existing renderer is reused; the marker is not kept. Withheld powers stay unrendered.
    working = {**authored, "access": resolve(power["access"], known),
               "prerequisites": resolve(power["prerequisites"], known)}
    if available:
        # compile_entry's renderer reads range["text"], which PERSONAL ranges (the only non-literal
        # range in this catalog) do not carry; the rendering copy names the authored range type.
        working["source"] = {**power["source"], "rulesText": True}
        working["activations"] = [
            {**activation, "range": {**activation["range"], "text": "Personal"}}
            if activation["range"]["type"] == "PERSONAL" else activation for activation in power["activations"]]
    entry = class_runtime.compile_entry(working)
    if available and "powerProfile" in entry["mechanics"]:
        entry["mechanics"]["powerProfile"]["pickKinds"] = section["pickKinds"][power["id"]]
    if not available:
        entry["mechanics"].pop("powerProfile", None)
        entry["mechanics"]["unsupported"].append(WITHHELD)
        entry["coverage"] = runtime_common.coverage(entry["coverage"]["limitations"] + [WITHHELD])
    entry["sharedData"] = {**authored, "utilitySection": section_metadata(section, power["id"])}
    return entry


def build(content=None):
    """Validate the utility inventory and emit the deterministic `modern4e.utilities` asset map."""
    content = Path(content) if content is not None else authoring.CONTENT
    catalog, powers = authoring.load(content)
    class_entries = class_runtime.authoring.catalog(content / "classes")["entries"]
    known = set(powers) | {entry["id"] for entry in class_entries}
    class_ids = {entry["id"] for entry in class_entries if entry["category"] == "CLASS"}
    entries = []
    for section in catalog["sections"]:
        for power_id in section["powerIds"]:
            entries.append(compile_utility(powers[power_id], section, known))
    return runtime_common.package(PACKAGE, TITLE, entries, revision="3", scope=runtime_common.power_scope(class_ids))
