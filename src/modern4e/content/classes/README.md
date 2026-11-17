# Shared class authoring (catalog/export schema v2)

All 19 local classes are authoritative here: four Defenders, six Leaders, three
Controllers and six Strikers. The catalog contains 170 features, 82 granted
powers, 96 selectable revised Barbarian attack powers and six explanatory rules.
Typst renders them directly;
`class_content.py` exports the same data for future Character Builder compilation.
This is **an authoring catalog, not a v1 runtime package**. Engine interpretation,
full progression and production pipeline replacement remain #33–#35. No class
chapter keeps a second editable rules definition in Typst. Feats and paragon-path
catalogs retain their existing contracts.

## Files and commands

`catalog.json` inventories every entry file exactly once under `classes`,
`features`, `powers` or `rules`. Each file has a schema version and that envelope
array; ordered power files use `schemaVersion: 2`, while class/feature/rule files
remain version 1. The inventory and normalized export are version 2. IDs are
persisted, not computed during builds; moving/renaming entries does
not change access or identity. Printed placement stays in each class's `.typ` page.
`advancement.json` holds common choices, independently of any class.

From the repository root:

```sh
python3 src/modern4e/scripts/class_content.py
python3 src/modern4e/scripts/class_content.py --output /tmp/modern4e-classes.json
python3 src/modern4e/scripts/class_content.py --output /tmp/modern4e-classes.json --check
python3 -m unittest discover -s src/character-builder/content -p 'test_modern_classes.py' -v
npm run typst:compile
```

Validation precedes writes. Exports sort object keys/entry IDs, retain meaningful
array order, and contain no timestamps, absolute paths or compendium reads.
`--check` compares UTF-8 bytes; exports cannot overwrite rulebook source files.
The CLI can validate a copied authoring directory using `--content`.

## Entry base

Every entry requires `id`, `title`, `description`, `access`, `prerequisites`,
`selection` and `coverage`; optional `source` and `note` retain provenance.
Authored category comes from the envelope; the normalized export adds `category`.
The exported kind is `modern4e.class-authoring`, with schema version 2. There is
no implicit mapping to the builder's v1 mechanics or published `class3` identity.

Access/prerequisites reuse the existing closed shared condition tree validated
by `scripts/feats.py`: `always`, `entry`, `level`, `abilityPoints`, `proficiency`,
`equipmentProficiency`, `classPowerSource`, `size`, supported `selected` queries,
`allOf`, `anyOf` and explicit `unresolved`. Access eligibility never causes an
automatic grant. Unlike the current feat access subset, class-content access can
reference a feature or source using that same vocabulary. No scripts or prose
inference are accepted.

`selection` uses the shared occurrence-limit shape (`maximum` positive integer
or null; `constraints` array). Class-content v1 currently requires that array to
be empty: the feat-specific distinct-configuration rules are not silently
accepted for class/feature/power occurrences. Whole-power-selection constraints
belong to the granting choice instead. All current entries explicitly use a
maximum of one; that is authored data, not a category-wide default.

Coverage requires `status` (`SUPPORTED`, `PARTIAL`, `UNIMPLEMENTED`) and
`limitations`. Incomplete states require nonblank reasons. Pending references,
unresolved conditions and query pools cannot claim supported automation.
Fighter entries deliberately declare **UNIMPLEMENTED runtime coverage** even
though their content is fully rendered. Combat Superiority preserves the original
Wisdom/Dexterity wording and explicitly records its unresolved interpretation.

## Class data

- `flavor`: full `quote`, `introduction` paragraph array and `gameplay` explanation.
  `description` is a catalog summary. Prose supports paragraphs and `*bold*` /
  `_emphasis_`; it never executes Typst. Images/cover geometry remain presentation.
- `role`: DEFENDER/STRIKER/LEADER/CONTROLLER; `powerSources`: structured source list.
- `abilities.main`: nonempty allowed main-ability list (one is fixed; several ask
  the player to choose one). `secondary` lists abilities used for extra effects,
  without restricting allocation. The shared 4-point main/5-point non-main rules
  remain outside class definitions.
- `proficiencies`: separate armor, shields, weapons and implements; the validator
  defines closed uppercase group/individual vocabularies matching current helpers.
- `statistics.defenses`: Fortitude/Reflex/Will bases. Shared Modern 4e formulas add
  STR + CON, INT + DEX, WIS + CHA respectively. Health is `base + perLevel × level
  + constitutionMultiplier × CON`; surges are `base + constitutionMultiplier × CON`.
  Fighter is HP `18 + 7 × level + 2 × CON`, surges `9 + CON`.
- `grants`: references owned by the granting entry. Each has a local occurrence
  `id`, `entryId`, and absolute character acquisition `atLevel` (1–30). These are
  independent of the received entry's prerequisites. `ruleIds` references its
  explanatory rules; feats and paragon paths remain independent existing data.

## Features, powers and rules

Features can grant entries or choices. `weaponAbilities` is an ordered structured
weapon-group/ability mapping; both consumers can use the same Fighter mastery
table. Other benefits remain exact shared prose with explicit coverage until
engine vocabulary is implemented; no unsupported text becomes an executable
modifier. Stable grants/choice IDs are used as inputs to future occurrence IDs.

Powers use the [ordered power contract](../../../../docs/modern4e-power-authoring.md):
`rulesProfile`, provenance, keywords, local acquisition/activation choices and
independent `activations` containing usage, bindings, range and ordered blocks.
Attacks own their rolls, comparisons and scoped outcomes. Fighter's three IDs
are preserved. Class validation reuses the power validator; local power choices
are distinct from the class/feature ENTRY-choice vocabulary. A power's use
requirement is distinct from its selection prerequisites. Granted powers do not
consume the standard selectable attack-power slots. Normal selectable power
pools are not migrated by this slice.

Leader features optionally declare ordered `sections`: literal `text`, named
`heading`, `grant` referencing a local `grantId`, or `choice` referencing a
`choiceId`. Each grant/choice must appear exactly once. This preserves rules,
subheadings and cards in source order without embedding Typst in JSON. Typst owns
page/column splits, including Shaman's companion options and Cleric's Channel
Divinity continuation. Class flavor adapters also read JSON, so banners have no
second editable copy. The migration reuses 19 predeclared feat reference IDs.

The Defender migration uses the same sections, preserving Paladin's split
Fervor options, Swordmage's split Aegis options and Warden's side-by-side reaction
cards. It adds 26 features and 15 powers and reuses 13 predeclared feature/power
IDs. Paladin's initial Channel Divinity choice is two distinct options from four;
additional acquisitions at levels 5, 11 and 21 remain explicit prose pending full
advancement/pool resolution. Grace powers retain their healing-surge costs,
once-per-round cap and literal Wisdom-based daily maximum. Smite the Condemned
retains its alternative attack ability and all six scaling thresholds without
inventing an ability-selection rule.

Controllers add 32 features, 18 powers and Druid's initial-selection explanation,
retaining 15 predeclared feature/power IDs. Druid's Balance of Nature modifies
the shared at-will slot to three selections with one-to-two BEAST_FORM powers.
Wizard's Spellbook modifies initial learned dailies to four, routes them to an
owned collection and grants a distinct preparation choice of two (three from
level 5). Storage, preparation and replacement remain separate decisions; later
utility acquisition/preparation and technique page accounting remain prose with
explicit incomplete coverage. Cantrips choose four of nine options. Effect-only
Invoker cards that specify Intelligence without a defense are retained without
inventing an attack roll.

Feature sections also support a literal `table` with `title`, string `columns`
and rectangular string `rows`. Wizard's complete preparation table is authored
once here and rendered by Typst. Query-based choices are explained by the
feature's prose/table and do not render fabricated option lists or choice prompts.

Strikers add 52 features, 23 granted powers, 96 selectable revised Barbarian
attack powers and three explanatory rules, preserving 30 predeclared feature/
power IDs. Warlock's Eldritch Attack disables the standard selectable at-will
slot with a zero-count selection modifier; its attack and pact choices grant the
actual at-wills. Player choices still require positive counts. Ranger's four
fighting styles/two specializations, Rogue's tactics/talents, Sorcerer's four
sources, Warlock's five pacts and Barbarian's four Feral Might options retain
their original packages and prose.

Selectable Barbarian attacks have class access, usage, level, ATTACK kind and
stored IDs. They are not automatic class grants. Their printed chapter order
stays in `classes/barbarian-primal-powers.typ`, which renders the JSON cards.
Attack blocks preserve before-attack movement, scoped hit/miss results and
secondary attacks; subtitle metadata preserves printed level labels. Rage Strike
keeps its expended-rage cost and literal power-level damage table, which must not
be mistaken for character-level scaling. Unusual source wording (Savage Reach's
"Melee weapon 1") remains explicit rather than being silently corrected.

Compact feature tables support an empty title and `style: COMPACT`; Rogue's
Sneak Attack dice and Sorcerer/Warlock damage-type tables remain shared data.
The renderer receives page-splitting and breakability choices from Typst rather
than storing page geometry in content definitions.

Cleric Healing Word's level-16 wording and Warlord's flavor/main-ability mismatch
remain explicit coverage limitations. Technique acquisition remains prose pending
the technique catalog. Shared healing pools, usage scaling and Channel Divinity
limits are structured where the local source is unambiguous. No combat effects
or proficiency benefits described in feature prose are inferred as automation.

Rules are independently identified explanatory entries. Reliable and Invigorating
are referenced by Fighter. Layout and table headings belong to the renderer.

## Granted choices and collections

An entry's optional `choices` array contains stable global `modern4e.choice.*`
IDs, title, `kind: ENTRY`, acquisition `atLevel`, `count`, `source` and `constraints`.
Counts are positive integers or `{byLevel: [{atLevel: 1, count: 2}, ...]}`.
Step tables start at 1, are ordered/unique, and replace earlier counts at each
threshold. Acquisition remains a separate fact.

Sources are either `{type: entries, entryIds: [...]}` or a `query` with explicit
category and closed filters: usage, attack/utility kind, maximum power level
(integer/CHARACTER/SLOT), access CHARACTER, keywords. These are candidate filters;
access and prerequisites must still be evaluated independently. Finite option
lists must be unique and large enough for the required count.

Choice constraints currently support:

- `{type: distinct}`: no repeated entry in that choice set.
- `{type: keywordCount, keyword: BEAST_FORM, minimum: 1, maximum: 2}`: bounds over
  matching powers in this choice set, checked again after replacement/retraining.

Optional `collections` declares owned lists with ID, title and a positive
capacity. A choice's `collection` stores its selected entries there;
`requiresCollection` requires those entries to already exist in the named owned
collection. These are distinct persistent character decisions, allowing known,
stored and prepared powers to differ. Capacity is an entry count, not spellbook
page accounting; page costs remain explicit prose/coverage for later migration.

## Shared advancement and feature exceptions

The three standard initial attack-power choices have stable IDs:
`modern4e.choice.class-attack-at-will`, `...class-attack-encounter` and
`...class-attack-daily`, with counts 2/1/2. Fighter's printed initial selection
sentence comes from them. Only initial choices are structured in this slice;
the original advancement table remains authoritative for later levels and is
explicitly declared incomplete in this authoring export. It is not a second,
claimed-complete level-30 progression system.

A feature's `selectionModifiers` targets an existing `choiceId` and declares a
replacement `count` plus extra `constraints`. Constraints are additive to the
target's existing constraints (identical constraints are idempotent); unrelated
slots and automatic powers are untouched. Modifiers are scoped to that active
feature occurrence and the targeted choice. Conflicting count replacements from
multiple active features must report a conflict, never depend on package/input
order. Authoring rejects duplicate targets within one feature; engine application
and simultaneous-feature conflict diagnostics belong to #34.

A modifier can route learned selections into a `collection` and declare
`replacement: FOLLOW_TARGET`: replacing/retraining a target selection also
replaces its stored occurrence. An independently granted preparation choice can
select from that owned collection, with its own level-based count and distinctness.
This encodes the Wizard known/stored/prepared distinction without a Wizard-only
field. Future acquisition slots need explicit definitions before targeting them.

`content/fixtures/classes/exceptional-features.json` in the Character Builder test
directory exercises Druid count/keyword limits, Wizard collections/preparation,
four-cantrip selection and Shaman nested grants. These are **test-only schema
examples**, not migrated/available playable classes. Pending power references stay
visible. Full class migration and runtime enforcement are separate tickets.

## Validation boundaries

The validator rejects unknown fields/values, duplicate keys/IDs, missing inventory,
wrong-category/missing references, bad counts/formulas/scaling, duplicate grant or
choice IDs, recursive grant/choice paths and invalid collection/override targets.
`catalog.json.references` declares external references with category/title and
PENDING_MIGRATION or UNAVAILABLE status; declarations are not definitions.
The existing feat reference registry is left untouched by this migration.
