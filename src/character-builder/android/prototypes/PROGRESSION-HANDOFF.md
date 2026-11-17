# Progression tab: implementation handoff

Spec by example: [progression.prototype.html](progression.prototype.html). Open it in a browser and use it as the visual and interaction reference. It is throwaway HTML with mock in-memory state, so port the behavior, not the code. The visual language is the same as [main-character.prototype.html](main-character.prototype.html) (printed-rulebook palette, serif headings).

## Where it goes

- Replace the `"progression"` stub in `android/src/main/kotlin/dev/modern4e/builder/ui/screens/CharacterPages.kt` with a new `ProgressionScreen.kt` in the same package. Overview is the model to follow for scrolling, colors and `Field`-style rows.
- Reuse `ui/components` (folio components, dialog, icons) and `ui/theme/FolioTheme.kt`. Keep state and edits in `BuilderSession`, and keep the existing string routes.
- Read first: `shared/ENGINE.md`, `shared/IMPORT.md`, the repo `AGENTS.md`, and the `character-builder` README layout notes.

## Screen anatomy (top to bottom, one scrolling column)

1. **Power tally:** four boxes (At-will / Encounter / Daily / Utility) with the counts gained up to the current level.
2. **Origin** (no header): rows for Name, Ancestry, Environment, Upbringing, Theme (optional) and Class.
3. **Level 1 … current level.** Each starts with a centered banner (`LEVEL` plus the number). Levels are never collapsible and the banner carries no status. Upcoming levels sit behind a "Show upcoming levels N–30" link and render read-only ("Reached at level N").
   - **Level 1 only:** a 2×2 grid of boxes (Ability Scores, Environment skill, Upbringing skill, Free skills), then the class's inner choices (Fighter: Reactivity, plus the Combat Superiority ability if chosen), then powers, then the feat.
   - **Other levels:** ability increase (non-main only), powers, feat, optional power replacement, and fixed grants as plain "arrives automatically" notes.
4. **Bottom nav badge:** the count of required choices that are still empty.

The level schedule comes from `modern4e/glossary/creation_&_advancement.typ`. Do not invent a different one.

## Interaction rules

- **Rows and boxes** open a bottom sheet containing just the list: no title, no subtitle, no "Level N" header. Buttons are Cancel and Save, plus a clear or undo link when something is chosen. Save is disabled until the choice is valid.
- **Choice entries are cards, not radio buttons.** Tapping selects, ticks and frames the card, and expands its content. Tapping the selected card only folds or unfolds it. Disabled cards stay dimmed with the reason ("Already chosen").
- **Level on a card:** a dark number box, right-aligned, only if the entry has a level (powers, level-gated feats).
- **Powers** render as 4e power cards: a usage bar coloured per `helpers/powers.typ` (at-will green, encounter red, daily blue) with the keywords, then action and range, flavor, and labelled rows (Target, Attack, Hit, Miss, Effect).
- **Environment and Upbringing** cards show their description and the four-skill choice.
- **Skill lists** (three separate sheets). Environment and Upbringing offer the four skills of the chosen option, and Free is multi-select with exactly two picks. Skills are never expandable. Each shows its current modifier right-aligned (ability points, plus 5 if proficient), which updates live as you select. A skill granted by another list is disabled as "Already proficient". If Environment or Upbringing changes, the stale skill pick becomes empty and the box goes back to ✗.
- **Ability Scores:** steppers for the five non-main abilities, with Strength fixed at 4 for Fighter. It must total 5 points, each 0–2, or one −1 paired with exactly one 3.
- **Feat sheet:** General / Ancestry / Class tabs that always open on Class. The list is sorted by required level, highest first, then by name. Ineligible entries (already taken, level too low) are hidden behind a "Show N ineligible" toggle. A feat with a source prerequisite that is not adapted to Modern 4e stays selectable and shows "Prerequisite not adapted". The engine already treats these as incomplete automation.
- **Level 1 boxes:** ✓ when complete. ✗ when empty. Free skills reads "n left".

## Mapping to the shared contracts

Prototype ids are not contract ids. Real choices live in `CharacterDocument.levels` (`LevelDecisions`: entries, proficiencies, abilityAdvancements, replacements). `ChoiceSlotId` is `(sourceInstanceId, choiceId, ordinal)`, and replacements point at the exact old slot (`ReplacementKind.PROGRESSION`). Existing engine slot ids are in `ENGINE.md`: `creation/{class,ancestry,theme,feat}/0`, `background.environment.<name>/skill/0`, `background.upbringing.<name>/skill/0`, `creation/free-skill/0|1`, `advancement.2/feat/0`. Use `RulesEngine` output (stable slots, candidate eligibility, diagnostics) rather than recomputing legality in the UI.

## Known gaps to decide, not silently paper over

- The proof engine only evaluates levels 1–2. Above that, ability advancements and replacements are preserved but return incomplete automation and unavailable totals. The screen can render and edit later levels, but must show the engine's incomplete state rather than guessing numbers. Progression beyond level 2 is a separate engine milestone.
- The prototype's option lists are the Player's Handbook Fighter powers, feats and background text from the offline compendium. They are published 4e, not Modern 4e adaptations. Real lists must come from `ContentCatalog`, and class and ancestry content other than the Fighter proof does not exist yet.
- Environment and Upbringing are separate Origin choices in the UI, but the engine encodes them in the skill slot id. Decide where the environment and upbringing themselves are stored before building the editors.
- Skill modifiers in the prototype ignore sources other than ability points and the +5 proficiency bonus. Use the engine's calculated skill values with contributors.
- Paragon and epic power options are placeholders. Theme and class lists are illustrative.

## Definition of done

Per `AGENTS.md`: update `FEATURES.md` (including incomplete or experimental status), add automated coverage for the new behavior (`android/src/test` for session logic, Compose instrumentation in `android/src/androidTest` for the sheet flows), and keep `tests/README.md` current. Delete the prototype HTML (or move it to a throwaway branch) once the screen ships.
