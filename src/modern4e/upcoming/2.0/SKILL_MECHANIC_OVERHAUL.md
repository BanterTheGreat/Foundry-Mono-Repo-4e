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
