# Skill Overhaul: Proficiency Ranks (Design Draft)

Status: **design only, nothing in the rulebook implements this yet.** It records the
proposal for replacing the flat +5 proficiency bonus with Pathfinder 2e-style ranks.

## Goals

- Make **which skills you pick** a real decision. Skills you skip should be bad by high level.
- Keep the printed idea of **set difficulties per current party level**.
- Keep bonuses small (no +5 start that climbs from there).
- A chosen skill on a **non-main ability** should succeed about **60%** on a Normal check, so checks stay tense.

## Current system (for reference)

- Roll: `1d20 + half level + ability points + 5 if proficient`. Half-level applies to everyone.
- Difficulties: Easy / Normal / Hard / Extreme in 5-point steps; the DC table covers levels 1-30
  (Normal 12 at level 1, 32 at level 30). See `glossary/skill_checks.typ`.
- Perfect success / catastrophic failure trigger at the "next step" of difficulty.
- Four proficiencies at level 1: two from background, two free. Skill Training feat adds two.
- Utility powers need proficiency plus a minimum level (2 / 6 / 10).
- The current DC table tracks half-level plus main ability: a proficient main-ability
  character hits Normal about 85-90% at every level.

## Pathfinder 2e reference (from memory; only the rank bonuses and unlock levels were checked online)

- Check: `d20 + ability + proficiency + item/circumstance/status`. Proficiency = `level + rank bonus`;
  Untrained +0 with **no level**.
- Ranks: Trained +2, Expert +4, Master +6, Legendary +8. Skill increases train a new skill or raise a
  rank; Master needs level 7+, Legendary level 15+.
- Rank gates many actions and skill feats.
- Degrees of success at +/-10 from the DC; natural 20 / 1 move one step.
- DC by level (level 1 = 15, level 20 = 40). Adjustments: Easy -2, Hard +2, Very Hard +5,
  Very Easy -5, incredibly easy/hard -10/+10. Simple DCs by rank: 10 / 15 / 20 / 30 / 40.
- A PF2e character has about 5-6 trained skills at level 1 of 16 (plus Perception for free, plus Lore).
  A generalist trained in a skill hits the level DC about 50% at level 1, falling to about 30% by
  level 20 if never raised, or staying 50-65% if raised to the best rank allowed.

## Proposed system

### Rolls

`1d20 + ability points + rank bonus + level contribution + other bonuses`

| Rank | Bonus | Level contribution |
| --- | --- | --- |
| Untrained | +0 | quarter level (rounded down) |
| Trained | +2 | half level (rounded down) |
| Expert | +4 | half level |
| Master | +6 | half level |
| Legendary | +8 | half level |

- Untrained characters scale at half the normal rate, so the gap between trained and untrained
  grows from 2 at level 1 to about 10 at level 30. Neglected skills fall behind.
- Half level still applies to everyone in combat (attacks, defenses). This only changes skill checks.
- Rank unlock levels (working assumption): Expert 3, Master 11, Legendary 21 (heroic / paragon / epic).
  Rank increases come from skill increases (assumed odd levels from 3) and an updated Skill Training feat.
- Learning an untrained skill late is a large jump (rank bonus plus the half-level difference), which
  makes late training a real but costly option.

### Difficulty table

Easy and Hard are **-2 / +2** from Normal. Extreme is **+5** (placeholder; not confirmed).
Normal is anchored so a Trained generalist at level 1 hits 60%, then rises about 0.85 per level.

| Level | Easy | Normal | Hard | Extreme |
| --- | --- | --- | --- | --- |
| 1 | 11 | 13 | 15 | 18 |
| 5 | 14 | 16 | 18 | 21 |
| 10 | 19 | 21 | 23 | 26 |
| 15 | 23 | 25 | 27 | 30 |
| 20 | 27 | 29 | 31 | 34 |
| 25 | 31 | 33 | 35 | 38 |
| 30 | 36 | 38 | 40 | 43 |

The full table should be generated from `Normal(L) = round(13 + 0.85 * (L - 1))`, then adjusted by
hand if desired. This is higher than the current table (Normal 12 to 32): the new anchor is a
60% chosen skill, not the old 85-90% proficient main-ability character. A faster or slower rank
schedule needs a steeper or flatter slope.

Because the table moves about 0.85 per level, Easy and Hard already sit roughly two levels below
and above, so the existing "use DCs one or two levels off for leeway" advice becomes redundant.

### Degrees of success

Steps of 2 break the current "next higher step" rule for perfect success and catastrophic failure
(a level-1 Trained generalist on Normal would see 20% catastrophic failure and 35% perfect success
with +/-5 windows). Use a **fixed +/-10 window**: perfect success at DC +10, catastrophic failure at
DC -10, natural 20 / 1 unchanged. A level-1 Trained generalist on Normal then splits roughly
5% catastrophic, 35% failure, 50% success, 10% perfect.

### Level 1 picks

Proposed, not confirmed:

- Raise level 1 proficiencies from 4 to **6**: two from background, **four** free.
- Make **Perception automatically Trained**, since an untrained Perception falls behind and
  becomes a trap. It should not use a pick.
- PF2e comparison: about 5-6 picks of 16, plus free Perception.

## Expected hit rates (d20, no natural 20/1 handling)

Assumptions: generalist ability points 2 (levels 1-7), 3 (8-14), 4 (15-24), 5 (25+); main ability
4 (1-7), 5 (8-15), 6 (16-19), 7 (20-27), 8 (28+). The ability schedule comes from `content/creation/standard.json`
(main +1 at level 8; later increases are assumed) and the generalist values are a guess. Each ability
point moves a hit rate by 5 points. "Invested" means a skill raised to the highest rank allowed.

| Level | Invested generalist | Trained-only generalist | Untrained generalist | Invested main |
| --- | --- | --- | --- | --- |
| 1 | 60% | 60% | 50% | 70% |
| 5 | 65% | 55% | 40% | 75% |
| 10 | 60% | 50% | 25% | 70% |
| 15 | 65% | 45% | 15% | 70% |
| 20 | 60% | 40% | 5% | 75% |
| 25 | 65% | 35% | 0% | 75% |
| 30 | 55% | 25% | 0% | 70% |

Invested generalist Easy / Hard / Extreme are about 70% / 50% / 35% through level 20 and
65% / 45% / 30% at level 30.

## Decisions

Settled in discussion:

- Ranks are +2 apart, Trained is +2, untrained scales at a quarter of level, Easy / Hard are -2 / +2.
- Tuned for about 60% on a chosen non-main skill at Normal.

Still open:

- Extreme step (+5 is a placeholder).
- Rank unlock levels (3 / 11 / 21 vs PF2e-style faster gates) and skill-increase schedule.
- Level 1 picks (6?), Perception auto-trained, and whether Insight needs the same treatment.
- Perfect / catastrophic window: fixed +/-10 (recommended) or something else, and whether it applies
  to every difficulty or only some.

## Pros

- Skill picks stay meaningful; later rank gating makes utility powers a depth-versus-breadth choice.
- Numbers stay small (no +5 start).
- Fits the book's goal of out-of-combat specialization without hurting combat.

## Cons

- Unchosen and merely Trained skills fall steadily behind; trained-only skills drift to 25% by level 30.
- Ranks add bookkeeping over a flat +5.
- Master and Legendary tiers cover levels beyond the part of the book verified (completion through level 10).
- Existing "+N to skill" text and the whole DC table need review.

## Affected files if adopted

- `glossary/skill_checks.typ`: proficiency text, DC table, degrees of success, leeway sentence.
- `glossary/creation_&_advancement.typ` and `content/creation/standard.json`: skill picks and skill increases.
- `glossary/background.typ`: background skill grants.
- `content/feats/heroic/general.json`: Skill Training feat and skill-bonus feats.
- `glossary/utility.typ`, `glossary/utility/skill-utilities.typ`: rank requirement instead of plain proficiency.
- `glossary/quick_rules.typ`: Aid Another uses `DC 10 + half your level`; check against the new scale.
- `glossary/balance_changes.typ`: skill changes section.
- Character Builder: skill proficiency is currently a flag (`SKILL_PROFICIENCY` fact in content JSON) and
  would need a graded value.
