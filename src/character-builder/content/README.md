# Build-time content production

## Production classes (#35)

The normal build validates all authoritative Modern 4e class JSON and compiles
`production-generated/modern4e.classes/` as a format-v2 runtime package. Its
index exposes all 19 migrated classes under their persisted local IDs; complete
flavor, statistics, feature grants, structured conditions and ordered powers
remain in each definition's `sharedData`. The engine reports partial coverage,
unavailable selectable pools and unsupported combat/later-level behavior.
Published class HTML and mechanics never supply or fill these definitions.

Package revision 2 adds all 174 Fighter selectable attacks through level 15 from
`modern4e/content/classes/fighter-attack-powers.json`, with stable local IDs,
level/usage profiles, class access and skill prerequisites. Descriptions render
reviewed ordered rules; original published text is retained only as provenance.
The explicit migration helper is not part of production. The Fighter-only compiler
subset includes its curated attack pool when advancement is enabled; the named
old proof compilation without advancement remains unchanged. Level-13/15 replacement
candidates use replacement-level ceilings while historical eligibility and timing
still report the shared engine's existing limitations.

```powershell
python -X utf8 src/character-builder/content/build.py
python -X utf8 src/character-builder/content/build.py --check
python -X utf8 src/character-builder/content/samples.py
python -X utf8 src/character-builder/content/samples.py --check
python -X utf8 -m unittest discover -s src/character-builder/content -p 'test_*.py' -v
```

The same build retains explicitly imported non-class categories from `proof.json`
under their existing package/entry identities, at revision 2. It excludes every
published class and the now-empty legacy class override package. Imported source
powers remain distinct from the curated authoritative class pools: no name matching,
ability conversion or implicit adaptation occurs. `--check` validates before
comparing exact UTF-8 bytes, rejects extra stale chunks, and never publishes partial
validation results. Change package revisions and regenerate fingerprints/samples
deliberately when evolving contracts or content. Output is deterministic, without
machine paths or timestamps.

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

`generated/`, `shared/fixtures/sample-fighter-*` and the `proof/` platform assets
are named legacy integration fixtures. Regenerate them explicitly with
`build.py --config src/character-builder/content/proof.json`; they are not the
production catalog or a fallback for missing/malformed local JSON. The offline
compendium snapshot and explicit `--config full.json` export remain available.


## Production ancestries, themes, feats, utilities and equipment

`build.py` (normal production mode) also compiles five more mechanics-v2 packages beside `modern4e.classes`,
then validates that every grant, finite choice and entry condition resolves in the combined catalog. Each has a
compiler module and test suite in this folder; `runtime_common.py` supplies the chunked package assembly and
cross-package reference check. The sample new-character template enables all of them.

- `modern4e.ancestries` (`ancestry_runtime.py`): 13 ancestries, 41 traits and 15 powers. Complete authored entries,
  including size, speed, vision and languages, stay in `sharedData`; no modifiers are invented from prose or
  attributes. Grants and Dragonborn/Elf power choices compile to finite entry choices. Damage-type choices,
  Revenant's Past Life (ancestry qualification only, never granting the chosen ancestry's traits) and language
  picks are recorded in `mechanics.unsupported` and coverage limitations. Ancestry powers carry no power profile
  and never enter class power query pools.
- `modern4e.themes` (`theme_runtime.py`): nine Zeitgeist themes, 32 level-benefit features and 11 powers under
  root slot `creation/theme/0`. Gunsmith's five `modifications` options are not an automatic grant or a finite
  choice because their count and timing exist only in prose; they are preserved in `sharedData` and reported as
  unsupported. Theme powers have no power profile.
- `modern4e.feats` (`feat_runtime.py`): all 818 feats in nine chunks. Access, structured prerequisites (allOf/anyOf
  intact) and `selection.maximum` are preserved; entry references to classes, ancestries and their features/powers
  stay `entry` conditions only when the target exists in a runtime package. Pending/unavailable references and
  `size`/`selected` conditions become explicit `unresolved` conditions. Skill Training's skill choice is the only
  compiled choice; other choices and distinct/advance constraints are unsupported and listed in coverage.
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
(`ContentCatalog.readSession`), which keeps large pools such as the 818 feats usable.

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
for distinctness scopes, exhaustion rules and the pending language/weapon catalogs.
Use `--output <directory>` for another location. No timestamps or machine paths
are emitted. Strict validation runs before any output writes; `--check` compares
the exact generated bytes. Unknown fields, duplicate IDs, undeclared references,
invalid values and stale/missing section inventories fail with authoring locations.

The authoring catalog is deliberately not a `PackageManifest` and is not loaded
by the v1 runtime adapters. The existing proof packages and portable characters
retain their current IDs and behavior. Runtime eligibility, fully adapted classes,
campaign availability, feat effects/selection rules, deduplication and saved-ID
migration are tracked in [#29](https://github.com/BanterTheGreat/Foundry-Mono-Repo-4e/issues/29).
Do not flatten OR conditions into AND, discard access rules, or claim that
descriptive effects are automated when compiling the future runtime package.

## Existing compendium proof pipeline

Python 3.9+ (standard library only). Run from the monorepo root:

```powershell
python -X utf8 src/character-builder/content/build.py --config src/character-builder/content/proof.json
python -X utf8 src/character-builder/content/build.py --config src/character-builder/content/proof.json --check
python -X utf8 -m unittest discover -s src/character-builder/content -p 'test_*.py' -v
```

The explicitly selected `--config src/character-builder/content/proof.json` joins separately authored mechanics to the actual offline snapshot and regenerates fourteen checked-in legacy `generated/` assets. No downloads, JavaScript execution, rulebook edits or Foundry deployment occur. `--check` validates input and compares exact generated bytes without writing. Python imports the existing compendium reader's JSONP parser; normalization of identifier keys, trailing commas and quoted strings is data parsing, not evaluation.

To extract all source categories that fit the existing Kotlin contract:

```powershell
python -X utf8 src/character-builder/content/build.py --config src/character-builder/content/full.json --output src/character-builder/content/full-generated
python -X utf8 src/character-builder/content/build.py --config src/character-builder/content/full.json --output src/character-builder/content/full-generated --check
python -X utf8 src/modern4e/scripts/compendium.py verify
```

The larger output is ignored. It is **source presentation with UNIMPLEMENTED mechanics**, not a playable vanilla rules package. This includes source hybrid descriptions without implementing hybrid rules. Monsters, traps, glossary, rituals and other categories outside the character-entry contract remain in the original snapshot. Race becomes ANCESTRY, paragonpath becomes PARAGON_PATH, epicdestiny becomes EPIC_DESTINY, and items/weapons/armor/implements become ITEM. Original IDs retain their category prefixes. FEATURE supports a `classfeature` listing if supplied; this snapshot embeds features in class HTML rather than providing that listing. No feature IDs are invented.

## Asset contract

`generated/<packageId>/manifest.json` is a legacy v1 `PackageManifest`; `production-generated/modern4e.classes/manifest.json` uses format v2. Load each logical index/chunk ID from `<packageId>/<id>.json` as `ContentIndex`/`EntryChunk`. Indexes contain only ID, normalized category, title and chunk ID; descriptions load lazily from chunks. Bundle identical UTF-8 JSON bytes in Android assets and web static assets without conversion or runtime Python. `ProductionPackageTest` embeds these exact files for JVM/JS tests using the existing `ContractCodec` and DTOs. No contracts or `ContentSource` API change. Runtime adapters and catalog resolution belong to the separate catalog work.

HTML is preserved exactly, without sanitizing or rewriting. Publications retain decoded attribution text including page numbers, falling back to listing SourceBook if absent. Internal `?view=` links (including comma-separated IDs) become sorted references checked against **all** snapshot IDs, including categories not bundled. Such links do not imply runtime availability. External URLs remain in untouched HTML. The original entry URL is `https://iws.mx/dnd/?view=<id>`.

Output has sorted package/entry/object keys, fixed-size chunks (default 100), UTF-8, LF and no timestamps or machine-specific paths. Authored mechanics arrays retain their meaningful order. Source failures identify file/row; authored failures identify config/package/entry/property. Validation completes before output writes. Unexpected JSON assets fail rather than silently shipping stale chunks; generate to an empty directory when changing package/chunk layout and deliberately replace the old generated set. IO errors during publication can leave partial output; regenerate or use `--check` before bundling. Outputs inside the original snapshot are rejected.

## Authoring and validation

Each config contains `packages`: unique ID, opaque revision, title, entries, optional chunkSize, dependencies and sourceCategories. `entries` select stable source IDs and optionally supply mechanics plus coverage. `sourceCategories` adds all listing entries in those categories, with explicit entries taking precedence. Mechanics never come from prose parsing or HTML renaming. Overrides are another package's whole entry with the same ID. Dependencies require matching revisions and inclusion in the same build config for offline validation. External prebuilt dependencies are not supported yet.

Mechanics use the existing closed Kotlin v1 vocabulary: prerequisites, grants, choices, typed integer modifiers and level progression. Unknown fields, executable extensions, vanilla skill identities, invalid target qualifiers/ranges, repeated choice/grant IDs, duplicate entries, cycles, missing dependencies and unresolved mechanical references fail. Mechanical references must exist locally or in a declared transitive dependency; presentation references may target the broader snapshot. Duplicate authored JSON keys are rejected.

Absent mechanics receive UNIMPLEMENTED coverage with a limitation. Authored mechanics require explicit coverage. PARTIAL/UNIMPLEMENTED require nonblank limitations; an unadapted prerequisite cannot claim SUPPORTED. Coverage is the author's declaration, not proof that a runtime engine evaluates every operation.

## Modern 4e proof and limits

- `class3`: Strength main-ability choice and an explicitly provisional imported class proficiency choice, replacing Heal/Streetwise with Medicine/Society.
- `feat166`: training becomes proficiency among the current 16 skills, including new Crafting, Medicine/Society using Intelligence, Nature absorbing Dungeoneering, and Wisdom-based Religion in the shared baseline. Repeat-selection restrictions remain incomplete.
- `feat338`: source Str 13 is replaced by a **provisional authored** direct Strength 2-point prerequisite with Medicine/Society choices. This threshold is a proof design decision, not a conversion algorithm or established rulebook ruling. Inspiring Word/multiclass restrictions remain incomplete.
- `feat261`: source Str 15 remains explicitly `unadapted`; it cannot silently use vanilla math or claim full support.
- `feat652`: presentation only; no inferred mechanics.
- `modern4e.proof.override`: replaces `feat166` with a Crafting/Medicine-only choice. This is an integration fixture, not a rulebook rule; its supplying package and fingerprint differ.

Active sources read: `helpers/classes.typ` imports `helpers/class_reference.typ` (main 4 points, **5** non-main points, normal cap **2**, optional -1 tradeoff); `glossary/creation_&_advancement.typ` grants two free proficiencies; `glossary/background.typ` grants environment/upbringing choices; `glossary/skill_checks.typ` supplies current mappings and +5 proficiency; `glossary/balance_changes.typ` supplies renamed/merged skills. The Fighter page supplies local health/defense rules. Those calculations, global creation/background choices and full advancement remain engine work. The class is PARTIAL and does not encode the source HTML's vanilla health/skill formulas. No general score-to-point conversion exists.

The Python suite covers parsing failures, source preservation, joining, Modern 4e choices, default coverage, indexes/chunks, duplicates, dependency/reference validation, strict vocabulary, reproducibility and category expansion. From `src/character-builder/`, run `./gradlew.bat :shared:jvmTest :shared:jsNodeTest` (or `bash ./gradlew` on Unix) to consume the proof through shared contracts on both targets.

## Fighter sample proof (#15)

See [FIGHTER-PROOF.md](FIGHTER-PROOF.md) for exact published sources, active Modern 4e adaptations, hand calculations and coverage gaps. After generating packages, run `python3 src/character-builder/content/samples.py` (or `--check`) to reproduce four portable samples, their coverage manifest and identical web/Android static bundles. These are separate `modern4e.fighter-proof` packages; the earlier pipeline fixtures remain unchanged.


## Shared class authoring (#30/#31)

All 19 local class, feature and granted-power definitions now live
in `src/modern4e/content/classes/` and supply their Typst chapters. Fighter's
explanatory rules live there too, along with the 96 revised selectable Barbarian
attacks. Powers use ordered activation/block data;
the class inventory and normalized export are schema v2. The separate
`python3 src/modern4e/scripts/class_content.py` validator/exporter emits a
`modern4e.class-authoring` catalog, not a v1 runtime package. See the
[class contract](../../modern4e/content/classes/README.md) for commands and exact
coverage. The explicit compendium proof pipeline is retained as a fixture; normal platform
bundles now consume the authoritative class package (#35); the v2 engine/compiler above implements #33, while shared power choices/collections use #34; general retraining/progression timing remains incomplete (#20).
