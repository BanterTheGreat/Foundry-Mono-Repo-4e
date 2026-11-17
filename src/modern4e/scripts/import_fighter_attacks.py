"""Explicit offline migration aid; production reads reviewed JSON, never this importer."""
import argparse
import json
import re
from pathlib import Path

import compendium


def text(html):
    """Read inert source HTML without executing it."""
    parser = compendium.PlainText()
    parser.feed(html)
    return parser.text()


def adapt(value):
    """Use direct ability points and local skill names; never convert scores."""
    for old, new in (("Dungeoneering", "Nature"), ("Streetwise", "Society"),
                     ("History", "Society"), ("Heal", "Medicine")):
        value = re.sub(r"\b" + old + r"\b", new, value)
    value = re.sub(r"\b(Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma) modifier(s)?\b", r"\1", value)
    return value.replace("trained in ", "proficient in ")


def source_rows():
    """Select only class attack acquisitions, excluding utility/path/feature powers."""
    listing = compendium.payload(compendium.DATA / "power/_listing.js")
    rows = [dict(zip(listing[-2], row)) for row in listing[-1]]
    return sorted((row for row in rows if row["ClassName"] == "Fighter"
                   and row["Level"].isdigit() and 1 <= int(row["Level"]) <= 15
                   and row["Type"] in ("At-Will Attack", "Enc. Attack", "Daily Attack")),
                  key=lambda row: (int(row["Level"]), row["Type"], row["Name"], row["ID"]))


def convert(row, html):
    """Keep ordered rules, scoped attack outcomes and explicit unresolved structures."""
    original = text(html)
    lines = original.splitlines()
    start = next(i for i, line in enumerate(lines) if re.match(r"^(At-Will|Encounter|Daily)\s", line))
    usage = re.match(r"^(At-Will|Encounter|Daily)", lines[start])[1]
    action = re.match(r"(Immediate Interrupt|Immediate Reaction|Opportunity Action|Standard Action|Move Action|Minor Action|Free Action|No Action)\s*(.*)", lines[start + 1])
    if not action:
        raise ValueError(f"Unrecognized action for {row['ID']}")
    actions = {"Standard Action": "STANDARD", "Move Action": "MOVE", "Minor Action": "MINOR",
               "Free Action": "FREE", "No Action": "NO_ACTION", "Immediate Interrupt": "IMMEDIATE_INTERRUPT",
               "Immediate Reaction": "IMMEDIATE_REACTION", "Opportunity Action": "OPPORTUNITY"}
    frequency = {"At-Will": "AT_WILL", "Encounter": "ENCOUNTER", "Daily": "DAILY"}[usage]
    activation = dict(id="use", availability="ENTRY", action=actions[action[1]],
                      usage=dict(frequency=frequency, limits=[], costs=[], rules=[]),
                      bindings={"self": dict(kind="ACTOR", text="The power user.")},
                      range=dict(type="RULES_TEXT", text=adapt(action[2])), blocks=[])
    prereqs = [dict(type="level", minimum=int(row["Level"]))]
    body = lines[start + 2:]
    body = body[:next((i for i, line in enumerate(body) if line.startswith(("Published in ", "Update (", "Revision ("))), len(body))]
    current_attack = None
    current_target = None
    last = None
    limitations = ["Power selection is supported; combat execution, conditional weapon benefits, secondary actions and sustain rules require manual resolution."]
    for i, line in enumerate(body):
        label, sep, value = line.partition(":")
        label, value = (label.strip(), adapt(value.strip())) if sep else ("Rule", adapt(line))
        if not value:
            continue
        block = dict(id=f"row-{i + 1}", type="effect", label=label, text=value)
        if label == "Prerequisite":
            skill = re.fullmatch(r"You must be proficient in (Athletics|Endurance)\.", value)
            prereqs.append(dict(type="proficiency", skill=skill[1].upper()) if skill else
                           dict(type="unresolved", text=value, reason="Unadapted source prerequisite."))
        elif label in ("Requirement", "Trigger"):
            activation[label.lower()] = value
            continue
        elif label in ("Target", "Targets", "Primary Target", "Secondary Target", "Tertiary Target"):
            current_target = f"targets-{i + 1}"
            activation["bindings"][current_target] = dict(kind="TARGET_SET", text=value)
            if "targets" not in activation:
                activation["targets"] = current_target
                continue
        elif label in ("Attack", "Primary Attack", "Secondary Attack", "Tertiary Attack"):
            defense = re.search(r"\bvs\.\s*(AC|Fortitude|Reflex|Will)\b", value)
            if defense and current_target:
                # Complex attack counts/weapon alternatives stay explicit rules text.
                statistic = dict(type="RULES_TEXT", text=value)
                simple = re.fullmatch(r"(Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma) vs\. (AC|Fortitude|Reflex|Will)", value)
                if simple:
                    statistic = dict(type="ABILITY", ability=simple[1].upper())
                block.update(type="attack", actor="self", targets=current_target, range=activation["range"],
                             roll=dict(count=1, sharing="PER_TARGET", statistic=statistic),
                             comparisons=[dict(id="defense", defense={"AC": "AC", "Fortitude": "FORTITUDE", "Reflex": "REFLEX", "Will": "WILL"}[defense[1]], outcomes={})])
                if "twice" in value or "two attacks" in value:
                    block["roll"]["count"] = 2
                    if "distributing" in value:
                        block["roll"]["sharing"] = "ALL_TARGETS"
                if "If you target only one creature" in value:
                    # Variable count stays literal, not an invented fixed count.
                    for key in ("actor", "targets", "range", "roll", "comparisons"):
                        block.pop(key)
                    block["type"] = "effect"
                    activation["blocks"].append(block)
                    current_attack = None
                    last = block
                    continue
                current_attack = block
            else:
                current_attack = None
        elif label in ("Hit", "Miss") and current_attack:
            current_attack["comparisons"][0]["outcomes"].setdefault(label.lower(), []).append(block)
            last = block
            continue
        elif re.fullmatch(r"Level \d+", label) and last:
            last.setdefault("scaling", []).append(dict(atLevel=int(label.split()[1]), text=value))
            continue
        activation["blocks"].append(block)
        last = block
    # An attack without a structured outcome cannot claim an executable attack group.
    for block in activation["blocks"]:
        if block["type"] == "attack" and not block["comparisons"][0]["outcomes"]:
            for key in ("actor", "targets", "range", "roll", "comparisons"):
                block.pop(key)
            block["type"] = "effect"
    # Conditional attacks granted in prose remain literal, never runtime automation.
    publication = next((line for line in lines if line.startswith("Published in ")), row["SourceBook"])
    return dict(id="modern4e.power.fighter-" + row["ID"], title=row["Name"],
                description=adapt(" ".join(lines[1:start])) or row["Name"],
                flavor=adapt(" ".join(lines[1:start])) or row["Name"],
                access=dict(type="entry", entryId="modern4e.class.fighter"),
                prerequisites=prereqs[0] if len(prereqs) == 1 else dict(type="allOf", conditions=prereqs),
                selection=dict(maximum=1, constraints=[]), coverage=dict(status="UNIMPLEMENTED", limitations=limitations),
                rulesProfile="MODERN4E", source=dict(entryId=row["ID"], publication=publication, rulesText=original),
                keywords=[keyword.strip().upper().replace(" ", "_").replace("-", "_") for keyword in lines[start].split("✦", 1)[1].split(",")],
                choices=[], activations=[activation], subtitle=f"Fighter Attack {row['Level']}",
                level=int(row["Level"]), powerKind="ATTACK")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, required=True, help="New scratch JSON file for review")
    args = parser.parse_args()
    if args.output.exists() or args.output.resolve().is_relative_to((compendium.DATA.parent / "classes").resolve()):
        parser.error("Use a new scratch file; never overwrite reviewed authoritative powers")
    cache = {}
    powers = []
    for row in source_rows():
        path = compendium.batch_path("power", row["ID"])
        if path not in cache:
            cache[path] = compendium.payload(path)[-1]
        powers.append(convert(row, cache[path][row["ID"]]))
    args.output.write_text(json.dumps(dict(schemaVersion=2, powers=powers), ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Exported {len(powers)} Fighter attacks for review")


if __name__ == "__main__":
    main()
