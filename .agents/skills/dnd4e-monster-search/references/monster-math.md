# User-supplied monster math

Transcribed from the user's **Monster Math** image supplied on 2026-10-23.
The image credits Blog of Holding for construction math based on Monster Manual
3 / Monster Vault, and Sly Flourish for the damage dice. This table governs
conversions requested by this skill; it is distinct from published stat blocks.

## Basic stats

Let `L` be the final monster level. These are level-zero bases plus the listed
increment for **each** level, including level 1.

| Stat | Formula |
| --- | --- |
| AC | 14 + L + role AC bonus |
| Other defenses (Fortitude, Reflex, Will) | 12 + L |
| Attack vs. AC | L + 5 |
| Attack vs. another defense | L + 3 |
| Average damage | L + 8 |

| Role | Level-zero HP | HP per level | AC bonus |
| --- | ---: | ---: | ---: |
| Skirmisher | 24 | 5 | 0 |
| Controller | 24 | 5 | 0 |
| Soldier | 24 | 5 | +2 |
| Brute | 26 | 7 | -2 |
| Artillery | 21 | 3 | -2 |
| Lurker | 21 | 3 | 0 |

Standard HP = level-zero HP + (HP per level × L). The image adds no Constitution
term. Bloodied = floor(final HP / 2). For minions, use the 4e convention of 1 HP
rather than this standard HP formula; that convention is not stated in the image.

The image provides a common non-AC defense baseline, not an allocation of strong
and weak defenses. Use that baseline by default; if retaining a monster's defense
spread or a deliberately exceptional attack modifier, show the offset and label
it as an adaptation rather than a number prescribed by the table.

## Damage and rank modifiers

The image specifies:

- Encounter powers: +25–50% damage.
- Multitarget powers: -25% damage.
- Brutes: +25% damage.
- Minions: 50% damage.
- Elites: ×2 HP, +2 saving throws, 1 action point.
- Solos: ×4 HP, +5 saving throws, 2 action points.

Elite/solo entries above describe their total rank benefits, not additional
bonuses stacked onto existing printed rank benefits. Rank alone does not multiply
each attack's damage. Account for the creature's actual action economy.

For average-based conversions, start with L + 8, apply relevant damage factors,
and state the chosen encounter-power percentage. Multiplying applicable factors
and rounding the final average to the nearest integer (halves up) is this skill's
working convention; the image does not specify stacking or rounding. Choose dice
and a flat modifier whose expected damage approximates that target, and show the
expected value. Budget a multiattack across its component attacks rather than
giving each component the full single-attack budget. Such budgeting requires
judgment beyond the image.

Alternatively, use the image's dice profiles below to express the intended
damage. Select the column for the power's intended output and explain the choice;
the image does not define Low/Med/High/Ltd as specific power types. In particular,
do not automatically add an encounter multiplier to a profile already selected
to represent that increased damage. `Min dmg` is the **minion** column, not a
minimum roll. The image also suggests the **Low** damage profile for more
threatening minions; use it only when that increased threat is intended and say
so. These are alternative minion outputs, not successive multipliers.

## Damage dice (levels 1–30)

Transcribed as printed, including the repeated or decreasing values in the
upper-level rows. Do not silently smooth them into a different progression.
Outside levels 1–30, the dice table supplies no entry; use the average formula
and disclose that the dice expression was derived.

| Level | Min dmg | Low dmg | Med dmg | High dmg | Ltd dmg |
| ---: | ---: | --- | --- | --- | --- |
| 1 | 5 | 1d6+3 | 1d8+4 | 1d8+6 | 1d8+8 |
| 2 | 5 | 1d6+4 | 1d8+5 | 1d8+7 | 1d8+9 |
| 3 | 6 | 1d6+5 | 1d8+6 | 1d8+8 | 1d8+10 |
| 4 | 6 | 1d8+5 | 2d6+5 | 2d6+8 | 2d6+11 |
| 5 | 7 | 1d8+6 | 2d6+6 | 2d6+9 | 2d6+12 |
| 6 | 7 | 1d8+6 | 2d6+7 | 2d6+10 | 2d6+13 |
| 7 | 8 | 2d6+4 | 2d8+6 | 2d8+10 | 2d8+14 |
| 8 | 8 | 2d6+5 | 2d8+7 | 2d8+11 | 2d8+15 |
| 9 | 9 | 2d6+6 | 2d8+8 | 2d8+12 | 2d8+16 |
| 10 | 9 | 2d6+6 | 2d8+9 | 2d8+13 | 2d8+17 |
| 11 | 10 | 2d6+7 | 3d6+9 | 3d6+14 | 3d6+19 |
| 12 | 10 | 2d8+6 | 3d6+10 | 3d6+15 | 3d6+20 |
| 13 | 11 | 2d8+7 | 3d6+11 | 3d6+16 | 3d6+21 |
| 14 | 11 | 2d8+7 | 3d6+12 | 3d6+17 | 3d6+22 |
| 15 | 12 | 2d8+8 | 3d6+13 | 3d6+18 | 3d6+23 |
| 16 | 12 | 3d6+8 | 3d8+11 | 3d8+17 | 3d8+23 |
| 17 | 13 | 3d6+9 | 3d8+12 | 3d8+18 | 3d8+24 |
| 18 | 13 | 3d6+9 | 3d8+13 | 3d8+19 | 3d8+25 |
| 19 | 14 | 3d6+10 | 3d8+14 | 3d8+20 | 3d8+27 |
| 20 | 14 | 3d6+11 | 3d8+15 | 3d8+21 | 3d8+29 |
| 21 | 15 | 3d8+9 | 4d6+15 | 4d6+22 | 4d6+31 |
| 22 | 15 | 3d8+9 | 4d6+16 | 4d6+23 | 4d6+32 |
| 23 | 16 | 3d8+10 | 4d6+17 | 4d6+24 | 4d6+33 |
| 24 | 16 | 3d8+11 | 4d6+18 | 4d6+25 | 4d6+34 |
| 25 | 17 | 3d8+12 | 4d6+19 | 4d6+26 | 4d6+36 |
| 26 | 17 | 4d6+11 | 4d8+16 | 4d8+25 | 4d8+33 |
| 27 | 18 | 4d6+12 | 4d8+17 | 4d8+26 | 4d8+35 |
| 28 | 18 | 4d6+13 | 4d8+18 | 4d8+27 | 4d8+36 |
| 29 | 19 | 4d6+14 | 4d8+19 | 4d8+28 | 4d8+38 |
| 30 | 19 | 4d6+15 | 4d8+20 | 4d8+30 | 4d8+39 |
