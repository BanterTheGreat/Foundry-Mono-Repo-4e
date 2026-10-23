---
name: dnd4e-monster-search
description: Find and recommend D&D 4e monsters from the local compendium, preferring Monster Manual 3 and Monster Vault and recalculating other sources with the user's monster-math table.
---

# Find monsters in the local compendium

Use the [4e-compendium skill](../4e-compendium/SKILL.md) for entry reading and
full-text searches. Select monsters for the requested theme, level, combat role,
and rank; distinguish role (brute, soldier, etc.) from rank (standard, minion,
elite, solo). Work locally; no Foundry access is needed for recommendations.

## Search and select

Run the bundled metadata search from the repository root:

```powershell
python -X utf8 .agents/skills/dnd4e-monster-search/scripts/search.py dragon --min-level 5 --max-level 10
python -X utf8 .agents/skills/dnd4e-monster-search/scripts/search.py --role soldier --rank standard --max-level 8 --preferred-only
```

The optional term matches names and creature types. Filters include `--source`
(exact source code), `--role`, `--rank`, level bounds, and `--limit`. Results
include source, level, role, rank, and entry URL, with preferred sources first.
Use the compendium reader's `search --category monster --full` for mechanics or
themes absent from metadata. Read each shortlisted entry to verify its abilities
and full publication attribution before recommending it.

Prefer **Monster Manual 3 (MM3)** and **Monster Vault (MV)** when they fit the
request. The preference is not an exclusion: use another source when it offers a
better fit, but recalculate its combat values using
[the user's monster math](references/monster-math.md). Verify each actual entry's
source rather than assuming all versions of a named monster share it. Related
books such as `MV:TttNV` are separate sources and require recalculation too.

## Recalculate and present

For every selected monster outside MM3/MV, read the math reference and calculate
usable revised HP, defenses, attack bonuses, and damage for its attacks at the
selected level, role, and rank. Preserve its identity, movement, keywords, and
distinctive abilities. Recompute dependent values such as bloodied HP. Identify
any unresolved interactions (ongoing damage, multiple attacks, automatic damage)
and explain how their combined output fits the damage budget. The table does not
define replacements for every such mechanic; label judgment calls explicitly.

For MM3/MV entries, retain published values unless the user asks for a level or
stat adjustment; use the same math reference when adjusting them. A request only
to locate or quote a specific entry should return its published text, with any
recalculation clearly separate.

Report each recommendation's name, level, role, rank, source, original entry
link, and why it fits. Briefly state when enemies were reduced in level or otherwise
adjusted to fit the encounter. In adjustment notes, give specific changed values
or before-and-after comparisons only for damage; summarize other adjustments
without numerical details. Usable statblocks should still contain the final stats
needed to run the monsters. Keep published mechanics distinct from these
user-directed adjustments. If adapting
into the Modern 4e rulebook, also load the [modern4e skill](../modern4e/SKILL.md).
For encounter budgets, use [dnd4e-encounter-difficulty](../dnd4e-encounter-difficulty/SKILL.md).

## Ability flavor text

When adapting a creature to the requested theme, you may rename its attacks,
powers, traits, and similar flavor details where appropriate. Keep the names
consistent with their mechanics and identify renamed abilities as adaptations.
Apply these adaptations only to the presented recommendations or derived
statblocks; leave the compendium source data unchanged.

When presenting usable monster abilities, add a short italicized flavor passage
to every ability, including basic attacks, traits, and triggered powers. Place it
between the ability name and its mechanics. Preserve suitable published flavor;
write original text where it is missing, and identify added flavor as an adaptation.
For requests only to locate or quote an entry, preserve the published text.

Use the style of **ZEITGEIST Act One**: brief, vivid, present-tense action vignettes,
often addressing the target as "you." Show the creature's concrete movements and
sensory effects so the mechanics make fictional sense; convey personality through
behavior, with occasional menace or dry humor. Aim for one or two sentences ready
to read aloud, with rules and numbers kept in the mechanics below. Match the
description to the ability's actual effects.

Original example for a claw attack that slides its target: *The beast hooks a claw
behind your knee and wrenches you sideways, its talons scraping sparks from the
flagstones.*
