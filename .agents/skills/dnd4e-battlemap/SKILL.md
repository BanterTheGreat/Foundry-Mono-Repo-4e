---
name: dnd4e-battlemap
description: Design a read-only D&D 4e tactical grid battlemap (square grid, terrain legend, coordinates, creature deployment) for a scene or encounter. Use for any plain "battlemap", "map" or "grid" request, with or without an encounter. Not for Dungeondraft (only when the user says so).
---

# D&D 4e Battlemap

Design a read-only square-grid battlemap: tactical terrain, a legend, one-based
coordinates and, when creatures are involved, a deployment table. This skill works
on its own and is also the map half of
[encounter-creation](../encounter-creation/SKILL.md), which adds the roster, XP
validation, tactics and Foundry handoff. A map request does not need any of that.

A plain "battlemap", "map" or "grid" request means this skill. Use the
[dungeondraft skill](../dungeondraft/SKILL.md) only when the user says
"Dungeondraft" (or names a `.dungeondraft_map` or the Crosshead packs); it turns a
grid produced here into a painted map.

## Establish the brief

Ask one concise batch of whatever is missing, then wait:

- Setting and environment (a warehouse, a forest clearing, a ruin) and the tone.
- Purpose: who fights or moves here, how many creatures or what footprints, and
  what each side wants. Ask for the party size if it affects space.
- Desired size, if any. Otherwise propose one that fits the scene.
- Anything fixed: entrances, objectives, elevation, features the user must have.

Distinguish what the user delegated from what still needs asking; invent details
only within what they delegated. For a Flint or other ZEITGEIST scene, dress the
map with the [zeitgeist skill](../zeitgeist/SKILL.md)'s look-and-feel notes.

If the user already has a map and wants advice, use only the layout they describe;
do not redraw, replace, or display a legend for it.

## Design the map

**Scale and size.** Use 5-foot squares unless asked otherwise. Default to a compact
**9 × 9** grid for a simple skirmish or sample. Pick larger dimensions when the
fight needs room: leave space for every creature and the party to deploy and
maneuver, including Large and bigger footprints, plus movement lanes and
reinforcement routes. Label size as **columns × rows**.

**Six tactical ingredients.** Combine **three or four** that fit the environment
(more on a large map):

1. **Multiple routes**: flanking paths and alternatives to a single corridor.
2. **Cover and blocking terrain**: partial cover, full blockers, sight blockers.
3. **Elevation**: ledges, stairs, platforms; keep high ground accessible.
4. **Difficult terrain**: slows movement without forbidding it.
5. **Hazards**: damage or conditions with understandable counterplay.
6. **Interactive features**: levers, objectives, movable or destructible things.

Preserve viable approaches and counterplay. Make choke points deliberate, not
accidental. Check entrances and starting areas (and their separation), sight
lines, ranges, movement lanes, creature footprints, and access to objectives.
Distinguish **cover**, **blocked sight**, **impassable** squares and **height**;
mark any environmental rule as a proposal.

## Terrain colors and symbols

Use these colors for rendered cells, and always add a symbol so color is never
the only cue. Rename the terrain label to fit the scene; keep the category and
color. These are the values the existing maps use.

| Category | Color | Typical symbol | Rule |
| --- | --- | --- | --- |
| Open / firm ground | `#E9DFC9` | `.` | Normal movement. |
| Difficult terrain | `#B9A587` | `~` | Costs extra movement. |
| Blocking (impassable, blocks sight) | `#214E92` | scene-specific letter | A freestanding obstacle (pillar, wardrobe, boulder) that fills its square. Cannot be entered; blocks line of sight unless the legend says otherwise. **Never use it for a wall**; see "Walls are edges". |
| Cover | `#6BADE8` | scene-specific letter | Grants cover; legend states movement cost. |
| Hazard | `#D94141` | `^` | State the damage or condition, trigger and timing. |
| Entrance, exit, start, objective | `#42A568` | letters such as `E`, `S` | Marks access points and starting squares. |
| Stair / ramp / worn ascent | `#C9AD73` | `R` | Walkable change in height; no climb check unless stated. |

## Walls are edges

A wall is **only as thick as a square's edge**, matching how walls work in the user's
software. It never fills a square. Squares on both sides of a wall are ordinary floor
(or whatever terrain they hold) and stay walkable and usable for deployment.

- **Placement.** A wall runs along the border between two squares, or along the map
  boundary for a building's outer wall. A room is therefore as many squares as its
  interior holds, and the footprint of two rooms is just the squares they cover, with
  no squares spent on walls.
- **Drawing.** Draw each wall edge as a thick (about 4 px) `#214E92` line on that
  border; never fill a square with the blocking color for a wall. A doorway or open
  gap is a gap in the line; a door is a `#42A568` segment on the edge, with a symbol
  (`D`, `E`) in the square next to it only if needed to read it. Include the outer
  boundary walls (and any exterior door) in the drawing.
- **Data.** Keep the cell title as `Column c, row r: <terrain>` exactly. Record wall
  edges on each cell in a `data-walls` attribute listing its walled sides by compass
  letter (for example `data-walls="N,E"`), and door or gap edges in `data-doors`
  (for example `data-doors="W"`). Write a shared edge on **both** neighbouring cells
  (the east wall of one square is the west wall of the next), and the boundary wall on
  the edge cell.
- **Rules.** A wall edge blocks movement and line of sight across it unless the legend
  says otherwise (a window, a low wall). A creature cannot move diagonally past a
  wall corner; doors and gaps let it through. State any door that is closed, locked
  or breakable in the legend.

Elevation: print each square's height (for example `+10`) at its bottom right and
mark height changes with an edge. Provide a walkable stair or ramp wherever the
high ground should be reachable; do not rely on a bare ledge.

## Present the map

1. A one-line summary: **dimensions as columns × rows**, square size, which way is
   north, and the key terrain ideas in a short paragraph.
2. The **grid**, placed first. Prefer an inline read-only HTML grid; otherwise an
   aligned monospaced text grid with the same coordinates and legend. Show
   one-based column numbers across the top and row numbers down the side. Mark
   entrances, starting areas, objectives and tactically significant features, and
   keep creature markers visually distinct from the terrain underneath. Give each
   cell a title in the form `Column c, row r: <terrain>` (the Dungeondraft tooling
   parses this form). Include no painting, palette-editing or reset controls.
3. **Legend** and **Deployment** side by side directly beneath the grid, in two
   equal-width columns (legend left, deployment right, aligned at the top); stack
   them on narrow screens with the legend first.
   - **Legend** columns: *Square / symbol* | *Terrain / feature* | *Effect*.
     Explain every symbol and color used, including heights and access points.
   - **Deployment** columns: *ID* | *Creature* | *Position (column, row)*, with
     one row per creature or token and height where relevant. Name the anchor
     square of multi-square footprints (for example, "2×2, anchor at NW").
     Omit this table if the map has no creatures.
4. **Creature IDs.** For a standalone map use numeric IDs (`1`, `2`, `3`) for
   creatures and `P1`, `P2` style labels for player starting squares. When the map
   belongs to an encounter, encounter-creation's alphabetical IDs (`A.1`, `B.2`)
   override these.

## Verify before presenting

- Dimensions match the stated columns × rows and every row has every column.
- Every symbol and color used appears in the legend; every legend entry is used.
- No wall fills a square: every wall is an edge line, `data-walls` and `data-doors`
  agree on both sides of each shared edge, and the legend shows the wall and door lines.
- Entrances, objectives and elevation are reachable (through doors and gaps, since walls
  block), and no deployment square sits on impassable terrain.
- Large creatures have room for their footprints, and the whole deployment fits.
- With an encounter, the grid agrees with the roster, deployment and tactics.
