---
name: dnd4e-encounter-difficulty
description: Calculate D&D 4e encounter difficulty, encounter level, and XP budget for a party and enemy roster using the repository's Battle Briefing calculator.
---

# D&D 4e encounter difficulty

Use the Battle Briefing calculation as the authority for these estimates. The
[calculator](../../../src/dnd4e-health-display/scripts/combat-start/encounter-calculation.js)
is a pure function that runs locally without Foundry. The helper below imports it
directly, so its XP table and difficulty boundaries stay in sync with the module.

## Calculate a roster

Collect each participating PC's level and each enemy group's name, level, rank,
and count. Levels must be integers from 1 to 40. Ranks are `standard`, `minion`,
`elite`, or `solo`; a monster's combat role (such as brute) is separate from rank.
Ask for missing party levels or enemy levels/ranks that affect the result.
An unspecified enemy count means one and an unspecified rank means standard;
state these defaults when used. Include hidden enemies and count each creature
separately, including repeated instances of the same monster.

From the repository root, pipe JSON into the helper. PowerShell example:

```powershell
'{"party":[5,5,5,5,5],"enemies":[{"name":"Guards","level":6,"rank":"standard","count":5}]}' | node .agents/skills/dnd4e-encounter-difficulty/scripts/calculate.mjs
```

`party` is an array of PC levels; `enemies` is an array of groups. `name` is
optional. An empty enemy array calculates an empty encounter. The output includes
party level/count, enemy XP breakdown, total XP, party budget, encounter level,
level difference, difficulty, and warnings.

Report the difficulty alongside encounter level and its difference from party
level, total XP versus budget, and the enemy breakdown. Account for assumptions
and warnings; a partial XP total with warnings is not a valid difficulty rating.
For comparisons or encounter tuning, rerun the helper with the proposed roster.

## Interpret the result

- Mixed-level parties use the average PC level rounded up.
- Enemy XP comes from the calculator's level table and rank multiplier, ignoring
  printed stat-block XP. Multipliers are standard 1, minion 0.25, elite 2, solo 5.
  XP is rounded per creature before multiplying by count.
- The party budget is party size times standard-monster XP at party level.
  Encounter level is the lowest table level whose party-sized budget covers the
  enemy total; totals beyond level 40 return `40+`.
- Labels are `Trivial`, `Easy`, `Normal`, `Hard`, and `Extreme`. These use the
  module's Kassoon-derived XP thresholds, including its equality boundaries and
  low/high-level fallbacks. Read the source's `getDifficulty` when explaining a
  boundary; a level difference alone does not determine the label.
- A valid party with no enemies returns `None`; absent party data or invalid
  combatant data returns `Unavailable`.

For supplied combatant data, the original function counts player-owned tokens
as party members regardless of disposition, and hostile non-player tokens as
enemies. Friendly/neutral non-player tokens are excluded. The roster helper
models explicit PCs and enemies; it does not access a live Foundry encounter.

Identify the rating as a Battle Briefing XP estimate. Terrain, tactics, party
resources, and monster abilities are outside this numeric calculation; discuss
them separately when relevant to the user's encounter.
