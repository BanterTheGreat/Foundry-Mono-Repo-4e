# Shared builder operations

Shared class v2 definitions expose their main ability at `(class instance,
"main", 0)` and feature-owned choices under deterministic grant instances.
Options use shared occurrence eligibility separately from combat coverage;
incomplete combat automation does not by itself make a v2 feature ineligible.
Class/feature replacement retains the edited occurrence ID and every dependent
decision, reporting newly orphaned choices. No legacy-to-modern ID mapping is
implicit. See [ENGINE.md](ENGINE.md) for class formulas and conditional benefits.

`BuilderOperations(catalog)` uses the character's existing package-order catalog.
`create` takes caller-generated character ID, RFC 3339 saved timestamp, identity,
package revisions, direct point allocation and level 1 or 2. It fills empty level
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
`creation/{class,ancestry,theme,feat}/0` at level 1 and
`advancement.2/feat/0` at level 2. Child slots come from engine choices. Existing
occurrence IDs survive replacement, keeping child slots stable; new occurrence
IDs come from callers. Repeated choices use distinct ordinals and instances.

`Level(2)` preserves all prior choices and exposes authored level-2 choices.
Direct level-2 creation allows filling both levels. Deleveling and progression
above level 2 are rejected. General advancement and retraining allowances remain
incomplete; explicit power replacement composition is supported as described below.

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

Tome-style sources enforce their authored replacement levels; general allowance
and timing checks remain explicitly incomplete (#20). `options` can inspect
active slots in direct higher-level documents, but this does not add full
higher-level character creation or forward advancement. Shared power acquisition
is supported through level 10; later provisional content and technique pools
remain incomplete.
