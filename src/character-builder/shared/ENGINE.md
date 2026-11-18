# Shared rules engine

## Shared class runtime (#33)

Package manifests accept versions 1 and 2; mechanics v2 adds class profiles,
structured access/conditions, acquisition levels, explicit selection maxima,
weapon-to-ability mappings and conditional modifiers. New optional fields omit
their defaults, preserving legacy v1 serialization and `sha256-v1` fingerprints.
The fingerprint algorithm includes every populated v2 field and preserved shared
authoring data. Character documents remain v1: no ID mapping or migration occurs.

`classProfile` supplies role, class power sources, direct main/secondary abilities,
equipment proficiencies and closed linear formulas over level/direct abilities.
The main-ability slot is `(class instance, "main", 0)`. Class HP, surges and three
non-AC defenses use these formulas and return an explanation of every term.
Missing/invalid dependencies, conflicting class profiles and integer overflow
produce unavailable values. Armor class, attacks and damage do not gain invented
bases. Allocation remains main 4/non-main budget 5/cap 2 with the optional trade.

Entry grants and finite entry choices activate at their absolute `atLevel`,
independently of entry prerequisites. Automatically acquired entries are not
validated as player selections and never consume selectable power slots.
Repeated grants retain distinct deterministic instances, even when an entry has
a selection maximum of one. Player entry decisions enforce the explicit maximum
and a choice's `distinct` constraint. Class/feature edits retain orphan decisions.

Access and prerequisites share recursive `allOf`/`anyOf` evaluation across
categories. Supported leaves include level, entry, direct ability, proficiency,
class power source and equipment proficiency. Sources qualify through active
classes, not known powers. Unsupported size/selected queries compile to explicit
unresolved conditions with the source data preserved. Mechanics-v2 prerequisites use selection-time snapshots excluding the candidate occurrence and recursively dependent benefit chains. Unknown definitions and unsupported conditions remain explicit gaps. Legacy v1 historical evaluation remains incomplete. In v2 eligibility and automation coverage are separate facts: an
eligible feature may still have incomplete combat effects. Legacy v1 retains its
existing conservative coverage gate.

`EngineResult.entryEligibility` contains selected occurrence eligibility;
`conditionalModifiers` contains sourced, unevaluated context-dependent benefits.
Fighter weapon talents use `ONE_HANDED_WEAPON` / `TWO_HANDED_WEAPON` and never add
to unconditional attack totals. Combat Superiority's Wisdom/Dexterity ambiguity
and Battlerager's temporary-HP/session effects stay explicit limitations. No power
execution is claimed. `weaponAbilities` preserves the shared mastery table.

Android calls `RulesEngine` / `BuilderOperations` directly. The compiled web
`WebContentCatalog.evaluate(characterJson)` uses its opened shared catalog and
returns JSON with statistic/calculation pairs, contributors/modifier explanations,
entries, choices, proficiency sources, coverage, diagnostics, conditional benefits
and occurrence eligibility. No platform math is required.

Explicit v2 class acquisition/formulas can evaluate characters above level 2,
with a general-progression diagnostic. Ability advancement still blocks totals;
power replacement replay validates composition without claiming complete
progression/retraining timing. Shared acquisition through level 10, query pools,
dynamic counts and collections are described below. General advancement and
levels 11?30 remain #20. These limits do not remove data.

`SharedClassTest` consumes the exact compiled Fighter golden on JVM/JS; the web
boundary test consumes the same content. It covers all six independent build
combinations, three granted powers, formula goldens/recalculation, level gates,
cycles, duplicates/conflicts/missing content, repeated grants, forced invalid
decisions, class changes, editing, reconciliation and portable reopen.

`RulesEngine.evaluate(document, content)` is a pure function. `RulesContent` holds
resolved definitions and exact saved-selection resolution results. The separate
suspending `RulesContent.load(document, catalog)` prepares this snapshot, loading
selected definitions, transitive grant dependencies, choice candidates and entry
prerequisite definitions through the existing catalog. It preserves the catalog's
saved-supplier protection and package diagnostics. It never writes characters.
Applications can prepare the snapshot once, then calculate locally without IO.

Results contain all 16 skills, all six ability totals, generic statistics, their
contributors and applied/suppressed modifier explanations; active/granted entry
occurrences, stable choice slots, candidate eligibility, proficiency sources,
per-occurrence coverage and diagnostics. Totals are `ContractResult` values:
unavailable definitions never become numeric zero. Missing definitions conservatively
make all dependent totals unavailable because their unknown effects cannot be
assigned to a narrower target. Partial coverage and unsupported prerequisites keep
explicit diagnostics alongside calculations of known contributions; a numerical
result does not imply full automation or validated eligibility. Manual adjustments
cannot clear those diagnostics or restore unavailable dependencies.

## Modern 4e baseline

The active `helpers/class_reference.typ` assigns main ability **4**, non-main
budget **5**, normally **0–2** per ability. An optional trade lowers one non-main
from zero to **−1**, raising another non-main by **1** (up to 3). The resulting
non-main total remains 5. Missing point-map members represent zero. Allocation
must identify an active main-ability choice and an allowed ability. Invalid
allocations make ability and dependent skill calculations unavailable.

The 16 `Skill` identities and their ability mappings come from
`glossary/skill_checks.typ` and `glossary/balance_changes.typ`. A displayed skill
bonus is its default ability's direct points plus **5** for proficiency and
applicable modifiers. No half-level or vanilla ability-score conversion is used.
These are builder statistics; live GM-selected alternate-ability checks are not
a session feature of this builder.

Background skill options are exposed by `ModernCreation.environments` and
`ModernCreation.upbringings`, transcribed from `glossary/background.typ`.
Background selections use `background.environment.<name>/skill/0` and
`background.upbringing.<name>/skill/0`; names are lower-case. Two independent
free slots are `creation/free-skill/0` and `creation/free-skill/1`. Choice sources
are preserved even when the same skill is granted repeatedly; +5 applies once.
Duplicate chosen proficiency emits incomplete automation: replacement rules are
unspecified, so the engine neither invents a replacement nor deletes a choice.

Initial root entry slots are `creation/{class,ancestry,theme,feat}/0` at level 1.
The level-2 feat slot is `advancement.2/feat/0`. Root categories are checked.
Class/content grants, choices and authored progression through level 2 are
evaluated. The engine reports missing declared choices and orphan decisions;
root-selection and advancement workflows belong to issue #10. Equipped items
apply their declarative mechanics once per occurrence (inventory quantities do
not multiply bonuses). Configuration-specific mechanics remain diagnosed as
incomplete; the engine does not interpret arbitrary configuration strings.

Child choice slots use the selected entry's persistent `instanceId`. Automatic
entry grants receive deterministic IDs from
`ModernCreation.grantInstance(parentInstanceId, grantId)`; the length-prefixed
encoding avoids separator collisions. Grant IDs and choice IDs must be unique
within an occurrence; duplicate occurrence IDs/slots, malformed definitions and
recursive grants are diagnosed rather than silently applied twice. Repeated
grant occurrences remain distinct. Cycles and ambiguous duplicate sources block
dependent totals. A choice's declared option list is enforced; an entry with an
unsatisfied supported prerequisite remains stored, contributes its authored
mechanics and has an invalid-selection diagnostic, allowing forced selections
without pretending they are legal.

## Eligibility limits

Legacy v1 prerequisites are minimum level, selected entry, direct ability points,
and proficiency; v2 also supports the grouped access vocabulary described above. Candidates expose `ELIGIBLE`, `INELIGIBLE`, `INCOMPLETE`, or
`UNRESOLVED`; interfaces offer `ELIGIBLE` by default and retain the others for
diagnostics/explicit selection. Missing prerequisite definitions are unresolved;
an available required entry that is not selected is provably ineligible.
Imported `Unadapted` text is incomplete and never parsed as a score threshold.

Mechanics-v2 eligibility reconstructs facts at the decision level, excluding the
candidate occurrence, its descendants and recursively dependent selections. Later
selections cannot qualify earlier decisions. Equipment and manual adjustments do
not establish prerequisite facts because they have no dated acquisition history.
Forced ineligible selections still contribute their declared benefits under the
existing editing contract; this is not general dependency-validity filtering.
Legacy v1 historical/self-benefit cases remain incomplete. General advancement,
retraining timing and higher levels remain provisional under #20.

Explicit `multiclassFor` counts as the target class for FEAT and PARAGON_PATH
access/prerequisites, including class source conditions. It does not grant the
class's equipment proficiencies or access to its power pools. Actually granted
features satisfy feature prerequisites normally; prose-only feature benefits
remain unsupported and are never inferred from a multiclass title.

`ChoiceDefinition.Proficiencies.distinctAgainstCharacter` enforces authored Skill
Training choices against independent proficiencies and sibling picks. Two new
skills must remain; later-level grants do not invalidate an earlier choice.
Ordinary proficiency choices retain their previous behavior.

Campaign `unavailable` conditions are provably ineligible, distinct from unknown
rules. The production ZEITGEIST policy retains Revenant's definition and saved
selections while denying access. HOMEBREW is explicitly unavailable until its
separate theme roster is migrated. Policy selection is currently at bundle build
time, with no character campaign-switch UI.

`ContentMigration.preview` accepts a reviewed `ContentMigrationPlan` against a
deliberately selected destination catalog. It preserves unmapped/missing targets,
source slots, abilities and inventory configuration, and records original and
adopted selections in optional portable `contentMigrations`. Destination package
precedence is retained; empty/failed migrations leave packages unchanged.
`commit` rejects stale documents and performs no persistence. The explicit
`content/migrations/fighter-v1.json` maps class3 and 174 published attack IDs.
Other identities require reviewed mappings; no automatic score or slot conversion
occurs. Platform confirmation/persistence UI remains pending.

## Modifier semantics

Sources: Rules Compendium pp. 27–28, 309, 314
([bonus](https://iws.mx/dnd/?view=glossary536),
[penalty](https://iws.mx/dnd/?view=glossary549)); PHB3 p. 223
([untyped bonus](https://iws.mx/dnd/?view=glossary508)). The checked-in offline
compendium was read for these rules.

- Positive `ADD` bonuses of the same type keep the highest; different types stack.
- Untyped positive bonuses stack across named game elements; repeated benefits
  from the same entry ID keep the highest, even across different occurrences.
- Penalties have no effective type. Penalties from different named elements add;
  repeated penalties from the same entry ID keep the strongest penalty.
- Manual adjustments use their persistent adjustment ID as their source identity
  and the exact contributor label **Manual Adjustment**, without requiring a reason.
- Skill proficiency's baseline +5 participates as a `PROFICIENCY` bonus so another
  proficiency modifier cannot accidentally add another +5.

`SET` and `MINIMUM` are explicitly authored engine operations, not inferred
published stacking rules. Calculation order is **SET base → stacked ADD → final
MINIMUM floor**, independent of input order. Equal SET values agree; conflicting
SET values are unavailable with incomplete diagnostics. ADD and MINIMUM cannot
invent an absent statistic base. A SET can establish an otherwise unimplemented
generic base (HP, defenses, etc.), but cannot conceal a missing dependency or
invalid allocation. Calculations detect integer overflow. Breakdowns include
applied and suppressed modifiers; applied contributor deltas sum to the total.

## Validation

From `src/character-builder/`:

```powershell
.\gradlew.bat :shared:jvmTest :shared:jsNodeTest
```

The same `RulesEngineTest` and `EngineModifiersTest` common tests run on JVM and
JavaScript, covering the baseline allocation/tradeoff, changed main abilities,
all skill mappings, background/free/granted proficiency, typed and named-source
stacking, penalties, SET/MINIMUM, diagnostics, missing/cyclic grants, repeated
choices, eligibility limits, catalog supplier protection and unavailable values.
No character UI or combat execution is implemented. V2 class formulas are described above.

## Shared power selections (#34)

`Mechanics.powerProfile` records a selectable power's level, usage, attack/utility
kind and keywords. `ChoiceDefinition.Entries` can use a closed `PowerQuery`, with
level/category/usage/keyword filters and separately evaluated access/prerequisites.
Powers without explicit adapted facts are excluded; unsupported technique/other
queries produce no fabricated candidates and retain incomplete coverage.

Shared choice IDs and acquisition levels come from class `advancement.json`.
Nine slots match authored GAIN events through level 10. Each active feature may
replace a target count and add idempotent distinct/keyword constraints. Finite
feature choices resolve before shared pools. Differing count/collection overrides
report `selectionOverrideConflict` and cannot establish eligible candidates.
There is no class-name dispatch. Granted and nested powers use their own source
occurrences and never consume normal slots.

`EngineResult.selectionSets` reports source occurrence, choice ID, required,
selected and remaining counts and whole-set diagnostics. Android receives it
directly; `WebContentCatalog.evaluate` serializes the same API. Individual access
eligibility remains separate from complete-set validity. Druid's three picks
permit either one or two Beast Form powers, arbitrary order and unfinished
intermediate sets; impossible or completed invalid combinations remain saved
and diagnosed. Feature removal recalculates counts without deleting extra picks.

`collections` declare owned lists and capacities; each choice's `collection` routes
its current decisions there. `requiresCollection` verifies ownership independently
for stored/prepared choices, which do not consume a second learning occurrence.
Wizard daily/utility preparation has separate capacities and distinctness; replacing
an acquisition updates ownership and exposes stale preparations. Tome uses
`notKnown` plus explicit `replacementLevels`. Technique occurrence slots are
preserved but remain unresolved until the adapted magic-technique pool exists;
spellbook page costs and combat execution remain incomplete.

Power-only `Replacement` histories replay by stable acquisition slot, preserve the
original occurrence ID and old saved decisions, and recheck all set constraints.
General progression/retraining timing and allowances remain incomplete under #20.
`PowerSelectionTest` runs the same count/bounds/order, feature-removal/conflict,
collection/preparation, Tome, unavailable-catalog, editing/retraining and portable
reopen scenarios on JVM and JavaScript.
