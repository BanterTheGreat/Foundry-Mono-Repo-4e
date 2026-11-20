# Shared builder operations

## Calculation and content lifetime

Each `evaluate`, `options` or `apply` call owns operation-local content preparation.
Decoded, validated and indexed chunks and dependency expansion are reused within
that operation; the next call observes fresh source bytes. Reopen the catalog after
package metadata/order changes. Candidate snapshots contain only their own dependencies.
Future progression and acquisition definitions are deferred until active. Active power
queries still prepare the complete power catalog because metadata lacks power facts.

Choice listing and single-entry validation share the internal `ChoiceEvaluation`
module. Selecting an entry checks that candidate without evaluating other entries
in its category. Mechanics v2 candidates activate the same rules but calculate only
their own eligibility; legacy candidates retain complete diagnostic evaluation.
Batch edits validate sequentially and publish one final calculated state, or return
the original state on rejection. Calculation reuse is bounded and expires with the operation.

Android Save persists the calculated state with a new `savedAt`, then publishes it
only after durable storage succeeds. The timestamp triggers no additional rules
calculation. Failed saves leave the prior visible state intact.

Explicit browsing sessions are the exception to operation-local catalog reads.
`nextBrowsingSession()` starts fresh character preparation while preserving the
unchanged catalog snapshot's decoded content. `BuilderOptionListing.inheritFrom`
retains definitions and preview content and copies checked eligibility only for
rows proven independent of the edit. Other rows become unchecked with unresolved
eligibility and no stale diagnostics. Candidate metadata is regenerated before
inherited rows are exposed. Character/catalog reloads discard this snapshot;
ordinary direct evaluate/apply calls continue to read fresh content.

Shared class v2 definitions expose their main ability at `(class instance,
"main", 0)` and feature-owned choices under deterministic grant instances.
Options use shared occurrence eligibility separately from combat coverage;
incomplete combat automation does not by itself make a v2 feature ineligible.
Class/feature replacement retains the edited occurrence ID and every dependent
decision, reporting newly orphaned choices. No legacy-to-modern ID mapping is
implicit. See [ENGINE.md](ENGINE.md) for class formulas and conditional benefits.

`BuilderOperations(catalog)` uses the character's existing package-order catalog.
`create` takes caller-generated character ID, RFC 3339 saved timestamp, identity,
package revisions, direct point allocation and a level from 1 through 19. It fills empty level
containers without inventing player choices. `evaluate` refreshes content and
returns `BuilderState(document, rules)` without saving. Recreate the coordinator
when packages change; use the reconciliation workflow below for package switching.

`apply(document, BuilderEdit)` returns a recalculated state and `applied` flag.
Operation diagnostics explain rejected commands; rule diagnostics live in
`state.rules.diagnostics`. Identity, allocation (including main ability/source),
entry, proficiency, background, equipment/configuration and manual-adjustment
edits are supported. Entry/equipment/adjustment removal is explicit. Changes do
not update savedAt; persistence owns the timestamp. No storage, clock, ID
generator or platform API is used.

Use `options(document, level, slot)` for eligible entry choices. Pass
`includeIneligible = true` to inspect incomplete, unresolved or invalid options;
`Entry.acceptIneligible = true` explicitly accepts an available noneligible entry
and retains engine diagnostics. Unavailable entries cannot be newly selected;
existing unavailable selections survive unrelated edits. Root slots are
`creation/{class,ancestry,theme,feat}/0` at level 1, `advancement.N/feat/0` at
each local feat level and `advancement.11/paragon-path/0` at level 11. Child slots come from engine choices. Existing
occurrence IDs survive replacement, keeping child slots stable; new occurrence
IDs come from callers. Repeated choices use distinct ordinals and instances.

`Level(2)` preserves all prior choices and exposes authored level-2 choices.
Direct level-2 creation allows filling both levels. `Level(n)` accepts levels 1–30. Raising pads empty decisions for each new level. Lowering removes decisions acquired above the target level. Progression through level 19 uses the local advancement table. `Advancement(level, value)` saves or clears the non-main increase at levels 4 and 12; level 8 main and level 16 all-ability increases are automatic. Retraining allowances remain unspecified.

`Background` selects environment/upbringing and one skill; changing its name
preserves the old skill unless explicitly replaced, so a now-invalid skill stays
visible. `Proficiency` fills an active slot, including both free skill ordinals.
`Allocation` stores invalid intermediate allocations for editing and delegates
budget/main-ability validation to the engine (main 4, non-main total 5, caps 2,
optional −1 trade). No operation removes dependent choices when rules change.
All wire-valid incomplete/invalid/unresolved documents remain codec-exportable.
Equipment configuration is preserved but still has incomplete automation.

Run `bash gradlew :shared:jvmTest :shared:jsNodeTest :shared:jsBrowserDevelopmentLibraryDistribution`
from `src/character-builder/` for shared behavior and the web consumable build.

## Content reconciliation and package changes (#11)

`ContentReconciliation(source, standardPackageId)` opens a fresh catalog for each
operation. Android and common Kotlin callers use it directly; the same common
implementation compiles to JavaScript. The platform workflow tickets own UI and
plain-data web bindings, as they do for `BuilderOperations`.

- `reconcile(document)` returns `ContractResult<ReconciliationState>` with the
  unchanged document, current rules, per-occurrence resolutions and changed
  installed package revisions. `acknowledgmentRequired` is a content-change
  notice, separate from invalid, unresolved and incomplete rule diagnostics.
  A revision-only update does not invent a definition change.
- `selections` covers level entries, replacement history and all inventory,
  including unequipped items. Each occurrence retains its saved title and
  provenance. `detailsAvailable` is false for missing suppliers, removed entries
  or failed detail reads; inspect `definition` for diagnostics. A missing custom
  supplier never silently adopts a standard definition.
- `acknowledge(document)` explicitly refreshes all available selection titles,
  suppliers and fingerprints, plus installed revisions in the existing package
  list. Unavailable selections and missing package revisions remain intact.
  Player decisions, occurrence IDs, timestamps and unresolved export data survive.
- `preview(document, orderedPackages)` resolves deliberately by entry ID and
  returns a `PackageSwitchPreview`: `proposed` contains the recalculated candidate,
  while `affectedSelections` contains changed or unavailable occurrences compared
  with their saved baselines. Available definitions adopt their current supplier
  and baseline in the candidate. Missing definitions preserve prior provenance.
  Invalid and unresolved choices stay in the document and can be committed.
- Discard the preview to cancel. `commit(currentDocument, preview)` returns the
  proposed state only if the current document still equals the preview's original;
  otherwise it returns `reconciliation.stalePreview`. Rebuild a preview after any
  installed content update. Commit performs no storage write; the caller persists
  the returned document and creates a new editing coordinator/catalog for its order.

All operations return structured catalog failures when the standard package or
catalog cannot be loaded. Missing optional content still permits unrelated edits.
The existing engine conservatively marks totals unavailable where missing active
mechanics could affect them; missing unequipped inventory does not block totals.
These operations add no historical pinning, migrations, package import or UI.

## Power replacement and selection-set queries

`rules.selectionSets` exposes required/selected/remaining counts and whole-set
diagnostics. Query choices offer explicit adapted power candidates; access and
prerequisites use the shared engine. Choosing an individually eligible option
can leave an incomplete set; the state exposes its remaining requirements.

`BuilderEdit.ReplacePower(level, slot, entryId, kind, acceptIneligible)` records
`PROGRESSION` or `RETRAINING` history against an active power acquisition slot.
The original entry/provenance remains in the document, while evaluation replays
the replacement with the original occurrence ID. This keeps owned spellbook
collections synchronized and diagnoses stale preparations. The replacement must
belong to the source pool; invalid eligibility or completed-set constraints are
rejected unless `acceptIneligible` is explicit. Wire-valid invalid history remains
exportable and can be inspected after reopen. No other choices are silently pruned.

Tome-style sources enforce their authored replacement levels. Progression replaces
one earlier class daily attack at levels 9, 15 and 19, preserving the acquisition
slot and occurrence ID. `replacementOptions(document, level, slot)` evaluates
candidates at the replacement level using the expanded original pool. Invalid
progression timing is rejected even when eligibility override is requested.
`RemoveReplacement(level, slot)` removes that history record and replays the rest.
Retraining remains explicitly incomplete; the local chapter does not supply an allowance.
`options` and normal typed edits support active choices through level 19.
Unsupported technique pools retain explicit coverage diagnostics.

## Progressive option browsing

Paragon-path roots filter `pathClassIds` index metadata before resolving candidate
definitions or checking eligibility. Qualifying classes come from the acquired
class and multiclass feats, including active grants, as of the path acquisition
level. Later qualifications cannot widen an earlier picker. Empty scope metadata
preserves theme-based and legacy paths; unavailable qualification definitions keep
the candidate set conservative. Direct catalog resolution and saved provenance
remain unchanged.

`optionListing(document, level, slot)` creates an explicit content snapshot for one
unchanged character and choice slot. `rows(featGroup)` returns metadata rows before
root-choice eligibility or definition loading; `check(ids)` checks only offered IDs
and retains completed results. Pending rows have `checked = false` and cannot be
selected. Failed definitions become checked unavailable rows with diagnostics.
Normal edits still validate against fresh operation content, independently of browsing.

Production feat indexes carry optional authored `featGroup` metadata (General,
Ancestry, Class); old indexes omit it and use definition/reference-category fallback.
Unknown legacy groups stay discoverable across tabs. Grouping uses access rather
than titles or the character's currently selected ancestry. Active feat mechanics
retain normal candidate activation; passive v2 root feats share exact prepared
character facts with conservative fallback for ambiguous cases.

Class and utility power indexes carry optional `classId` metadata on selectable powers whose access names
a class, and each class's powers fill their own chunks. `RulesContent` loads a character's power pools from
the powers with no `classId` plus those of its chosen class(es) (`CharacterDocument.classEntryIds()`; a class
entry being previewed always includes its own), and `ContentCatalog.search(classIds = ...)` applies the same
scope to the Android level 3+ pickers. Scoping is a loading rule only: any power still resolves by ID, and
old indexes without `classId` behave as before.

Android loads only the selected feat tab and publishes metadata, then batches of
32 checks. Lazy rows preserve native scrolling and the folio scrollbar. Rows stay
in metadata title order during loading. Cancelling/tab switching stops delivery;
reopening the unchanged character reuses checked results. At most two slot snapshots
are retained; edits, character changes and catalog reloads clear them. Bundled content
is immutable for the session; a new catalog is required after installed metadata changes.
Choices through level 19 use the shared eligibility policy.
