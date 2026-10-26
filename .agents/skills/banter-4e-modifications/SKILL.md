---
name: banter-4e-modifications
description: Module-specific layout, architecture, and working conventions for src/banter-4e-modifications (player active-defense, DnD4e system customizations, BEACON-inspired backgrounds/titles). Use when reading or editing files under src/banter-4e-modifications.
---

# Banter 4e Modifications

Foundry VTT v14 module for DnD4e homebrew automation: simplified conditions and skills, optional NPC-vs-player active defense, and BEACON-inspired backgrounds/titles. It targets the DnD4e system's [`0.9.3` source](https://github.com/EndlesNights/dnd4eBeta/tree/0.9.3); do not assume current upstream APIs or behavior apply without checking this tag.

## Layout

- `scripts/main.js`: module entry point; registers settings, hooks, and SocketLib handlers.
- `scripts/modules/player-defense/`: intercepts NPC attack rolls and adds player defense buttons to chat. Its `socket-helper.js` performs GM-only SocketLib chat-message updates.
- `scripts/modules/dnd4e-system-customizations/`: mutates DnD4e status effects and skill definitions during `init`.
- `scripts/shared/`: shared logging and module setting/flag keys. `module.json` is the manifest.
- `scripts/tools/`: development-only damage-calculation utilities.

## Architecture

- `module.json` loads the entry-point ES modules; `main.js` imports feature classes and attaches them through Foundry lifecycle hooks.
- At `init`, `Dnd4eSystemCustomizations` changes the DnD4e configuration. At `i18nInit`, the active-defense setting is registered and, when enabled, its event hooks are attached. At `ready`, shared helpers are exposed on `game`.
- `PlayerDefense` is event-driven: it records an NPC attack from `dnd4e.rollAttack`, replaces the matching attack chat message with defense controls, then resolves a clicked defense roll.
- Clients render and click chat controls, but SocketLib routes message mutations to a GM through `SocketHelper`; mutable module state is stored on `game.PlayerDefense` and `game.SocketHelper`.

## Working conventions

- Keep the active-defense flow GM-authoritative for chat-message edits via SocketLib, and preserve ownership checks before a player rolls.
- Changes that affect initial hooks or the manifest should be tested by reloading Foundry and checking the browser console. Additionally, new tests should be made where applyable.
- After every substantial change, run `npm test` (inside `src/banter-4e-modifications`) and resolve any failures before handoff.
- Do not enable or alter the commented-out BEACON hooks without explicitly intending to ship that feature.

## Naming and method style

- Name methods for the domain operation or state transition they perform: `captureNpcAttack`, `createPendingDefense`, and `resolveDefenseAttempt` communicate more than incidental implementation steps. Reserve `on...` for Foundry hook handlers.
- Use verbs that match the method's role: `find...` for lookups, `is...`/`has...`/`can...` for predicates, `create...` for new documents or workflow state, and `resolve...` for committed outcomes. Keep private implementation helpers private with `#`.
- Split an event workflow at meaningful transitions—capture, evaluate, create, claim, resolve, and finalize—so each method has one orchestration responsibility. Keep calculations, rendering, and compatibility reads in focused helpers when they represent a named concept.
- Avoid shallow pass-through helpers. A method earns its name when it hides a decision, a Foundry-system quirk, a state transition, or repeated implementation detail from its caller.
- When data crosses a hook, socket, or persisted flag seam, document its shape and authority in JSDoc. Prefer names such as `attackContext`, `defenseAttempt`, and `promptState` over generic `data` or `context` when the role is known.

## Debugging

- Heavily prefer adding temporary debug logging, since you can't directly control foundry.

## Chat card visual style guide

Use this guide when changing compact power, attack, or damage chat cards. The implementation lives in `styles/chat-rolls.css` and `scripts/modules/chat-rolls/`.

- Match the Actor HUD's dark-fantasy palette: near-black rules surfaces, warm parchment text, and aged-brass borders. Keep power and attack header/action colors in shared CSS rules so they stay identical.
- Headers use `linear-gradient(110deg, #292318, #101010)`, parchment `#eee4cc`, and brass dividers `#655433`. Outer card borders use `#8f794e`; secondary dividers use `#493c26`.
- Action surfaces and attack footers use `#0d0c09`. Buttons use gold text `#e5cc8e`, borders `#493c26`, a restrained `#ffffff0d` hover highlight, and a visible parchment focus outline `#e9dfce`.
- Power card titles use `600 17px/1.25 Georgia, serif`. Keep supporting mechanics compact in Arial; the attack header's power name uses 11px. Preserve the small card corners and thin dividers.
- Foundry's native speaker header remains visible on every message, including consecutive messages from the same speaker. The custom attack header contains the power name and a right-aligned **Roll Damage** button; attacker identity comes from the native header.
- A multi-target attack has one shared header and damage action. Each target retains its own verdict, total, semantic outcome color, and collapse chevron at the far right, vertically centered in that target's summary.
- The attack footer shows the total target count on the left and attacked defense on the right (`vs. AC`, `vs. WIL`, etc.). Keep weapon details and full calculations inside the existing disclosures.
- **Roll Damage** stays unchanged after use and remains available for another roll. It rolls through the original power once per click for the whole attack, with damage application remaining a separate action.
