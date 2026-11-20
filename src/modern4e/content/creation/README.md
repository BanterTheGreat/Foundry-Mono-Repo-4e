# Creation and advancement authoring

`standard.json` supplies the seven creation steps, their original prose, structured
starting equipment/free-skill/feat rules, universal ability allocation, ritual
acquisition and the complete printed level 1–30 progression table. Typst owns
layout in `glossary/creation_&_advancement.typ` and `helpers/creation_content.typ`.
Class reference panels read ability allocation values from the same file; the
ritual chapter reads its advancement-acquisition sentence here.

The closed schema is validated by `scripts/creation_content.py`. All records have
persistent IDs. Do not regenerate IDs when editing wording or inserting events.
`GAIN` adds a selection; `REPLACE` exchanges an existing selection without changing
its total; `GRANT_FEATURES` delegates the actual features to the indicated owner.
Events distinguish class, ancestry, character, paragon-path and epic-destiny owners.
Power kind/usage can remain `UNRESOLVED` where the source does not specify them.
`target` preserves the source wording and is not an executable query. Explicit
entry-level bounds do not resolve eligibility or promise available catalogs.

`powerTotals` and `featTotal` are stored for the printed table and validated against
the events. They describe the standard progression, before class overrides.
`initialPowerChoices` references `classes/advancement.json`; its existing stable
choice IDs remain the targets for class selection modifiers, and validation checks
that its initial counts agree. Do not apply both descriptions as separate grants.

Levels 11–30 remain `PROVISIONAL`, matching the original source warning. The
level-17 encounter power retains an unresolved attack/utility kind. Generic utility
events do not invent separate combat/non-combat counts or usage frequencies. The
chapter has no retraining procedure, so none is inferred. Optional themes and
ritual acquisition remain optional. The Builder tracks known rituals in Stats,
using the same ritual definitions as the rulebook.

Run from the repository root:

```sh
python -X utf8 src/modern4e/scripts/creation_content.py
python -X utf8 -m unittest discover -s src/modern4e/scripts -p test_creation_content.py -v
npm run typst:compile
```

For deterministic authoring export, pass `--output` with a path outside the
rulebook tree; add `--check` to detect stale bytes. The exported kind is
`modern4e.creation-authoring`, schema version 1, not a builder runtime package.
Tests compare all original steps and table rows with the source golden, check
invalid records and boundaries, export/check behavior and actual Typst output
when `typst` or `TYPST_BIN` is available. Visually inspect creation, advancement,
representative class reference panels and the ritual introduction after edits.
