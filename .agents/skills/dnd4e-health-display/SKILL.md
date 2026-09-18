---
name: dnd4e-health-display
description: Module-specific layout, architecture, and HUD visual style guide for src/dnd4e-health-display (token-hover health display, actor HUD, team display, mark display). Use when reading or editing files under src/dnd4e-health-display.
---

# DnD4e Info Displays

Foundry VTT v14 module for the DnD4e system that provides two independent information displays under one package. It targets the DnD4e system's [`0.9.3` source](https://github.com/EndlesNights/dnd4eBeta/tree/0.9.3); confirm system APIs against that tag or the locally installed system before relying on current upstream behavior.

## Layout

- `main.js` initializes the health-display, actor-display, team-display, and mark-display modules.
- `scripts/health-display/` owns the token-hover health display, its presentation data, and effect mapping.
- `scripts/actor-display/actor-display.js` owns the controlled-token HUD lifecycle, interactions, dragging, and document mutations.
- `scripts/actor-display/actor-display-data.js` converts DnD4e actor and item documents into template-ready display data.
- `scripts/actor-display/actor-display-tooltips.js` lazily renders and caches HTML rules tooltips.
- `scripts/actor-display/actor-display.hbs` is the actor HUD's single Handlebars part.
- `scripts/mark-display/mark-display.js` owns the canvas overlay that connects DnD4e markers to their marked tokens.
- `styles/` contains one stylesheet per display module.
- `PoC/actor-hud-ui-prototype/` contains throwaway visual explorations. Treat these as design references, not production code.

## Architecture

- Each display module exposes registration functions for settings and runtime hooks; `main.js` is the only caller.
- Health display is the token-hover submodule. It presents HP state, actor role styling, effects, and optional NPC traits without mutating the actor.
- Mark display is a read-only canvas submodule. It resolves `system.marker` and an active `mark` or `mark_1` through `mark_7` status before drawing each directional token connection.
- The actor display uses one controlled token, with an assigned or owned player-character fallback for non-GM users.
- The actor display is a frameless `ApplicationV2` appended to `document.body`. Its identity header is the drag handle, and its client setting stores the last screen position.
- Actor-display tabs are module-owned buttons and state, rather than Foundry's tab-group controller. Powers and skills roll through DnD4e actor APIs; feats and items roll or open their sheets; equipment toggles update the embedded item.
- Item tooltips load only on first hover. Auto-generated power cards receive compact custom formatting; custom-authored powers, feats, and inventory use `dnd4e.compatibility.tah.TokenBarHooks.generateItemTooltip`. Cache both `data-tooltip-html` and `data-tooltip-class`, since Foundry reads those attributes on later hovers.
- The manifest retains the `dnd4e-health-display` package ID so existing installations and client settings continue working under the new title.

## Working conventions

- Use `ApplicationV2`. The module intentionally targets Foundry v14.
- Keep UI markup in the relevant Handlebars part, presentation data in its data module, interaction logic in its controller, and presentation rules in the matching display stylesheet.
- There is no automated test or build setup. Run `node --check` on changed JavaScript and `git diff --check`; then reload Foundry and inspect the browser console for hook, manifest, template, and interaction changes.
- For actor-display UI changes, ask the user to reload Foundry and provide the manual verification results: switch controlled tokens and all available tabs, verify scrolling at 1920×1080, drag and reopen the HUD, and hover the same power or item twice to exercise cached tooltips. The user exclusively operates Foundry; do not launch, inspect, automate, or otherwise attempt to validate Foundry directly.

## HUD visual style guide

- Treat the actor HUD as a compact, dark-fantasy game panel: near-black charcoal surfaces, warm parchment text, aged-brass borders, and restrained shadows.
- Reserve saturated semantic colour for game state: crimson for health, green for at-will powers, red for encounter powers, slate for daily powers, gold for items and selected controls, and cool blue for temporary HP.
- Build hierarchy through surface contrast, thin warm dividers, compact uppercase labels, and the `--font-h1` display face for character names and important values; do not add decorative chrome without an information purpose.
- Prefer subtle gradients, inset highlights, and small border-radius values (about `0.25rem` to `0.65rem`) over flat cards, oversized rounding, or glossy effects.
- Keep density high but readable: use short labels, ellipsis for one-line lists, grouped sections, and a scrolling workspace instead of expanding the panel beyond its established footprint.
- Make interactive states unmistakable but restrained: warm borders/highlights, a slight brightness lift, and a small translate transform; keep the visible keyboard focus ring.
- Preserve accessibility: maintain strong text contrast, never communicate state by colour alone, and provide labels or titles for icon-only controls.
- Extend existing actor-display CSS classes and colour vocabulary before introducing new visual tokens, so tabs, cards, tooltips, and quick actions remain one coherent HUD.
