# Shared rules engine

Selection-time dependency exclusion and historical reconstruction belong to the
internal `SelectionTimeFacts` module. Equivalent reconstructed documents share a
facts evaluation within one rules evaluation; caches never survive a content or
document evaluation. Internal targeted candidate checks preserve activation and
occurrence eligibility while skipping unrelated choice eligibility and final
statistics. Normal `RulesEngine.evaluate` still produces the complete result.
Public contracts and saved-supplier protection are unchanged.

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
produce unavailable values. Fortitude, Reflex and Will include the default
Modern 4e tier bonus once: +1 at levels 1-10, +2 at 11-20 and +3 at 21-30.
Armor Class gets no tier bonus; it adds half the character level, rounded down, and is otherwise
10 plus the greater of direct Dexterity
or Intelligence points in light armor or without armor, plus the equipped
armor's listed bonus. Heavy armor replaces the ability contribution. A proficient
equipped shield adds its bonus to Armor Class and Reflex. Unproficient armor
imposes a −2 Reflex penalty. Multiple equipped armor entries make Armor Class
and Reflex unavailable. Known points support a Stats preview during unfinished
creation choices. Class-specific non-AC defense bonuses are shown separately
from the base 10 in their calculation contributors. Half level is added only to
Armor Class; skill and non-AC defense formulas remain authored. Attacks and damage still have
no default base. Allocation remains main 4/non-main budget 5/cap 2 with the
optional trade.

Entry grants and finite entry choices activate at their absolute `atLevel`,
independently of entry prerequisites. Automatically acquired entries are not
validated as player selections and never consume selectable power slots.
Repeated grants retain distinct deterministic instances, even when an entry has
a selection maximum of one. Player entry decisions enforce the explicit maximum
and a choice's `distinct` constraint. Class/feature edits retain orphan decisions.

Access and prerequisites share recursive `allOf`/`anyOf` evaluation across
categories. Supported leaves include level, entry, direct ability, proficiency,
class power source and equipment proficiency. Sources qualify through active
classes, not known powers. Size predicates use structured ancestry size. The authored selected predicates query explicit class-specific multiclass targets and selected leveled encounter-power profiles. Missing or conflicting size and missing power profiles remain incomplete; titles and descriptions never establish these facts. Mechanics-v2 prerequisites use selection-time snapshots excluding the candidate occurrence and recursively dependent benefit chains. Unknown definitions and unsupported conditions remain explicit gaps. Legacy v1 historical evaluation remains incomplete. In v2 eligibility and automation coverage are separate facts: an
eligible feature may still have incomplete combat effects. Legacy v1 retains its
existing conservative coverage gate.

`EngineResult.entryEligibility` contains selected occurrence eligibility;
`conditionalModifiers` contains sourced, unevaluated context-dependent benefits.
Fighter weapon talents use `ONE_HANDED_WEAPON` / `TWO_HANDED_WEAPON` and never add
to unconditional attack totals. Combat Superiority's Wisdom/Dexterity ambiguity
and Battlerager's temporary-HP/session effects stay explicit limitations. No power
execution is claimed. `weaponAbilities` preserves the shared mastery table.

Android calls `RulesEngine` / `BuilderOperations` directly. The compiled web
`WebContentCatalog.evaluate(characterJson)` evaluates through `BuilderOperations`
on its opened shared catalog, so it reports the same diagnostics as Android, and
returns JSON with statistic/calculation pairs, contributors/modifier explanations,
entries, inline choices, proficiency sources, coverage, diagnostics, conditional
benefits and occurrence eligibility. Root offers and the offers' category,
required, filled and listing fields are not serialized. No platform math is required.

Modern 4e progression is evaluated through level 19. Starting allocation stays
separate from earned increases: levels 4 and 12 require one non-main +1 decision,
level 8 automatically increases the main ability by 1, and level 16 automatically
increases all abilities by 1. Invalid or missing non-main decisions stay saved and
make dependent totals unavailable; known previews still show earned valid points.
Historical prerequisite snapshots include only increases earned by that level.
Character feat roots follow the advancement schedule, including levels 11 and 17; the
paragon-path root is `advancement.11/paragon-path/0`. Authored path grants and
choices activate at their declared acquisition levels. Levels 20–30 are preview only.

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
bonus is its default ability's direct points plus **half the character's level
(rounded down)**, **5** for proficiency, and applicable modifiers. Half-level
applies to proficient and untrained skills. No vanilla ability-score conversion is used.
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
Later feats use `advancement.N/feat/0` at each local feat level, and the level-11
path uses `advancement.11/paragon-path/0`. Root categories and active levels are
checked. Class/content grants, choices and authored progression through level 19
are evaluated. The engine reports missing declared choices, unfilled root slots
(see Slot offers below) and orphan decisions. Equipped items
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
Legacy v1 historical/self-benefit cases remain incomplete. Retraining allowances remain unspecified by the local chapter. Levels after 19 remain unsupported.

Explicit `multiclassFor` counts as the target class for FEAT and PARAGON_PATH
access/prerequisites, including class source conditions. It does not grant the
class's equipment proficiencies or access to its power pools. Actually granted
features satisfy feature prerequisites normally; prose-only feature benefits
remain unsupported and are never inferred from a multiclass title.

`ChoiceDefinition.Proficiencies.distinctAgainstCharacter` enforces authored Skill
Training choices against independent proficiencies and sibling picks. Two new
skills must remain; later-level grants do not invalidate an earlier choice.
Ordinary proficiency choices retain their previous behavior.

`armorAdvancement` carries an authored category order and step count. The engine
replays it by acquisition level against class and explicit `equipmentProficiencies`
grants, retaining each source in `EngineResult.equipmentProficiencies` (also exposed
by the web bridge). It grants only the next category; no starting proficiency or
past-cap benefit is invented. Independent selection-time snapshots enforce the
cap across repeated selections and expose the resulting facts to equipment
prerequisites. These grants do not apply armor statistics or combat effects.

Campaign `unavailable` conditions are provably ineligible, distinct from unknown
rules. The production ZEITGEIST policy retains Revenant's definition and saved
selections while denying access. HOMEBREW is explicitly unsupported and outside the current Character Builder
scope by user decision. Only ZEITGEIST is supported. Policy selection is currently at bundle build
time, with no character campaign-switch UI.

`ContentMigration.preview` accepts a reviewed `ContentMigrationPlan` against a
deliberately selected destination catalog. It preserves unmapped/missing targets,
source slots, abilities and inventory configuration, and records original and
adopted selections in optional portable `contentMigrations`. Destination package
precedence is retained; empty/failed migrations leave packages unchanged.
`commit` rejects stale documents and performs no persistence. The explicit
`content/migrations/fighter-v1.json` maps class3 and 174 published attack IDs.
Other identities require reviewed mappings; no automatic score or slot conversion
occurs. Platform confirmation/persistence UI and additional reviewed ID plans are deferred
to [#38](https://github.com/BanterTheGreat/Foundry-Mono-Repo-4e/issues/38) and do not
block #29; the existing shared API remains available.

## Unmet conditions and slot issues

Callers decide from typed verdicts, never from diagnostic codes or wording.
`EntryEligibility.unmet` lists the candidate's unmet conditions: `Failed`,
`Unavailable`, `Unresolved` and `Unadapted` carry their authored leaf, and
`Unchecked` names why facts were missing (definitions, class, size or
selected-power facts, or a self/historical dependency). It follows the same
alternative filtering as the diagnostics, is filled by full evaluation,
selection-time snapshots and both prepared fast paths, reaches
`BuilderOption.unmet`, and is not serialized. `EngineResult.slotIssues` keys
`Timing`, `InvalidOption`, `Orphan` and `Remaining` by slot; editors reject
mistimed replacements, invalid value decisions and violated selection sets from
them. Every verdict still emits its diagnostic with an unchanged code and
message: diagnostics are the presentation surface only.

## Occurrence timeline

`OccurrenceTimeline.of(document, content)` answers once per evaluation which occurrences
are active, the acquisition level of each occurrence and choice slot, which grants were
substituted and which saved replacements retired an occurrence. It is built on the
per-entry rule `ContentEntry.activation(level)`: the progression rows, grants (with
their alternatives) and choices one entry activates by a level, from that entry alone.
Content loading follows the same rule, as do the detail reader and upcoming-grant
previews; the paragon-path and foreign-power filters ask the timeline of the character
at the picker level. Every saved pick whose content resolves activates when its root
slot or offering choice is active; missing content stays saved, activates nothing and
remains a blocker. The engine reports the timeline's walk and judges substitution and
replacement validity; it never re-derives activation. Equipment has no dated history
and is acquired at the current level.

## Advancement schedule and slot offers

`AdvancementRules.schedule` is the one advancement schedule for levels 1–30. Each
`AdvancementLevel` holds the powers offered (kind and class, path or destiny source),
whether a feat is gained, the ability increase (non-main, main or all), the
replacement (daily or encounter), the path or destiny selected and the path or
destiny features granted. Levels 20–30 are `previewOnly`: shown for planning, never
enforced, and they open no root slots. The engine reads automatic main/all increases,
non-main decision levels, daily replacement levels and root categories from it, and
`AdvancementRules.rootSlots(level)` gives the root slot identities and categories of
each enforced level (`classSlot`/`ancestrySlot` serve document readers).

`EngineResult.choices` holds every slot offer. Inner offers, opened by entries, keep
their `INLINE` listing and evaluated `entries` unchanged. Root offers follow them:
class, ancestry, theme and the creation feat, then by level the non-main increase,
feat, paragon path and daily replacement up to the character's level (at most 19).
Each carries its `category` (`SlotCategory.Entry`, `AbilityIncrease` or
`Replacement`), acquisition level, `required = true` and a `DEFERRED` listing: its
candidates are never evaluated during `evaluate` and come only from
`BuilderOptionListing` when asked for, so the prepared feat fast path and progressive
feat listing are untouched. `filled` is true when the slot holds a saved decision;
an ability increase counts only when it is a valid non-main increase, a replacement
milestone when a progression replacement is recorded at its level. Inner entry,
proficiency and value offers are required unless optional; the main-ability offer is
filled by the allocation and is not required. An unfilled root entry or replacement
slot also emits `engine.missingRootChoice` (INVALID_SELECTION; "Choose a Theme.",
"Select an entry for this starting or advancement slot." or "Replace an earlier class
daily attack power."); a missing increase keeps `engine.missingAdvancement`. These
diagnostics are not blockers and change no totals. Callers count `missing` offers
instead of rebuilding the schedule; Android's Levels screen and missing-choice count
read them.

## Listing retention

`EffectProfile.of(entry)` classifies an entry's own mechanics as passive, a plain power
(passive plus a power profile) or active, lists the kinds of facts it can supply
(identity, power profile, further entries, facts, proficiencies, ability points,
equipment proficiency, class access, size, pool rules) and answers whether it can
change one requirement leaf. The prepared feat and power fast paths and listing
retention all ask it.

`ListingRetention.verdict(before, after, listing)` decides from the character before
and after an edit whether a `BuilderOptionListing` is still correct: `Drop` (another
character), `Keep`, or `Rebase(recheck)`, which keeps every loaded definition and marks
the rows `recheck` selects unchecked. A listing survives while its slot's occurrence,
candidate pool and every rules input at or below its level are unchanged, ignoring
selections proven independent of it. Only selections the edit added or removed count as
changed (with the selections a changed replacement displaces or restores), and retired
occurrences resolve through the occurrence timeline (`EngineResult.retired`), so a daily
replacement does not make every edit recheck the whole listing.
`BuilderOptionListing.retainedAfter` applies a
verdict. Content changes are not judged: callers discard every listing first.

## Structured feat and ancestry choices (#29)

`ChoiceDefinition.Values` exposes finite `ValueOption` identities and labels.
`LevelDecisions.values` stores `ValueChoice(slot, value)` decisions without copying
derived facts. Empty arrays are omitted so existing documents retain their shape.
`EngineChoice.values` and `BuilderEdit.Value` provide the same options/edits to
Android and the web bridge. Saved invalid and orphan decisions remain exportable
and receive diagnostics rather than being silently cleared.

`Mechanics.facts` and choice grants produce sourced `EngineResult.facts`.
Languages are character facts; weapon and Linguist bonus-skill distinctness use
the same entry's earlier occurrences; damage types target a power ID. Past Life
supplies ancestry qualification only, without activating its traits, languages,
size or powers. Personal-detail language/size prose does not create these facts.
`Mechanics.factLinks` explicitly projects Dragonborn Scales' entry-scoped damage
choice onto active Dragon Breath power facts. Other ancestry damage choices do
not become Dragon Breath types merely because their strings match.
Weapon Proficiency grants one reviewed superior identity or the authored
simple-and-military bundle. Linguist grants three new distinct languages and its
chosen feat bonus, with bonus-skill repeats allowed only after exhaustion.
Adaptable Breath excludes existing Dragon Breath damage types from every source.
Acquisition-time snapshots and self/dependent-chain protection remain in force.

`Grant.Entry.replacementEntryIds` declares explicit alternatives to a default
grant. Alchemist is authored only on the existing Wizard/Artificer class-feature
Technique Master grants. The parent occurrence and grant ID keep the same slot
and deterministic `ModernCreation.grantInstance` identity across substitutions.
An optional entry decision selects the default or alternative through ordinary
builder editing; removing that decision restores the default. Removed sources,
withdrawn alternatives and missing suppliers retain saved decisions and produce
diagnostics. This adds no general retraining, formula grants or technique effect
automation. Unsupported effects retain visible coverage.

Optional grant choices expose their source `acquisitionLevel`. Editors reject
substitutions recorded at another level. A saved late substitution stays portable
with a timing diagnostic and the default grant active, so later facts cannot
retroactively qualify the replacement.

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
Combat execution remains outside the builder. V2 class formulas are described above.

## Shared power selections (#34)

`Mechanics.powerProfile` records a selectable power's level, usage, attack/utility
kind and keywords. `ChoiceDefinition.Entries` can use a closed `PowerQuery`, with
level/category/usage/keyword filters and separately evaluated access/prerequisites.
Powers without explicit adapted facts are excluded; unsupported technique/other
queries produce no fabricated candidates and retain incomplete coverage.

Shared choice IDs and acquisition levels come from class `advancement.json`.
Class slots match authored GAIN events through level 19. Each active feature may
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
Progression replacements validate one earlier class daily attack at levels 9, 15 and 19. Retraining remains explicitly incomplete because the local chapter supplies no allowance.
`PowerSelectionTest` runs the same count/bounds/order, feature-removal/conflict,
collection/preparation, Tome, unavailable-catalog, editing/retraining and portable
reopen scenarios on JVM and JavaScript.
