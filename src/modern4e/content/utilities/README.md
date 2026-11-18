# Shared utility power authoring

All 1,046 utility definitions use the shared entry base and ordered power body:
826 available class utilities, 66 formerly inline
skill cards, 41 additional skill utilities and 113 power-source utilities.
The rulebook consumes these definitions directly. This is authoring data, not
a Character Builder runtime package or combat interpreter.

`catalog.json` inventories every utility file and its ordered selection sections.
Definitions remain in `../class-utilities/`, `../skill-utilities.json`,
`../power-source-utilities.json` and `general.json`, with schema version 2.
The catalog schema is version 1. Each definition has a persisted
`modern4e.power.utility-<variant>-<source-id>` identity, provenance in `source`, level, UTILITY kind, access,
prerequisites, occurrence limit, unsupported runtime coverage and ordered
activations/blocks. Never recalculate IDs after renaming or moving a definition.

Class/source adaptations of the same published power deliberately retain distinct
identities and access conditions. The original source identifier remains in
`source.entryId`; it is not a second playable identity. Class access references
the existing class definitions. Source access tests the character's class power
source, rather than a known power's keywords. Skill utility access is general,
with proficiency and minimum level in selection prerequisites. Other unresolved
prerequisites retain their literal text and an explicit unresolved condition.
Use requirements remain distinct from selection prerequisites.

Sections own `powerIds` in printed order, `availability` (AVAILABLE/DEFERRED), and
per-power `pickKinds` (COMBAT/NON_COMBAT, or both). Class/source metadata agrees
with the definitions' access conditions. No entry is withheld now. The 36 formerly
deferred class utilities (familiar, summoning and off-slot-level powers, including
18 level-1 Cleric powers) joined their class sections and keep their original
`utility-class-deferred-` identities; 35 that depend on Beast Mastery companions,
Godsworn, eladrin or class features absent from Modern 4e were removed. A DEFERRED
section remains valid, is exported as DEFERRED and is refused by the Typst reader. Importing this catalog must not expose all exported
powers as available selections.

The six ability-named Typst files retain only their public section functions;
layout, level breaks, sorting and illustration choices remain in Typst.
`helpers/utility_content.typ` loads the declared catalog and the shared
`power_content.typ` renderer draws the cards. Safe literal text is never evaluated
as Typst source. Unlabeled paragraphs use the renderer's `Rule` label convention,
which prints their text without adding a visible label.

Clear attack groups own their hit outcomes. Unsupported defense alternatives and
situational attack structures remain ordered literal rules with explicit coverage
limitations. Range wording remains literal except for PERSONAL. Secondary actions,
sustain, costs, durations and conditional benefits remain exact rules text, rather
than claiming executable effects or fabricating grants. All runtime coverage is
UNIMPLEMENTED. The migration does not complete progression or enforce selection
and combat rules in the builder.

From the repository root:

```sh
python3 src/modern4e/scripts/utility_content.py
python3 src/modern4e/scripts/utility_content.py --output /tmp/modern4e-utilities.json
python3 src/modern4e/scripts/utility_content.py --output /tmp/modern4e-utilities.json --check
python3 -m unittest discover -s src/modern4e/scripts -p test_utility_content.py -v
npm run typst:compile
```

The export is deterministic and preserves section order and withheld status;
source directories cannot be overwritten. `--content` accepts a copied content
root. Validation rejects duplicate identities/keys, legacy rows, missing/orphan
entries, malformed ordered powers, unsupported metadata and inconsistent section
access. Presentation SHA-256 fixtures preserve each pre-migration card's rules,
order, flavor, range, action, target, trigger and requirement without keeping a
second editable copy of its prose. Typst tests exercise every available section
and rejection of the withheld section.

`import_class_utilities.py` and `import_source_utilities.py` remain reference
extraction tools. They now require `--output <scratch-directory>` and refuse to
write inside the authoritative content directory. Their legacy output is not a
replacement for this catalog. Reference/addition JSON remains import input only.
