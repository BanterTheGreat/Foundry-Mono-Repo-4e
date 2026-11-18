# Build-time content production

## Shared-content acceptance and migration (#29)

Production uses an explicit build-time ZEITGEIST profile in `campaign-profiles.json`.
Revenant retains its ID and full definition but has a provably unavailable access
condition. HOMEBREW is explicitly unsupported and outside the current Character Builder
scope by user decision. Only ZEITGEIST is supported. This does not add per-character campaign switching.

Mechanics-v2 eligibility uses independent selection-time facts. Explicit
class-specific multiclass targets qualify for feat/paragon-path class and source
requirements, without opening class power pools or granting class equipment
proficiencies. Skill Training enforces two distinct untrained skills and pool
exhaustion. Armor Proficiency advances the authored category sequence through Plate using independent/current equipment proficiency facts, with repeated-selection cap checks. Other repeatable feat choices/effects remain visible limitations.

`samples.py` additionally generates three unbundled acceptance characters:
level 1, level 2 with a combat utility, and level 2 with a non-combat utility.
Each fills all represented choices using production definitions. Advancement
grants **one utility total**, selected from eligible combat/non-combat options.
`PowerProfile.pickKinds` preserves explicit section membership, and optional
`PowerQuery.pickKind` can restrict a pool without inventing keywords or extra slots.

`migrations/fighter-v1.json` explicitly maps class3 and 174 published Fighter
attack IDs to stable Modern 4e identities. The shared `ContentMigration` API
requires a deliberate destination catalog and preview/commit. It retains unknown
choices, original supplier/title/fingerprint provenance and slots, rejects stale
confirmation, and never converts scores. Package precedence follows the selected
destination catalog. Platform migration UI, save/recovery integration and additional reviewed adoption
plans are deferred to [#38](https://github.com/BanterTheGreat/Foundry-Mono-Repo-4e/issues/38),
outside #29 acceptance. The plan is not applied automatically when opening a character.

Remaining #29 work includes other repeatable effects/weapon option catalogs, language choice persistence/grants, Alchemist's
grant replacement and broader content coverage. Saved-character adoption UI and
additional reviewed ID plans are tracked separately in #38. Higher-level progression
remains provisional under #20.

## Production classes (#35)

The normal build validates all authoritative Modern 4e class JSON and compiles
`production-generated/modern4e.classes/` as a format-v2 runtime package. Its
index exposes all 19 migrated classes under their persisted local IDs; complete
flavor, statistics, feature grants, structured conditions and ordered powers
remain in each definition's `sharedData`. The engine reports partial coverage,
unavailable selectable pools and unsupported combat/later-level behavior.
Published class HTML and mechanics never supply or fill these definitions.

Package revision 3 chunks the package (`entries-NNNN.json`, sorted by ID) and adds the other 17 non-Barbarian
classes' 2,118 selectable attacks through level 15 from `<class>-attack-powers.json` (see the shared class README).
Powers with an unresolved prerequisite (builds Modern 4e lacks) compile without a `powerProfile`, so they resolve by ID
but never enter a query pool. Revision 2 added all 174 Fighter selectable attacks through level 15 from
`modern4e/content/classes/fighter-attack-powers.json`, with stable local IDs,
level/usage profiles, class access and skill prerequisites. Descriptions render
reviewed ordered rules; original published text is retained only as provenance.
The explicit migration helper is not part of production. The Fighter-only compiler
subset includes its curated attack pool when advancement is enabled; the named
old proof compilation without advancement remains unchanged. Level-13/15 replacement candidates use replacement-level ceilings; general
progression/retraining timing remains provisional.

```powershell
python -X utf8 src/character-builder/content/build.py
python -X utf8 src/character-builder/content/build.py --check
python -X utf8 src/character-builder/content/samples.py
python -X utf8 src/character-builder/content/samples.py --check
python -X utf8 -m unittest discover -s src/character-builder/content -p 'test_*.py' -v
```

The production build contains only the six authoritative Modern 4e packages.
It never reads `proof.json` or imports legacy compendium entries as fallback content.
`--check` validates input and exact UTF-8 bytes, rejects extra stale chunks, and
never publishes partial validation results. Output has no machine paths or timestamps.

Android's content Sync and the web adapter both consume `production-generated`
bytes directly; Android assembly and the web production build run the strict
content check before bundling. JVM and JavaScript tests load those same generated
bytes. The new-character template uses `modern4e.class.fighter` supplied by
`modern4e.classes`; it starts with required choices incomplete rather than filling
them with unadapted source powers. The template fingerprint is verified through
the shared codec on both targets.

`class3` remains a distinct published identity. Existing portable characters,
supplier history and unresolved selections are preserved; installing the modern
class package never rewrites them. No automatic adoption/migration exists. Any
future adoption must present explicit mappings and a reconciliation preview.

## Reviewed feat consolidation

`migrations/feat-consolidation-v1.json` explicitly maps nine retired duplicate IDs
to retained definitions. It uses the existing deliberate preview/commit API;
removed heroic Bloodthirsty Visage and paragon Double Lunge have no substitute.
Section `ref` placements share one authored definition and occurrence limit while
preserving class-page order. The runtime exports 798 unique feats; no same-title
groups remain after the reviewed corrections. Stable IDs survive title changes,
including Scouring Wrath and Swordmage Warden/Aegis.

## Current-data test fixtures

`samples.py` generates four level 1/2 Fighter test characters (base and override)
in `shared/fixtures/sample-current-fighter-*.json`, directly from production JSON.
They select current Fighter build features, level-1 attacks, a level-2 utility, Dwarf, Skill Training and Longsword definitions,
with actual suppliers and codec fingerprints. Skill Training uses its authored
two-skill choice. Fighter build and level-1 attack choices use current definitions. Unanswered level-2 choices intentionally
remain visible; these samples do not claim complete playable characters.

`content/test-generated/` holds a test-only whole-entry Fighter override copied
from current data. Only a marked presentation suffix differs; mechanics and
coverage are unchanged. It tests ordering, fingerprints and missing suppliers
without inventing campaign rules. Shared JVM/JS tests load it alongside the exact
production bytes. Android coordinator tests use current character fixtures and
the actual production source. Neither test characters nor test packages ship in
the applications; only `samples/sample-modern-fighter.json` is an app asset.

The old `proof.json`, generated proof packages, platform `proof/` assets, four
provisional saves and hand-calculated proof coverage file have been removed.
Small hand-authored codec/catalog fixtures remain synthetic contract inputs.
Old saved selections keep their identities and provenance and report missing
suppliers; there is no silent migration to current definitions.

Regenerate with `python -X utf8 src/character-builder/content/samples.py` and use
`--check` to detect stale samples or override bytes. Authoritative content changes
must regenerate the production packages first, then these test fixtures.

## Production ancestries, themes, feats, utilities and equipment

`build.py` (normal production mode) also compiles five more mechanics-v2 packages beside `modern4e.classes`,
then validates that every grant, finite choice and entry condition resolves in the combined catalog. Each has a
compiler module and test suite in this folder; `runtime_common.py` supplies the chunked package assembly and
cross-package reference check. The sample new-character template enables all of them.

- `modern4e.ancestries` (`ancestry_runtime.py`): 13 ancestries, 41 traits and 15 powers. Complete authored entries,
  including size, speed, vision and languages, stay in `sharedData`; size additionally supplies a structured prerequisite fact. No modifiers are invented from prose or
  attributes. Grants and Dragonborn/Elf power choices compile to finite entry choices. Damage-type choices,
  Revenant's Past Life (ancestry qualification only, never granting the chosen ancestry's traits) and language
  picks are recorded in `mechanics.unsupported` and coverage limitations. Ancestry powers carry no power profile
  and never enter class power query pools.
- `modern4e.themes` (`theme_runtime.py`): nine Zeitgeist themes, 32 level-benefit features and 11 powers under
  root slot `creation/theme/0`. Gunsmith's five `modifications` options are not an automatic grant or a finite
  choice because their count and timing exist only in prose; they are preserved in `sharedData` and reported as
  unsupported. Theme powers have no power profile.
- `modern4e.feats` (`feat_runtime.py`): all 798 feats in eight chunks. Access, structured prerequisites (allOf/anyOf
  intact) and `selection.maximum` are preserved; entry references to classes, ancestries and their features/powers
  stay `entry` conditions only when the target exists in a runtime package. Pending/unavailable references
  remain explicit unresolved conditions. `size`/`selected` predicates compile to structured ancestry and selection queries; unknown facts stay incomplete. Skill Training's two distinct untrained skill choices are enforced, including exhaustion;
  Armor Proficiency advances the authored category sequence through Plate; other choices and distinct constraints are unsupported and listed in coverage. Explicit
  tagged multiclass targets carry contextual feat/paragon-path qualification; other benefits remain descriptive.
- `modern4e.utilities` (`utility_runtime.py`): all 1,081 utility powers. The 1,010 in AVAILABLE sections carry a
  `powerProfile` and join the level-N utility pools; the 71 DEFERRED class utilities stay in the package so IDs
  resolve but have no profile. `sharedData.utilitySection` keeps section kind/availability and COMBAT/NON_COMBAT
  pick kinds. The advancement pool queries do not carry the authored `access: CHARACTER` filter, so pools list
  other classes' utilities; selection still requires eligible access and prerequisites.
- `modern4e.equipment` (`equipment_runtime.py`): 53 ITEM entries (45 weapons, 6 armor, 2 shields). Descriptions
  render deterministically from structured fields only. No armor, speed, attack or damage number becomes a modifier;
  `sharedData` keeps the authored profile, property definitions and armor rules. The authoring export
  (`--modern-equipment`) is unchanged.

`BuilderOperations.options` evaluates each candidate against one shared decoded catalog snapshot
(`ContentCatalog.readSession`), which keeps large pools such as the 798 feats usable.

## Shared class runtime package (#33)

```powershell
python -X utf8 src/character-builder/content/build.py --modern-classes-runtime
python -X utf8 src/character-builder/content/build.py --modern-classes-runtime --check
python -X utf8 -m unittest discover -s src/character-builder/content -p test_class_runtime.py -v
```

This validates the authoritative Modern 4e class catalog and emits an ignored
`modern-classes-runtime-generated/modern4e.classes/` package: manifest format 2,
index and chunk, with mechanics v2. The shared catalog/codec loads this package.
The normal production build includes this compiler output in the platform bundles. No compendium class data supplies these
definitions, and no legacy `class3`/feature/power IDs are rewritten.

`class_runtime.py` maps class metadata/proficiencies, direct main abilities,
local formula terms, automatic acquisition and finite feature-owned choices.
Structured access/prerequisite groups retain their meaning. It preserves complete
authoring entries (including flavor, ordered powers, source notes and unsupported
choices) in `sharedData`, included in definition fingerprints. Unsupported
condition queries outside the implemented vocabulary become explicit unresolved
conditions. Shared `PowerQuery`/`PowerProfile`, `SelectionModifier`,
`SelectionSetResult` and `PowerCollection` contracts carry candidate filters, count
overrides, additive constraints, remaining requirements and owned collections.
Conflicting overrides report incomplete automation. Individual eligibility and
whole-set validity remain separate. Stored/prepared occurrences do not consume
normal learning slots or trigger duplicate-learning checks.
Combat/session effects remain partial/unimplemented coverage. Conditional weapon
talents and weapon-ability mappings are authored data, not inferred from prose.

The compiler tests compare the Fighter subset to the exact common Kotlin golden
`shared/fixtures/shared-fighter-chunk.json`, require deterministic regeneration,
and check changed formulas, missing references, unsupported content and the closed
conditional vocabulary. If intentionally changing the runtime mapping or Fighter
authoring, regenerate this golden with `class_runtime.build(class_ids=[
"modern4e.class.fighter"])["modern4e.classes/entries.json"]` and review its diff.

The shared acquisition slots mirror authored GAIN events through level 10. Wizard
known/stored/prepared daily and utility choices have separate capacities; extra
technique slots remain unresolved because an adapted technique catalog is absent.
Tome of Readiness excludes known powers and exposes replacement levels 1/3/7.
`ReplacePower` preserves the target occurrence and revalidates composition while
replaying saved history. General retraining and progression timing remain
incomplete under #20; builder creation/forward editing is still limited to levels
1?2. Direct higher-level documents expose authored acquisition without claiming
complete higher-level rules.

## Shared equipment authoring

The authoritative [equipment catalog](../../modern4e/content/equipment/README.md)
supplies all Modern 4e weapon/armor/shield tables and property rules to Typst.
`python3 src/character-builder/content/build.py --modern-equipment` exports those
same structured profiles for builder compilation; append `--check` to verify
the deterministic output. This is an authoring catalog, not a v1 runtime package;
equipment combat automation and saved-ID migration remain unimplemented.

The [shared Modern 4e content model](../../../docs/modern4e-content-model.md)
records the reusable entry base for feats and future powers, classes, ancestries
and other categories, including the distinction between implemented fields and
selection authoring and its remaining runtime integration.

## Shared Modern 4e feats (#28)

The authoritative local feat definitions now live in
`src/modern4e/content/feats/`; see their [authoring contract](../../modern4e/content/feats/README.md).
They supply local descriptions, persistent IDs, explicit access and structured
prerequisites directly, without consulting or matching the compendium:

```sh
python3 src/character-builder/content/build.py --modern-feats
python3 src/character-builder/content/build.py --modern-feats --check
```

This produces `modern-feats-generated/modern4e.feats/catalog.json` (ignored), a
versioned **authoring catalog**, with original section order, structured conditions,
reference declarations, generated requirement/selection text and per-entry unresolved
gaps. Feat files and this catalog use schema v2, including explicit `selection`
limits and separate `choices`. See the [selection contract](../../../docs/modern4e-selection-rules.md)
for distinctness scopes, exhaustion rules and reviewed language/weapon catalogs.
Use `--output <directory>` for another location. No timestamps or machine paths
are emitted. Strict validation runs before any output writes; `--check` compares
the exact generated bytes. Unknown fields, duplicate IDs, undeclared references,
invalid values and stale/missing section inventories fail with authoring locations.

The authoring catalog is deliberately not a `PackageManifest` and is not loaded
by the v1 runtime adapters. Existing portable characters retain their saved IDs and provenance even when their suppliers are unavailable. Runtime eligibility, fully adapted classes,
campaign availability, feat effects/selection rules, deduplication and saved-ID
migration are tracked in [#29](https://github.com/BanterTheGreat/Foundry-Mono-Repo-4e/issues/29).
Do not flatten OR conditions into AND, discard access rules, or claim that
descriptive effects are automated when compiling the future runtime package.

## Optional offline compendium import

The importer is independent of production. Its tests use temporary presentation-only
configs and synthetic malformed inputs, not a maintained provisional rules package.
Python parses JSONP as data without executing JavaScript.

To extract all source categories that fit the existing Kotlin contract:

```powershell
python -X utf8 src/character-builder/content/build.py --config src/character-builder/content/full.json --output src/character-builder/content/full-generated
python -X utf8 src/character-builder/content/build.py --config src/character-builder/content/full.json --output src/character-builder/content/full-generated --check
python -X utf8 src/modern4e/scripts/compendium.py verify
```

The larger output is ignored. It is **source presentation with UNIMPLEMENTED mechanics**, not a playable vanilla rules package. This includes source hybrid descriptions without implementing hybrid rules. Monsters, traps, glossary, rituals and other categories outside the character-entry contract remain in the original snapshot. Race becomes ANCESTRY, paragonpath becomes PARAGON_PATH, epicdestiny becomes EPIC_DESTINY, and items/weapons/armor/implements become ITEM. Original IDs retain their category prefixes. FEATURE supports a `classfeature` listing if supplied; this snapshot embeds features in class HTML rather than providing that listing. No feature IDs are invented.

## Asset contract

`production-generated/<packageId>/manifest.json` uses package format v2. Explicit offline source exports use format v1. Load each logical index/chunk ID from `<packageId>/<id>.json` as `ContentIndex`/`EntryChunk`. Indexes contain only ID, normalized category, title and chunk ID; descriptions load lazily from chunks. Bundle identical UTF-8 JSON bytes in Android assets and web static assets without conversion or runtime Python. `ProductionPackageTest` embeds these exact files for JVM/JS tests using the existing `ContractCodec` and DTOs. No contracts or `ContentSource` API change. Runtime adapters and catalog resolution belong to the separate catalog work.

HTML is preserved exactly, without sanitizing or rewriting. Publications retain decoded attribution text including page numbers, falling back to listing SourceBook if absent. Internal `?view=` links (including comma-separated IDs) become sorted references checked against **all** snapshot IDs, including categories not bundled. Such links do not imply runtime availability. External URLs remain in untouched HTML. The original entry URL is `https://iws.mx/dnd/?view=<id>`.

Output has sorted package/entry/object keys, fixed-size chunks (default 100), UTF-8, LF and no timestamps or machine-specific paths. Authored mechanics arrays retain their meaningful order. Source failures identify file/row; authored failures identify config/package/entry/property. Validation completes before output writes. Unexpected JSON assets fail rather than silently shipping stale chunks; generate to an empty directory when changing package/chunk layout and deliberately replace the old generated set. IO errors during publication can leave partial output; regenerate or use `--check` before bundling. Outputs inside the original snapshot are rejected.

## Authoring and validation

Each config contains `packages`: unique ID, opaque revision, title, entries, optional chunkSize, dependencies and sourceCategories. `entries` select stable source IDs and optionally supply mechanics plus coverage. `sourceCategories` adds all listing entries in those categories, with explicit entries taking precedence. Mechanics never come from prose parsing or HTML renaming. Overrides are another package's whole entry with the same ID. Dependencies require matching revisions and inclusion in the same build config for offline validation. External prebuilt dependencies are not supported yet.

Mechanics use the existing closed Kotlin v1 vocabulary: prerequisites, grants, choices, typed integer modifiers and level progression. Unknown fields, executable extensions, vanilla skill identities, invalid target qualifiers/ranges, repeated choice/grant IDs, duplicate entries, cycles, missing dependencies and unresolved mechanical references fail. Mechanical references must exist locally or in a declared transitive dependency; presentation references may target the broader snapshot. Duplicate authored JSON keys are rejected.

Absent mechanics receive UNIMPLEMENTED coverage with a limitation. Authored mechanics require explicit coverage. PARTIAL/UNIMPLEMENTED require nonblank limitations; an unadapted prerequisite cannot claim SUPPORTED. Coverage is the author's declaration, not proof that a runtime engine evaluates every operation.

## Retired dependencies and reviewed languages (#29)

Feral Companion, Fey Charge, Combat Opening and Elusive Hexer are removed from
shared authoring and production. No active feat requires Eladrin/Half-elf; no
authored unresolved prerequisite occurrence remains. Saved retired IDs are not
mapped to other options and preserve their supplier/title/fingerprint provenance.

`modern4e/content/languages.json` (relative to `src/`) records the ten published
languages approved for Linguist, including stable IDs, scripts and the Rules
Compendium p. 69 source. The feat authoring catalog exports `optionCatalogs.LANGUAGE`;
Linguist's runtime `sharedData.runtimeChoiceCatalogs.LANGUAGE` carries identical
catalog data. Its structured value choices persist three new languages and the
authored chosen skill bonus, with separate language and bonus-skill exhaustion
rules. WEAPON options come from the nine superior identities in the validated
local equipment catalog plus the explicitly authored simple-and-military bundle.
Weapon Proficiency and Adaptable Breath compile scoped distinct choices; ancestry
choices and grants supply structured language, damage and qualification facts.
Descriptive identity language text supplies no eligibility facts. Other unspecified
feat benefits remain manual. HOMEBREW still denotes the alternate rulebook theme
roster in `glossary/themes.typ`, not a general switch enabling arbitrary imports;
its builder profile stays disabled and is outside the current scope by user decision.

Alchemist substitutes only for explicitly authored class-feature Technique Master
grants. The class compiler retains the source grant ID and emits its permitted
replacement IDs; runtime dependency validation includes default and replacement.
There is no additional normal feat slot, inferred technique catalog or formula
automation. Missing sources/options preserve saved substitution decisions with
diagnostics. Regenerate production packages and sample fingerprints with `build.py`
and `samples.py` after changing inputs, then check both with `--check`.
