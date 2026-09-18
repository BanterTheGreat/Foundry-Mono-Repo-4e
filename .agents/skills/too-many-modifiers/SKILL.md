---
name: too-many-modifiers
description: Module-specific layout and architecture for src/too-many-modifiers (Too Much To Track — actor HUD note tracker and party health bar). Use when reading or editing files under src/too-many-modifiers.
---

# Too Much To Track

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

- Keep UI markup in Handlebars parts and presentation rules in the dialog stylesheet.
- Changes that affect initial hooks or the manifest should be tested by reloading Foundry and checking the browser console. There is no automated test or build setup.

## Active Effects

- See `src/too-many-modifiers/Active_Effects_Info.md` for information regarding the Active Effects in the DnD4e system, and the `dnd4e-active-effect-keys` and `dnd4e-aura-effects` skills for the broader key/variable reference.
