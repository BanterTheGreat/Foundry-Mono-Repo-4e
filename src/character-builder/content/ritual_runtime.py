"""Build the Modern 4e ritual and alchemical formula catalogs."""

from html import escape, unescape
from pathlib import Path
import re

import build as content
import runtime_common

RITUALS = Path(__file__).resolve().parents[2] / "modern4e/content/rituals/rituals.json"
CATEGORIES = ("Crafting", "Arcane", "Primal", "Divine", "Medical")
RITUAL_FIELDS = ("title", "category", "time", "duration", "marketPrice", "cost", "keywords")


def entry(entry_id, title, description, shared):
    """Map a reference list entry without treating it as equippable gear."""
    return {
        "id": entry_id,
        "category": "ITEM",
        "presentation": {"title": title, "description": description},
        "mechanics": {
            "version": 2,
            "access": {"type": "always"},
            "prerequisites": [],
            "grants": [],
            "choices": [],
            "unsupported": [],
            "maximumSelections": None,
        },
        "coverage": {"status": "SUPPORTED", "limitations": []},
        "sharedData": shared,
    }


def ritual_rules(rules, where):
    """Validate and render shared ritual rule paragraphs, lists and tables."""
    plain, rich = [], []
    for block in content.array(rules, where):
        content.object_fields(block, [], ("text", "bullets", "table"), where)
        content.require(len(block) == 1, where, "expected exactly one ritual rule block")
        if "text" in block:
            line = block["text"]
            content.string(line, where)
            plain.append(line)
            rich.append(f"<p>{escape(line)}</p>")
        elif "bullets" in block:
            lines = content.array(block["bullets"], where)
            content.require(lines, where, "empty ritual rule list")
            for line in lines:
                content.string(line, where)
            plain.append("\n".join(f"• {line}" for line in lines))
            rich.append("<ul>" + "".join(f"<li>{escape(line)}</li>" for line in lines) + "</ul>")
        else:
            rows = content.array(block["table"], where)
            content.require(rows and rows[0], where, "empty ritual rule table")
            for row in rows:
                content.require(len(content.array(row, where)) == len(rows[0]), where, "uneven ritual table")
                for cell in row:
                    content.string(cell, where)
            lines = [" | ".join(row) for row in rows]
            plain.append("\n".join(lines))
            rich.append(f"<p><b>{escape(lines[0])}</b><br>" + "<br>".join(map(escape, lines[1:])) + "</p>")
    content.require(plain, where, "missing ritual rules")
    return "\n\n".join(plain), "".join(rich)


def rituals(source):
    """Load the same source that Typst uses and validate every reference card."""
    data = content.load_json(source)
    content.object_fields(data, ("schemaVersion", "rituals"), [], source)
    content.require(type(data["schemaVersion"]) is int and data["schemaVersion"] == 1, source,
                    "unsupported ritual schema version")
    entries = []
    for card in content.array(data["rituals"], source):
        content.object_fields(card, ("id", "level", "rules", *RITUAL_FIELDS), ("focus", "pricingNote"), source)
        where = card["id"]
        content.require(isinstance(where, str) and re.fullmatch(r"modern4e\.ritual\.[a-z0-9-]+", where),
                        source, "invalid ritual ID")
        content.integer(card["level"], where, 1, 30)
        content.enum(card["category"], CATEGORIES, where)
        for field in (*RITUAL_FIELDS, "focus", "pricingNote"):
            if field in card:
                content.string(card[field], f"{where}.{field}")
        description, rules_html = ritual_rules(card["rules"], where)
        profile = {key: value for key, value in card.items() if key not in {"rules", "pricingNote"}}
        entries.append(entry(where, card["title"], description, {**profile, "rulesHtml": rules_html}))
    return entries


def formula_field(stats, label):
    """Preserve published metadata when the source actually supplies a value."""
    match = re.search(rf"<b>{label}:\s*</b>([^<]*)", stats)
    value = unescape(match[1]).strip() if match else ""
    return value if value and value != "gp" else None


def formula_entry(row, source_html):
    """Keep one formula per name, with its individual crafting levels and costs."""
    source_id, title = row["ID"], row["Name"]
    levels, costs = row["Level"][1:], row["Cost"][1:]
    content.require(len(levels) == len(costs) and levels, source_id, "missing or unmatched formula variants")
    variants = []
    for level, cost in sorted(zip(levels, costs)):
        content.integer(level, source_id, 1, 30)
        content.integer(cost, source_id, 0)
        variants.append({"level": level, "cost": f"{cost:,} gp"})
    content.unique(levels, source_id)

    # The compendium card has a title, price table and crafting stat block. The
    # Builder renders those fields from structured data, and the rest as item rules.
    stats = re.search(r"<p class=mistatAI>.*?</p>", source_html, re.DOTALL)
    content.require(stats is not None, source_id, "missing alchemical item stats")
    flavor = re.search(r"<p class=miflavor>.*?</p>", source_html, re.DOTALL)
    rules_source = (flavor[0] if flavor else "") + source_html[stats.end():]
    formatting = {"p", "br", "b", "i", "h2"}

    def clean_tag(match):
        close, tag = match[1], match[2].lower()
        if tag == "h2":
            return "</b></p>" if close else "<p><b>"
        return f"<{close}{tag}>" if tag in formatting else ""

    rich = re.sub(r"<(/?)([A-Za-z0-9]+)\b[^>]*>", clean_tag, rules_source)
    parser = content.compendium.PlainText()
    parser.feed(rich)
    description = parser.text()
    content.require(description, source_id, "missing item rules")
    profile = {
        "level": variants[0]["level"],
        "variants": variants,
        "sourceId": source_id,
        "rulesHtml": rich,
    }
    for field, label in (("formulaCost", "Formula Cost"), ("time", "Time"), ("sourceKeySkill", "Key Skill")):
        value = formula_field(stats[0], label)
        if value is not None:
            profile[field] = value
    return entry(f"modern4e.formula.{source_id}", title, description, profile)


def formulas(snapshot):
    """Import only published alchemical items from the local snapshot."""
    items = snapshot / "item"
    columns, rows = content.payload(items / "_listing.js")[-2:]
    batches, entries = {}, []
    for values in rows:
        row = dict(zip(columns, values))
        if row["Type"] != "Alchemical Item":
            continue
        source_id = row["ID"]
        bucket = int(re.search(r"\d{1,2}$", source_id)[0]) % 20
        if bucket not in batches:
            batches[bucket] = content.payload(items / f"data{bucket}.js")[-1]
        content.require(source_id in batches[bucket], source_id, "missing compendium item rules")
        entries.append(formula_entry(row, batches[bucket][source_id]))
    return entries


def build(snapshot=content.SNAPSHOT, source=RITUALS):
    """Export both catalogs as independently loadable mechanics-v2 packages."""
    return (
        runtime_common.package("modern4e.rituals", "Modern 4e rituals", rituals(source))
        | runtime_common.package("modern4e.formulas", "Alchemical crafting formulas", formulas(snapshot))
    )
