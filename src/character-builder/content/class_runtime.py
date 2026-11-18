"""Compile validated shared class data into the mechanics-v2 runtime contract.

The package supplies the shared engine and normal web/Android production bundles.
Unsupported decisions/effects retain their complete authoring data and diagnostics.
"""
import importlib.util
import json
from pathlib import Path

import runtime_common

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


def compile_choice(choice):
    """Preserve acquisition, pool, collection and whole-set rules independently."""
    count = choice["count"]
    result = {"type": "entries", "id": choice["id"], "count": count if type(count) is int else count["byLevel"][0]["count"],
              "atLevel": choice["atLevel"], "distinct": any(c["type"] == "distinct" for c in choice["constraints"])}
    extra = [c for c in choice["constraints"] if c["type"] != "distinct"]
    if extra:
        result["constraints"] = extra
    if type(count) is dict:
        result["countByLevel"] = count["byLevel"]
    for key in ("collection", "requiresCollection", "replacementLevels"):
        if key in choice:
            result[key] = choice[key]
    source = choice["source"]
    if source["type"] == "entries":
        result["entryIds"] = source["entryIds"]
    else:
        filters = source["filters"]
        query = {"category": source["category"]}
        for key in ("usage", "powerKind", "keywords", "pickKind"):
            if key in filters:
                query[key] = filters[key]
        maximum = filters.get("levelMaximum")
        if type(maximum) is int:
            query["levelMaximum"] = maximum
        elif maximum == "CHARACTER":
            query["characterLevel"] = True
        elif maximum == "SLOT":
            query["levelMaximum"] = choice["atLevel"]
        result["query"] = query
    return result


def compile_entry(entry):
    """Map explicit authoring facts; preserve the source for unsupported consumers."""
    mechanics = {"version": 2, "access": condition(entry["access"]),
                 "prerequisites": [condition(entry["prerequisites"])],
                 "grants": [{"type": "entry", "grantId": g["id"], "entryId": g["entryId"],
                             "atLevel": g["atLevel"],
                             **({"replacementEntryIds": g["replacementEntryIds"]} if g.get("replacementEntryIds") else {})}
                            for g in entry.get("grants", [])],
                 "choices": [], "unsupported": [], "maximumSelections": entry["selection"]["maximum"]}
    for choice in entry.get("choices", []) if entry["category"] != "POWER" else []:
        mechanics["choices"].append(compile_choice(choice))
    for key in ("selectionModifiers", "collections"):
        if entry.get(key):
            mechanics[key] = entry[key]
    if mechanics.get("selectionModifiers"):
        mechanics["selectionModifiers"] = [{**modifier, "count": modifier["count"]["byLevel"][0]["count"],
                                            "countByLevel": modifier["count"]["byLevel"]}
                                           if type(modifier["count"]) is dict else modifier
                                           for modifier in mechanics["selectionModifiers"]]
    if entry["category"] == "POWER" and "level" in entry and "powerKind" in entry:
        frequencies = {activation["usage"]["frequency"] for activation in entry["activations"]
                       if activation["availability"] == "ENTRY"}
        blocked = [node["text"] for node in (entry["prerequisites"].get("conditions") or [entry["prerequisites"]])
                   if node["type"] == "unresolved"] if entry["powerKind"] == "ATTACK" else []
        if blocked:
            # An attack that needs a build Modern 4e lacks can never become eligible, so it only resolves by ID.
            mechanics["unsupported"].append("Unresolved prerequisite; excluded from query pools: " + "; ".join(blocked))
        elif len(frequencies) == 1 and next(iter(frequencies)) in ("AT_WILL", "ENCOUNTER", "DAILY"):
            mechanics["powerProfile"] = {"level": entry["level"], "powerKind": entry["powerKind"],
                                         "usage": next(iter(frequencies)), "keywords": entry["keywords"]}
        else:
            mechanics["unsupported"].append("Ambiguous selectable power usage; excluded from query pools.")
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
    mechanics["conditionalModifiers"] = entry.get("conditionalModifiers", [])
    mechanics["weaponAbilities"] = {row["weaponGroup"]: row["ability"] for row in entry.get("weaponAbilities", [])}
    boilerplate = "Shared authoring definition; runtime interpretation and combat effects are not implemented by this migration."
    limitations = [text for text in entry["coverage"]["limitations"] if text != boilerplate]
    limitations += mechanics["unsupported"] + [
        "Combat/session effects and power execution are not automated; conditional modifiers remain separate from unconditional totals."]
    coverage = {"status": "PARTIAL" if entry["category"] != "POWER" else "UNIMPLEMENTED",
                "limitations": limitations or ["Combat/session effects are not executed by the character builder."]}
    description = entry["description"]
    if entry["category"] == "POWER" and entry.get("source", {}).get("rulesText"):
        # Render reviewed local rules, not the preserved unadapted source transcript.
        def lines(blocks):
            result = []
            for block in blocks:
                result.append(f"{block['label']}: {block['text']}")
                result += [f"Level {scale['atLevel']}: {scale['text']}" for scale in block.get("scaling", [])]
                for comparison in block.get("comparisons", []):
                    for children in comparison["outcomes"].values():
                        result += lines(children)
            return result
        parts = [description]
        for activation in entry["activations"]:
            parts.append(activation["usage"]["frequency"] + " / " + activation["action"])
            parts.append(activation["range"]["text"])
            for key in ("trigger", "requirement"):
                if key in activation:
                    parts.append(f"{key.title()}: {activation[key]}")
            if "targets" in activation:
                parts.append("Target: " + activation["bindings"][activation["targets"]]["text"])
            parts += lines(activation["blocks"])
        description = "\n\n".join(parts)
    return {"id": entry["id"], "category": entry["category"],
            "presentation": {"title": entry["title"], "description": description},
            "mechanics": mechanics, "coverage": coverage, "sharedData": entry}


def build(content=authoring.CONTENT, class_ids=None, include_advancement=True):
    """Validate all sources before emitting a deterministic, independently loadable package."""
    catalog = authoring.catalog(content)
    source = {e["id"]: e for e in catalog["entries"]}
    ids = set(source) if class_ids is None else set(class_ids)
    if class_ids is not None:
        authoring.require(all(key in source and source[key]["category"] == "CLASS" for key in ids),
                          "class_ids", "expected authoritative class IDs")
        if include_advancement:
            # Query pools are dependencies too; explicit old proof compilation
            # without advancement keeps its named finite fixture unchanged.
            ids.update(entry["id"] for entry in source.values() if entry["category"] == "POWER"
                       and "level" in entry and entry["access"].get("type") == "entry"
                       and entry["access"]["entryId"] in class_ids)
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
    for entry in entries:
        if entry["category"] == "CLASS" and include_advancement:
            entry["sharedData"] = {**entry["sharedData"], "runtimeReferences": catalog["references"],
                                   "runtimeAdvancementCoverage": catalog["advancement"]["coverage"]}
        if entry["category"] == "CLASS" and include_advancement:
            entry["mechanics"]["choices"] += [compile_choice(choice) for choice in catalog["advancement"]["powerChoices"]]
    # Selectable attack powers make the package large; each class's powers fill their own chunks so loaders can skip other classes.
    class_ids = {key for key, entry in source.items() if entry["category"] == "CLASS"}
    return runtime_common.package("modern4e.classes", "Modern 4e shared classes", entries, revision="4",
                                  scope=runtime_common.power_scope(class_ids))
