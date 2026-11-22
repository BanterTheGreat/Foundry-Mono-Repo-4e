# Armor AC handoff (2026-11-22)

Working note so a new session can continue without the old conversation. Delete it once the armor change ships.

## Decision so far

- Apply **chainmail 6 -> 7 and scale 7 -> 8**. Plate stays 9, hide 3, leather 2, cloth 0.
- **Dropped** after review: the universal AC bonus (+2 at 11, +3 at 21) and the heavy-armor +1 at levels 5/15/25. They overshoot for plate (Paladin hit chance fell to 25-40%).
- Not yet applied anywhere. The user has not given the OK to edit armor data. Wait for it.
- Open question the user may raise: chainmail and scale still trail Dex-main hide late. A smaller late bonus for those two armors would close it (not modelled).

## Method (reproduce with a short script)

- Monster attack vs AC = level + 5. Verified against 4,770 published monsters (mean +0.01 off; MM3/MV +0.02; every level within 1 point).
- Hit chance = clamp((level + 5 + 21 - AC) / 20, 5%, 95%). Modern 4e defense rolls (`player-defense.js`: DC = 10 + attack + 2 against d20 + defense - 10) give the same probability.
- Modern 4e AC = 10 + half level (rounded down) + armor + magic armor enhancement + shield, plus the higher of Dex/Int **points** in light armor or no armor only. Sources: `content/equipment/equipment.json`, builder `DefenseRules.kt` and `shared/ENGINE.md`.
- Enhancement: none at level 1, then +1 at 2, +2 at 6, +3 at 11, +4 at 16, +5 at 21, +6 at 26 (PHB magic armor). Optional intrinsic AC table in `glossary/balance_changes.typ` lags it by at most 1.
- Ability points (`content/creation/standard.json`): main 4 at level 1, +1 at 8, 16 (all), 20, 28. Non-main 2, +1 at 16 (all). "Dex/Int 2" = non-main with no extra investment.
- Levels 11-30 are provisional in the rulebook, so paragon and epic numbers are indicative.

## Builds (class proficiencies from `content/classes/*.json`)

| Build | Classes |
| --- | --- |
| Plate + heavy shield | Paladin |
| Scale + heavy shield | Fighter |
| Chainmail | Cleric, Invoker, Warlock (Bard and Runepriest add a light shield) |
| Hide, Dex/Int main | Ranger (Dex main); Rogue is leather + light shield, same total |
| Hide, Dex/Int 2 | Warlord, Barbarian, Druid (Warden adds a heavy shield) |

## Result: average monster hit chance (heroic / paragon / epic)

| Build | As printed | Chainmail and scale +1 |
| --- | --- | --- |
| Plate + heavy shield | 33 / 48 / 63 | 33 / 48 / 63 |
| Scale + heavy shield | 43 / 58 / 73 | 38 / 52 / 68 |
| Chainmail | 58 / 73 / 88 | 53 / 68 / 83 |
| Hide, Dex/Int main | 52 / 59 / 66 | 52 / 59 / 66 |
| Hide, Dex/Int 2 | 63 / 75 / 88 | 63 / 75 / 88 |

At level 30 as printed: plate + heavy shield 42 AC (70% hit), scale + heavy shield 40 (80%), chainmail 37 (95%), Dex-main hide 42 (70%), Dex/Int 2 hide 37 (95%).

## Why chainmail and scale

Armor-only AC minus Dex-main hide (no shields):

| Levels | Plate | Scale | Chainmail | Scale +1 | Chainmail +1 |
| --- | --- | --- | --- | --- | --- |
| 1-7 | +2 | 0 | -1 | +1 | 0 |
| 8-15 | +1 | -1 | -2 | 0 | -1 |
| 16-19 | 0 | -2 | -3 | -1 | -2 |
| 20-27 | -1 | -3 | -4 | -2 | -3 |
| 28-30 | -2 | -4 | -5 | -3 | -4 |

Plate is already fine because Modern 4e made it +9 (vanilla +8) and slowed ability growth. The hole is chainmail and scale.

## Vanilla 4e findings (for context)

- Plate +8 and a dedicated Dex/Int build in hide beat plain plate from level 8 on (+4 AC at level 30), because ability scores keep growing. Modern 4e's points system removed most of that.
- No vanilla feat scales AC like Expertise or Improved Defenses do. Armor Specialization and Shield Specialization give a flat +1 at level 11.

## What-if: level bonus plus heavy armor bonus (saved 2026-11-22, not decided)

A possible future alternative to the chainmail/scale +1 above. Nothing here is applied; it is only stored so it can be revived. It is milder than the dropped universal bonus (+2 at 11, +3 at 21).

Rules modelled, on top of the method above (chainmail stays at the printed +6, plate 9, hide 3, leather 2):

- **Universal level bonus:** +1 AC at level 11 and another +1 at level 21 (+2 total from 21), for every build.
- **Heavy armor bonus:** +1 AC at levels 15, 20 and 25 (+3 total from 25) for heavy armor only. Plate and chainmail were modelled; scale would count too. Hide, leather and cloth get nothing.
- Dex/Int points: main 4, +1 at 8, 16, 20, 28; secondary 2, +1 at 16. Only in light armor (hide, leather).
- Leather build is Dex/Int main with no shield (hide main minus 1 AC); a Rogue's light shield brings it level with hide.
- The user's target is an **average 55% monster hit chance**.

Average monster hit chance (heroic / paragon / epic):

| Build | As printed | What-if |
| --- | --- | --- |
| Plate + heavy shield | 33 / 48 / 63 | 33 / 39 / 40 |
| Plate | 43 / 58 / 73 | 43 / 49 / 50 |
| Hide, Dex/Int main | 52 / 60 / 66 | 52 / 55 / 56 |
| Leather, Dex/Int main | 57 / 65 / 71 | 57 / 60 / 61 |
| Chainmail | 58 / 73 / 88 | 58 / 64 / 65 |
| Hide, Dex/Int secondary | 63 / 75 / 88 | 63 / 70 / 78 |

AC at level 1 / level 30 under the what-if: plate 19 / 45, plate + heavy shield 21 / 47, hide main 17 / 44, leather main 16 / 43, chainmail 16 / 42, hide secondary 15 / 39.

Takeaways:

- Hide with Dex/Int main lands almost exactly on the 55% target in paragon and epic.
- Plate (50%) and especially plate + heavy shield (40%) end up well under the target, so the heavy bonus overshoots for plate. A smaller or chainmail/scale-only version would fit better.
- Chainmail still ends about 10 points over the target (65%), and Dex/Int secondary hide is the outlier at 78% (85% at level 30) because it gets no heavy bonus.
- An earlier iteration with only the level bonus (no heavy bonus) gave: plate + heavy shield 33 / 43 / 53, plate 43 / 53 / 63, hide main 52 / 55 / 56, leather main 57 / 60 / 61, chainmail 58 / 68 / 78, hide secondary 63 / 70 / 78.

Reproduce: hit = clamp((level + 26 - AC) / 20, 5%, 95%), AC = 10 + floor(level / 2) + armor + enhancement + shield + Dex/Int points (light armor) + level bonus + heavy bonus, for levels 1-30.

## What-if: lower armor bonuses with ability caps (saved 2026-11-22, not decided)

A second stored alternative, built by stacking changes on the printed values. Nothing is applied. Without any level bonus, AC is only half level + enhancement + armor + capped ability points.

Rules modelled:

- **Armor bonuses:** every armor 1 below printed (plate +8, scale +6, chainmail +5, hide +2, leather +1; cloth stays at 0), then chainmail and scale 1 lower again (scale +5, chainmail +4).
- **Dex/Int caps:** chainmail and scale may add Dex/Int up to +1 (so they end at 6 and 5 total, the same as the first step). Light armor (hide, leather) may add Dex/Int up to +4. Main starts at 4 points, so the +4 cap freezes it there; secondary (2, then 3 at level 16) never reaches it.
- No shields, no level bonus (the +1 at 11/21 and heavy +1 at 15/20/25 are off).
- The user's target is an average 55% monster hit chance.

Resulting AC at level 1 / level 30 and average monster hit chance (heroic / paragon / epic). Matching lines are merged:

| Build | AC L1 / L30 | Hit chance |
| --- | --- | --- |
| Plate | 18 / 39 | 48 / 63 / 78 |
| Scale and hide, Dex/Int main | 16 / 37 | 58 / 73 / 88 |
| Chainmail and leather, Dex/Int main | 15 / 36 | 63 / 78 / 92 |

Takeaways:

- Scale equals capped hide, and chainmail equals capped leather, at every level, so each pair is one line.
- Every build sits above the 55% target except plate in heroic, so this version needs a level bonus to bring the table down.
- The cap alone (printed armor values, light armor capped at +4) gave 43 / 58 / 73 for plate, 53 / 68 / 83 for scale and capped hide, and 58 / 73 / 88 for chainmail and capped leather.

Reproduce with the formula in the previous section; each armor's AC is 10 + floor(level / 2) + armor + enhancement + capped ability points.

## What-if: scheduled AC bonus on top of the lowered armor values (saved 2026-11-22, not decided)

A third stored alternative. It keeps the lowered armor values and ability caps from the previous what-if, and adds a stepped bonus for every build to bring the table to the 55% target. Nothing is applied.

Rules modelled:

- **Armor bonuses:** plate +8, scale +5, chainmail +4, hide +2, leather +1.
- **Dex/Int caps:** chainmail and scale may add up to +1; light armor (hide, leather) up to +4. Main starts at 4 points, so its +4 cap freezes it there.
- **Scheduled AC bonus, all builds:** +1 at levels 5, 10, 13, 15, 20, 23, 25 and 30, +8 total at level 30. It started as +1 at 5, 10, 15, 20, 25 and 30, then the second +1 at 10 and 20 was moved to 13 and 23 to remove 10-point dips on those levels.
- Enhancement still +1 at 2, +2 at 6, +3 at 11, +4 at 16, +5 at 21, +6 at 26. No shields.

Result, average monster hit chance (heroic / paragon / epic) and AC at level 1 / level 30:

| Build | AC L1 / L30 | Hit chance |
| --- | --- | --- |
| Plate | 18 / 47 | 45 / 45 / 45 |
| Scale and hide, Dex/Int main | 16 / 45 | 55 / 55 / 55 |
| Chainmail and leather, Dex/Int main | 15 / 44 | 60 / 60 / 60 |
| Hide, Dex/Int secondary | 14 / 44 | 65 / 63 / 60 |
| Leather, Dex/Int secondary | 13 / 43 | 70 / 68 / 65 |

Secondary means 2 ability points, 3 from level 16. From level 16 secondary hide has the same AC as chainmail and leather main, because main is frozen at the +4 cap while secondary keeps gaining.

Open problem and candidate fix: half investment becomes less penalising from level 16 (the gap to main shrinks from 2 AC to 1). A cap that depends on investment fixes it: Dex/Int adds to AC in light armor up to +4 if it is your main ability and up to +2 if it is not. Secondary then stays 2 AC behind main for the whole game: hide secondary a flat 65%, leather secondary a flat 70%. Not yet charted or decided. A secondary cap of +3 would make the gap a fixed 1 AC instead.

An attempt with hide and leather Dex/Int cap +3 and +1 base AC (hide +3, leather +2) was reverted: main stayed identical and secondary gained 5 points of hit chance.

Takeaways:

- Scale and hide hit the 55% target exactly in every tier; chainmail and leather sit 5 over, plate 10 under.
- The bonus schedule is a hack: eight breakpoints with no rule behind them. It is a stand-in for full-level scaling: for scale and hide, AC stays within 1 point of level + 15 at every level (the 55% target is AC = level + 15). Enhancement plus the schedule also stays within 1 point of half level, so the whole thing is roughly AC = 10 + full level + armor + capped ability, with the half-level and enhancement steps double-counting what a single full-level term would do.
- Earlier iterations: +1 at 5/10/15/20/25/30 gave 45 / 49 / 54, 55 / 59 / 64 and 60 / 64 / 69; with +2 at 10 and 20 it gave 44 / 44 / 44, 54 / 54 / 54 and 59 / 59 / 59 but dipped 10 points on levels 10 and 20.

## What-if: armor kits with ability prerequisites (saved 2026-11-22, not decided)

The latest direction, replacing "armor bonus + Dex/Int points". Nothing is applied. It follows from the problems in the previous sections: ability growth made AC drift and let half investment catch up at level 16, and caps or schedules patched around it.

Rules modelled:

- **A kit is an abstraction of armor** with a set AC value at level 1 (it replaces 10 + armor bonus + ability points). AC is then kit value + half level + magic enhancement + the scheduled bonus (+1 at levels 5, 10, 13, 15, 20, 23, 25 and 30, the same schedule as the previous what-if).
- **Ability points no longer add to AC.** A prerequisite only decides whether a character may use a kit. Points above the prerequisite do nothing for AC.
- **Dex/Int prerequisites are met by points, not modifiers.** Main starts at 4 points, non-main at 2 (3 from level 16), so a prerequisite of 2 is met by everyone and a prerequisite of 4 only by a main ability or extra investment. The free +1 at level 16 never unlocks a kit that needs 4.
- Strength/Constitution prerequisites on the heavy kits were tried (2, 4 and 4) and then removed: Chainmail, Scale and Plate are now gated by proficiency only.

| Kit | Replaces | Level 1 AC | Prerequisite | Penalties | Suggested name |
| --- | --- | --- | --- | --- | --- |
| Default / Unarmored | Cloth | 12 | None | None | Unarmored |
| Mage Armor | New | 14 | Not defined yet | None assumed | Mage Armor |
| Leather kit | Leather | 15 | 2 Dex/Int | None | Scout |
| Hide kit | Hide | 16 | 4 Dex/Int | None | Skirmisher |
| Chainmail kit | Chainmail | 15 | Proficiency only | -1 speed | Soldier |
| Scale kit | Scale | 16 | Proficiency only | -1 speed | Vanguard |
| Plate kit | Plate | 17 | Proficiency only | -1 speed, -1 armor check | Bulwark |

Average monster hit chance (flat across heroic, paragon and epic) and AC at level 1 / level 30:

| Kit | AC L1 / L30 | Hit chance |
| --- | --- | --- |
| Plate | 17 / 46 | 50% |
| Hide and Scale | 16 / 45 | 55% |
| Leather and Chainmail | 15 / 44 | 60% |
| Mage Armor | 14 / 43 | 65% |
| Unarmored | 12 / 41 | 75% |

Takeaways:

- Lines are flat and parallel, so nothing drifts or converges. Leather matches Chainmail and Hide matches Scale, which is accepted. There are no secondary lines: secondary characters (2 points) land on a 15 kit.
- Half investment is a fixed 1 AC (Hide 16 for main against Leather 15 for secondary) at every level.
- Against the previous what-if at level 1: plate 18 to 17, hide main and chainmail/leather main unchanged, secondary users gain 1 to 2 AC (hide secondary 14, leather secondary 13, cloth 12 all become 15).

Open problems:

- **Free gates make cheap kits dominated.** Every character meets the 2-point gate, so Chainmail (15, -1 speed) is strictly worse than Leather (15, no penalty), and Unarmored 12 and Mage Armor 14 are worse than Leather. Fixes: keep class proficiency per kit family (casters limited to Unarmored and Mage Armor, Cleric and Warlock to the Str/Con kits, Rogue to the Dex/Int kits), or make Chainmail 16 so its speed penalty buys something.
- **Mage Armor** has no prerequisite or reason to exist yet. An Int prerequisite, a class proficiency or a spellcasting benefit would give it one.
- **Heavy access** is by proficiency only now: a Dex/Int 4 character with heavy proficiency would take Plate (17) over Hide (16).
- **Shields** are untouched and have not been charted with kits.
- The scheduled bonus is still needed. Kit values that rise by tier could replace it, not yet drafted.
- **Builder impact:** `DefenseRules.kt` would drop the Dex/Int AC contribution and the armor bonus lookup, and gain a prerequisite check and a kit choice.

### Kit track: AC bonus schedule and results

The scheduled bonus above (+1 at 5, 10, 13, 15, 20, 23, 25 and 30) was replaced while iterating. The latest track, with Mage Armor included, is below. Nothing is applied.

**AC formula:** kit value + half level (rounded down) + magic enhancement + added bonus.

- **Kit values at level 1:** Plate 17, Hide and Scale 16, Leather and Chainmail 15, Mage Armor 14, Unarmored 12.
- **Magic enhancement (assumed, not added):** +1 at level 2, +2 at 6, +3 at 11, +4 at 16, +5 at 21, +6 at 26. This is the PHB magic armor curve and holds only if characters wear enchanted armor.
- **Added bonus: +1 AC at levels 5, 9, 13, 15, 19, 23, 25 and 29** (+8 total, running total +1, +2, +3, +4, +5, +6, +7, +8). It is applied to every kit.
- Not in the chart: a tier bonus to AC (the rulebook gives +1/+2/+3 by tier to attack, Fortitude, Reflex and Will only), and shields.

**Why those levels:** monster attack rises 1 per level, so AC should rise 1 per level. Half level adds AC on even levels and enhancement on levels 2, 6, 11, 16, 21 and 26. The bonuses go on odd levels where neither steps (odd levels other than 11 and 21; levels 7, 17 and 27 were open too but are not used, to keep the total at 8 spread evenly), so no level gains more than 2 AC and no hit chance moves more than 5 points between levels. An earlier version with +1 at 6, 16, 26 and 30 and +2 at 11 and 21 (+8 total) stacked bonuses onto the enhancement levels and dipped 10 points at levels 6, 11, 16, 21 and 26.

**Results.** Average monster hit chance (heroic / paragon / epic) and AC at level 1 / level 30:

| Kit | AC L1 / L30 | Hit chance |
| --- | --- | --- |
| Plate | 17 / 46 | 49 / 50 / 50 |
| Hide and Scale | 16 / 45 | 54 / 55 / 55 |
| Leather and Chainmail | 15 / 44 | 59 / 60 / 60 |
| Mage Armor | 14 / 43 | 64 / 65 / 65 |
| Unarmored | 12 / 41 | 74 / 75 / 75 |

- Hide and Scale sit at exactly 55% (the target) at almost every level, with 5-point dips to 50% at levels 2, 6, 16 and 26. Those dips come from the half-level and enhancement steps landing together and cannot be fixed by moving the added bonus; they need an enhancement shift.
- Gaps between kits are fixed in AC: Plate 5 points under Hide and Scale, Leather and Chainmail 5 over, Mage Armor 10 over, Unarmored 20 over.
- With no added bonus at all, hit chances drift up about 15 points per tier (hide and scale 58 / 73 / 88, plate 53 / 68 / 83) because monster attack rises 29 points over 30 levels and half level plus enhancement only gives 21. The 8-point added bonus fills exactly that gap.
- Other versions tried on the way, for comparison. Added bonus +1 at 6, 11, 16, 21, 26 and 30 (+6 total): hide and scale 56 / 60 / 65, still drifting. Same plus a second +1 at 11 and 21 (+8 total): flat 56 / 55 / 55 but with 10-point dips on the enhancement levels.
- The bonus is still eight breakpoints. Replacing half level and the schedule with a single full-level term would remove them entirely (AC = 10 + level + kit offset) but would stop magic armor adding AC.

### Kit track, regular cadence (preferred so far, saved 2026-11-22)

The user's current favorite way to make the added AC bonus feel like a rule instead of a patch. Not applied.

**Rule:** you gain +1 AC at 5th level and every four levels after that: levels 5, 9, 13, 17, 21, 25 and 29 (+7 total). It is applied to every kit. The rest of the formula is unchanged: AC = kit value + half level + magic enhancement (+1 at 2, +2 at 6, +3 at 11, +4 at 16, +5 at 21, +6 at 26) + this bonus. Kit values at level 1: Plate 17, Hide and Scale 16, Leather and Chainmail 15, Mage Armor 14, Unarmored 12.

**Results.** Average monster hit chance (heroic / paragon / epic) and AC at level 1 / level 30:

| Kit | AC L1 / L30 | Hit chance |
| --- | --- | --- |
| Plate | 17 / 45 | 49 / 52 / 54 |
| Hide and Scale | 16 / 44 | 54 / 57 / 59 |
| Leather and Chainmail | 15 / 43 | 59 / 62 / 64 |
| Mage Armor | 14 / 42 | 64 / 67 / 69 |
| Unarmored | 12 / 40 | 74 / 77 / 79 |

- No hit chance moves more than 5 points between adjacent levels, the same as the irregular 8-bonus track (5, 9, 13, 15, 19, 23, 25, 29). The cadence lands on odd levels that are not enhancement levels (5, 9, 13, 17, 25, 29), plus level 21, where it stacks with an enhancement step for +2 (still within the limit).
- It drifts slightly: 7 bonuses are one short of the 8 needed, so hit chance rises 2 to 3 points per tier. Hide and Scale go from 54% to 60% at level 30. Adding +1 at level 30 (+8 total) would end Hide and Scale at 55% at level 30 and give 54 / 57 / 58 on average, with a small bump at the last level.
- The 5-point dips at levels 2 and 6 (and 16 and 26) remain; they come from enhancement landing with half level.
- Alternatives compared (hide and scale): current irregular track 54 / 55 / 55; every 3 levels from 5 (+1 at 5, 8, 11, ... 26) dips 10 points on enhancement levels and ends at 54 / 52 / 51; full-level AC (kit + level - 1) is a perfect flat 55%.

**Other ways to integrate the bonus that were discussed:**

- Fold enhancement and the bonus into one inherent armor column in the optional intrinsic bonus table in `balance_changes.typ` (the table's AC column currently reaches only +5), reusing its "use an item's bonus where it is higher" rule so nothing double counts. AC would have to move into the baseline instead of GM opt-in.
- Replace half level, enhancement and the bonus with full-level AC (kit + level - 1). Perfect flat hit chance, but magic armor stops adding AC.
- The tier bonus (+1/+2/+3 by tier) is too coarse to close the gap; AC does not currently get it (it applies to attack, Fortitude, Reflex and Will).
- Check whether Fortitude, Reflex and Will drift against monster attacks the same way, since they only get the tier bonus from the baseline. Not yet checked.

### Kit names (abstract, saved 2026-11-22)

A kit is a defensive discipline, not a piece of gear. The look is free: describe the kit with whatever gear fits, so it is never odd that a Dex 4 character cannot "wear hide". Kits are grouped in families by the stat that gates them. Class armor proficiency still decides which kits a class may use, so it is not listed as a gate; a kit with no stat requirement is simply open to any class trained in it.

| Family | Kit | Level 1 AC | Stat requirement | Penalties | Looks like |
| --- | --- | --- | --- | --- | --- |
| None | Unguarded | 12 | None | None | Clothes, robes |
| Spell | Mage Armor | 14 | None | None | A ward, no gear |
| Dodge | Nimble | 15 | 2 Dex/Int | None | Leather, padding |
| Dodge | Evasive | 16 | 4 Dex/Int | None | Hide, studded leather |
| Heavy | Steady | 15 | None | -1 speed | Mail, light plates |
| Heavy | Stalwart | 16 | None | -1 speed | Scale, brigandine |
| Heavy | Unyielding | 17 | None | -1 speed, -1 armor check | Full plate |

- The Dodge and Heavy families both use adjectives. Alternatives considered for the heavy family: Palisade, Rampart, Citadel; Braced, Bulwark, Aegis.
- Mage Armor has no stat requirement. Whether every class may take it or only casters is still open; if everyone can, it beats Unguarded and sits 1 AC under Nimble.
- Magic armor would attach to a kit instead of an armor type. The six armor items in `equipment.json` would become these seven kits.
- Features that change which stat counts toward AC (Barbarian Agility: Strength, Primal Guardian: Constitution, World Speaker spirit: Constitution) would instead change which stat meets the Dodge family requirement.

Ideas tried before kits and set aside: a Dex/Int cap of +2 for secondary only (gap fixed at 2 AC, rejected as the wrong approach), tiered caps (3 + tier) and a medium armor category, and Simple / Military / Superior proficiency tiers with Dex/Int caps of +2 and +4 and a shared base for Leather and Studded Leather.

## Next steps when the user says go

1. Set `armorBonus` for `modern4e.armor.chainmail` (6 -> 7) and `modern4e.armor.scale` (7 -> 8) in `src/modern4e/content/equipment/equipment.json`.
2. Regenerate and check: `python3 src/modern4e/scripts/equipment_content.py`, `python3 src/character-builder/content/build.py --modern-equipment --check`, `python3 -m unittest discover -s src/character-builder/content -p 'test_modern_equipment.py' -v`, and the production-generated packages under `src/character-builder/content/production-generated/modern4e.equipment/`.
3. Update tests that hard-code the values: `shared/src/commonTest/.../ProductionContentPackagesTest.kt`, `SharedContentAcceptanceTest.kt`, `android/src/test/.../EquipmentDefenseTest.kt`, fixtures under `shared/fixtures/sample-*-fighter-*.json`, and `content/samples.py`. Add a test covering the new values.
4. Update `FEATURES.md` and `tests/README.md` if behavior or commands change. Check `shared/ENGINE.md` mentions.
5. `npm run typst:compile` for the rulebook; check the armor table page.
6. Remove the queued item from memory (`project-armor-ac-todo.md`) and delete this file.
