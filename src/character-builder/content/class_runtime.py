"""Compile validated shared class data into the mechanics-v2 runtime contract.

The package is an engine input for #33; production bundle adoption remains #35.
Unsupported decisions/effects retain their complete authoring data and diagnostics.
"""
import importlib.util
import json
from pathlib import Path

SPEC = importlib.util.spec_from_file_location(
    "class_authoring", Path(__file__).resolve().parents[2] / "modern4e/scripts/class_content.py")
authoring = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(authoring)


def condition(node):
    """Preserve grouping and explicit gaps; no prose parsing or eligibility guesses."""
    kind = node["type"]
    if kind in ("allOf", "anyOf"):
        return {"type": kind, "conditions": [condition(child) for child in node["conditions"]]}
    if kind in ("always", "level", "entry", "abilityPoints", "proficiency",
                "classPowerSource", "equipmentProficiency", "unresolved"):
        return node
    return {"type": "unresolved", "text": json.dumps(node, ensure_ascii=False, sort_keys=True),
            "reason": "Condition requires an additional runtime fact vocabulary."}


def compile_entry(entry):
    """Map explicit authoring facts; preserve the source for unsupported consumers."""
    mechanics = {"version": 2, "access": condition(entry["access"]),
                 "prerequisites": [condition(entry["prerequisites"])],
                 "grants": [{"type": "entry", "grantId": g["id"], "entryId": g["entryId"],
                             "atLevel": g["atLevel"]} for g in entry.get("grants", [])],
                 "choices": [], "unsupported": [], "maximumSelections": entry["selection"]["maximum"]}
    for choice in entry.get("choices", []) if entry["category"] != "POWER" else []:
        if (choice["source"]["type"] != "entries" or type(choice["count"]) is not int
                or any(c["type"] != "distinct" for c in choice["constraints"])
                or "collection" in choice or "requiresCollection" in choice):
            mechanics["unsupported"].append(f"Choice {choice['id']} requires progression/collection support (#34).")
            continue
        mechanics["choices"].append({"type": "entries", "id": choice["id"], "count": choice["count"],
                                     "entryIds": choice["source"]["entryIds"], "atLevel": choice["atLevel"],
                                     "distinct": any(c["type"] == "distinct" for c in choice["constraints"])})
    if entry["category"] == "CLASS":
        stats = entry["statistics"]
        defense_abilities = {"FORTITUDE": ["STRENGTH", "CONSTITUTION"],
                             "REFLEX": ["INTELLIGENCE", "DEXTERITY"], "WILL": ["WISDOM", "CHARISMA"]}
        formulas = {name: {"base": value, "abilities": dict.fromkeys(defense_abilities[name], 1)}
                    for name, value in stats["defenses"].items()}
        for name, source in [("HIT_POINTS", "health"), ("HEALING_SURGES", "healingSurges")]:
            formula = stats[source]
            formulas[name] = {"base": formula["base"], "perLevel": formula.get("perLevel", 0),
                              "abilities": {"CONSTITUTION": formula["constitutionMultiplier"]}}
        mechanics["classProfile"] = {"role": entry["role"], "powerSources": entry["powerSources"],
                                     "mainAbilities": entry["abilities"]["main"],
                                     "secondaryAbilities": entry["abilities"]["secondary"],
                                     "proficiencies": entry["proficiencies"], "statistics": formulas}
    for key in ("selectionModifiers", "collections"):
        if entry.get(key):
            mechanics["unsupported"].append(f"{key} requires progression/collection support (#34).")
    mechanics["conditionalModifiers"] = entry.get("conditionalModifiers", [])
    mechanics["weaponAbilities"] = {row["weaponGroup"]: row["ability"] for row in entry.get("weaponAbilities", [])}
    boilerplate = "Shared authoring definition; runtime interpretation and combat effects are not implemented by this migration."
    limitations = [text for text in entry["coverage"]["limitations"] if text != boilerplate]
    limitations += mechanics["unsupported"] + [
        "Combat/session effects and power execution are not automated; conditional modifiers remain separate from unconditional totals."]
    coverage = {"status": "PARTIAL" if entry["category"] != "POWER" else "UNIMPLEMENTED",
                "limitations": limitations or ["Combat/session effects are not executed by the character builder."]}
    return {"id": entry["id"], "category": entry["category"],
            "presentation": {"title": entry["title"], "description": entry["description"]},
            "mechanics": mechanics, "coverage": coverage, "sharedData": entry}


def build(content=authoring.CONTENT, class_ids=None):
    """Validate all sources before emitting a deterministic, independently loadable package."""
    catalog = authoring.catalog(content)
    source = {e["id"]: e for e in catalog["entries"]}
    ids = set(source) if class_ids is None else set(class_ids)
    if class_ids is not None:
        authoring.require(all(key in source and source[key]["category"] == "CLASS" for key in ids),
                          "class_ids", "expected authoritative class IDs")
        pending = list(ids)
        while pending:
            entry = source[pending.pop()]
            refs = [g["entryId"] for g in entry.get("grants", [])]
            refs += [key for choice in entry.get("choices", []) if choice.get("source", {}).get("type") == "entries"
                     for key in choice["source"]["entryIds"]]
            for key in refs:
                if key in source and key not in ids:
                    ids.add(key)
                    pending.append(key)
    entries = [compile_entry(source[key]) for key in sorted(ids) if source[key]["category"] != "RULE"]
    package = "modern4e.classes"
    return {
        f"{package}/manifest.json": {"formatVersion": 2, "id": package, "revision": "1",
                                    "title": "Modern 4e shared classes", "indexes": ["index"], "chunks": ["entries"]},
        f"{package}/index.json": {"entries": [{"id": e["id"], "title": e["presentation"]["title"],
                                               "category": e["category"], "chunkId": "entries"} for e in entries]},
        f"{package}/entries.json": {"id": "entries", "entries": entries},
    }
