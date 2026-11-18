"""Reusable authoring validation for entry selection rules and granted choices.

This module does not evaluate characters or provide category-wide defaults.
Consumers supply their vocabulary and explicitly authored selection rules.
"""


def require(condition, where, message):
    if not condition:
        raise ValueError(f"{where}: {message}")


def fields(value, required, optional, where):
    require(isinstance(value, dict), where, "expected object")
    require(set(required) <= value.keys(), where, f"missing fields {sorted(set(required) - value.keys())}")
    require(value.keys() <= set(required + optional), where, f"unknown fields {sorted(value.keys() - set(required + optional))}")


def positive(value, where):
    require(type(value) is int and 1 <= value <= 2**31 - 1, where, "expected positive integer")


def validate(selection, choices, references, value_sets, where):
    """Validate limits, choice references and distinctness scopes before export."""
    fields(selection, ["maximum", "constraints"], [], f"{where}.selection")
    if selection["maximum"] is not None:
        positive(selection["maximum"], f"{where}.selection.maximum")
    require(isinstance(choices, list), f"{where}.choices", "expected choices array")
    by_id = {}
    for index, choice in enumerate(choices):
        loc = f"{where}.choices[{index}]"
        fields(choice, ["id", "kind", "count", "source"], [], loc)
        key = choice["id"]
        require(isinstance(key, str) and bool(key.strip()), loc, "expected nonblank choice ID")
        require(key not in by_id, loc, f"duplicate choice ID {key}")
        require(choice["kind"] in ("SKILL", "LANGUAGE", "WEAPON_PROFICIENCY", "DAMAGE_TYPE"), loc, "unknown choice kind")
        positive(choice["count"], f"{loc}.count")
        source = choice["source"]
        require(isinstance(source, dict), f"{loc}.source", "expected source object")
        if source.get("type") == "values":
            fields(source, ["type", "values"], [], f"{loc}.source")
            values = source["values"]
            require(isinstance(values, list) and all(isinstance(v, str) and v.strip() for v in values), loc, "expected nonblank option values")
            require(len(set(values)) == len(values) and len(values) >= choice["count"], loc, "duplicate options or insufficient distinct options")
            require(choice["kind"] in value_sets and all(v in value_sets[choice["kind"]] for v in values), loc, "unknown option for choice kind")
        elif source.get("type") == "catalog":
            require(choice["kind"] in ("LANGUAGE", "WEAPON_PROFICIENCY"), loc, "catalog must match the choice kind")
            if choice["kind"] == "LANGUAGE":
                fields(source, ["type", "catalog"], [], f"{loc}.source")
                require(source["catalog"] == "LANGUAGE", loc, "catalog must match the choice kind")
            else:
                fields(source, ["type", "catalog", "filters", "bundles"], [], f"{loc}.source")
                require(source["catalog"] == "WEAPON", loc, "catalog must match the choice kind")
                fields(source["filters"], ["proficiencyCategory"], [], f"{loc}.source.filters")
                require(source["filters"]["proficiencyCategory"] == "SUPERIOR", loc, "expected superior weapon pool")
                require(source["bundles"] == [{"id": "simple-and-military", "proficiencyCategories": ["SIMPLE", "MILITARY"]}], loc, "expected simple-and-military proficiency bundle")
        else:
            raise ValueError(f"{loc}.source: unknown choice source")
        by_id[key] = choice
    constraints = selection["constraints"]
    require(isinstance(constraints, list), f"{where}.selection.constraints", "expected constraint array")
    constrained = set()
    advancement = False
    for index, rule in enumerate(constraints):
        loc = f"{where}.selection.constraints[{index}]"
        require(isinstance(rule, dict), loc, "expected constraint object")
        if rule.get("type") == "distinct":
            fields(rule, ["type", "choiceId", "against", "whenExhausted"], [], loc)
            key = rule["choiceId"]
            require(isinstance(key, str) and key in by_id, loc, "unknown choiceId")
            require(key not in constrained, loc, "duplicate distinct constraint for choice")
            constrained.add(key)
            require(rule["whenExhausted"] in ("BLOCK", "ALLOW_REPEAT"), loc, "unknown exhaustion policy")
            target = rule["against"]
            require(isinstance(target, dict), loc, "expected distinctness target")
            scope = target.get("scope")
            kind = by_id[key]["kind"]
            if scope == "ENTRY":
                fields(target, ["scope"], [], loc)
            elif scope == "CHARACTER":
                fields(target, ["scope", "fact"], [], loc)
                expected = {"SKILL": "SKILL_PROFICIENCY", "LANGUAGE": "LANGUAGE"}.get(kind)
                require(expected is not None and target["fact"] == expected, loc, "character fact must match the choice kind")
            elif scope == "POWER":
                fields(target, ["scope", "fact", "entryId"], [], loc)
                key = target["entryId"]
                require(kind == "DAMAGE_TYPE" and target["fact"] == "DAMAGE_TYPE", loc, "power distinctness needs damage types")
                require(isinstance(key, str) and key in references and references[key]["category"] == "POWER", loc, "expected declared power reference")
            else:
                raise ValueError(f"{loc}: unknown distinctness scope")
        elif rule.get("type") == "advance":
            fields(rule, ["type", "fact", "order", "steps"], [], loc)
            require(not advancement, loc, "duplicate advancement constraint")
            advancement = True
            require(rule["fact"] == "ARMOR_PROFICIENCY", loc, "unknown progression fact")
            require(rule["order"] == ["CLOTH", "LEATHER", "HIDE", "CHAINMAIL", "SCALE", "PLATE"], loc, "expected Modern 4e armor progression")
            require(type(rule["steps"]) is int and rule["steps"] == 1, loc, "armor advances one step")
        else:
            raise ValueError(f"{loc}: unknown selection constraint")


def special_text(entry, references, noun="entry"):
    """Render selection-only prose from data; never inspect the entry's title or ID."""
    selection = entry["selection"]
    maximum = selection["maximum"]
    if maximum == 1:
        return ""
    sentences = [f"You can take this {noun} more than once." if maximum is None else f"You can take this {noun} up to {maximum} times."]
    choices = {choice["id"]: choice for choice in entry.get("choices", [])}
    labels = {"SKILL": ("skill", "skills"), "LANGUAGE": ("language", "languages"), "WEAPON_PROFICIENCY": ("weapon proficiency option", "weapon proficiency options"), "DAMAGE_TYPE": ("damage type", "damage types")}
    for rule in selection["constraints"]:
        if rule["type"] == "advance":
            sentences.append(f"Each time, advance one step in the armor proficiency progression, up to {rule['order'][-1].title()}.")
            continue
        choice = choices[rule["choiceId"]]
        scope = rule["against"]["scope"]
        label = labels[choice["kind"]][0 if choice["count"] == 1 else 1]
        if scope == "CHARACTER":
            ending = "you are not already proficient in" if choice["kind"] == "SKILL" else "you do not already know"
        elif scope == "POWER":
            power = references[rule["against"]["entryId"]]["title"]
            ending = f"that {power} does not already deal"
        else:
            ending = f"not chosen for previous selections of this {noun}"
        sentences.append(f"Each time, choose {choice['count']} {label} {ending}.")
        if rule["whenExhausted"] == "ALLOW_REPEAT":
            sentences.append("If all those options have already been chosen, you may repeat a previous choice.")
    return " ".join(sentences)


def limitations(entry, references, available_catalogs=()):
    """Expose pending choice catalogs and target definitions without claiming automation."""
    gaps = [f"Choice {c['id']}: {c['source']['catalog']} option catalog is pending migration."
            for c in entry.get("choices", []) if c["source"]["type"] == "catalog" and
            c["source"]["catalog"] not in available_catalogs]
    for rule in entry["selection"]["constraints"]:
        if rule["type"] == "distinct" and rule["against"]["scope"] == "POWER":
            key = rule["against"]["entryId"]
            gaps.append(f"{key}: {references[key]['status']}")
    return gaps
