# Shared builder operations

`BuilderOperations(catalog)` uses the character's existing package-order catalog.
`create` takes caller-generated character ID, RFC 3339 saved timestamp, identity,
package revisions, direct point allocation and level 1 or 2. It fills empty level
containers without inventing player choices. `evaluate` refreshes content and
returns `BuilderState(document, rules)` without saving. Recreate the coordinator
when packages change; package switching belongs to the catalog workflow.

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
above level 2 are rejected. General advancement/retraining remains unsupported.

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
