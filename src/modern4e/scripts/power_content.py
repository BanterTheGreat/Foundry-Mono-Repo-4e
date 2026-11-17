"""Ordered power authoring used by class export and the Typst power renderer.

Validate structure and explicit relationships without interpreting rules prose.
Published-reference fixtures remain experimental; runtime combat is unimplemented.
Ancestry power contracts remain independently versioned.
"""
import argparse
import importlib.util
from pathlib import Path

_spec = importlib.util.spec_from_file_location("power_shared", Path(__file__).with_name("class_content.py"))
shared = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(shared)
fields, require, string = shared.fields, shared.require, shared.string
enum, integer, array = shared.enum, shared.integer, shared.array
DEFAULT = Path(__file__).with_name("fixtures") / "powers" / "catalog.json"


def strings(items, where, nonempty=False):
    """Validate an ordered list of distinct nonblank strings."""
    array(items, where, nonempty)
    for item in items:
        string(item, where)
    require(len(items) == len(set(items)), where, "duplicate values")


def leveled(value, where):
    """A base count plus replacement values at ascending level thresholds."""
    fields(value, ["base"], ["byLevel"], where)
    integer(value["base"], where, 1)
    levels = []
    array(value.get("byLevel", []), where)
    for row in value.get("byLevel", []):
        fields(row, ["atLevel", "value"], [], where)
        integer(row["atLevel"], where, 2, 30)
        integer(row["value"], where, 1)
        levels.append(row["atLevel"])
    require(levels == sorted(set(levels)), where, "levels must be unique and ascending")


def validate(document):
    """Validate a closed catalog and all local references before returning it."""
    fields(document, ["schemaVersion", "kind", "references", "powers"], [], "catalog")
    require(type(document["schemaVersion"]) is int and document["schemaVersion"] == 1, "catalog", "unsupported schemaVersion")
    enum(document["kind"], ["modern4e.power-authoring-experimental"], "catalog")
    references = document["references"]
    require(isinstance(references, dict), "references", "expected object")
    for key, ref in references.items():
        string(key, "references")
        fields(ref, ["category", "title", "status"], [], key)
        enum(ref["category"], ["CLASS", "ANCESTRY", "FEATURE", "POWER", "FEAT"], key)
        enum(ref["status"], ["PENDING_MIGRATION", "UNAVAILABLE"], key)
        string(ref["title"], key)
    array(document["powers"], "powers", True)
    ids = []
    for power in document["powers"]:
        validate_power(power, references)
        ids.append(power["id"])
    require(len(ids) == len(set(ids)), "powers", "duplicate power IDs")
    require(not set(ids) & references.keys(), "references", "definition shadows reference")
    return document


def validate_power(power, references):
    """Validate a power's presentation tree, activations and structural links."""
    fields(power, ["id", "title", "description", "access", "prerequisites", "selection", "coverage", "rulesProfile", "source", "keywords", "choices", "activations"], ["level", "powerKind", "flavor", "note", "subtitle"], "power")
    loc = power["id"]
    for key in ("id", "title", "description"):
        string(power[key], "power." + key)
    if "level" in power:
        integer(power["level"], loc, 1, 30)
    if "powerKind" in power:
        enum(power["powerKind"], ["ATTACK", "UTILITY"], loc)
    for key in ("flavor", "note", "subtitle"):
        if key in power:
            string(power[key], loc)
    enum(power["rulesProfile"], ["MODERN4E", "PUBLISHED_REFERENCE"], loc)
    fields(power["source"], ["entryId", "publication"], ["rulesText"], loc)
    require(power["rulesProfile"] != "PUBLISHED_REFERENCE" or "rulesText" in power["source"], loc, "published fixtures require preserved source text")
    for value in power["source"].values():
        string(value, loc)
    for key in ("access", "prerequisites"):
        shared.shared.validate_condition(power[key], references, set(), loc + "." + key)
    shared.shared.selection_rules.validate(power["selection"], [], references, {}, loc + ".selection")
    shared.coverage(power["coverage"], loc)
    require(power["coverage"]["status"] == "UNIMPLEMENTED", loc, "experimental contract has no runtime support")
    strings(power["keywords"], loc)
    require(not {"PSIONIC", "AUGMENTABLE", "FULL_DISCIPLINE"} & set(power["keywords"]), loc, "Psionics and Monk disciplines are out of scope")
    array(power["choices"], loc)
    choices = {}
    for choice in power["choices"]:
        fields(choice, ["id", "timing", "options"], [], loc)
        string(choice["id"], loc)
        enum(choice["timing"], ["ACQUISITION", "ACTIVATION"], loc)
        strings(choice["options"], loc, True)
        require(choice["id"] not in choices, loc, "duplicate choice ID")
        choices[choice["id"]] = choice
    array(power["activations"], loc, True)
    activations = {}
    for activation in power["activations"]:
        fields(activation, ["id", "availability", "action", "usage", "bindings", "blocks"], ["trigger", "requirement", "range", "targets", "title", "special"], loc)
        aid = activation["id"]
        string(aid, loc)
        require(aid not in activations, loc, "duplicate activation ID")
        activations[aid] = activation
    require(any(a["availability"] == "ENTRY" for a in activations.values()), loc, "missing entry activation")
    grants = []
    for aid, activation in activations.items():
        here = loc + ".activations." + aid
        enum(activation["availability"], ["ENTRY", "GRANTED"], here)
        enum(activation["action"], shared.ACTIONS, here)
        if "title" in activation:
            string(activation["title"], here)
        if "special" in activation:
            require(type(activation["special"]) is bool, here, "expected special boolean")
        for key in ("trigger", "requirement"):
            if key in activation:
                string(activation[key], here)
        usage(activation["usage"], here)
        bindings = activation["bindings"]
        require(isinstance(bindings, dict), here, "expected bindings object")
        for bid, binding in bindings.items():
            string(bid, here)
            fields(binding, ["kind", "text"], ["fromAttack"], here)
            enum(binding["kind"], ["ACTOR", "TARGET_SET", "ORIGIN", "ENTITY"], here)
            string(binding["text"], here)
        blocks, links = {}, []

        def binding_ref(value, kinds):
            string(value, here)
            require(value in bindings and bindings[value]["kind"] in kinds, here, "missing or wrong-kind binding " + value)

        def predicate(value):
            fields(value, ["type", "text"], ["attackId", "comparisonId", "outcome", "count"], here)
            enum(value["type"], ["RULES_TEXT", "ATTACK_RESULTS"], here)
            string(value["text"], here)
            if value["type"] == "ATTACK_RESULTS":
                require(set(value) == {"type", "text", "attackId", "comparisonId", "outcome", "count"}, here, "incomplete attack-results predicate")
                string(value["comparisonId"], here)
                enum(value["outcome"], ["HIT", "MISS"], here)
                integer(value["count"], here, 1)
                links.append((value["attackId"], value["comparisonId"], value["count"]))
            else:
                require(set(value) == {"type", "text"}, here, "rules-text predicate cannot claim structured results")

        if "range" in activation:
            geometry(activation["range"], binding_ref, here)
        if "targets" in activation:
            binding_ref(activation["targets"], ["TARGET_SET"])

        def walk(items, depth=0):
            require(depth <= 16, here, "block nesting exceeds 16")
            array(items, here, True)
            for block in items:
                require(isinstance(block, dict), here, "expected block object")
                kind = block.get("type")
                extra = {"effect": [], "attack": ["actor", "targets", "range", "roll", "comparisons"], "choice": ["options"], "conditional": ["when", "blocks"], "repeat": ["while", "blocks"], "persistent": ["duration", "blocks"], "trigger": ["event", "blocks"], "table": ["die", "results"], "grant": ["activationId", "duration"]}
                require(isinstance(kind, str) and kind in extra, here, "unknown block type")
                fields(block, ["id", "type", "label", "text"] + extra[kind], ["scaling"], here)
                for key in ("id", "label", "text"):
                    string(block[key], here)
                require(block["id"] not in blocks, here, "duplicate block ID")
                blocks[block["id"]] = block
                scaling(block.get("scaling", []), here)
                if kind == "attack":
                    binding_ref(block["actor"], ["ACTOR", "ENTITY"])
                    binding_ref(block["targets"], ["TARGET_SET"])
                    geometry(block["range"], binding_ref, here)
                    roll = block["roll"]
                    fields(roll, ["count", "sharing", "statistic"], [], here)
                    integer(roll["count"], here, 1)
                    enum(roll["sharing"], ["PER_TARGET", "ALL_TARGETS"], here)
                    statistic = roll["statistic"]
                    fields(statistic, ["type"], ["ability", "choiceId", "text"], here)
                    enum(statistic["type"], ["ABILITY", "CHOICE", "RULES_TEXT"], here)
                    field = {"ABILITY": "ability", "CHOICE": "choiceId", "RULES_TEXT": "text"}[statistic["type"]]
                    require(set(statistic) == {"type", field}, here, "invalid statistic fields")
                    if field == "ability":
                        enum(statistic[field], shared.ABILITIES + ["MAIN"], here)
                    elif field == "choiceId":
                        string(statistic[field], here)
                        require(statistic[field] in choices, here, "unknown acquisition/activation choice")
                        require(set(choices[statistic[field]]["options"]) <= set(shared.ABILITIES + ["MAIN"]), here, "attack ability choice must contain abilities")
                    else:
                        string(statistic[field], here)
                    array(block["comparisons"], here, True)
                    comparison_ids = []
                    for comparison in block["comparisons"]:
                        fields(comparison, ["id", "defense", "outcomes"], [], here)
                        string(comparison["id"], here)
                        comparison_ids.append(comparison["id"])
                        enum(comparison["defense"], ["AC", "FORTITUDE", "REFLEX", "WILL"], here)
                        fields(comparison["outcomes"], [], ["hit", "miss"], here)
                        require(bool(comparison["outcomes"]), here, "empty outcomes")
                        for children in comparison["outcomes"].values():
                            walk(children, depth + 1)
                    require(len(comparison_ids) == len(set(comparison_ids)), here, "duplicate comparison ID")
                elif kind == "choice":
                    array(block["options"], here, True)
                    option_ids = []
                    for option in block["options"]:
                        fields(option, ["id", "title", "blocks"], [], here)
                        string(option["id"], here)
                        string(option["title"], here)
                        option_ids.append(option["id"])
                        walk(option["blocks"], depth + 1)
                    require(len(option_ids) == len(set(option_ids)), here, "duplicate option ID")
                elif kind in ("conditional", "repeat"):
                    predicate(block["when" if kind == "conditional" else "while"])
                    walk(block["blocks"], depth + 1)
                elif kind in ("persistent", "trigger"):
                    string(block["duration" if kind == "persistent" else "event"], here)
                    walk(block["blocks"], depth + 1)
                elif kind == "table":
                    integer(block["die"], here, 2, 100)
                    array(block["results"], here, True)
                    faces = []
                    for result in block["results"]:
                        fields(result, ["faces", "blocks"], [], here)
                        array(result["faces"], here, True)
                        for face in result["faces"]:
                            integer(face, here, 1, block["die"])
                            faces.append(face)
                        walk(result["blocks"], depth + 1)
                    require(sorted(faces) == list(range(1, block["die"] + 1)), here, "table must cover every face exactly once")
                elif kind == "grant":
                    target = block["activationId"]
                    string(target, here)
                    require(target in activations and activations[target]["availability"] == "GRANTED", here, "grant must reference granted activation")
                    string(block["duration"], here)
                    grants.append((aid, target))

        walk(activation["blocks"])
        for target, comparison, count in links:
            require(isinstance(target, str) and target in blocks and blocks[target]["type"] == "attack", here, "missing or wrong-kind attack reference")
            require(comparison in {c["id"] for c in blocks[target]["comparisons"]}, here, "missing comparison reference")
            require(count <= blocks[target]["roll"]["count"], here, "result count exceeds attack roll count")
        for binding in bindings.values():
            if "fromAttack" in binding:
                origin = binding["fromAttack"]
                fields(origin, ["attackId", "part"], [], here)
                string(origin["attackId"], here)
                target = blocks.get(origin["attackId"])
                require(target is not None and target["type"] == "attack", here, "missing binding attack reference")
                enum(origin["part"], ["TARGETS", "ACTOR"], here)
                kinds = ["ORIGIN", "TARGET_SET"] if origin["part"] == "TARGETS" else ["ORIGIN", "ACTOR", "ENTITY"]
                require(binding["kind"] in kinds, here, "incompatible binding projection")
    granted = {target for _, target in grants}
    require(all(a["availability"] != "GRANTED" or aid in granted for aid, a in activations.items()), loc, "orphan granted activation")
    def visit(aid, path):
        require(aid not in path, loc, "cyclic activation grant")
        for owner, target in grants:
            if owner == aid:
                visit(target, path | {aid})
    for aid in activations:
        visit(aid, set())


def geometry(value, binding_ref, where):
    """Separate area size, placement distance and origin; alternatives stay explicit."""
    fields(value, ["type"], ["distance", "size", "origin", "options", "text"], where)
    kind = value["type"]
    enum(kind, ["PERSONAL", "MELEE", "RANGED", "CLOSE_BURST", "CLOSE_BLAST", "AREA_BURST", "WALL", "CHOICE", "RULES_TEXT"], where)
    required = {"PERSONAL": [], "MELEE": ["distance", "origin"], "RANGED": ["distance", "origin"], "CLOSE_BURST": ["size", "origin"], "CLOSE_BLAST": ["size", "origin"], "AREA_BURST": ["size", "distance", "origin"], "WALL": ["size", "distance", "origin"], "CHOICE": ["options"], "RULES_TEXT": ["text"]}[kind]
    allowed = {"type", *required}
    if kind == "AREA_BURST":
        required = ["size", "origin"]
    require({"type", *required} <= set(value) <= allowed, where, "invalid geometry fields")
    for key in ("distance", "size"):
        if key in value:
            if value[key] in ("WEAPON", "TOUCH"):
                require(kind in ("MELEE", "RANGED") and key == "distance", where, "invalid symbolic range")
            else:
                leveled(value[key], where)
    if "origin" in value:
        binding_ref(value["origin"], ["ACTOR", "ENTITY", "ORIGIN"])
    if kind == "CHOICE":
        array(value["options"], where, True)
        for option in value["options"]:
            require(isinstance(option, dict) and option.get("type") != "CHOICE", where, "nested geometry choice")
            geometry(option, binding_ref, where)
    if kind == "RULES_TEXT":
        string(value["text"], where)


def scaling(rows, where):
    """Preserve level-dependent rule replacements without parsing their prose."""
    array(rows, where)
    levels = []
    for row in rows:
        fields(row, ["atLevel", "text"], [], where)
        integer(row["atLevel"], where, 2, 30)
        string(row["text"], where)
        levels.append(row["atLevel"])
    require(levels == sorted(set(levels)), where, "scaling levels must be unique and ascending")


def usage(value, where):
    """Validate independent limits and explicit unautomated expenditure rules."""
    fields(value, ["frequency", "limits", "costs", "rules"], [], where)
    enum(value["frequency"], ["AT_WILL", "ENCOUNTER", "DAILY"], where)
    array(value["limits"], where)
    periods = []
    for limit in value["limits"]:
        fields(limit, ["period", "maximum"], ["poolId"], where)
        enum(limit["period"], ["TURN", "ROUND", "ENCOUNTER", "DAY"], where)
        leveled(limit["maximum"], where)
        if "poolId" in limit:
            string(limit["poolId"], where)
        periods.append((limit["period"], limit.get("poolId")))
    require(len(periods) == len(set(periods)), where, "duplicate usage limit")
    strings(value["costs"], where)
    strings(value["rules"], where)


def main():
    """Read-only validation; never rewrite production power definitions."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--content", type=Path, default=DEFAULT)
    args = parser.parse_args()
    data = validate(shared.shared.load_json(args.content))
    print(f"Validated {len(data['powers'])} experimental power fixtures; runtime coverage UNIMPLEMENTED.")


if __name__ == "__main__":
    main()
