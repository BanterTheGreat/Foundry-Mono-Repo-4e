# Horizontal Actor HUD Prototype — Report

Covers `horizontal-hud-prototype.html` (iteration 15). Throwaway HTML/CSS/JS mockup of a horizontal, bottom-left-docked variant of the Actor HUD — no build step, open directly in a browser. All state lives in a JS object and re-renders on every interaction (no persistence, no real Foundry integration).

## Layout structure

Two elements docked at `bottom: 1rem; left: 1rem`:

1. **Left column** — a tab strip stacked above a "player info" panel.
2. **Skill hotbar** — floats beside the left column.

## Player info panel

- **Avatar**: stretches to the full height of the block.
- **Name row**: character name with class/level subtitle stacked underneath, and four **icon-only action buttons** (⚡ Use AP, ★ Save, ➕ Heal, 🕐 Rest) anchored to the right.
  - Use AP shows a small badge with the current AP count.
  - Save/Heal/Rest each open a dropdown to their left (Saving Throw/Death Save, Second Wind/Spend Surge, Short/Extended Rest).
- **HP dial**: circular crimson gauge (conic-gradient fill + clock-tick overlay) with an editable number.
- **Temp HP / Surges**: two equal-width "stat card" chips (icon + label header, big editable number), plus a 20-segment bar tracking the surge fraction underneath.
- **Defenses**: 6 equal-width chips — AC, Fort, Ref, Will, Init, Speed (icon + value + label).

## Tabs

Four separate squared buttons (Powers/Skills/Feats/Items) in a row above the info panel. Selecting one opens a drawer that pops upward, anchored to the tab strip.

## Drawer content (per tab)

- **Powers**: search box; grouped into headed sections by action type (Standard/Minor/Immediate Reaction/…); each row shows a range-type icon (melee/ranged/close/area), name, expand/collapse chevron (reveals stat lines), and a Use button. A 📜 header toggle shows/hides all flavour text at once. No usage-type text badge — the color-coded left border (green/red/purple/blue) carries that instead.
- **Skills**: 2-column grid, trained skills highlighted gold.
- **Feats**: grouped into headed sections by category (Combat/Racial/General).
- **Items**: quantity shown per row; weapon items additionally show their trait (e.g. "Heavy Blade, Versatile") as a subtitle.

## Skill hotbar

14 MMO-style slots (7 per row), each floating independently (own border/shadow, no shared container). A slot can hold a power or an item:

- Filled slots show a color-coded left accent, a range/type icon, and a 2-line name.
- Hovering a filled slot shows a tooltip with full details (pure CSS `:hover`, no JS).
- Clicking uses it — marks encounter/daily powers spent, logs item use.
- Empty slots are dashed placeholders.

## Interactivity implemented

HP/Temp HP/Surges are directly editable number inputs; AP spend, saving throws, second wind/spend surge, short/extended rest all mutate state; power search filters live; power rows expand/collapse; flavour-text toggle; hotbar use/hover.

## History

Iteration 14 is kept as `horizontal-hud-prototype.backup-iter14.html` as the last rollback point (earlier backups were pruned).
