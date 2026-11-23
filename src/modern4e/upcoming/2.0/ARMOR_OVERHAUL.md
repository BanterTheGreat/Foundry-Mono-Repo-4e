# Armor overhaul (2026-11-22)

This note records the armor design agreed so far so a new session can pick up the work. The armor data, Character Builder, and rulebook still use the current rules. Wait for the user's go-ahead before changing armor data or how the builder calculates AC. Delete this note after the change ships.

On 2026-11-22 the user called this version "the fix we were looking for". This design replaces the earlier armor kits. Each kit had a fixed level 1 AC, and Dexterity or Intelligence only determined whether a character qualified. Ability points did not add to AC under that design.

## Goal

Use a simple armor rule to keep the average monster's chance to hit a player at about 55% from level 1 through 30. Limit how much ability points can add to armor class (AC).

## The design

**AC = armor value + Dex/Int points (up to the armor's cap, light armor only) + half level (rounded down) + magic enhancement + the added bonus.**

| Armor | AC at level 1 | Dex/Int cap | Penalties |
| --- | --- | --- | --- |
| Cloth (unarmored) | 10 + Dex/Int | +3 | None |
| Leather | 12 + Dex/Int | +3 | None |
| Hide | 13 + Dex/Int | +3 | None |
| Chainmail | 15 | Dex/Int do not count | -1 speed |
| Scale | 16 | Dex/Int do not count | -1 speed |
| Plate | 17 | Dex/Int do not count | -1 speed, -1 armor check |

- **Use ability points directly.** As in the current rules, use the higher of Dexterity (Dex) and Intelligence (Int). A main ability starts at 4 points and gains 1 at levels 8, 16, 20, and 28. A secondary ability starts at 2 points and gains 1 at level 16. These values come from `content/creation/standard.json`.
- **Unarmored (Cloth), Leather and Hide** each add up to +3 AC from Dex or Int.
- **Heavy armor has a fixed armor value.** Chainmail gives 15, Scale gives 16, and Plate gives 17. The design notes compare these with light armor on a character whose main ability is Dex or Int. The table shows that Leather and Hide reach 15 and 16, while Cloth reaches 13. No light armor in the table reaches 17.
- **In armor bonus terms** (AC = 10 + bonus): Cloth 0, Leather +2, Hide +3, Chainmail +5, Scale +6, Plate +7. The light armor bonuses match standard 4e. Each heavy armor bonus is 1 lower than its standard value (+6, +7, and +8 respectively). The speed and armor check penalties come from the earlier kit table and have not been revisited.
- **Features that swap the AC stat keep working** (Barbarian Agility with Strength, Primal Guardian and the Shaman's World Speaker spirit with Constitution): the swapped stat is the one counted up to the cap.

### When the extra AC bonus increases

**You gain +1 AC at 5th level and every four levels after that: levels 5, 9, 13, 17, 21, 25 and 29** (+7 total), for every armor.

- The calculation assumes characters wear enchanted armor and follow the Player's Handbook (PHB) enhancement schedule. The armor grants +1 at level 2, +2 at 6, +3 at 11, +4 at 16, +5 at 21, and +6 at 26.
- Monster attack rises 1 per level, so AC should too. Half level adds AC on even levels and enhancement on 2, 6, 11, 16, 21 and 26. The extra bonus increases on odd levels. Its only overlap with an enhancement increase is at level 21, when the two add up to +2 AC. No level gains more than 2 AC, so the hit chance changes by at most 5 percentage points between levels.
- A tier bonus to AC is not part of this (the rulebook gives +1/+2/+3 by tier to attack, Fortitude, Reflex and Will only).

## Results

![Enemy hit chance by armor over levels 1–30](../../armor-ac-hit-chance.svg)

The chart assumes a heavy shield adds +2 AC to Plate. The average weights each of the five plotted lines equally and overlaps Hide and Scale at every level.

The calculation sets monster attack to level + 5. Calculate hit chance as `(level + 26 - AC) / 20`, with a minimum of 5% and a maximum of 95%. An earlier check against 4,770 published monsters found a mean difference of +0.01. The rulebook's levels 11–30 are provisional, so the paragon and epic results are estimates.

The table shows AC at levels 1 and 30 for a character whose main ability is Dex or Int. The three hit chances are the averages for levels 1–10, 11–20, and 21–30, in that order. Armors with the same AC share a row.

| Armor | AC L1 / L30 | Hit chance (%) |
| --- | --- | --- |
| Plate | 17 / 45 | 49 / 51 / 53 |
| Hide and Scale | 16 / 44 | 54 / 56 / 58 |
| Leather and Chainmail | 15 / 43 | 59 / 62 / 64 |
| Cloth (unarmored) | 13 / 41 | 69 / 72 / 74 |

- The four lines are parallel. Plate, Hide/Scale and Leather/Chainmail are 5 percentage points apart. Unarmored is 10 percentage points above Leather/Chainmail.
- A secondary Dex/Int character (2 points, 3 from level 16) is behind a main one until level 15, then identical to one in Leather and Hide, because the cap of 3 is reached. Hide secondary 59 / 59 / 58, Leather secondary 64 / 64 / 64, Cloth secondary 74 / 74 / 74.
- A main Dex/Int character reaches the +3 cap in all three categories at level 1.
- Small 5-point dips at levels 2, 6, 16 and 26 come from half level and enhancement landing together; they need an enhancement shift, not a different bonus.

## Still open

- Whether Mage Armor (14 starting AC with no ability requirement, from the earlier kit design) stays. It would start 1 AC above unarmored at the +3 cap.
- The half-investment gap closes at level 16 for Leather and Hide (the problem the kits were meant to remove); it has not been fixed.
- Chainmail matches Leather at 15 but has a -1 speed penalty; Cloth and Mage Armor are worse than both for any class that can take them.
- Which classes may take which armor. The repo already has a general feat, Armor Proficiency, that moves one step up Cloth, Leather, Hide, Chainmail, Scale, Plate, and features that give Cleric (Battlepriest's Lore) and Warlord (Armored Warlord) scale proficiency and Sorcerer (Leatherbound Sorcerer) leather. With flat heavy armors, one feat is worth +1 to +2 AC.
- The chart models a heavy shield with Plate. Other shield combinations are still open.
- Fortitude, Reflex and Will may drift against monster attacks the same way AC did; not checked.
- The earlier comparison of vanilla 4e AC for Barbarian, Druid and Shaman was built on the old kit values and needs redoing.

## What to do after approval

1. Change the armor bonuses in `src/modern4e/content/equipment/equipment.json` to the values above (Cloth 0, Leather +2, Hide +3, Chainmail +5, Scale +6, Plate +7), add the +3 Dex/Int cap for unarmored (Cloth), Leather and Hide, then regenerate with `python3 src/modern4e/scripts/equipment_content.py` and `python3 src/character-builder/content/build.py --modern-equipment --check`, and check the production-generated packages under `src/character-builder/content/production-generated/modern4e.equipment/`.
2. Change `src/character-builder/shared/src/commonMain/kotlin/dev/modern4e/builder/DefenseRules.kt`: cap the Dex/Int contribution per armor and add the +1 every four levels from level 5. Update `shared/ENGINE.md`.
3. Update tests that hard-code armor values (`ProductionContentPackagesTest.kt`, `SharedContentAcceptanceTest.kt`, `DefenseRulesTest.kt`, `EquipmentDefenseTest.kt`, fixtures under `shared/fixtures`, `content/samples.py`) and add coverage for the caps and the added bonus.
4. Update `FEATURES.md` and `tests/README.md`; update the rulebook armor table and the AC rules, then `npm run typst:compile` and check the page.
5. Remove the queued item from memory (`project-armor-ac-todo.md`) and delete this file.
