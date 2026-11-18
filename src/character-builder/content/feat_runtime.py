"""Compile the validated shared feat catalog into the mechanics-v2 runtime contract.

One package, ``modern4e.feats``, carries every authored feat. Access, prerequisites and the
occurrence limit are evaluated by the shared engine. Skill Training proficiency choices and
explicit multiclass qualification have PARTIAL coverage; other benefits stay UNIMPLEMENTED.
Decisions the closed vocabulary cannot express remain in
``mechanics.unsupported``, coverage limitations and ``sharedData``.

References to classes, ancestries and their features/powers stay ``entry`` conditions only
when the target exists in another runtime package. Every other reference (still pending or
outside the local roster) becomes an explicit ``unresolved`` condition so no dangling ID
reaches the engine.
"""
import importlib.util
import sys
from pathlib import Path

import class_runtime
import runtime_common

SCRIPTS = Path(__file__).resolve().parents[2] / "modern4e/scripts"
PACKAGE = "modern4e.feats"
TITLE = "Modern 4e shared feats"
REVISION = "1"
FEAT_PREFIX = "modern4e.feat."

SPEC = importlib.util.spec_from_file_location("feat_authoring", SCRIPTS / "feats.py")
feats = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(feats)


def _load_ancestry_ids():
    """Load ancestry IDs; the validator imports its sibling power validator by name."""
    sys.path.insert(0, str(SCRIPTS))
    try:
        spec = importlib.util.spec_from_file_location("feat_ancestry_authoring", SCRIPTS / "ancestry_content.py")
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        return set(module.load())
    finally:
        sys.path.remove(str(SCRIPTS))


def available_ids():
    """Non-feat IDs that exist in another runtime package (classes and ancestries)."""
    ids = {entry["id"] for entry in class_runtime.authoring.catalog()["entries"]
           if entry["category"] != "RULE"}
    return ids | _load_ancestry_ids()


def unresolved_reference(entry_id, references):
    """Explicit gap for a declared reference that has no runtime definition."""
    reference = references[entry_id]
    if reference["status"] == "UNAVAILABLE":
        detail = "is outside the local roster"
    else:
        detail = "has no shared runtime definition yet"
    return {"type": "unresolved", "text": reference["title"],
            "reason": f"{entry_id} ({reference['category']}) {detail}: {reference['status']}."}


def condition(node, context):
    """Compile one authored condition tree; grouping and every gap are preserved."""
    kind = node["type"]
    if kind in ("allOf", "anyOf"):
        return {"type": kind, "conditions": [condition(child, context) for child in node["conditions"]]}
    if kind == "entry":
        entry_id = node["entryId"]
        if entry_id in context["feat_ids"] or entry_id in context["available"]:
            return node
        if entry_id not in context["references"]:
            raise ValueError(f"undeclared reference {entry_id}")
        return unresolved_reference(entry_id, context["references"])
    if kind in ("size", "selected"):
        text = feats.condition_text(node, context["references"], context["titles"])
        return {"type": "unresolved", "text": text,
                "reason": f"Condition type {kind} requires an additional runtime fact vocabulary."}
    return class_runtime.condition(node)


def unresolved_nodes(node):
    """Every unresolved leaf of a compiled condition tree, in authored order."""
    if node["type"] in ("allOf", "anyOf"):
        return [leaf for child in node["conditions"] for leaf in unresolved_nodes(child)]
    return [node] if node["type"] == "unresolved" else []


def grants_skill_proficiency(entry, choice):
    """A skill choice is a proficiency grant only when its authored constraint says so."""
    return choice["kind"] == "SKILL" and any(
        rule["type"] == "distinct" and rule["choiceId"] == choice["id"] and
        rule["against"] == {"scope": "CHARACTER", "fact": "SKILL_PROFICIENCY"}
        for rule in entry["selection"]["constraints"])


def compile_choices(entry):
    """Return (runtime choices, unsupported notes) for the authored choices."""
    stem = entry["id"][len(FEAT_PREFIX):]
    choices, unsupported = [], []
    for choice in entry.get("choices", []):
        source = choice["source"]
        if grants_skill_proficiency(entry, choice):
            choices.append({"type": "proficiencies", "id": f"modern4e.choice.{stem}.{choice['id']}",
                            "count": choice["count"], "skills": source["values"],
                            "distinctAgainstCharacter": True})
        elif source["type"] == "catalog":
            unsupported.append(f"Choice {choice['id']}: select {choice['count']} {choice['kind']} from the "
                               f"{source['catalog']} catalog; the option catalog is pending migration.")
        else:
            unsupported.append(f"Choice {choice['id']}: select {choice['count']} {choice['kind']} from "
                               f"{', '.join(source['values'])}; the closed vocabulary cannot apply this decision.")
    return choices, unsupported


def constraint_note(rule):
    """Describe an authored selection constraint that the engine does not enforce."""
    if rule["type"] == "advance":
        return (f"Selection constraint: each selection advances {rule['steps']} step in {rule['fact']} "
                f"({' > '.join(rule['order'])}); not enforced.")
    target = rule["against"]
    scope = target["scope"] if "fact" not in target else f"{target['scope']} {target['fact']}"
    if "entryId" in target:
        scope += f" ({target['entryId']})"
    return (f"Selection constraint: choice {rule['choiceId']} must be distinct against {scope}; "
            f"when exhausted {rule['whenExhausted']}; not enforced.")


def compile_feat(entry, context, requirement_text, selection_text):
    """Map one authored feat; the complete authored entry stays in sharedData."""
    access = condition(entry["access"], context)
    prerequisite = condition(entry["prerequisites"], context)
    choices, unsupported = compile_choices(entry)
    enforced = {choice["id"] for choice in entry.get("choices", []) if grants_skill_proficiency(entry, choice)}
    unsupported += [constraint_note(rule) for rule in entry["selection"]["constraints"]
                    if not (rule["type"] == "distinct" and rule["choiceId"] in enforced)]
    automated = bool(choices) or "MULTICLASS" in entry.get("tags", []) and bool(entry.get("multiclassFor"))
    limitations = ["Only declared proficiency choices and explicit multiclass qualification are automated; "
                    "other feat benefits require manual resolution." if automated else
                    "Feat benefits are descriptive text; no feat effect is automated by the character builder."]
    for label, tree in (("Access", access), ("Prerequisite", prerequisite)):
        for leaf in unresolved_nodes(tree):
            limitations.append(f"{label} not evaluated: {leaf['text']} ({leaf['reason']})")
    limitations += unsupported
    shared = dict(entry)
    if requirement_text:
        shared["runtimeRequirementText"] = requirement_text
    if selection_text:
        shared["runtimeSelectionText"] = selection_text
    mechanics = {"version": 2, "access": access, "prerequisites": [prerequisite],
                 "grants": [], "choices": choices, "unsupported": unsupported,
                 "maximumSelections": entry["selection"]["maximum"]}
    if "MULTICLASS" in entry.get("tags", []) and entry.get("multiclassFor"):
        mechanics["multiclassFor"] = entry["multiclassFor"]
    return {"id": entry["id"], "category": "FEAT",
            "presentation": {"title": entry["title"], "description": entry["description"]},
            "mechanics": mechanics,
            "coverage": {"status": "PARTIAL" if automated else "UNIMPLEMENTED", "limitations": limitations},
            "sharedData": shared}


def build(content=None, available=None):
    """Validate the authored feats, then emit the deterministic ``modern4e.feats`` package."""
    catalog = feats.catalog(feats.CONTENT if content is None else content)
    context = {"references": catalog["references"],
               "feat_ids": {entry["id"] for entry in catalog["entries"]},
               "titles": {entry["id"]: entry["title"] for entry in catalog["entries"]},
               "available": available_ids() if available is None else set(available)}
    entries = [compile_feat(entry, context, catalog["requirementText"][entry["id"]],
                            catalog["selectionText"][entry["id"]]) for entry in catalog["entries"]]
    return runtime_common.package(PACKAGE, TITLE, entries, revision=REVISION)
