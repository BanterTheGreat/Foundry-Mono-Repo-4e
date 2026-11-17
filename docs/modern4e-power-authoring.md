# Ordered power authoring

Status: used by all four Defender, six Leader and three Controller chapters, validated against
16 additional published-reference scenarios. Class catalog/export schema v2
adopts these ordered power definitions, and `helpers/power_content.typ` renders
them. This is an authoring contract, not an enabled builder runtime package.
Ancestry powers retain their independent schema. Psionic powers, power-point
augments and Monk full disciplines are outside this slice.

The read-only validator is `src/modern4e/scripts/power_content.py`. Its default
catalog is `src/modern4e/scripts/fixtures/powers/catalog.json`. These fixtures use
`fixture.power.*` identities and `PUBLISHED_REFERENCE`, never playable Modern4e
identities. Published statistics are not automatically converted into local rules.

## Envelope and shared entry data

The experimental fixture envelope has `schemaVersion: 1`,
`kind: modern4e.power-authoring-experimental`, `references`, and `powers`.
Production class files use `{schemaVersion: 2, powers: [...]}` and the class
catalog inventory/reference registry. `class_content.py` validates and exports
them with the same block validator. Fighter retains its three existing power IDs;
the Leader migration adds 23 powers, Paladin/Swordmage/Warden add 15, and the
Controllers add 18. Forty-seven
predeclared feature/power identities are reused, so feat references retain their
targets. Cross-catalog runtime
resolution and legacy feat-reference status reconciliation remain pending.
Each power has stored `id`, `title`, `description`, shared `access`,
`prerequisites`, `selection`, explicit `coverage`, `rulesProfile`, `source`,
`keywords`, `choices`, and `activations`. Access, prerequisites and selection
reuse the existing shared validators. References are declarations with category,
title and PENDING_MIGRATION/UNAVAILABLE status; declarations do not confer access.
Optional `level`, `powerKind` (ATTACK/UTILITY), `flavor`, and `note` retain
selection metadata and presentation. Missing levels are not inferred from titles.

`source` records `entryId` and `publication`. PUBLISHED_REFERENCE fixtures also
require complete literal `rulesText`; production definitions author their rules
once in blocks and do not copy a second rules definition into source metadata.
The fixtures retain the snapshot's full readable rules, including source updates;
tests compare these bytes as text against the offline reader. Their structural
annotations are deliberately partial. Rules prose is never executable, and all
experimental entries must declare UNIMPLEMENTED runtime coverage. This contract
does not promise that every rule is represented by a typed operation.

`rulesProfile` distinguishes MODERN4E from PUBLISHED_REFERENCE. It records
provenance, not an alternative rules mode in the builder.

## Choices and activations

Entry-owned `choices` have stable local IDs, `timing` ACQUISITION or ACTIVATION,
and distinct string `options`. An attack statistic can reference an ability
choice; the validator rejects missing choices and non-ability options there.
Acquisition choices must eventually be stored as character decisions; the
validator does not select or persist them.

Each activation has a local `id`, `availability` ENTRY or GRANTED, `action`,
`usage`, `bindings`, and ordered `blocks`. Optional `trigger` and `requirement`
are literal rules. Optional `range` and `targets` describe effects that do not
make an attack. A power must have an ENTRY activation. A GRANTED activation must
be referenced by a grant block. Missing targets, orphan grants and grant cycles
fail validation. Optional `title` names a secondary card; optional boolean
`special` preserves the printed Special usage marker. An action's presence does
not schedule or execute it.

`usage` contains `frequency`, independent `limits`, literal `costs`, and literal
`rules`. Each limit specifies TURN/ROUND/ENCOUNTER/DAY, a `maximum`, and optional
`poolId` for a shared usage pool. Pool IDs are opaque identities; a pool catalog
and runtime sharing are pending. Maximums and numeric ranges use
`{ "base": 2, "byLevel": [{ "atLevel": 16, "value": 3 }] }`.
Thresholds replace the earlier value; levels must be unique and ascending.
Conditional expenditure and optional payments remain explicit prose.

Bindings name ACTOR, TARGET_SET, ORIGIN or ENTITY contexts with explanatory text.
An optional `fromAttack: { attackId, part: TARGETS | ACTOR }` projects a previous
attack's context, for example an area centered on the primary target. The
validator checks the attack and projection kinds. It does not establish spatial
legality, temporal availability or branch reachability.

## Ordered blocks

Every block has a stable activation-local `id`, `type`, printed `label`, literal
`text`, and optional ordered `scaling: [{ atLevel, text }]`. IDs must be unique
throughout the activation, including branches. Labels preserve presentation and
do not define execution semantics. Block order preserves authored sequence.

| Type | Additional fields | Meaning |
| --- | --- | --- |
| `effect` | None | Literal rule/effect paragraph |
| `attack` | `actor`, `targets`, `range`, `roll`, `comparisons` | One attack group with explicit roll relationships |
| `choice` | `options: [{ id, title, blocks }]` | Choose one branch when resolving this section |
| `conditional` | `when`, `blocks` | Branch under an explicit predicate |
| `repeat` | `while`, `blocks` | Repeat under a literal stopping/continuation rule |
| `persistent` | `duration`, `blocks` | Own a persistent rule context |
| `trigger` | `event`, `blocks` | Describe later behavior; do not resolve on initial display |
| `table` | `die`, `results: [{ faces, blocks }]` | Random outcomes covering each die face exactly once |
| `grant` | `activationId`, `duration` | Make another local activation available for the stated duration |

Nested sections preserve scope. A hit-only aftereffect stays inside the hit
branch. An unconditional secondary attack is a sibling after the primary attack.
Summon commands and sustain actions are separate GRANTED activations. A command
granted now does not imply it is used now; an initial free command exception is
preserved in rules text. Nothing here is an execution interpreter.

## Attack groups

An attack owns its actor, target-set binding and range. `roll` has positive
`count`, `sharing` PER_TARGET or ALL_TARGETS, and `statistic`. Count is the
number of rolls per target, or across the entire set for ALL_TARGETS. Every roll
is compared against every listed comparison; additional defenses do not create
additional rolls. Prismatic Spray therefore has count 1, PER_TARGET, and three
comparisons. Driving Assault has count 2 and one comparison.

Statistics are `{ type: ABILITY, ability }`, `{ type: CHOICE, choiceId }`, or
`{ type: RULES_TEXT, text }`. Fixed bonuses, companion formulas, defense
alternatives and unsupported roll expressions remain literal where necessary;
they are not inferred from the power's text.

Each comparison has its own local `id`, defense AC/FORTITUDE/REFLEX/WILL, and
`outcomes` containing optional `hit`/`miss` block arrays. These outcomes apply
per roll and per comparison. An absent miss branch grants no inferred effect.

A structured aggregate predicate is:

```json
{
  "type": "ATTACK_RESULTS",
  "text": "Both attacks hit.",
  "attackId": "strike",
  "comparisonId": "ac",
  "outcome": "HIT",
  "count": 2
}
```

It means exactly that many matching results for that comparison against the
current target context (or the shared roll group for ALL_TARGETS). The validator
checks the reference and that count does not exceed the roll count. More complex
conditions use `{ type: RULES_TEXT, text }`, without claiming evaluation support.

## Geometry

MELEE/RANGED use `distance` and `origin`; distance is a positive leveled value
or WEAPON/TOUCH. CLOSE_BURST/CLOSE_BLAST use `size` and `origin`. AREA_BURST uses
`size`, `origin` and optional placement `distance`; without distance it is
centered on the origin, rather than inventing a numeric range. WALL uses size,
distance and origin; heights and detailed construction rules remain prose.
PERSONAL has no extra fields. CHOICE contains geometry `options`; RULES_TEXT
preserves geometry that is not structured yet. An area size and its placement
distance are distinct values.

## Validation evidence and remaining boundaries

The fixtures cover Rope the Mark, Hurl the Spark, Prismatic Spray, Driving
Assault, Distracting Team, Familiar Surge, Inspiring Word, Summon Savage Tiger,
Memory of Blades, Frozen Heart, Oath of Consuming Light, Blade Barrier, Rune of
the Astral Phalanx, Reality Distortion, Fate Rolls On, and Tempest of Triumph.

Tests exercise preserved source text, order and branch placement, roll sharing,
aggregate results, acquisition choices, independent limits, scaling, deferred
commands, random tables and rejection of malformed identities/references,
impossible counts, grant cycles, unsupported keywords and unknown fields.

Production migration preserves the existing local rules, including explicit
limitations for Cleric Healing Word's conflicting level-16 usage wording and
Warlord's Intelligence flavor versus Strength reference panel. Shared healing
and Channel Divinity limits are structured where the local source is clear.

This establishes a viable authoring shape, not complete power automation.
Durations, save groups/transitions, typed effect calculations, event frequency,
resource payments and complex predicates are still literal rules. The renderer
prints ordered blocks and deferred contexts without executing them. Runtime
interpretation, runtime package compilation, further content adaptation and
saved-character migration remain separate work.

```sh
python -X utf8 src/modern4e/scripts/power_content.py
python -X utf8 src/modern4e/scripts/class_content.py
python -X utf8 -m unittest discover -s src/modern4e/scripts -p test_power_content.py -v
python -X utf8 -m unittest discover -s src/character-builder/content -p test_modern_leaders.py -v
```
