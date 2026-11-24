# Skill mechanic overhaul

**Status: Work in progress.**

## Starting skills and Intelligence

Each character starts with two background skills and a number of free Trained skill picks based on their class.

| Class ability guidance | Free picks | Classes |
| --- | ---: | --- |
| Intelligence is a main ability | 1 | Artificer, Swordmage, Wizard |
| Intelligence is a listed secondary ability | 1 | Avenger, Bard, Cleric, Invoker, Shaman, Warlock, Warlord |
| Intelligence is neither | 3 | Barbarian, Druid, Fighter, Paladin, Ranger, Rogue, Runepriest, Sorcerer, Warden |

Characters also gain one Trained skill per two points of Intelligence, rounded down, with a minimum of zero and no cap on the Intelligence contribution. When Intelligence rises enough to increase that total, choose another skill to train. The free picks depend on the class's listed abilities.

| Example build | Level 1 | Level 15 | Level 30 |
| --- | ---: | ---: | ---: |
| Wizard, main Intelligence starting at +4 | 5 | 6 | 7 |
| Warlock, secondary Intelligence starting at +3 and raised whenever possible | 4 | 5 | 7 |
| Fighter, Intelligence stays at +1 | 5 | 5 | 5 |

These totals use the proposed [Ability Advancement](ABILITY_UPDATE.md) schedule and exclude any skill increases spent on new training.

## Skill ranks and advancement

| Rank | Bonus | Earliest level |
| --- | ---: | ---: |
| Untrained | +0 | 1 |
| Trained | +2 | 1 |
| Expert | +4 | 3 |
| Adept | +6 | 9 |
| Master | +8 | 18 |
| Legendary | +10 | 27 |

Characters gain a skill increase every three levels starting at level 3, for **11 increases** by level 30. Level 24 grants two increases, which must go to different skills. Each increase moves a skill up one rank, including from Untrained to Trained, up to the highest rank available at that level.

| Highest rank available | Skill increase levels | Increases |
| --- | --- | ---: |
| Expert | 3, 6 | 2 |
| Adept | 9, 12, 15 | 3 |
| Master | 18, 21, 24 (two) | 4 |
| Legendary | 27, 30 | 2 |

## Checks and DCs

Roll **1d20 + half your character level (rounded down) + the relevant ability + your skill rank bonus**, plus any applicable situational modifiers. Use the existing degrees of success, including the natural 1 and natural 20 overrides.

Add the following adjustment to every published DC in the corresponding level row. This applies to Easy, Normal, Hard, and Extreme checks.

| DC table level | DC increase |
| --- | ---: |
| 1–3 | +3 |
| 4–15 | +4 |
| 16–30 | +5 |

The adjustment increases by 1 at levels **4 and 16**. The level 1 Normal DC is **15**. A Trained character using their main ability (+4 ability and +2 training) succeeds on a 9–20, for **60%**. Success includes both perfect success and success with a minor hurdle.

| Level 1 ability | Trained | Untrained |
| --- | ---: | ---: |
| Main ability (+4) | 60% | 50% |
| Secondary ability (+2) | 50% | 40% |
| Secondary ability (+1) | 45% | 35% |

Using the current published ability progression, a main-ability skill that takes every available rank reaches **85%** on a Normal check at level 30. A main-ability skill that stays Trained falls to **45%**, and an Untrained one falls to **35%**.

### Level 12 playtest example

The level 12 Normal DC is **24**. Mork, a Shaman with INT +3 and WIS +5, has a **60%** chance with Adept Crafting or Expert Nature, **50%** with Trained Religion, and **40%** with Trained Arcana. He can reach those ranks with the increases at levels 3, 6, and 9 and use his level 12 increase elsewhere. All four checks include +6 from half his level.

## Example builds at level 30

These examples start with four Trained skills and spend all 11 skill increases.

| Build | Trained | Expert | Adept | Master | Legendary |
| --- | ---: | ---: | ---: | ---: | ---: |
| Train all 14 skills and raise one to Expert | 13 | 1 | 0 | 0 | 0 |
| One Legendary and two Masters | 0 | 1 | 0 | 2 | 1 |
| Two Legendary specialists | 0 | 1 | 1 | 0 | 2 |
| One Legendary and seven new skills | 10 | 0 | 0 | 0 | 1 |

Two Legendary skills is the maximum. The level 27 and 30 increases are the only opportunities to reach Legendary, so both skills must be Master before level 27.

## Open questions

- Check the DC progression again against the proposed [Ability Advancement](ABILITY_UPDATE.md) schedule before adopting it.
- Decide whether to lower early DCs to offset the smaller Trained and Expert bonuses.
- Decide whether to limit the number of skill increases that can train new skills.
- Decide whether Master and Legendary should unlock skill utility powers or other ways to use a skill.

The proposed skill list and guidance for choosing an ability are in [Skills Overhaul](SKILLS_OVERHAUL.md).

## What if skill increases had different rank caps?

Start with four skills. Choose one to be Expert (+5) and three to be Trained (+3). Untrained skills give +0. Master gives +7 and Legendary gives +9. The rank bonus applies whichever ability the check uses.

Gain one skill increase every three levels. Each increase moves one skill up one rank, subject to the cap for that pick.

| Levels | Highest rank | Can train a new skill? |
| --- | --- | --- |
| 3, 6, 9, 15, 21 | Expert (+5) | Yes |
| 12, 18, 24 | Master (+7) | Yes |
| 27, 30 | Legendary (+9) | No |

A Master-capped pick can also raise a Trained skill to Expert. Learning a new skill raises it from Untrained to Trained and uses the whole pick.

This example prioritizes the three skills in bold. It raises Society and Nature at levels 3 and 6, then Crafting at 12. The picks at 9, 15, and 21 go to Stealth and Medicine. Society and Nature reach Master at 18 and 24, then Crafting and Society reach Legendary at 27 and 30.

| Skill | Level 1 | Level 15 | Level 30 |
| --- | ---: | ---: | ---: |
| **Crafting** | +5 | +7 | +9 |
| **Society** | +3 | +5 | +9 |
| **Nature** | +3 | +5 | +7 |
| Stealth | +3 | +5 | +5 |
| Medicine | +0 | +3 | +5 |


## What If — Half ability points and skill ranks

Keep the current skill list. For a skill check, roll 1d20 and add half your level (rounded down), half your relevant ability points (rounded down), and your skill rank bonus. An ability of 2–3 contributes +1 and an ability of 4–5 contributes +2.

| Rank | Bonus | Proposed access |
| --- | ---: | --- |
| Untrained | +0 | Default |
| Trained | +3 | Convert existing proficiency grants to Trained |
| Expert | +5 | Available from level 3 |
| Specialist | +7 | Available from level 11 |
| Master | +9 | Available from level 21 |

Grant one skill advancement at levels 3, 6, 9, 11, 15, 18, 21, 24, 27, and 30. Spend it to learn a new skill or raise one existing skill by one rank, subject to the level gates. The level 11 and 21 advancements let a character take the new rank at the start of its tier. Trained satisfies existing skill utility proficiency prerequisites. This PoC uses rank bonuses alone.

Keep the existing Normal DC progression, starting at 12. Set Easy to Normal −3 and Hard to Normal +3 at every level. The Normal DCs in level order are:

| Levels | Normal DCs |
| --- | --- |
| 1–10 | 12, 13, 13, 14, 15, 15, 16, 16, 17, 18 |
| 11–20 | 19, 20, 20, 21, 22, 22, 23, 23, 24, 25 |
| 21–30 | 26, 27, 27, 28, 29, 29, 30, 30, 31, 32 |

Count meeting the DC as success, including success with a minor hurdle. The chance in percent is 5 × (21 + total bonus − DC), bounded between 5% and 95% by the natural 20 and natural 1 rules.

| Level 1 rank and ability contribution | Easy 9 | Normal 12 | Hard 15 |
| --- | ---: | ---: | ---: |
| Untrained +1 | 65% | 50% | 35% |
| Untrained +2 | 70% | 55% | 40% |
| Trained +1 | 80% | 65% | 50% |
| Trained +2 | 85% | 70% | 55% |

The table below shows Normal success chances for a fixed +1 ability contribution. Dashes mark ranks unavailable at the level shown.

| Level | Normal DC | Untrained | Trained | Expert | Specialist | Master |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 12 | 50% | 65% | — | — | — |
| 3 | 13 | 50% | 65% | 75% | — | — |
| 6 | 15 | 50% | 65% | 75% | — | — |
| 9 | 17 | 45% | 60% | 70% | — | — |
| 11 | 19 | 40% | 55% | 65% | 75% | — |
| 20 | 25 | 35% | 50% | 60% | 70% | — |
| 21 | 26 | 30% | 45% | 55% | 65% | 75% |
| 30 | 32 | 25% | 40% | 50% | 60% | 70% |

Training adds 15 percentage points, and each later rank adds another 10 when the natural-roll bounds do not apply. A Trained character with +1 from ability stays 10 points ahead of an Untrained character with +2 on Normal checks throughout the progression.

On the current DC curve, a character with +1 from ability has a 75% chance against a Normal check of their own level when they first reach Expert at level 3, Specialist at level 11, and Master at level 21. Within each rank, the chance can fall as the DC rises. If the PoC should make specialists increasingly reliable against challenges of their own level, test a Normal DC of 12 + half level rounded down, with the same Easy and Hard offsets. On that curve, a fixed +1 ability gives Normal success chances of 50%, 65%, 75%, 85%, and 95% from Untrained through Master.


### What If — Half-level DCs with rank unlock increases

Test Normal DC = 12 + half level rounded down, plus cumulative increases of +1 at level 3 (Expert), +2 more at level 11 (Specialist), and +2 more at level 21 (Master). Easy is Normal −3 and Hard is Normal +3. Normal DC is 12 at level 1, 14 at level 3, 20 at level 11, 27 at level 21, and 32 at level 30.

Use Untrained +0, Trained +3, Expert +5, Specialist +7, and Master +9. Add half level rounded down and half the current ability points rounded down. Keep the current skill list and natural-roll outcomes. Use [the revised ability track](ABILITY_UPDATE.md) from level 11 onward and the existing track through level 10. The modeled main ability starts at 4 and gains points at 8, 14, 18, and 28. The modeled non-main ability starts at 2 or 3 and is selected at every opportunity (4, 11, 16, 21, and 24).

The DC increase at Expert leaves a net +1 for a character who takes the promotion. At Specialist and Master, the promotion matches the DC increase. On the non-main path starting at 2, at level 21 Trained succeeds 50% on Normal and 35% on Hard, and Master succeeds 80% on Normal and 65% on Hard. These figures exclude item bonuses. For playtesting, use Normal to gauge whether a secondary Trained skill still contributes and Hard to gauge the payoff for a signature skill.

#### Published 4e equipment benchmark

The local 4e compendium sample groups equipment by published item level and counts each variant once, using its highest explicit fixed item bonus to skill checks in a property. It excludes consumables, alternative rewards, activated powers, and bonuses limited to a particular use of a skill. These are averages among qualifying equipment variants, with no estimate of how often a character has one equipped.

| Item level | Mean bonus | Variants |
| ---: | ---: | ---: |
| 1 | +1.00 | 2 |
| 2 | +1.43 | 7 |
| 3 | +3.75 | 4 |
| 4 | +2.75 | 4 |
| 5 | +1.78 | 9 |
| 6 | +2.00 | 4 |
| 7 | +1.90 | 10 |
| 8 | +3.40 | 5 |
| 9 | +2.10 | 10 |
| 10 | +2.43 | 7 |
| 11 | +2.60 | 5 |
| 12 | +1.91 | 11 |
| 13 | +3.57 | 7 |
| 14 | +2.08 | 12 |
| 15 | +2.27 | 11 |
| 16 | +2.88 | 8 |
| 17 | +2.22 | 9 |
| 18 | +3.33 | 15 |
| 19 | +2.09 | 11 |
| 20 | +3.56 | 9 |
| 21 | +3.86 | 7 |
| 22 | +2.75 | 8 |
| 23 | +4.36 | 11 |
| 24 | +2.50 | 8 |
| 25 | +2.88 | 8 |
| 26 | +4.00 | 4 |
| 27 | +2.90 | 10 |
| 28 | +4.29 | 7 |
| 29 | +2.11 | 9 |
| 30 | +4.33 | 6 |

The sample averages +2.19 in heroic, +2.62 in paragon, and +3.33 in epic. [Boots of Stealth](https://iws.mx/dnd/?view=item764) give +2/+4/+6 at item levels 3/13/23. [Headband of Perception](https://iws.mx/dnd/?view=item1520) gives +1/+3/+5 at item levels 1/11/21. A +2 bonus has the same numerical effect as the proposed promotion above Trained. Test equipment on a signature skill after establishing the baseline odds.
