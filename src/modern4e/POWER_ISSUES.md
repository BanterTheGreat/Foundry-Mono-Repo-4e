# Power content issues to review

These are unresolved content findings from the rulebook review. They are recorded
for later decisions; the suggested directions below have not been applied.
Local homebrew rules take precedence over published 4e wording.

## Incomplete or inconsistent power cards

| Entry | Source | Issue | Suggested direction |
| --- | --- | --- | --- |
| Divine Guidance | [Avenger](classes/avenger.typ), Channel Divinity | Grants an ally a second attack roll, but also says "Miss: Half damage, and you pull the target 1 square." The power has no attack or damage of its own. | Remove the unrelated miss clause, unless an additional effect is intended. |
| Maledictor's Doom | [Invoker](classes/invoker.typ), Covenant of Malediction | Says "Miss: Half damage," although the power makes no attack and deals no damage. | Remove the unrelated miss clause. |
| Preserver's Rebuke | [Invoker](classes/invoker.typ), Covenant of Preservation | Is an immediate reaction with no trigger. Its effect refers to a triggering enemy; Insightful Preservation and Preserver's Summons refer to a triggering attack and ally. | Define the triggering attack, ally, and enemy, and make the associated feats use the same trigger. |
| Darkspiral Aura | [Warlock](classes/warlock.typ), Dark Pact | Places damage under Hit without supplying an attack roll or an automatic-hit rule. The accumulation rule is written inside the triggered power's Effect, although cursed enemies dying is a separate event. | Clarify whether the damage is automatic and separate passive accumulation from spending the aura. |
| Misty Step | [Warlock](classes/warlock.typ), Fey Pact | The damage formula reads "half your level your Intelligence" with no operator. | Specify the intended formula; addition appears likely, but requires an author decision. |
| Warden's Fury | [Warden](classes/warden.typ), Nature's Wrath | Both damage expressions add "Strike," which is not a defined ability or value. | Specify the intended damage ability, likely Strength. |
| Heroic Effort | [Human](ancestries/human.typ) | Can trigger when an ally misses or fails a saving throw, but has Personal range and no target. The effect refers to "the target." | Define whether it affects you, an ally, or either, and give any ally version a range and target. |
| Summon Shadow Serpent | [Arcane utilities](glossary/utility/utility-arcane.typ), Level 2 | References the serpent's action description and dropping to 0 HP, but provides no creature statistics or command actions. | Add its HP, defenses, size, speed, senses, and permitted command actions. |

## Class features and feats that depend on powers

- [ ] **Wizard daily preparation:** [Wizard](classes/wizard.typ), Spellbook and
  Powers. The spellbook text and preparation table allow one daily at levels 1–4
  and two at levels 5–8. The Powers section grants two starting dailies, matching
  general advancement. Decide how the revised number of daily selections affects
  spellbook contents and preparation, including replacements at later levels.
- [ ] **Resilient Spirit:** [Shaman](classes/shaman.typ), Heroic Feats. Grants +2
  to the spirit companion's defenses, but the revised Call Spirit Companion
  resolves attacks using a saving throw and does not use companion defenses.
  Give the feat a benefit that works with that mechanic.
- [ ] **Improved Fate of the Void:**
  [Heroic Warlock feats](content/feats/heroic/warlock.json). Refers to an additional
  bonus to "the d20 roll," whereas the revised Star Pact grants charges that can
  enhance attacks or checks. Specify which charge expenditures receive the bonus.
- [ ] **Message of Doom Spurned:**
  [Paragon Warlock feats](content/feats/paragon/warlock.json). Refers to applying
  and spending a Fate of the Void bonus as a defense bonus. Define how many charges
  it costs and what defense bonus they grant.
- [ ] **Fate of the Void charge limit:** [Warlock](classes/warlock.typ), Star Pact.
  The requirement permits gaining a charge when the current total equals
  Intelligence (minimum 1), allowing the total to become one higher. Confirm
  whether the intended cap is Intelligence or Intelligence + 1.
- [ ] **Armor of Burning Wrath:** [Invoker](classes/invoker.typ), Heroic Feats.
  Two different feats have this name: one adds fire damage and a saving-throw
  penalty; the other grants vulnerable 2 to all other damage. Give them distinct
  names or combine them explicitly.
- [ ] **Healing Word at level 16:** [Cleric](classes/cleric.typ), Healing Word.
  The Special row changes from twice per encounter, once per round, to "three
  times per round." Confirm whether this should be three times per encounter,
  still once per round.
- [ ] **Smite the Condemned's Dogmatic keyword:** [Paladin](classes/paladin.typ).
  The restriction to creatures condemned by your deity has been removed as
  requested. The card still has an undefined Dogmatic keyword; decide whether
  that keyword has any remaining purpose.

## Defense-roll follow-up

The variant now states that a natural 1 on a defense roll is an enemy critical
hit, a natural 20 is an enemy critical failure, and effects that make an enemy
reroll its attack instead let the defender roll twice and use the better result.

- [ ] The [Defense rolls rule](glossary/balance_changes.typ) still specifies only
  the target number (attack bonus + 2), without stating exactly what is added to
  the player's d20. Write the full formula once the intended defense modifier is
  confirmed.
- [ ] Check Second Chance and its supporting Halfling feats against this variant:
  the original wording includes attack-roll penalties and protection against
  critical hits. Define how those additional benefits apply to defense rolls.

## Related technique issues

- [ ] [Techniques](glossary/techniques.typ) repeatedly use "committed healing
  surge" without explaining recovery, maximum available surges, extended rests,
  or what happens when a technique ends.
- [ ] [Technique Master](glossary/feats.typ) grants permission to master and
  perform techniques of your level or lower, which the general technique rules
  appear to grant already. Define its additional benefit or prerequisite role.
- [ ] Climate has a duration of 10 minutes but discusses being maintained for a
  year and a day, without a rule for extending its duration.
- [ ] Delay Affliction's result table starts at 1, but its penalty can produce a
  check result of 0 or lower. Define that outcome.
