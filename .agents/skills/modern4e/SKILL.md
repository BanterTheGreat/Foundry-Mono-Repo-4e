---
name: modern4e
description: Project-specific layout, local D&D 4e rules, Typst conventions, and validation for src/modern4e. Use when reading or editing the rulebook or adapting published mechanics to its local rules.
---

# Modern 4e

This is a Typst rulebook for the author's semi-homebrew D&D 4e setup, titled
`DND4: Death to CBLoader Edition`. It centralizes character creation and rules,
combines community homebrew with the author's changes, and expands out-of-combat
specialization without sacrificing combat effectiveness. Treat the local rules
as authoritative when adapting published 4e material.

All paths below are relative to `src/modern4e/` unless stated otherwise.
This directory is a rulebook, never a Foundry module or deployment input.

## Where to work

For published D&D 4e lookups, compendium entry IDs, or `iws.mx/dnd` links, use
the local [4e-compendium skill](../4e-compendium/SKILL.md) to read or
search `content/compendium/` offline. Local rulebook rules govern adaptations.

For explaining, running, or adapting Draw Steel Negotiation, use the
`draw-steel-negotiation` skill and read `DRAW_STEEL_NEGOTIATION.md`. It records
the source system; local rules remain authoritative for adaptations.

- `main.typ` sets the book's typography, page geometry, cover, outline, ability
  highlighting, and chapter order. Chapters are collected with `showPages`.
- `ancestries/root.typ` and `classes/root.typ` import and assemble their sections.
  Classes are grouped by combat role. Register new pages in the relevant root.
- `ancestries/*.typ` and `classes/*.typ` contain individual character options.
- `glossary/*.typ` contains creation, backgrounds, bonds, equipment, themes,
  feats, utility powers, techniques, skill checks, variants, and quick rules.
- `glossary/utility/*.typ` contains utility powers grouped by ability or power
  source; `glossary/utility.typ` selects and assembles the printed lists.
- `helpers/theme.typ` owns shared colors, titles, banners, tables, feat/path
  rendering, and ability formatting. `helpers/powers.typ` renders power cards
  and defines power, action, offense, and defense constants.
- `helpers/classes.typ` and `helpers/ancestries.typ` render common option blocks.
  Class flavor is stored in `helpers/class_data.typ` and selected through
  `helpers/class_flavor.typ`.
- `content/feats/` and `content/paths/` hold JSON-backed entries for some classes.
  Follow the existing class's split between inline content and JSON.
- `templates/empty_page.typ` and `templates/empty_class.typ` are starting points;
  compare with a current page before copying, since templates may lag behind it.
- `images/` supplies illustrations and `svgs/` supplies layout icons.

Follow imports from the affected page to find the active implementation.
`helpers/classes_templates.typ` resembles the class helpers but is not imported
by the current book; changes there alone will not update the printed pages.

## Revised skill system

Before changing skills, checks, or skill-dependent content, read
`glossary/skill_checks.typ` and the **Skill Changes** section of
`glossary/balance_changes.typ`. The current skill-to-ability mapping is:

| Ability | Skills |
| --- | --- |
| Strength | Athletics |
| Dexterity | Acrobatics, Stealth, Thievery |
| Constitution | Endurance |
| Intelligence | Arcana, Crafting, Society, Medicine |
| Wisdom | Insight, Nature, Perception, Religion |
| Charisma | Bluff, Diplomacy, Intimidate |

- Dungeoneering is folded into Nature; some of its utility powers were assigned
  to other skills.
- Crafting is new and covers knowledge of mechanical devices and alchemy.
- Streetwise is folded into History, which is renamed Society.
- Heal is renamed Medicine and moved to Intelligence.
- Religion uses Wisdom.

Use these names and abilities in new content. Adapt imported prerequisites,
bonuses, and check descriptions to this system rather than restoring stock 4e
skills. Keep original source terminology only where its context requires it.

Proficiency adds **+5** to the relevant roll. Backgrounds grant one skill from
the environment and one from the upbringing (`glossary/background.typ`);
character creation also grants two freely selected skills
(`glossary/creation_&_advancement.typ`). Other content may grant proficiency.
Checks use **1d20 + points in the GM-selected ability + applicable bonuses**;
use the printed formula rather than assuming standard 4e skill math.

The DC table has Easy, Normal, Hard, and Extreme difficulties for levels 1–30.
Checks have success with a minor hurdle, perfect success, failure, and
catastrophic failure; natural 20 and 1 have special outcomes. Preserve the
printed thresholds. The prose's “next step” comparisons and edge difficulties
are not fully explicit; flag ambiguity when it affects a requested edit instead
of inventing a resolution.

For skill changes, check backgrounds, creation, feats, class and ancestry
features, utility prerequisites, techniques, and variants for affected references.
Utility filenames are not authoritative skill mappings: Medicine powers still
live in `utility-wisdom.typ`, and a Society power appears in
`utility-dexterity.typ`. Read each card's `bonusTitle` and mechanics. Moving
content between files also requires updating its assembly calls.

`glossary/utility.typ` requires proficiency and minimum level for skill utility
powers. Out-of-combat powers also respect power-source restrictions (Martial,
Arcane, Divine, or Primal, or no source). Advancement grants separate combat and
out-of-combat utility picks. The HOMEBREW theme text currently tells readers to
ignore old skill-check bonuses pending replacements; preserve that distinction.

## Typst coding style

- Use two-space indentation, double-quoted strings, and relative imports with
  forward slashes. Put imports at the top; match nearby namespace aliases or
  selective imports.
- Most functions, variables, and named arguments use camelCase, such as
  `skillChecksPage`, `className`, and `additionalRows`. Existing snake_case and
  hyphenated names remain valid conventions in their modules; retain them.
- Page modules usually expose `#let namePage() = { return [ ... ] }`. Keep
  presentation helpers separate from rule prose and compose pages through them.
- Prefer named arguments. Format larger calls and tuples across multiple lines
  with trailing commas. Preserve tuple syntax, including `(item,)` for one item.
- Write prose as Typst content blocks `[...]`, with `=`, `==`, and `===` headings,
  `*bold*` mechanical labels, `_italic_` flavor, and explicit line breaks as needed.
- Semicolons are common on imports, declarations, and markup calls, but are not
  universal. Match the edited block rather than reformatting unrelated code.
- Reuse `theme.pageTitle`, `theme.subPageTitle`, `theme.choiceBox`,
  `theme.featBlock`, table style functions, and `powers.power` as appropriate.
  Use constants such as `powers.powerType.encounter` and `powers.actionType.minor`
  with the import form used by the page.
- Power effects and special rules normally go in `additionalRows` content
  tuples with bold labels. Keep prerequisites, triggers, targets, and level
  scaling in their existing card fields.
- JSON uses two-space indentation, a top-level `feats` or `paths` array, and
  entries with `title`, `requirements`, and `description`; paths also have `link`.
  Follow neighboring use of `null` for absent requirements. Descriptions are
  strings rendered by the shared helpers, not inline Typst programs.
- Preserve deliberate `columns`, `grid`, `colbreak`, `pagebreak`, fixed image
  dimensions, and spacing adjustments. Pagination is part of the design.

The global ability-name show rule in `main.typ` works with
`helpers/state.typ`. Banner pages temporarily disable default highlighting.
Keep state restoration paired with those updates when editing banners.

## Rules and build boundaries

Ability values are direct points, not stock ability scores: the shared class
helper gives the main ability 4 points and distributes 6 among non-main
abilities, up to 3 each, with an optional -1 tradeoff. Preserve local formulas,
prerequisites, advancement, and balance changes when adapting source material.

Read `glossary/balance_changes.typ` and `glossary/quick_rules.typ` for combat-rule
edits. They include baseline expertise/defenses, intrinsic bonuses, defense
rolls, action-point stun relief, and main-ability melee basic attacks.

`helpers/configuration.typ` selects ZEITGEIST or HOMEBREW and supplies the footer
version. The checked-in selection is ZEITGEIST. Themes branch on that setting;
Revenant is separately commented out in `ancestries/root.typ` for ZEITGEIST.
Check both mechanisms when changing campaign availability. Keep version changes
and release PDF generation within the requested scope.

The introduction describes completion through level 10; the advancement table
explicitly warns that later levels are not fully verified. Existing paragon
content does not imply that the entire higher-level ruleset is finished.

## Validation

After any rulebook content change, recompile from the monorepo root when the
Typst CLI is available. The user authorizes creating or overwriting `inDev.pdf`
in `src/modern4e/` as the temporary development build:

```sh
npm run typst:compile
# Or: make typst-compile
```

The book requests Rokkitt, Merriweather, Bona Nova SC, and Alfa Slab One fonts.
Check missing-font warnings because substitutions can change pagination. Inspect
affected rendered pages for overflowing cards/tables, awkward column breaks,
stranded headings, image placement, footer contrast, and outline entries.
Shared-helper edits require checking representative pages across their consumers.

The root Makefile and npm scripts provide Typst compile, watch, fonts, and clean
commands. There is no rulebook automated test suite. For JSON edits,
validate JSON syntax and compile the consuming page through `main.typ`. If
Typst or fonts are unavailable, report the unperformed checks explicitly.
PDFs are ignored by `.gitignore`; use temporary validation output and preserve
existing release PDFs. Documentation-only edits need source/path verification
and a diff review, not a book rebuild.
