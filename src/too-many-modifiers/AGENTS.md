# Too Much Too Track

Foundry VTT v14 module for the DnD4e system that provides a compact actor HUD and a party health bar. It targets the DnD4e system's [`0.9.3` source](https://github.com/EndlesNights/dnd4eBeta/tree/0.9.3); confirm system APIs against that tag before relying on current upstream behavior.

## Layout

- `main.js` registers Foundry hooks and opens the token HUD dialog.
- `tracking-dialog.js` renders the V2 Handlebars form; `parts/` contains its templates and `styles/` its CSS.
- `handlers/` creates and cleans each note type; `tracking-helper.js` stores notes and `tracking-overlay.js` renders them.
- `combat-manager.js` advances and removes notes during combat; `constants.js` holds shared identifiers and durations.

## Architecture

- Notes are module flags named `too-many-modifiers.notes`: store them on linked actors, otherwise on token documents.
- Each note has an `id`, `type`, `text`, and duration data. Handler-created Active Effects use the note ID so cleanup can remove both the effect and its note.
- Add note types through a handler with `create()` and `clean()`, then register it in `TrackingDialog` and `TrackingHelper`.

## Working conventions

- We don't need to make Markdown research documents.
- Use ES modules, Foundry hooks, and the DnD4e system API; preserve v12 compatibility unless intentionally upgrading it.
- Use braced, multiline `if` blocks. Document methods with JSDoc, using multiline JSDoc blocks whenever practical.
- Prefer Foundry APIs (`foundry.utils`, document flags, embedded documents) and keep asynchronous document changes awaited.
- Keep UI markup in Handlebars parts and presentation rules in the dialog stylesheet.
- Match the existing simple JavaScript style: direct Foundry globals, small focused helpers, pragmatic comments, and short guard clauses. Document reusable module methods with JSDoc when it clarifies their contract.
- Changes that affect initial hooks or the manifest should be tested by reloading Foundry and checking the browser console. There is no automated test or build setup.
- Changelog entries are release summaries, not per-change notes. Since the previous version, record new features and changed behavior in concise prose suitable for future regression review.
- Track project TODOs as appropriately labeled GitHub Issues rather than local TODO files.

## Active Effects

- Use the `dnd4e-active-effect-keys` skill for Active Effect change keys, modes, filters, formulas, and roll-data variables.
- Use the `dnd4e-effect-macros` skill for macros embedded through the Effect Macro module, including triggers and injected helpers.
- Use the `dnd4e-aura-effects` skill for Aura Effects configuration, source/recipient evaluation, stacking, and conditional scripts.
