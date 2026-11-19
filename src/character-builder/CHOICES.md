# Character Builder choices

Use the existing Progression sheet when adding an Android choice. Choose the sheet layout by what the player is choosing and how much they need to read.

## Picker layouts

| Choice | Default layout |
| --- | --- |
| Ancestry, Feat, or mixed catalog options | **Full list with collapsible rows.** Reuse `CatalogChoiceList` and `ChoiceCard`. A new pick expands its card and replaces the draft. Tapping the selected row toggles its detail. Use the row's resolved ancestry grants for ancestry features. |
| Class | **Sectioned list with collapsible rows.** Reuse `ClassPicker` in new character creation and Progression. It groups classes by role, sorts names within each group, and shows fixed-width power-source badges. Revealed ineligible classes stay in their role group. `SectionedChoiceList` accepts ordered sections and caller-supplied rows. |
| Power-only catalog, including attack, utility, and power replacement | **Split reader.** Reuse `PowerChoiceReader` and `CatalogReaderPanes`. Put compact rows above an independently scrollable `PowerBlock`. Power search acts on the current pool and matches names and authored rules. Pick the earlier slot before staging a replacement. |
| Theme | **Split reader.** Reuse `AdvancementChoiceReader` with `AdvancementDetails`. Use this pattern for new advancement pickers whose descriptions, grants, and modifications need a reading pane. Theme is the current route into this reader. |
| Environment or Upbringing | **Full list with collapsible rows.** Show the origin description and offered skills inline. Use `backgroundEdit` to save the origin and clear any stale skill together. |
| Structured values, proficiencies, or ability edits | **Full sheet with direct controls.** Use compact rows for values and skills, and steppers for allocation. The free proficiency editor stages exactly two picks. |

The layouts share a fixed Progression sheet height of 650 dp capped at 85% of window height, with actions below the scrolling content. Use the existing folio scrolling and choice card styles. In a split reader, an explicit row tap can stage a draft. The reading pane follows the inspected row, the visible selected row, or the first visible row in that order. Opening the sheet, searching, and revealing ineligible entries only change what can be read. Reset detail scroll when the inspected entry changes. Start with [ProgressionScreen.kt](android/src/main/kotlin/dev/modern4e/builder/ui/screens/ProgressionScreen.kt) and [ChoiceCard.kt](android/src/main/kotlin/dev/modern4e/builder/ui/components/ChoiceCard.kt).

## Choice identity and edits

1. **Find the slot.** Use the reserved creation and advancement slots for baseline choices. For authored choices, use the engine's active `EngineChoice` and its acquisition level through `Progression.levelChoices`. The stable `ChoiceSlotId(sourceInstanceId, choiceId, ordinal)` identifies the occurrence being edited. Reuse the source occurrence ID so its nested choices keep their identity. Automatic grants can supply the displayed value. Authored grant replacements use the engine's offered choice.
2. **Read the offered values.** Entry choices go through `BuilderSession.progressionOptionRows`. Proficiency and structured value choices read the slot's offered skills or values from `state.rules.choices`. Keep choice labels, section placement, and required-choice indicators in the existing Progression helpers.
3. **Stage and save.** Initialize the sheet from the saved choice or displayed grant. Stage a `BuilderEdit` locally and pass it to `BuilderSession.edit` on Save. Cancel discards the draft, and Clear stages a removal where supported. Use `progressionEntryInstance` for early entry edits, typed edits for values/proficiencies/allocation, and `BuilderEdit.Batch` for changes that must succeed together. Through level 2 the shared operations check choices. Later-level entry picks use `LaterDecisions` and show incomplete automation. A progression replacement stores both the prior target slot and the new choice.
4. **Verify the normal entry point.** Open the choice from Levels or its existing caller. Check the saved value on reopen, draft changes on tap, cancellation, and any relevant eligibility, loading, or replacement state. Find the unit suites under [Progressive feat listing and picker tests](../../tests/README.md#progressive-feat-listing).

Use [Progression.kt](android/src/main/kotlin/dev/modern4e/builder/Progression.kt) for slot discovery and labels, [BuilderSession.kt](android/src/main/kotlin/dev/modern4e/builder/BuilderSession.kt) for editing and option loading, and [ENGINE.md](shared/ENGINE.md) for persistence and rules contracts.

## Catalog loading and eligibility

- Load the requested slot and feat tab from catalog metadata before resolving definitions. The Feat picker opens on Class. Class and Ancestry tabs scope indexed entries to the character's applicable access IDs, including multiclass or Past Life qualifications where applicable. Index scope narrows the candidates. Eligibility still comes from the shared choice evaluator.
- Reuse `BuilderOptionListing` for batched checks and `BuilderSession` for cancellation, cache invalidation, and warm-up. Warm-up uses active picker slots and shares its results with the open sheet. Update its targets when a change affects which choices Levels can open.
- Feed the rows to `pickerOptions`. The sheet shows progress until the current list finishes checking. Checked eligible rows appear first. The toggle reveals ineligible rows and their reasons. Only an explicit pick with a resolved definition can stage an ineligible edit, which remains visible in Validation. Search, filters, loading, and unavailable definitions never stage an edit.

See [BuilderOptionListing.kt](shared/src/commonMain/kotlin/dev/modern4e/builder/BuilderOptionListing.kt), [ProgressionOptions.kt](android/src/main/kotlin/dev/modern4e/builder/ProgressionOptions.kt), and [PowerReaderOptions.kt](android/src/main/kotlin/dev/modern4e/builder/PowerReaderOptions.kt).
