"""Explicit offline migration aid for class attack powers; production reads reviewed JSON, never this importer."""
import argparse
import json
import re
from pathlib import Path

import compendium
import feats


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
    # "Strength (melee) or Dexterity (ranged) modifier" shares one trailing noun.
    value = re.sub(r"(\b(?:Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma) \([a-z ]+\) or "
                   r"(?:Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma) \([a-z ]+\)) modifiers?\b", r"\1", value)
    return value.replace("trained in ", "proficient in ")


def source_rows(class_name="Fighter"):
    """Select only one class's attack acquisitions, excluding utility/path/feature powers."""
    listing = compendium.payload(compendium.DATA / "power/_listing.js")
    rows = [dict(zip(listing[-2], row)) for row in listing[-1]]
    return sorted((row for row in rows if row["ClassName"] == class_name
                   and row["Level"].isdigit() and 1 <= int(row["Level"]) <= 15
                   and row["Type"] in ("At-Will Attack", "Enc. Attack", "Daily Attack")),
                  key=lambda row: (int(row["Level"]), row["Type"], row["Name"], row["ID"]))


def importable_rows(class_name):
    """Skip attacks whose title is already an authored Modern 4e power for the class (revised wording wins)."""
    path = compendium.DATA.parent / "classes" / f"{class_name.lower()}-powers.json"
    authored = {power["title"] for power in json.loads(path.read_text(encoding="utf-8"))["powers"]} if path.exists() else set()
    return [row for row in source_rows(class_name) if row["Name"] not in authored]


# Builds and companions Modern 4e does not have; the power stays in the package but cannot be selected.
UNSUPPORTED = {
    "Warlock": (re.compile(r"Vestige|Sorcerer-King|\bBinder\b"), "Requires a Vestige, Sorcerer-King or Binder build, which Modern 4e does not have."),
    "Sorcerer": (re.compile(r"Active Familiar"), "Requires a sorcerer familiar, which Modern 4e does not have."),
    "Ranger": (re.compile(r"\bBeast's attack|\byour beast\b|^[A-Z][^\n]*✦[^\n]*\bBeast\b", re.M), "Requires a ranger beast companion, which Modern 4e does not have."),
}
COUNTS = {"two": 2, "three": 3, "four": 4}


ACTIONS = {"Standard Action": "STANDARD", "Move Action": "MOVE", "Minor Action": "MINOR",
           "Free Action": "FREE", "No Action": "NO_ACTION", "Immediate Interrupt": "IMMEDIATE_INTERRUPT",
           "Immediate Reaction": "IMMEDIATE_REACTION", "Opportunity Action": "OPPORTUNITY"}
FREQUENCIES = {"At-Will": "AT_WILL", "Encounter": "ENCOUNTER", "Daily": "DAILY"}
ACTION_LINE = re.compile("(" + "|".join(ACTIONS) + r")\s*(.*)")
HEADER = re.compile(r"^(At-Will|Encounter|Daily)\s+✦")
# Notes about source errata are bookkeeping, never rules text.
TRAILER = re.compile(r"^(?:Update \(|Revision \(|(?:Addition|Deletion|Correction|Erratum|Errata)\s*\(\d)")
TARGET_LABELS = ("Target", "Targets", "Primary Target", "Secondary Target", "Tertiary Target")
OUTCOME_LABELS = re.compile(r"Aftereffect|(?:First |Each )?Failed Saving Throw")
DEFENSES = {"AC": "AC", "FORTITUDE": "FORTITUDE", "REFLEX": "REFLEX", "WILL": "WILL"}
ABILITIES = "Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma"


def is_header(body, i):
    """A usage header that starts a follow-up power: '<usage> ✦ keywords' then an action line."""
    return i >= 2 and bool(HEADER.match(body[i])) and i + 1 < len(body) and bool(ACTION_LINE.match(body[i + 1]))


def title_at(body, header):
    """A follow-up's title is the line above its header, or two above when a flavor sentence intervenes."""
    return header - 1 if not body[header - 1].rstrip().endswith((".", ":", "!", "?", '"', "”")) else header - 2


def strip_notes(body):
    """Drop errata notes wherever they sit; keep any follow-up power that comes after one."""
    while (note := next((i for i, line in enumerate(body) if TRAILER.match(line)), None)) is not None:
        header = next((i for i in range(note + 1, len(body)) if is_header(body, i)), None)
        body = body[:note] + body[title_at(body, header):] if header is not None else body[:note]
    return body


def activation_for(activation_id, header, action_line, row_id):
    """Open one activation from its usage header and action/range line."""
    action = ACTION_LINE.match(action_line)
    if not action:
        raise ValueError(f"Unrecognized action for {row_id}")
    frequency = FREQUENCIES[re.match(r"^(At-Will|Encounter|Daily)", header)[1]]
    return dict(id=activation_id, availability="ENTRY", action=ACTIONS[action[1]],
                usage=dict(frequency=frequency, limits=[], costs=[], rules=[]),
                bindings={"self": dict(kind="ACTOR", text="The power user.")},
                range=dict(type="RULES_TEXT", text=adapt(action[2]) or "Personal"), blocks=[])


def fill(activation, rows, prereqs, inherited=None):
    """Keep ordered rules, scoped attack outcomes and explicit unresolved structures."""
    current_attack = None
    attacks = []
    current_target = None
    target_texts = {}
    target_after_attack = False
    inline_action = False
    last = None
    for i, line in rows:
        label, sep, value = line.partition(":")
        label, value = (label.strip(), adapt(value.strip())) if sep else ("Rule", adapt(line))
        if not value:
            continue
        block = dict(id=f"row-{i + 1}", type="effect", label=label, text=value)
        if label == "Prerequisite":
            skill = re.fullmatch(r"You must be proficient in (" + "|".join(skill.title() for skill in feats.SKILLS) + r")\.?", value)
            prereqs.append(dict(type="proficiency", skill=skill[1].upper()) if skill else
                           dict(type="unresolved", text=value, reason="Unadapted source prerequisite."))
            continue
        if label in ACTIONS:
            # An inline '<action>: <range>' line opens a nested use; its trigger is not the parent's.
            inline_action = True
        elif label == "Requirement" or label == "Trigger" and not inline_action:
            activation[label.lower()] = f"{activation[label.lower()]} {value}" if label.lower() in activation else value
            continue
        elif label in TARGET_LABELS:
            current_target = f"targets-{i + 1}"
            target_texts[current_target] = value
            target_after_attack = bool(attacks)
            activation["bindings"][current_target] = dict(kind="TARGET_SET", text=value)
            if "targets" not in activation:
                activation["targets"] = current_target
                continue
        elif re.fullmatch(r"(?:Primary |Secondary |Tertiary )?Attack(?: \((?:AC|Fortitude|Reflex|Will)\))?", label):
            value = value.replace("Relfex", "Reflex")
            block["text"] = value
            defense = re.search(r"\bvs\.?\s*(AC|Fortitude|Reflex|Will)\b", value, re.I)
            target = current_target
            if defense and not target:
                # The target row may follow the attack, or a follow-up power may reuse its parent's.
                ahead = next((j for j, later in rows if j > i and later.partition(":")[0].strip() in TARGET_LABELS), None)
                if ahead is not None:
                    target = f"targets-{ahead + 1}"
                elif inherited:
                    target = inherited[0]
                    activation["bindings"].setdefault(*inherited)
            if defense and target:
                # Complex attack counts/weapon alternatives stay explicit rules text.
                statistic = dict(type="RULES_TEXT", text=value)
                note = None
                # Only a bare "Ability vs. Defense" (optionally followed by a rider sentence) is a structured statistic.
                simple = re.fullmatch(r"(" + ABILITIES + r") vs\.? (AC|Fortitude|Reflex|Will)(?:\.(?:\s+(.+))?)?", value, re.I)
                if simple:
                    statistic = dict(type="ABILITY", ability=simple[1].upper())
                    note = simple[3]
                # A later attack with its own target row has its own reach, never the primary attack's.
                own_reach = target_after_attack and target == current_target and re.search(r"\b(?:within|adjacent|burst|blast|squares?)\b", target_texts[target])
                reach = dict(type="RULES_TEXT", text=target_texts[target]) if own_reach else activation["range"]
                block.update(type="attack", actor="self", targets=target, range=reach,
                             roll=dict(count=1, sharing="PER_TARGET", statistic=statistic),
                             comparisons=[dict(id="defense", defense=DEFENSES[defense[1].upper()], outcomes={})])
                if simple:
                    block["text"] = f"{simple[1]} vs. {simple[2]}"
                multiple = re.search(r"\b(two|three|four) (?:attacks|attack rolls)\b", value)
                if multiple or re.search(r"\btwice\b", value) and not re.search(r"roll twice", value):
                    block["roll"]["count"] = COUNTS[multiple[1]] if multiple else 2
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
                attacks.append(block)
                activation["blocks"].append(block)
                last = block
                if note:
                    activation["blocks"].append(dict(id=f"row-{i + 1}-note", type="effect", label=label, text=note))
                continue
            current_attack = None
        elif label in ("Hit", "Miss") and current_attack:
            owner = current_attack
            if label == "Miss" and re.search(r"no secondary attack", value, re.I) and attacks:
                # A miss that cancels the secondary attack belongs to the primary attack.
                owner = attacks[0]
            owner["comparisons"][0]["outcomes"].setdefault(label.lower(), []).append(block)
            last = block
            continue
        elif OUTCOME_LABELS.fullmatch(label) and current_attack and current_attack["comparisons"][0]["outcomes"].get("hit"):
            current_attack["comparisons"][0]["outcomes"]["hit"].append(block)
            last = block
            continue
        elif re.fullmatch(r"Level \d+", label) and last:
            last.setdefault("scaling", []).append(dict(atLevel=int(label.split()[1]), text=value))
            continue
        elif label == "Rule" and last and re.fullmatch(r"Increase damage to (.+?) at 21st level\.?", value):
            last.setdefault("scaling", []).append(dict(atLevel=21, text=re.fullmatch(r"Increase damage to (.+?) at 21st level\.?", value)[1]))
            continue
        activation["blocks"].append(block)
        last = block
    # An attack without a structured outcome cannot claim an executable attack group.
    for block in activation["blocks"]:
        if block["type"] == "attack" and not block["comparisons"][0]["outcomes"]:
            for key in ("actor", "targets", "range", "roll", "comparisons"):
                block.pop(key)
            block["type"] = "effect"


def convert(row, html, class_name="Fighter"):
    """Convert one published attack, splitting an embedded follow-up power into a granted activation."""
    slug = class_name.lower()
    original = text(html)
    lines = original.splitlines()
    start = next(i for i, line in enumerate(lines) if re.match(r"^(At-Will|Encounter|Daily)\s", line))
    activation = activation_for("use", lines[start], lines[start + 1], row["ID"])
    prereqs = [dict(type="level", minimum=int(row["Level"]))]
    unsupported = UNSUPPORTED.get(class_name)
    if unsupported and unsupported[0].search(original):
        prereqs.append(dict(type="unresolved", text=unsupported[1], reason="Depends on a build or feature Modern 4e does not have."))
    body = lines[start + 2:]
    body = strip_notes(body[:next((i for i, line in enumerate(body) if line.startswith("Published in ")), len(body))])
    limitations = ["Power selection is supported; combat execution, conditional weapon benefits, secondary actions, summoned-creature commands and sustain rules require manual resolution."]
    indexed = list(enumerate(body))
    # A second "<usage> ✦ keywords" header after a title/flavor pair starts a follow-up power
    # (Forms, stances) that must not borrow the parent's requirement, trigger or range.
    headers = [i for i in range(len(body)) if is_header(body, i)]
    activations = [activation]
    if headers:
        cuts = [title_at(body, h) for h in headers] + [len(body)]
        segments = [indexed[:cuts[0]]]
        merged = []
        for n, header_at in enumerate(headers):
            sub_title = body[cuts[n]]
            sub_action = ACTION_LINE.match(body[header_at + 1])
            rows = indexed[header_at + 2:cuts[n + 1]]
            if sub_title.endswith("Secondary Attack") and "primary target" in sub_action[2]:
                # A secondary attack is part of its parent's use, not an independently usable power.
                segments[-1] = segments[-1] + [(header_at, f"Secondary Attack Range: {sub_action[1]}; {sub_action[2]}")] + rows
                continue
            granted = activation_for("use-" + re.sub(r"[^a-z0-9]+", "-", sub_title.lower()).strip("-"),
                                     body[header_at], body[header_at + 1], row["ID"])
            granted.update(availability="GRANTED", title=sub_title)
            activations.append(granted)
            segments.append(rows)
            merged.append(granted)
        # The parent is filled first so a follow-up without its own target can reuse the parent's.
        for part, segment in zip(activations, segments):
            inherited = None
            if part is not activation and "targets" in activation:
                inherited = (activation["targets"], activation["bindings"][activation["targets"]])
            fill(part, segment, prereqs, inherited)
        for granted in merged:
            activation["blocks"].append(dict(id=f"grant-{granted['id']}", type="grant", label="Grants", text=granted["title"],
                                             activationId=granted["id"], duration="As stated in the power's rules"))
        if merged:
            limitations.append("The follow-up power is a separate granted activation; its availability window is stated only in the parent rules text.")
    else:
        fill(activation, indexed, prereqs)
    publication = next((line for line in lines if line.startswith("Published in ")), row["SourceBook"])
    keywords = [keyword.strip().upper().replace(" ", "_").replace("-", "_") for keyword in re.split(r"[,;]", lines[start].split("✦", 1)[1])]
    return dict(id=f"modern4e.power.{slug}-" + row["ID"], title=row["Name"],
                description=adapt(" ".join(lines[1:start])) or row["Name"],
                flavor=adapt(" ".join(lines[1:start])) or row["Name"],
                access=dict(type="entry", entryId=f"modern4e.class.{slug}"),
                prerequisites=prereqs[0] if len(prereqs) == 1 else dict(type="allOf", conditions=prereqs),
                selection=dict(maximum=1, constraints=[]), coverage=dict(status="UNIMPLEMENTED", limitations=limitations),
                rulesProfile="MODERN4E", source=dict(entryId=row["ID"], publication=publication, rulesText=original),
                keywords=[keyword for keyword in keywords if keyword and keyword != "VARIES"],
                choices=[], activations=activations, subtitle=f"{class_name} Attack {row['Level']}",
                level=int(row["Level"]), powerKind="ATTACK")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--class", dest="classes", nargs="+", required=True, metavar="NAME", help="Published class names, e.g. Fighter Paladin")
    parser.add_argument("--output-dir", type=Path, required=True, help="New scratch directory for <class>-attack-powers.json review files")
    args = parser.parse_args()
    authoritative = (compendium.DATA.parent / "classes").resolve()
    if args.output_dir.exists() or args.output_dir.resolve().is_relative_to(authoritative):
        parser.error("Use a new scratch directory; never overwrite reviewed authoritative powers")
    args.output_dir.mkdir(parents=True)
    cache = {}
    for class_name in args.classes:
        powers = []
        for row in importable_rows(class_name):
            path = compendium.batch_path("power", row["ID"])
            if path not in cache:
                cache[path] = compendium.payload(path)[-1]
            powers.append(convert(row, cache[path][row["ID"]], class_name))
        target = args.output_dir / f"{class_name.lower()}-attack-powers.json"
        target.write_text(json.dumps(dict(schemaVersion=2, powers=powers), ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(f"Exported {len(powers)} {class_name} attacks for review")


if __name__ == "__main__":
    main()
