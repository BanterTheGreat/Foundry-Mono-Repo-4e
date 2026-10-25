// Adapted from Barbarian 2.0, A Sharp Sword And A Straight Path.
#import "../helpers/powers.typ";

#let primalPowers() = [
  == Primal At-will Attack Powers

  #powers.power(
    title: "Devastating Strike",
    bonusTitle: "Level 1",
    description: "You strike with awesome power, more concerned with offensive strength than defensive posturing.",
    type: powers.powerType.at-will,
    action: powers.actionType.standard,
    range: "Melee weapon",
    traits: "Primal, Weapon",
    target: "One creature",
    additionalRows: (
      [*Attack:* Strength vs. AC],
      [*Hit:* 2[W] + Strength damage.],
      [*Level 11:* 3[W] + Strength damage.],
      [*Miss:* Half damage.],
      [*Effect:* Until the start of your next turn, you grant combat advantage. While you are raging, ignore this effect line.],
    ),
  )

  #powers.power(
    title: "Foe to Foe",
    bonusTitle: "Level 1",
    description: "Each foe that you slay fills you with the rush of battle, and as the battle rages, you cut your way from one foe to the next.",
    type: powers.powerType.at-will,
    action: powers.actionType.standard,
    range: "Melee weapon",
    traits: "Primal, Weapon",
    target: "One creature",
    additionalRows: (
      [*Attack:* Strength vs. AC],
      [*Hit:* 1[W] + Strength damage. If you began this turn adjacent to an enemy other than the target, you deal 1d12 extra damage.],
      [*Level 11:* 2d12 extra damage],
      [*Special:* While you are raging, this power gains the Basic keyword.],
    ),
  )

  #powers.power(
    title: "Howl of Fury",
    bonusTitle: "Level 1",
    description: "You strike a hearty blow, then unleash an ear-splitting battle cry.",
    type: powers.powerType.at-will,
    action: powers.actionType.standard,
    range: "Melee weapon",
    traits: "Primal, Thunder, Weapon",
    target: "One creature",
    additionalRows: (
      [*Attack:* Strength vs. AC],
      [*Hit:* 1[W] + Strength damage. You then howl in a blast 3 that includes the target. Each enemy in the blast, other than the target, takes thunder damage equal to half your level + your Constitution. If you are raging, the target also takes this damage.],
      [*Level 11:* You howl in a blast 4.],
    ),
  )

  #powers.power(
    title: "Howling Strike",
    bonusTitle: "Level 1",
    description: "With a blood-freezing scream, you throw yourself into the fray.",
    type: powers.powerType.at-will,
    action: powers.actionType.standard,
    range: "Melee weapon",
    traits: "Primal, Weapon",
    target: "One creature",
    additionalRows: (
      [*Attack:* Strength vs. AC],
      [*Hit:* 1[W] + Strength damage. This power deals 1d8 extra damage, or 1d12 extra damage if you are wielding the weapon with which you make this attack in two hands.],
      [*Level 11:* 2d8 or 2d12 extra damage.],
      [*Special:* When charging, you can use this power in place of a melee basic attack. If you are raging, you can move 2 extra squares as part of the charge.],
      [*Level 11:* 3 extra squares],
    ),
  )

  #powers.power(
    title: "Pressing Strike",
    bonusTitle: "Level 1",
    description: "You push lesser foes from your path, moving through the lines of battle at will.",
    type: powers.powerType.at-will,
    action: powers.actionType.standard,
    range: "Melee weapon",
    traits: "Primal, Weapon",
    target: "One creature",
    additionalRows: (
      [*Effect:* Before the attack, you shift 2 squares. You can move through an enemy's space during the shift, but you can't end your movement there.],
      [*Attack:* Strength vs. AC],
      [*Hit:* 1[W] + Strength damage, and you push the target up to 1 square. If you are raging, the attack deals 1d6 extra damage.],
      [*Level 11:* 2d6 extra damage.],
    ),
  )

  #powers.power(
    title: "Recuperating Strike",
    bonusTitle: "Level 1",
    description: "Nothing restores your will to fight more than slamming your weapon into a foe. Each crushing swing gives you more will to press on.",
    type: powers.powerType.at-will,
    action: powers.actionType.standard,
    range: "Melee weapon",
    traits: "Primal, Weapon",
    target: "One enemy",
    additionalRows: (
      [*Attack:* Strength vs. AC],
      [*Hit:* 1[W] + 1d6 + Strength damage, and you gain temporary hit points equal to half your level + your Constitution. If you are raging, increase the temporary hit points by half your level (minimum 1).],
      [*Level 11:* 1[W] + 2d6 + Strength damage.],
    ),
  )

  #powers.power(
    title: "Savage Reach",
    bonusTitle: "Level 1",
    description: "Your great strength and the reach of your weapon allow you to smash enemies aside with each blow.",
    type: powers.powerType.at-will,
    action: powers.actionType.standard,
    range: "Melee weapon + 1",
    traits: "Primal, Weapon",
    target: "One creature",
    additionalRows: (
      [*Attack:* Strength vs. AC],
      [*Hit:* 1[W] + Strength damage, and you slide the target 1 square, or up to 2 squares if you are wielding the weapon with which you make this attack in two hands. If you are raging, the attack deals 1d6 extra damage.],
      [*Level 11:* 2d6 extra damage.],
    ),
  )

  #powers.power(
    title: "Whirling Rend",
    bonusTitle: "Level 1",
    description: "You strike out in two directions, drawing blood from different enemies.",
    type: powers.powerType.at-will,
    action: powers.actionType.standard,
    range: "Melee weapon",
    traits: "Primal, Weapon",
    requirement: "You must be wielding two melee weapons.",
    target: "One creature",
    additionalRows: (
      [*Attack:* Strength vs. AC (main hand weapon)],
      [*Hit:* 1[W] + Strength damage (main hand weapon), and an enemy adjacent to you other than the target takes 1[W] + Dexterity damage (off-hand weapon). If you are raging, you instead add your Strength + your Dexterity to both damage rolls.],
      [*Level 11:* 1[W] + 1d6 + Strength damage (main hand weapon), and 1[W] + 1d6 damage (off-hand weapon)],
    ),
  )

  #pagebreak()
  == Primal Encounter Attack Powers

  === Level 1

  #powers.power(
    title: "Avalanche Strike",
    bonusTitle: "Level 1",
    description: "You drop your guard and put all your strength into a devastating overhead swing.",
    type: powers.powerType.encounter,
    action: powers.actionType.standard,
    range: "Melee weapon",
    traits: "Primal, Weapon",
    target: "One creature",
    additionalRows: (
      [*Attack:* Strength vs. AC],
      [*Hit:* 3[W] + 1d8 + Strength damage. You can use d12s instead of d8s for the non-[W] damage in the hit line if you are wielding the weapon with you make this attack in two hands.],
      [*Miss:* Half damage.],
      [*Level 11:* 3[W] + 2d8 + Strength damage.],
      [*Effect:* Until the start of your next turn, you take a -4 penalty to all defenses.],
    ),
  )

  #powers.power(
    title: "Bloodletting",
    bonusTitle: "Level 1",
    description: "Your powerful attack is meant to finish off a wounded foe.",
    type: powers.powerType.encounter,
    action: powers.actionType.standard,
    range: "Melee weapon",
    traits: "Primal, Weapon",
    target: "One creature",
    additionalRows: (
      [*Attack:* Strength vs. AC],
      [*Hit:* 2[W] + Strength damage, and ongoing damage equal to 5 + half your level (save ends). If the target is bloodied, the attack deals 1d8 extra damage, and this extra damage is added to the ongoing damage amount.],
      [*Level 11:* 2d8 extra damage],
    ),
  )

  #powers.power(
    title: "Desperate Fury",
    bonusTitle: "Level 1",
    description: "Even if it kills you, you'll accept nothing less than a solid hit.",
    type: powers.powerType.encounter,
    action: powers.actionType.standard,
    range: "Melee weapon",
    traits: "Primal, Weapon",
    target: "One creature",
    additionalRows: (
      [*Attack:* Strength vs. AC],
      [*Hit:* 2[W] + 1d6 + Strength damage.],
      [*Rageblood Vigor:* use d10s instead of d6s for the non-[W] damage in the hit line.],
      [*Miss:* You can take 4 + your level damage to reroll the attack. If the reroll misses, you take 4 + half your level damage.],
      [*Level 11:* 3[W] + 2d6 + Strength damage.],
    ),
  )

  #powers.power(
    title: "Escalating Violence",
    bonusTitle: "Level 1",
    description: "You hack at your enemy, daring it and its companions to incur your greater fury.",
    type: powers.powerType.encounter,
    action: powers.actionType.standard,
    range: "Melee weapon",
    traits: "Primal, Weapon",
    target: "One creature",
    additionalRows: (
      [*Attack:* Strength vs. AC],
      [*Hit:* 2[W] + Strength damage. If you take damage before the start of your next turn, you gain a +2 bonus to the attack rolls and the damage rolls of the first attack power you use before the end of your next turn.],
      [*Thaneborn Triumph:* Until the end of your next turn, an ally within 5 squares of you gains a bonus to damage rolls against the target equal to your Charisma.],
      [*Level 11:* If you take damage before the start of your next turn, you gain a +2 bonus to the attack rolls and a +4 bonus to the damage rolls of the first attack power you use before the end of your next turn.],
    ),
  )

  #powers.power(
    title: "Great Cleave",
    bonusTitle: "Level 1",
    description: "The numbers arrayed against you mean nothing. You swing your weapon in a great arc, stopped by nothing so trivial as flesh and bone.",
    type: powers.powerType.encounter,
    action: powers.actionType.standard,
    range: "Close burst 1",
    traits: "Primal, Weapon",
    target: "Each creature in burst",
    additionalRows: (
      [*Attack:* Strength vs. AC],
      [*Hit:* 2[W] + Strength damage + 2 damage for each enemy adjacent to you.],
      [*Level 11:* +3 damage for each enemy adjacent to you.],
    ),
  )

  #powers.power(
    title: "Rending Strike",
    bonusTitle: "Level 1",
    description: "You tear your weapon through the enemy, leaving it vulnerable to an ally's attack.",
    type: powers.powerType.encounter,
    action: powers.actionType.standard,
    range: "Melee weapon",
    traits: "Fear, Primal, Weapon",
    target: "One creature",
    additionalRows: (
      [*Attack:* Strength vs. AC],
      [*Hit:* 2[W] + Strength damage, and the next time the target takes damage before the start of your next turn, it takes 1d6 extra damage and you slide it up to 2 squares. If the target is immune to fear, it instead takes 2d6 extra damage.],
      [*Thaneborn Triumph:* You can slide the target a number of squares up to your Charisma instead of 2.],
      [*Level 11:* 2d6 extra damage. If the target is immune to fear, it instead takes 4d6 extra damage.],
    ),
  )

  #powers.power(
    title: "Resurgent Strike",
    bonusTitle: "Level 1",
    description: "You slash, you are rejuvenated, and your enemy's blood wells.",
    type: powers.powerType.encounter,
    action: powers.actionType.standard,
    range: "Melee weapon",
    traits: "Primal, Weapon",
    target: "One creature",
    additionalRows: (
      [*Attack:* Strength vs. AC],
      [*Hit:* You either gain your level + your Constitution temporary hit points or end one dazing or weakening effect on yourself. The target then takes 2[W] + your Strength damage.],
      [*Miss:* You either gain half your level + your Constitution temporary hit points, or make a saving throw against one dazing or weakening effect on yourself.],
    ),
  )

  #powers.power(
    title: "Room for Carnage",
    bonusTitle: "Level 1",
    description: "You drive your foes backward with the haft of your weapon, giving you enough room to deliver a mighty blow.",
    type: powers.powerType.encounter,
    action: powers.actionType.standard,
    range: "Melee or Ranged weapon",
    traits: "Primal, Weapon",
    target: "One creature",
    additionalRows: (
      [*Effect:* You push each enemy adjacent to you up to 1 square.],
      [*Attack:* Strength vs. AC],
      [*Hit:* 2[W] + Strength damage. If you have no creatures adjacent to you, you deal 1d8 extra damage.],
      [*Level 11:* If you have no creatures adjacent to you, you deal 2d8 extra damage.],
    ),
  )

  #powers.power(
    title: "Shout of Terror",
    bonusTitle: "Level 1",
    description: "The primal storm that rages within you manifests as a terrifying battle scream that causes your enemies to hesitate.",
    type: powers.powerType.encounter,
    action: powers.actionType.standard,
    range: "Melee weapon",
    traits: "Fear, Primal, Weapon",
    target: "One creature",
    additionalRows: (
      [*Attack:* Strength vs. AC],
      [*Hit:* 2[W] + 1d6 + Strength damage. You then howl in a blast 3 that includes the target. Each enemy in the blast is slowed until the end of your next turn.],
      [*Thunderborn Wrath:* Until the end of your next turn, you gain a bonus to damage rolls against slowed creatures equal to your Constitution.],
      [*Level 11:* 2[W] + 2d6 + Strength damage.],
    ),
  )

  #powers.power(
    title: "Vault the Fallen",
    bonusTitle: "Level 1",
    description: "You leap from one foe to the next, leaving blood in your wake.",
    type: powers.powerType.encounter,
    action: powers.actionType.standard,
    range: "Melee weapon",
    traits: "Primal, Weapon",
    target: "One or two creatures",
    additionalRows: (
      [*Attack:* Strength vs. AC],
      [*Hit:* 1[W] + 1d6 + Strength damage.],
      [*Level 11:* 1[W] + 2d6 + Strength damage.],
      [*Effect:* If you target two creatures, you can shift up to 2 squares after the first attack.],
      [*Thaneborn Triumph:* The number of squares you can shift equals your Charisma.],
    ),
  )

  #powers.power(
    title: "Whirling Frenzy",
    bonusTitle: "Level 1",
    description: "Someone will bleed after every strike of this frenzy. You prefer to see your enemy's blood but are prepared to see your own.",
    type: powers.powerType.encounter,
    action: powers.actionType.standard,
    range: "Close burst 1",
    traits: "Primal, Weapon",
    requirement: "You must be wielding two melee weapons.",
    target: "Each creature in the burst",
    additionalRows: (
      [*Attack:* Strength vs. AC (main weapon)],
      [*Whirling Slayer:* The attack targets the lower of an enemy's Reflex and AC.],
      [*Hit:* 1[W] + 1[W] (off-hand weapon) + 1d6 + Strength damage.],
      [*Level 11:* 1[W] + 1[W] (off-hand weapon) + 2d6 + Strength damage.],
      [*Miss:* Half damage. You take damage equal to your level for each creature you missed, plus 1[W] (off-hand weapon) extra damage.],
    ),
  )

  #pagebreak()
  === Level 3

  #powers.power(
    title: "Blade Sweep",
    bonusTitle: "Level 3",
    description: "Though the fury of your attack is directed at a single foe, no nearby enemy is spared your wrath.",
    type: powers.powerType.encounter,
    action: powers.actionType.standard,
    range: "Melee weapon",
    traits: "Primal, Weapon",
    target: "One creature",
    additionalRows: (
      [*Attack:* Strength vs. AC],
      [*Hit:* 2[W] + Strength damage, then each enemy adjacent to you takes 1[W] + 1d8 damage.],
      [*Rageblood Vigor:* use d12s instead of d8s for the non-[W] damage in the hit line.],
      [*Level 11:* then each enemy adjacent to you takes 1[W] + 2d8 damage.],
    ),
  )

  #powers.power(
    title: "Blood Strike",
    bonusTitle: "Level 3",
    description: "Blood calls to blood. Your pain and your enemy's give strength to your assault.",
    type: powers.powerType.encounter,
    action: powers.actionType.standard,
    range: "Melee weapon",
    traits: "Primal, Weapon",
    target: "One creature",
    additionalRows: (
      [*Attack:* Strength vs. AC],
      [*Hit:* 2[W] + 1d8 + Strength damage. If you or the target is bloodied, the attack deals 2[W] extra damage.],
      [*Level 11:* 2[W] + 2d8 + Strength damage.],
      [*Miss:* Half damage.],
    ),
  )

  #powers.power(
    title: "Brutal Slam",
    bonusTitle: "Level 3",
    description: "Your forceful blow pushes your foe into one of its companions.",
    type: powers.powerType.encounter,
    action: powers.actionType.standard,
    range: "Melee weapon",
    traits: "Primal, Reliable, Weapon",
    target: "One creature",
    additionalRows: (
      [*Attack:* Strength vs. AC],
      [*Hit:* 2[W] + Strength damage, and you push the target up to 2 squares and knock it prone. One enemy adjacent to the target after the push takes 1d8 + the target's Constitution damage.],
      [*Level 11:* 2[W] + Strength damage, and 2d8 + the target's Constitution damage.],
    ),
  )

  #powers.power(
    title: "Daring Charge",
    bonusTitle: "Level 3",
    description: "You leap forward and charge your foes. Those who try to strike you as you charge ahead only embolden your attack.",
    type: powers.powerType.encounter,
    action: powers.actionType.standard,
    range: "Melee weapon",
    traits: "Primal, Weapon",
    target: "One creature",
    additionalRows: (
      [*Attack:* Strength vs. AC],
      [*Hit:* 2[W] + Strength damage.],
      [*Special:* When charging, you can use this power in place of a melee basic attack. You may always choose for movement from charging to use this power to provoke opportunity attacks from your enemies. You gain a +2 bonus to the attack roll and the damage roll for each opportunity attack you provoke by using this power.],
      [*Thaneborn Triumph:* You gain a power bonus to AC equal to your Charisma against any opportunity attack you provoke during your charge.],
      [*Level 11:* you gain a +2 bonus to the attack roll and a +4 bonus to the damage roll for each opportunity attack you provoke while you charge.],
    ),
  )

  #powers.power(
    title: "Hammer Fall",
    bonusTitle: "Level 3",
    description: "You swing your weapon in a great underhand arc, and the impact lifts your target off its feet and sends it crashing to the ground.",
    type: powers.powerType.encounter,
    action: powers.actionType.standard,
    range: "Melee weapon",
    traits: "Basic, Primal, Weapon",
    target: "One creature",
    additionalRows: (
      [*Attack:* Strength vs. Fortitude],
      [*Hit:* 2[W] + Strength damage, and you knock the target prone.],
    ),
  )

  #powers.power(
    title: "Longstrike Charge",
    bonusTitle: "Level 3",
    description: "You surge toward your target, your momentum and leverage from your weapon adding devastating speed and power to your attack.",
    type: powers.powerType.encounter,
    action: powers.actionType.standard,
    range: "Melee weapon",
    traits: "Primal, Weapon",
    target: "One creature",
    additionalRows: (
      [*Special:* When charging, you can use this power in place of a melee basic attack. When you do so, you gain a power bonus to the damage roll equal to the number of squares you moved during the charge.],
      [*Level 11:* you gain a power bonus to the damage roll equal to twice the number of squares you moved during the charge.],
      [*Attack:* Strength vs. AC],
      [*Hit:* 2[W] + Strength damage. If you are wielding a reach weapon, you deal 1d8 extra damage.],
      [*Level 11:* 2d8 extra damage],
    ),
  )

  #powers.power(
    title: "Reckless Rampage",
    bonusTitle: "Level 3",
    description: "As you advance, enemy attacks fuel a wrath that spills over with undeniable force against your chosen target.",
    type: powers.powerType.encounter,
    action: powers.actionType.standard,
    range: "Melee weapon",
    traits: "Primal, Weapon",
    target: "One creature",
    additionalRows: (
      [*Effect:* Before the attack, you move your speed. If you provoke at least one opportunity attack from an enemy during this movement, you gain combat advantage against the target of this attack.],
      [*Rageblood Vigor:* Add your Constitution to the distance you can move.],
      [*Attack:* Strength vs. AC],
      [*Hit:* 3[W] + 1d10 + Strength damage.],
      [*Level 11:* 3[W] + 2d10 + Strength damage.],
    ),
  )

  #powers.power(
    title: "Rippling Blades",
    bonusTitle: "Level 3",
    description: "If your foe avoids your attack, you accept a glancing blow to maneuver that foe into a weak position, ready for your friend's attack.",
    type: powers.powerType.encounter,
    action: powers.actionType.standard,
    range: "Melee weapon",
    traits: "Primal, Weapon",
    target: "One creature",
    additionalRows: (
      [*Attack:* Strength vs. AC],
      [*Hit:* 2[W] + 1d8 + Strength damage.],
      [*Level 11:* 2[W] + 2d8 + Strength damage.],
      [*Miss:* You can take damage equal to your level to enable an ally adjacent to the target to make a melee basic attack against it as a free action, and deal 1d8 extra damage on a hit.],
      [*Thaneborn Triumph:* The ally gains a bonus to the attack roll equal to your Charisma.],
      [*Level 11:* 2d8 extra damage],
    ),
  )

  #powers.power(
    title: "Roaring Challenge",
    bonusTitle: "Level 3",
    description: "Striking at your foe, you let loose a challenging roar, daring the mob to face your terrifying weapon.",
    type: powers.powerType.encounter,
    action: powers.actionType.standard,
    range: "Melee weapon",
    traits: "Fear, Primal, Psychic, Weapon",
    additionalRows: (
      [*Primary Target:* One creature],
      [*Primary Attack:* Strength vs. AC],
      [*Hit:* 3[W] + Strength damage.],
      [*Effect:* Make a close blast 3 secondary attack],
      [*Secondary Target:* Each enemy in the blast],
      [*Secondary Attack:* Charisma vs. Will],
      [*Hit:* Charisma + enhancement bonus psychic damage, and the target takes a -2 penalty to attack rolls until the end of your next turn.],
    ),
  )

  #powers.power(
    title: "Shatterbone Strike",
    bonusTitle: "Level 3",
    description: "The fury of your assault knocks your foe off balance, leaving a hole in its defenses.",
    type: powers.powerType.encounter,
    action: powers.actionType.standard,
    range: "Melee weapon",
    traits: "Primal, Weapon",
    target: "One creature",
    additionalRows: (
      [*Attack:* Strength vs. AC],
      [*Hit:* 3[W] + 1d10 + Strength damage, and the target takes a -2 penalty to AC and Fortitude until the end of your next turn.],
      [*Thaneborn Triumph:* The penalty to AC and Fortitude equals your Charisma.],
      [*Level 11:* 3[W] + 2d10 + Strength damage],
    ),
  )

  #powers.power(
    title: "Thundering Howl",
    bonusTitle: "Level 3",
    description: "You strike and then let out a thunderous battle cry, which knocks your foes back.",
    type: powers.powerType.encounter,
    action: powers.actionType.standard,
    range: "Melee weapon",
    traits: "Primal, Thunder, Weapon",
    target: "One creature",
    additionalRows: (
      [*Attack:* Strength vs. AC],
      [*Hit:* 2[W] + Strength damage. You then howl in a blast 3 that includes the target. Each enemy in the blast takes 1d6 thunder damage and is pushed up to 1 square.],
      [*Thunderborn Wrath:* The number of squares you push each enemy equals your Constitution.],
      [*Level 11:* 2d6 thunder damage],
    ),
  )

  #powers.power(
    title: "Whirling Step",
    bonusTitle: "Level 3",
    description: "You strike out and keep moving. As you pass, many enemies bleed.",
    type: powers.powerType.encounter,
    action: powers.actionType.standard,
    range: "Melee weapon",
    traits: "Primal, Weapon",
    requirement: "You must be wielding two melee weapons.",
    target: "One creature",
    additionalRows: (
      [*Attack:* Strength vs. AC (main weapon)],
      [*Hit:* 1[W] + Strength damage.],
      [*Effect:* You shift up to 2 squares. If the attack hit, you deal 1[W] damage (off-hand weapon) to one or two enemies that are adjacent to you at some point during the shift.],
      [*Whirling Slayer:* Shift up to a number of squares equal to your Dexterity.],
    ),
  )

  #pagebreak()
  === Level 7

  #powers.power(
    title: "Blood Sacrifice",
    bonusTitle: "Level 7",
    description: "You wound yourself, offering your pain to the spirits in exchange for a more telling strike.",
    type: powers.powerType.encounter,
    action: powers.actionType.standard,
    range: "Melee weapon",
    traits: "Primal, Weapon",
    target: "One creature",
    additionalRows: (
      [*Effect:* Before the attack, you can take 1d10 damage. If you do so, you gain a bonus to the damage roll equal to the damage you take + your Constitution.],
      [*Level 11:* 2d10 damage],
      [*Attack:* Strength vs. Fortitude],
      [*Hit:* 3[W] + Strength damage.],
      [*Miss:* Half damage.],
    ),
  )

  #powers.power(
    title: "Crushing Charge",
    bonusTitle: "Level 7",
    description: "The impact of your charge smashes your foe back to crush it against solid terrain.",
    type: powers.powerType.encounter,
    action: powers.actionType.standard,
    range: "Melee 1",
    traits: "Primal, Weapon",
    target: "One creature",
    additionalRows: (
      [*Attack:* Strength vs. AC],
      [*Hit:* 2[W] + Strength damage, and you push the target up to 2 squares. If the target ends this push adjacent to blocking terrain other than the ground, the target takes damage equal to 2d6 + your Strength.],
      [*Level 11:* 4d6 + your Strength.],
      [*Special:* When charging, you can use this power in place of a melee basic attack.],
    ),
  )

  #powers.power(
    title: "Curtain of Steel",
    bonusTitle: "Level 7",
    description: "You are the pacing lion, the circling predator. No attack will come toward you without being answered in kind.",
    type: powers.powerType.encounter,
    action: powers.actionType.immediateReaction,
    range: "Melee 1",
    traits: "Primal, Weapon",
    trigger: "An enemy adjacent to you hits or misses you",
    target: "The triggering enemy",
    additionalRows: (
      [*Attack:* Strength vs. AC],
      [*Thaneborn Triumph:* You gain a bonus to the attack roll equal to your Charisma.],
      [*Hit:* 3[W] + 1d8 + Strength damage.],
      [*Level 11:* 3[W] + 2d8 + Strength damage.],
    ),
  )

  #powers.power(
    title: "Devastating Leverage",
    bonusTitle: "Level 7",
    description: "You swing your weapon in a wide arc, using the terrible power generated by its length to smash your enemy to the ground.",
    type: powers.powerType.encounter,
    action: powers.actionType.standard,
    range: "Melee weapon",
    traits: "Primal, Weapon",
    target: "One creature",
    additionalRows: (
      [*Attack:* Strength vs. AC],
      [*Hit:* 2[W] + 2d6 + Strength damage, and you slide the target up to 2 squares and knock the target prone. You deal 1[W] extra damage if you are wielding a reach weapon.],
      [*Level 11:* 2[W] + 4d6 + Strength damage],
    ),
  )

  #powers.power(
    title: "Fearsome Smash",
    bonusTitle: "Level 7",
    description: "Smashing your weapon through your foe's defenses injures both body and will.",
    type: powers.powerType.encounter,
    action: powers.actionType.standard,
    range: "Melee weapon",
    traits: "Fear, Primal, Weapon",
    target: "One creature",
    additionalRows: (
      [*Attack:* Strength vs. AC],
      [*Hit:* 3[W] + 1d6 + Strength damage, and the target takes a –2 penalty to attack rolls until the end of your next turn.],
      [*Thaneborn Triumph:* The penalty to attack rolls equals 1 + your Charisma.],
      [*Special:* You can use this power against an adjacent enemy as an immediate interrupt that triggers when that enemy hits you.],
      [*Level 11:* 3[W] + 2d6 + Strength damage],
    ),
  )

  #powers.power(
    title: "Feast of Violence",
    bonusTitle: "Level 7",
    description: "You drop your guard as you come close for your attack, drawing primal strength from the violence directed at you.",
    type: powers.powerType.encounter,
    action: powers.actionType.standard,
    range: "Melee weapon",
    traits: "Primal, Weapon",
    target: "One creature",
    additionalRows: (
      [*Attack:* Strength vs. AC],
      [*Hit:* 3[W] + 1d10 + Strength damage.],
      [*Special:* Using this attack provokes opportunity attacks from your enemies. You gain a +1 bonus to the attack roll and the attack deals 1[W] extra damage for each enemy from which you provoke an opportunity attack.],
      [*Level 11:* 3[W] + 2d10 + Strength damage.],
    ),
  )

  #powers.power(
    title: "Fortune's Favor",
    bonusTitle: "Level 7",
    description: "You strike at an odd angle, gambling that your enemy will react by maneuvering into the force of your blow.",
    type: powers.powerType.encounter,
    action: powers.actionType.standard,
    range: "Melee weapon",
    traits: "Primal, Weapon",
    target: "One creature",
    additionalRows: (
      [*Attack:* Strength vs. AC],
      [*Hit:* 3[W] + 1d8 + Strength damage. You can choose to roll this attack again using the same modifiers. If this attack roll would hit, you instead deal 2[W] extra damage and the target is immobilized until the end of your next turn. If this attack roll would miss, you instead deal 1[W] less damage.],
      [*Level 11:* 3[W] + 2d8 + Strength damage.],
    ),
  )

  #powers.power(
    title: "Great Shout",
    bonusTitle: "Level 7",
    description: "You slam your weapon into a foe, then give voice to the fury of your ancestors, cowing those who dare to stand against you.",
    type: powers.powerType.encounter,
    action: powers.actionType.standard,
    range: "Melee weapon",
    traits: "Fear, Primal, Weapon",
    target: "One creature",
    additionalRows: (
      [*Attack:* Strength vs. AC],
      [*Hit:* 3[W] + Strength damage, and each enemy within 3 squares of you takes a -2 penalty to attack rolls until the end of your next turn.],
      [*Thaneborn Triumph:* Each ally within 3 squares of you can shift up to 1 square.],
    ),
  )

  #powers.power(
    title: "Harbinger of Doom",
    bonusTitle: "Level 7",
    description: "You hack through one foe, and your battle cry heralds doom for the enemies before you.",
    type: powers.powerType.encounter,
    action: powers.actionType.standard,
    range: "Melee weapon",
    traits: "Fear, Primal, Weapon",
    target: "One creature",
    additionalRows: (
      [*Attack:* Strength vs. AC],
      [*Hit:* 3[W] + 1d8 + Strength damage. You then howl in a blast 3 that includes the target. Each enemy in the blast gains vulnerable 5 to all damage until the end of your next turn.],
      [*Thunderborn Wrath:* The vulnerability equals 5 + your Constitution.],
      [*Level 11:* 3[W] + 2d8 + Strength damage.],
    ),
  )

  #powers.power(
    title: "Looming Threat",
    bonusTitle: "Level 7",
    description: "An ally might have raised a foe's ire, but once you strike, that enemy must pay attention to you.",
    type: powers.powerType.encounter,
    action: powers.actionType.standard,
    range: "Melee weapon",
    traits: "Primal, Weapon",
    target: "One creature",
    additionalRows: (
      [*Attack:* Strength vs. AC],
      [*Hit:* 3[W] + Strength damage. If the target is marked by an ally, the attack deals 1[W] extra damage. You mark the target until the end of your next turn.],
      [*Rageblood Vigor:* Until the mark ends, you gain a power bonus to damage rolls against the target equal to your Constitution.],
      [*Miss:* Half damage, and you mark the target until the end of your next turn.],
    ),
  )

  #powers.power(
    title: "Slash and Slash Again",
    bonusTitle: "Level 7",
    description: "You strike hard and then lay into enemies all around you.",
    type: powers.powerType.encounter,
    action: powers.actionType.standard,
    range: "Melee weapon",
    traits: "Primal, Weapon",
    requirement: "You must be wielding two melee weapons.",
    target: "One creature",
    additionalRows: (
      [*Attack:* Strength vs. AC (main weapon)],
      [*Hit:* 2[W] + Strength damage. Until the start of your next turn, you can use a free action to deal 1[W] + 1d6 damage (off-hand weapon) to any enemy that starts its turn adjacent to you.],
      [*Level 11:* 1[W] + 2d6 damage (off-hand weapon)],
      [*Whirling Slayer:* Add your Dexterity to the offhand weapon damage.],
    ),
  )

  #powers.power(
    title: "Tide of Blood",
    bonusTitle: "Level 7",
    description: "Your anger sweeps over every nearby enemy, drawing blood to fuel the tide of your assault on one of them.",
    type: powers.powerType.encounter,
    action: powers.actionType.standard,
    range: "Melee weapon",
    traits: "Primal, Weapon",
    target: "One creature",
    additionalRows: (
      [*Attack:* Strength vs. AC],
      [*Hit:* 3[W] + Strength damage. The attack deals 1d6 extra damage for each enemy within two squares of you.],
      [*Rageblood Vigor:* The attack instead deals 1d6 extra damage for each enemy within a number of squares of you equal to 1 + your Constitution.],
      [*Miss:* Half damage.],
      [*Level 11:* 2d6 extra damage],
    ),
  )

  #powers.power(
    title: "Wheat to the Scythe",
    bonusTitle: "Level 7",
    description: "The enemies fall before your weapon's wide arc, like wheat to the scythe.",
    type: powers.powerType.encounter,
    action: powers.actionType.standard,
    range: "Close burst 1",
    traits: "Fear, Healing, Primal, Weapon",
    target: "Each enemy in the burst that you can see",
    additionalRows: (
      [*Attack:* Strength vs. AC],
      [*Hit:* 2[W] + Strength damage, the target falls prone, and you regain hit points equal to your Charisma for each target hit.],
      [*Thaneborn Triumph:* You can push the target 1 square.],
      [*Level 11:* Charisma + 2],
    ),
  )















































  #pagebreak()
  == Primal Daily Attack Powers

  === Level 1

  #powers.power(
    title: "Always Falling Rage",
    bonusTitle: "Level 1",
    description: "The fury of the waterfall and the relentless push of the waters propels you past any defenses.",
    type: powers.powerType.daily,
    action: powers.actionType.standard,
    range: "Melee weapon",
    traits: "Elemental, Primal, Rage, Weapon",
    target: "One creature",
    additionalRows: (
      [*Attack:* Strength vs. AC],
      [*Hit:* 2[W] + Strength damage, and you knock the target prone.],
      [*Miss:* Half damage.],
      [*Effect:* You enter the rage of the Always Falling spirit. Until the rage ends, whenever one of your allies hits an enemy adjacent to you, you can shift up to your speed as an immediate reaction.],
    ),
  )

  #powers.power(
    title: "Blood Bear Rage",
    bonusTitle: "Level 1",
    description: "You strike, then call on the spirit of the blood bear, drawing on its great strength and crushing grip to destroy your foes.",
    type: powers.powerType.daily,
    action: powers.actionType.standard,
    range: "Melee weapon",
    traits: "Primal, Rage, Weapon",
    target: "One creature",
    additionalRows: (
      [*Attack:* Strength vs. AC],
      [*Hit:* 2[W] + Strength damage, and you grab the target.],
      [*Miss:* Half damage.],
      [*Effect:* You enter the rage of the blood bear. Until the rage ends, you gain a +4 bonus to grab attacks. If an enemy starts its turn grabbed by you, it takes damage equal to your Strength plus half your level.],
    ),
  )

  #powers.power(
    title: "Bloodhunt Rage",
    bonusTitle: "Level 1",
    description: "Your rage surges up from the depths of your pain to bring pain to the wounded.",
    type: powers.powerType.daily,
    action: powers.actionType.standard,
    range: "Melee weapon",
    traits: "Primal, Rage, Weapon",
    target: "One creature",
    additionalRows: (
      [*Attack:* Strength vs. AC],
      [*Hit:* 3[W] + Strength damage.],
      [*Miss:* Half damage.],
      [*Effect:* You enter the rage of the bloodhunt. Until the rage ends, you gain a bonus to melee damage rolls equal to your Constitution if either you or your target is bloodied.],
    ),
  )

  #powers.power(
    title: "Bloodseeker's Rage",
    bonusTitle: "Level 1",
    description: "As you strike, flashes of spectral teeth and blood-red hide reveal the bloodseeker drake predator spirit that inspires your rage.",
    type: powers.powerType.daily,
    action: powers.actionType.standard,
    range: "Melee weapon",
    traits: "Primal, Rage, Weapon",
    target: "One creature",
    additionalRows: (
      [*Attack:* Strength vs. AC],
      [*Hit:* 3[W] + Strength damage.],
      [*Miss:* Half damage.],
      [*Effect:* You enter the rage of the bloodseeker. Until the rage ends, your opportunity attacks inflict ongoing damage equal to your Strength plus half your level (save ends), and you can make an opportunity attack against any bloodied enemy adjacent to you that shifts.],
    ),
  )

  #powers.power(
    title: "Frost Hide Rage",
    bonusTitle: "Level 1",
    description: "Your weapon becomes icy as you strike. Afterward, the ice spreads over you, shielding you from harm.",
    type: powers.powerType.daily,
    action: powers.actionType.standard,
    range: "Melee weapon",
    traits: "Cold, Elemental, Primal, Rage, Weapon",
    target: "One creature",
    additionalRows: (
      [*Attack:* Strength vs. AC],
      [*Hit:* 2[W] + Strength cold damage, and the target is slowed (save ends).],
      [*Miss:* Half damage.],
      [*Effect:* You enter the rage of the frost hide. Until the rage ends, you gain resistance to all damage equal to your Constitution.],
    ),
  )

  #powers.power(
    title: "Ghost Viper Rage",
    bonusTitle: "Level 1",
    description: "The spirit of the ghost viper infuses you, sending venom coursing through the veins of your foe. As you rage, the viper's spirit throws nearby foes off guard.",
    type: powers.powerType.daily,
    action: powers.actionType.standard,
    range: "Melee weapon",
    traits: "Poison, Primal, Rage, Weapon",
    target: "One creature",
    additionalRows: (
      [*Attack:* Strength vs. AC],
      [*Hit:* 3[W] + Strength damage, and ongoing poison damage equal to 10 + your level (save ends).],
      [*Miss:* Half damage.],
      [*Effect:* You enter the rage of the ghost viper. Until the rage ends, once per round an enemy that starts its turn next to you grants combat advantage until the end of its next turn.],
    ),
  )

  #powers.power(
    title: "Life Thane Rage",
    bonusTitle: "Level 1",
    description: "As you strike, raging energy boils out of you as life-giving mist, healing you and invigorating your allies.",
    type: powers.powerType.daily,
    action: powers.actionType.standard,
    range: "Melee weapon",
    traits: "Healing, Primal, Rage, Weapon",
    target: "One creature",
    additionalRows: (
      [*Attack:* Strength vs. AC],
      [*Hit:* 2[W] + Strength damage.],
      [*Miss:* Half damage],
      [*Effect:* You can spend a healing surge. You enter the rage of the life thane. Until the rage ends, any ally who starts his or her turn within 2 squares of you gains temporary hit points equal to your Charisma plus half your level.],
    ),
  )

  #powers.power(
    title: "Macetail's Rage",
    bonusTitle: "Level 1",
    description: "You knock your enemy to the ground with a slam like the behemoth's heavy tail, and the rage of the macetail fills you, refreshing you with every blow of your weapon.",
    type: powers.powerType.daily,
    action: powers.actionType.standard,
    range: "Close burst 1",
    traits: "Primal, Rage, Weapon",
    target: "Each enemy in the burst you can see",
    additionalRows: (
      [*Attack:* Strength vs. AC],
      [*Hit:* 1[W] + Strength damage, and you knock the target prone.],
      [*Miss:* Half damage.],
      [*Effect:* You enter the rage of the macetail behemoth. Until the rage ends, whenever you hit, you gain temporary hit points equal to your Strength plus half your level.],
    ),
  )

  #powers.power(
    title: "Rage Drake's Frenzy",
    bonusTitle: "Level 1",
    description: "You slam your weapon into your wounded foe, and the rage drake's spirit fills you. You erupt in violence, swinging furiously at a new foe as soon as the last one falls.",
    type: powers.powerType.daily,
    action: powers.actionType.standard,
    range: "Melee weapon",
    traits: "Primal, Rage, Weapon",
    target: "One creature",
    additionalRows: (
      [*Attack:* Strength vs. AC. If the target is bloodied, you gain a +2 bonus to the attack roll.],
      [*Hit:* 3[W] + Strength damage.],
      [*Miss:* Half damage.],
      [*Effect:* You enter the rage of the rage drake. Until the rage ends, once per round when you reduce an enemy to 0 hit points, you can shift up to 1 square and make a basic attack as a free action.],
    ),
  )

  #powers.power(
    title: "Savage Juggernaut Rage",
    bonusTitle: "Level 1",
    description: "Your blow triggers an inner wrath that grows more and more unstoppable with each enemy you fell.",
    type: powers.powerType.daily,
    action: powers.actionType.standard,
    range: "Melee weapon",
    traits: "Primal, Rage, Weapon",
    target: "One creature",
    additionalRows: (
      [*Attack:* Strength vs. AC],
      [*Hit:* 3[W] + Strength damage.],
      [*Miss:* Half damage.],
      [*Effect:* You enter the rage of the savage juggernaut. Until the rage ends, you gain a power bonus to attack rolls equal to the number of nonminion creatures you have reduced to 0 hit points since you entered the rage plus one.],
    ),
  )

  #powers.power(
    title: "Skull-Taker's Rage",
    bonusTitle: "Level 1",
    description: "The ancient berserker spirit that drives this rage doesn't care that its presence tears you apart, vein by vein. It wants the skulls of your enemies, no matter how they' ve tried to wedge themselves into their cowards' armor.",
    type: powers.powerType.daily,
    action: powers.actionType.standard,
    range: "Melee weapon",
    traits: "Primal, Rage, Weapon",
    target: "One creature",
    additionalRows: (
      [*Attack:* Strength vs. AC],
      [*Hit:* 3[W] + Strength damage.],
      [*Miss:* Half damage.],
      [*Effect:* You enter the rage of the skull-taker. Until the rage ends, you take damage equal to your level at the start of each of your turns. Until the rage ends, you have a +1 bonus to your attack rolls, and deal extra damage equal to the damage you took at the start of your turn with the first attack power you use on your turn.],
    ),
  )

  #powers.power(
    title: "Swift Panther Rage",
    bonusTitle: "Level 1",
    description: "You slash your foe with fury as the spirit of the swift panther grants you its speed and agility.",
    type: powers.powerType.daily,
    action: powers.actionType.standard,
    range: "Melee weapon",
    traits: "Primal, Rage, Weapon",
    target: "One creature",
    additionalRows: (
      [*Attack:* Strength vs. AC],
      [*Hit:* 3[W] + Strength damage.],
      [*Miss:* Half damage.],
      [*Effect:* You enter the rage of the swift panther. Until the rage ends, you gain a +2 bonus to speed and can shift 2 squares as a move action.],
    ),
  )

  #powers.power(
    title: "Thunder Hooves Rage",
    bonusTitle: "Level 1",
    description: "You hammer the enemy with a heavy blow, and the spirits of stampeding beasts fill you with strength.",
    type: powers.powerType.daily,
    action: powers.actionType.standard,
    range: "Melee weapon",
    traits: "Primal, Rage, Weapon",
    target: "One creature",
    additionalRows: (
      [*Attack:* Strength vs. AC],
      [*Hit:* 3[W] + Strength damage.],
      [*Miss:* Half damage.],
      [*Effect:* You enter the rage of the thunder hooves. Until the rage ends, you can move through one or two enemies' spaces during each of your turns. When you move through an enemy's space, your next attack against that enemy during the same turn deals 1[W] extra damage.],
    ),
  )

  #powers.power(
    title: "Voracious Predator Rage",
    bonusTitle: "Level 1",
    description: "You swing mightily, and spirit predators arise, empowering your blows whenever you leave an enemy's body in your wake.",
    type: powers.powerType.daily,
    action: powers.actionType.standard,
    range: "Melee weapon",
    traits: "Primal, Rage, Weapon",
    target: "One creature",
    additionalRows: (
      [*Attack:* Strength vs. AC],
      [*Hit:* 3[W] + Strength damage. If the target is already bloodied, the attack deals 1[W] extra damage.],
      [*Miss:* Half damage.],
      [*Effect:* You enter the rage of the voracious predator. Until the rage ends, whenever you reduce an enemy to 0 hit points with an attack, you gain a +2 power bonus to your next weapon attack roll, and that next attack deals 1[W] extra damage if it hits.],
    ),
  )

  #powers.power(
    title: "Ambusher's Rage",
    bonusTitle: "Level 5",
    description: "Blood calls. The ambush drake's throaty roar erupts from your throat as you fling yourself around your wounded enemy in a dizzying set-up for the death blow.",
    type: powers.powerType.daily,
    action: powers.actionType.standard,
    range: "Melee weapon",
    traits: "Primal, Rage, Weapon",
    target: "One creature",
    additionalRows: (
      [*Attack:* Strength vs. AC],
      [*Hit:* 3[W] + Strength damage. If you were hidden from the target or the target is bloodied, you deal 2[W] extra damage.],
      [*Miss:* Half damage.],
      [*Effect:* You enter the rage of the ambusher. Until the rage ends, you can shift up to 2 squares as a minor action as long as you end the shift with total cover, total concealment, or adjacent to a bloodied enemy.],
      [*Special:* When charging, you can use this power in place of a melee basic attack.],
    ),
  )

  #pagebreak()
  === Level 5

  #powers.power(
    title: "Ancestral War Band Rage",
    bonusTitle: "Level 5",
    description: "You hew at your enemy, and the spirits of ancestral warriors rise up to aid you.",
    type: powers.powerType.daily,
    action: powers.actionType.standard,
    range: "Melee weapon",
    traits: "Primal, Rage, Weapon",
    target: "One creature",
    additionalRows: (
      [*Attack:* Strength vs. AC],
      [*Hit:* 4[W] + Strength damage.],
      [*Miss:* Half damage.],
      [*Effect:* You enter the rage of the ancestral war band. Until the rage ends, you gain combat advantage against any enemy when making barbarian at-will attacks against it. In addition, whenever you roll a 1 on a damage die for a primal attack, the roll changes to the die's maximum value.],
    ),
  )

  #powers.power(
    title: "Ancient Berserkers' Rage",
    bonusTitle: "Level 5",
    description: "You lash out and the spirits of ancestral berserkers roar their approval. As always, they are anxious to fight beside a member of the clan.",
    type: powers.powerType.daily,
    action: powers.actionType.standard,
    range: "Close burst 1",
    traits: "Fear, Primal, Rage, Weapon",
    target: "Each enemy in the burst.",
    additionalRows: (
      [*Attack:* Strength vs. AC],
      [*Hit:* 3[W] + Strength damage, and the target is slowed (save ends).],
      [*Miss:* Half damage.],
      [*Effect:* You enter the rage of the ancient berserkers. Until the rage ends, you gain combat advantage against each enemy adjacent to you and a power bonus to damage rolls against them equal to your Charisma.],
    ),
  )

  #powers.power(
    title: "Blood Hunger Rage",
    bonusTitle: "Level 5",
    description: "Your fierce attack leaves your target reeling. As you rage, the Primal Beast surges in your blood, drawing on the carnage around you to empower your attacks.",
    type: powers.powerType.daily,
    action: powers.actionType.standard,
    range: "Melee weapon",
    traits: "Primal, Rage, Weapon",
    target: "One creature",
    additionalRows: (
      [*Attack:* Strength vs. AC],
      [*Hit:* 2[W] + Strength damage, and the target is dazed (save ends).],
      [*Miss:* Half damage.],
      [*Effect:* You enter the blood hunger rage. Until the rage ends, you gain a bonus to attack rolls and damage rolls equal to the number of bloodied creatures within 3 squares of you.],
    ),
  )

  #powers.power(
    title: "Blue Dragon Rage",
    bonusTitle: "Level 5",
    description: "Your weapon surges with lightning like the blue dragon's horn. As you rage, the spirit of the blue dragon courses through you, and your blows erupt in bursts of lightning.",
    type: powers.powerType.daily,
    action: powers.actionType.standard,
    range: "Melee weapon",
    traits: "Lightning, Primal, Rage, Weapon",
    target: "One creature",
    additionalRows: (
      [*Attack:* Strength vs. AC],
      [*Hit:* 3[W] + Strength damage, and ongoing 20 lightning damage (save ends).],
      [*Miss:* Half damage.],
      [*Effect:* You enter the rage of the blue dragon. Until the rage ends, you and each ally adjacent to you have resist 5 lightning, and once per round when you hit a target with a melee attack, each enemy adjacent to that target takes 5 lightning damage.],
    ),
  )

  #powers.power(
    title: "Circle of Blood Rage",
    bonusTitle: "Level 5",
    description: "You spin, hacking at your enemies. The image of the circle of blood used in your initiation rites grips your mind, empowering your later attacks.",
    type: powers.powerType.daily,
    action: powers.actionType.standard,
    range: "Close burst 1",
    traits: "Primal, Rage, Weapon",
    target: "Each creature in the burst",
    additionalRows: (
      [*Attack:* Strength vs. AC],
      [*Hit:* 4[W] + Strength damage.],
      [*Miss:* Half damage.],
      [*Effect:* You enter the rage of the circle of blood. Until the rage ends, you gain a power bonus to attack rolls and damage rolls with barbarian at-will attack powers and rage strike equal to the number of creatures you targeted with this power.],
    ),
  )

  #powers.power(
    title: "Clawfoot Berserker Rage",
    bonusTitle: "Level 5",
    description: "You channel the behemoth's fury to avenge injury to allies who fight alongside you.",
    type: powers.powerType.daily,
    action: powers.actionType.standard,
    range: "Melee weapon",
    traits: "Primal, Rage, Weapon",
    target: "One creature",
    additionalRows: (
      [*Attack:* Strength vs. AC],
      [*Hit:* 3[W] + Strength damage, and the target is marked (save ends).],
      [*Miss:* Half damage, and the target is marked until the end of your next turn.],
      [*Effect:* You enter the rage of the clawfoot berserker. Until the rage ends, when any ally within 5 squares of you becomes bloodied, you gain a +2 power bonus to attack rolls until the end of your next turn and can make a basic attack as an immediate reaction.],
    ),
  )

  #powers.power(
    title: "Earth Grasp Rage",
    bonusTitle: "Level 5",
    description: "Your rage reaches out to Stone Brother, and arms of molten stone form to grab your foe.",
    type: powers.powerType.daily,
    action: powers.actionType.standard,
    range: "Melee weapon",
    traits: "Elemental, Fire, Primal, Rage, Weapon",
    target: "One creature",
    additionalRows: (
      [*Attack:* Strength vs. AC],
      [*Hit:* The target takes ongoing 20 fire damage and is immobilized (save ends both).],
      [*Aftereffect:* The target falls prone.],
      [*Miss:* The target takes 10 ongoing fire damage (save ends) and falls prone.],
      [*Effect:* You enter the rage of earth's grasp. Until the rage ends, the first enemy you hit with a melee attack on each of your turns is immobilized until the end of your next turn, and your attacks against immobilized, restrained, or prone targets deal 5 extra fire damage.],
    ),
  )

  #powers.power(
    title: "Earthquake Dragon's Rage",
    bonusTitle: "Level 5",
    description: "The ground shakes, and the air splits. You can barely hear the voices of your friends asking you to call on a different primal spirit to drive your rage.",
    type: powers.powerType.daily,
    action: powers.actionType.standard,
    range: "Melee weapon",
    traits: "Primal, Rage, Weapon",
    target: "One creature",
    additionalRows: (
      [*Attack:* Strength vs. AC],
      [*Hit:* 4[W] + Strength damage.],
      [*Miss:* Half damage.],
      [*Effect:* You enter the rage of the earthquake dragon. Until the end of your next turn or until the rage ends (whichever is longer), whenever an enemy hits you, you deal thunder damage equal to your Strength plus half your level to each creature within 3 squares of you and push each creature you damage up to 2 squares.],
    ),
  )

  #powers.power(
    title: "Flameheart Rage",
    bonusTitle: "Level 5",
    description: "The spirit of the red dragon imbues your attack with fiery wrath, scorching your foe. As you rage, the fire of the dragon's heart lashes out at those that strike you.",
    type: powers.powerType.daily,
    action: powers.actionType.standard,
    range: "Close blast 5",
    traits: "Fire, Primal, Rage, Weapon",
    target: "Each creature in the blast",
    additionalRows: (
      [*Attack:* Strength vs. AC],
      [*Hit:* 2[W] + Strength fire damage.],
      [*Miss:* Half damage.],
      [*Effect:* You enter the rage of the red dragon. Until the rage ends, you and each ally within 2 squares of you have Resist 5 fire, and any creature that hits you with a melee attack takes fire damage equal to half your level + your Constitution.],
    ),
  )

  #powers.power(
    title: "Frost Wolf Rage",
    bonusTitle: "Level 5",
    description: "Like the great spirit wolf whose breath is the cold north wind, you are wreathed in frost, chilling those who try to harm you.",
    type: powers.powerType.daily,
    action: powers.actionType.standard,
    range: "Melee weapon",
    traits: "Cold, Elemental, Primal, Rage, Weapon",
    target: "One creature",
    additionalRows: (
      [*Effect:* Using this attack provokes an opportunity attack from each adjacent enemy, which must take the opportunity attack if they are able. For each enemy that takes this opportunity attack, your attack deals 1[W] extra cold damage.],
      [*Attack:* Strength vs. Fortitude],
      [*Hit:* 3[W] + Strength cold damage.],
      [*Miss:* Half damage.],
      [*Effect:* You enter the rage of the frost wolf. Until the rage ends any enemy that hits you with a melee attack takes cold damage equal to half your level + your Constitution, and you and each ally within 2 squares have resist 5 to cold damage.],
    ),
  )

  #powers.power(
    title: "Hunting Lion Rage",
    bonusTitle: "Level 5",
    description: "You channel the spirit of the hunting lion into a mighty blow. As you rage, the lion's spirit makes the most of every advantage.",
    type: powers.powerType.daily,
    action: powers.actionType.standard,
    range: "Melee weapon",
    traits: "Primal, Rage, Weapon",
    target: "One creature",
    additionalRows: (
      [*Attack:* Strength vs. AC],
      [*Hit:* 4[W] + Strength damage.],
      [*Miss:* Half damage.],
      [*Effect:* You enter the rage of the hunting lion. Until the rage ends, you gain a +2 power bonus to attack and damage rolls against any target that is granting combat advantage to you.],
    ),
  )

  #powers.power(
    title: "Iron Hammer Rage",
    bonusTitle: "Level 5",
    description: "Even the iron that sleeps in the earth has its primal spirits, which fuel your mighty attacks to dash your foes against walls and large trees.",
    type: powers.powerType.daily,
    action: powers.actionType.standard,
    range: "Melee weapon",
    traits: "Elemental, Primal, Rage, Weapon",
    target: "One creature",
    additionalRows: (
      [*Attack:* Strength vs. AC],
      [*Hit:* 2[W] + Strength damage, and you push the target up to a number of squares equal to your Strength.],
      [*Miss:* Half damage, and you push the target up to 1 square.],
      [*Effect:* You enter the rage of the iron hammer. Until the rage ends, whenever you hit a creature with a melee attack, you push that creature up to 2 squares. If the creature is adjacent to blocking terrain other than the ground at the end of the push, the creature takes damage equal to your Strength.],
    ),
  )

  #powers.power(
    title: "Longstrike Slayer Rage",
    bonusTitle: "Level 5",
    description: "Your weapon smashes into your targets like a steel hurricane as your fury enhances its leverage and power with each strike.",
    type: powers.powerType.daily,
    action: powers.actionType.standard,
    range: "Close burst 2",
    traits: "Primal, Rage, Weapon",
    requirement: "You must be wielding a reach weapon.",
    target: "Each enemy you can see that is not adjacent to you in the burst",
    additionalRows: (
      [*Attack:* Strength vs. AC],
      [*Hit:* 3[W] + Strength damage.],
      [*Miss:* Half damage.],
      [*Effect:* You enter the rage of the longstrike slayer. Until the rage ends, you gain a power bonus equal to your Constitution to attack and damage rolls with melee and close weapon powers against targets that are 2 or more squares away from you.],
    ),
  )

  #powers.power(
    title: "Rage of the Crimson Hurricane",
    bonusTitle: "Level 5",
    description: "Your swing arcs around you, and rage transforms you into a swirling storm of death, dangerous to any enemy near you.",
    type: powers.powerType.daily,
    action: powers.actionType.standard,
    range: "Close burst 1",
    traits: "Primal, Rage, Weapon",
    target: "Each enemy in the burst",
    additionalRows: (
      [*Attack:* Strength vs. AC],
      [*Hit:* 2[W] + Strength damage.],
      [*Effect:* Each target takes ongoing 20 damage (save ends). You enter the rage of the crimson hurricane. Until the rage ends, the first time you hit an enemy with a primal melee power each turn, each enemy adjacent to you after the attack is resolved takes damage equal to your Strength plus half your level.],
    ),
  )

  #powers.power(
    title: "Razor Wind Rage",
    bonusTitle: "Level 5",
    description: "Your strike batters the crowding enemies, unleashing your rage. From then on, after each devastating blow, primal winds speed you.",
    type: powers.powerType.daily,
    action: powers.actionType.standard,
    range: "Close burst 1",
    traits: "Elemental, Primal, Rage, Weapon",
    target: "Each enemy in the burst",
    additionalRows: (
      [*Attack:* Strength vs. AC],
      [*Hit:* 2[W] + Strength damage, and you push the target up to 2 squares.],
      [*Miss:* Half damage.],
      [*Effect:* You enter the rage of the razor wind. Until the rage ends, whenever your Rampage class feature is triggered, you can shift a number of squares equal to your Dexterity and then make a basic attack against each enemy adjacent to you as a free action, instead of making a single melee basic attack.],
    ),
  )

  #powers.power(
    title: "Scytheclaw Rage",
    bonusTitle: "Level 5",
    description: "You batter a foe to the ground, and you channel the spirit of the scytheclaw drake. Even as you swing your weapon, you kick and punch to keep your foes back.",
    type: powers.powerType.daily,
    action: powers.actionType.standard,
    range: "Melee weapon",
    traits: "Primal, Rage, Weapon",
    target: "One creature",
    additionalRows: (
      [*Attack:* Strength vs. AC],
      [*Hit:* 3[W] + Strength damage.],
      [*Miss:* Half damage.],
      [*Effect:* You knock the target prone. You enter the rage of the scytheclaw drake. Until the rage ends, you can push an enemy adjacent to you 2 squares as a minor action once per round.],
    ),
  )

  #powers.power(
    title: "Silver Phoenix Rage",
    bonusTitle: "Level 5",
    description: "Your mighty blow erupts in silver fire as the spirit of the phoenix enters you. As you rage, vitality surges through you to ward you from death.",
    type: powers.powerType.daily,
    action: powers.actionType.standard,
    range: "Close burst 1",
    traits: "Fire, Healing, Primal, Rage, Weapon",
    target: "Each enemy in the burst",
    additionalRows: (
      [*Attack:* Strength vs. AC],
      [*Hit:* 2[W] + Strength fire damage, and ongoing 10 fire damage (save ends).],
      [*Miss:* Half damage.],
      [*Effect:* You enter the rage of the silver phoenix. Until the rage ends, you gain regeneration equal to your Charisma. In addition, the first time you are reduced to 0 hit points or fewer while the rage is active, you can spend a healing surge as an immediate interrupt.],
    ),
  )

  #powers.power(
    title: "Slashing Tornado Rage",
    bonusTitle: "Level 5",
    description: "The howling winds of the tornado enhance your whirling strike. As the fury of the tornado fills you, your fury reaches out to strike at any who oppose you.",
    type: powers.powerType.daily,
    action: powers.actionType.standard,
    range: "Close burst 2",
    traits: "Elemental, Primal, Rage, Weapon",
    target: "Each enemy you can see in the burst",
    additionalRows: (
      [*Attack:* Strength vs. AC],
      [*Hit:* 1[W] + Strength damage.],
      [*Miss:* Half damage.],
      [*Effect:* You enter the rage of the slashing tornado. Until the rage ends, at the start of each of your turns, deal damage equal to your Dexterity to each enemy within 2 squares of you, and you can slide each of those enemies up to 1 square.],
    ),
  )

  #powers.power(
    title: "Thunderfury Rage",
    bonusTitle: "Level 5",
    description: "Charging at your foe and knocking it to the ground, you call on the spirit of the thunderfury boar to drive you into a frenzy. In your rage, you lash out at foes that attack you.",
    type: powers.powerType.daily,
    action: powers.actionType.standard,
    range: "Melee weapon",
    traits: "Primal, Rage, Weapon",
    target: "One creature",
    additionalRows: (
      [*Attack:* Strength vs. AC],
      [*Hit:* 3[W] + Strength damage, and you knock the target prone.],
      [*Miss:* Half damage.],
      [*Effect:* You enter the rage of the thunderfury boar. Until the rage ends, when any enemy adjacent to you hits you, you can make a melee basic attack against that enemy as an immediate reaction.],
    ),
  )

  #powers.power(
    title: "Thunder Hawk Rage",
    bonusTitle: "Level 5",
    description: "Your thunderous attack dazes your foe as you channel the great spirit hawk whose wings rumble across the sky. Your screaming charge blasts your enemies with thunder.",
    type: powers.powerType.daily,
    action: powers.actionType.noAction,
    range: "Melee 1",
    traits: "Elemental, Primal, Rage, Thunder, Weapon",
    target: "One creature",
    requirement: "The Thunder Hawk Rage power must be active to use this power.",
    additionalRows: (
      [*Attack:* Strength vs. AC],
      [*Hit:* 2[W] + Strength thunder damage, and the target is dazed (save ends).],
      [*Miss:* Half damage.],
      [*Effect:* You enter the rage of the thunder hawk. Until the rage ends, you can use the Thunder Hawk Rage Attack power once per turn only on your own turn. Thunder Hawk Rage Attack Your thunderous attack dazes your foe as you channel the great spirit hawk whose wings rumble across the sky. Your screaming charge blasts your enemies with thunder.],
      [*Attack:* Strength vs. Fortitude],
      [*Hit:* You knock the secondary target prone.],
    ),
  )

  #powers.power(
    title: "Tiger's Claw Rage",
    bonusTitle: "Level 5",
    description: "Your attack awakens the tiger spirit within you. Its raking claws punish any enemies that avoid your blows.",
    type: powers.powerType.daily,
    action: powers.actionType.standard,
    range: "Melee weapon",
    traits: "Primal, Rage, Weapon",
    target: "One creature",
    additionalRows: (
      [*Attack:* Strength vs. AC],
      [*Hit:* 4[W] + Strength damage.],
      [*Miss:* Half damage.],
      [*Effect:* You enter the rage of the tiger's claw. Until the rage ends, whenever you miss a creature with a melee attack, that creature takes 1[W] damage.],
    ),
  )

  #powers.power(
    title: "Tyrant's Rage",
    bonusTitle: "Level 5",
    description: "Your blow is a prelude to a furious shriek. Your visage reveals a berserker fury, which causes your foes to recoil.",
    type: powers.powerType.daily,
    action: powers.actionType.standard,
    range: "Melee weapon",
    traits: "Fear, Primal, Rage, Weapon",
    target: "One creature",
    additionalRows: (
      [*Attack:* Strength vs. Will],
      [*Hit:* 2[W] + Strength damage, and the target is dazed (save ends).],
      [*Miss:* Half damage, and the target is dazed until the end of your next turn.],
      [*Effect:* You enter the rage of the tyrant. Until the rage ends, you can push every enemy adjacent to you up to 1 square as a minor action once per round.],
    ),
  )

  #powers.power(
    title: "Vengeful Storm Rage",
    bonusTitle: "Level 5",
    description: "Your whirlwind assault engulfs your enemies in lightning as you channel the storm's fury.",
    type: powers.powerType.daily,
    action: powers.actionType.standard,
    range: "Close burst 1",
    traits: "Elemental, Lightning, Primal, Rage, Weapon",
    target: "Each enemy in the burst",
    additionalRows: (
      [*Attack:* Strength vs. AC],
      [*Hit:* 3[W] + Strength lightning damage.],
      [*Miss:* Half damage.],
      [*Effect:* You enter the rage of the vengeful storm. Until the rage ends, at the start of each of your turns, each enemy adjacent to you takes lightning damage equal to half your level + your Constitution.],
    ),
  )

  #pagebreak()
  === Level 9

  #powers.power(
    title: "Black Dragon Rage",
    bonusTitle: "Level 9",
    description: "Channeling the spirit of the black dragon's caustic heart, your attack erupts in searing acid. As you rage, acid sears the eyes of nearby foes.",
    type: powers.powerType.daily,
    action: powers.actionType.standard,
    range: "Melee weapon",
    traits: "Acid, Primal, Rage, Weapon",
    target: "One creature",
    additionalRows: (
      [*Attack:* Strength vs. AC],
      [*Hit:* 3[W] + Strength acid damage, and ongoing 30 acid damage (save ends).],
      [*Miss:* Half damage.],
      [*Effect:* You enter the rage of the black dragon. Until the rage ends, you have resist 10 acid, and at the start of each of your turns, each enemy adjacent to you is blinded until the end of your turn.],
    ),
  )

  #powers.power(
    title: "Carver's Glory Rage",
    bonusTitle: "Level 9",
    description: "Your axe rises in time with the ocean's pounding waves. Your axe falls with power borrowed from each crashing death.",
    type: powers.powerType.daily,
    action: powers.actionType.standard,
    range: "Melee weapon",
    traits: "Primal, Rage, Weapon",
    target: "One creature",
    additionalRows: (
      [*Attack:* Strength vs. AC],
      [*Hit:* 5[W] + Strength damage.],
      [*Miss:* Half damage.],
      [*Effect:* You enter the rage of carver's glory. Until the rage ends, you gain a +1 bonus to attack rolls, you deal 5 extra damage, and whenever you reduce any enemy to 0 hit points, you deal 5 extra damage. This extra damage is cumulative.],
    ),
  )

  #powers.power(
    title: "Clawed Ancestor Rage",
    bonusTitle: "Level 9",
    description: "You strike a mighty blow, then draw the enemy close. The shadowy presence of the Great Bear grows within you, roaring into full frenzy as you clench a foe.",
    type: powers.powerType.daily,
    action: powers.actionType.standard,
    range: "Close burst 2",
    traits: "Primal, Rage, Weapon",
    target: "Each enemy you can see in burst",
    additionalRows: (
      [*Attack:* Strength vs. AC],
      [*Hit:* 2[W] + Strength damage, you pull the target up to 1 square and grab the target. You do not need a free hand to maintain these grabs.],
      [*Miss:* Half damage.],
      [*Effect:* You enter the rage of the clawed ancestor. Until the rage ends, you treat the Grab attack power as having the Weapon keyword, and if an enemy begins its turn grabbed by you, it takes damage equal to your level + your Strength damage.],
    ),
  )

  #powers.power(
    title: "Desert Wind Rage",
    bonusTitle: "Level 9",
    description: "A desert wind rises in the wake of your strike, blinding your foe. The sirocco then expands and settles in, scouring even distant enemies.",
    type: powers.powerType.daily,
    action: powers.actionType.standard,
    range: "Melee weapon",
    traits: "Elemental, Fire, Illusion Primal, Rage, Weapon",
    target: "One creature",
    additionalRows: (
      [*Attack:* Strength vs. AC],
      [*Hit:* 3[W] + Strength damage and the target is blinded until the end of your next turn.],
      [*Miss:* Half damage.],
      [*Effect:* You enter the rage of the desert wind. Until the rage ends, at the start of each of your turns, you deal your Strength fire damage to each enemy within 5 squares of you.],
    ),
  )

  #powers.power(
    title: "Flying Serpent Rage",
    bonusTitle: "Level 9",
    description: "Coiling, spitting, and darting, you react to the enemy's charge with brutal swiftness.",
    type: powers.powerType.daily,
    action: powers.actionType.immediateReaction,
    range: "Melee weapon",
    traits: "Primal, Rage, Weapon",
    trigger: "An enemy charges you or an ally",
    target: "The triggering enemy",
    additionalRows: (
      [*Effect:* Before the attack, you shift up to 6 squares.],
      [*Attack:* Strength vs. AC],
      [*Hit:* 3[W] + Strength damage.],
      [*Miss:* Half damage.],
      [*Effect:* You enter the rage of the flying serpent. Until the rage ends, you can shift 2 squares as a move action. In addition, after making a charge attack on your turn, you can take further actions during that turn.],
    ),
  )

  #powers.power(
    title: "Frenzied Beast Rage",
    bonusTitle: "Level 9",
    description: "You are so consumed with primal fury that you enter a self-destructive rampage.",
    type: powers.powerType.daily,
    action: powers.actionType.standard,
    range: "Melee weapon",
    traits: "Primal, Rage, Weapon",
    target: "One creature",
    additionalRows: (
      [*Attack:* Strength vs. AC],
      [*Hit:* 4[W] + Strength damage. The target takes 30 ongoing damage (save ends) and you take 15 ongoing damage (save ends).],
      [*Miss:* Half damage. The target takes 20 ongoing damage (save ends) and you take 20 ongoing damage (save ends).],
      [*Effect:* You enter the rage of the frenzied beast. Until the rage ends, once per round as a minor action you can take damage equal to your level to deal damage to an enemy adjacent to you equal to your level + your Constitution damage, plus half your level if you are bloodied after taking the damage. The damage you take cannot be reduced or negated.],
    ),
  )

  #powers.power(
    title: "Oak Hammer Rage",
    bonusTitle: "Level 9",
    description: "The ancient spirit of the oak knocks your foe to the ground. As you rage, you knock foe after foe down to the earth, then strike them with the earth's fury.",
    type: powers.powerType.daily,
    action: powers.actionType.standard,
    range: "Melee weapon",
    traits: "Primal, Rage, Weapon",
    target: "One creature",
    additionalRows: (
      [*Attack:* Strength vs. AC],
      [*Hit:* 3[W] + Strength damage, and you knock the target prone.],
      [*Miss:* Half damage, and you knock the target prone.],
      [*Effect:* You enter the rage of the oak hammer. Until the rage ends, whenever you hit a target with a melee attack, you knock that target prone. If that target is already prone, the attack instead deals extra damage equal to half your level plus your Constitution.],
    ),
  )

  #powers.power(
    title: "Rage of the Battle Tyrant",
    bonusTitle: "Level 9",
    description: "Your strike awakens a rage within you that urges your allies to move about the battlefield with impunity whenever you hit.",
    type: powers.powerType.daily,
    action: powers.actionType.standard,
    range: "Melee weapon",
    traits: "Primal, Rage, Weapon",
    target: "One creature",
    additionalRows: (
      [*Attack:* Strength vs. AC],
      [*Hit:* 3[W] + Strength damage, and the target gains vulnerable 5 to all damage (save ends).],
      [*Miss:* Half damage.],
      [*Effect:* You enter the rage of the battle tyrant. Until the rage ends, each ally who can hear you gains a +2 power bonus to speed, and whenever you hit any enemy with a primal attack power, one ally within 2 squares of that enemy can shift up to 2 squares as a free action.],
    ),
  )

  #powers.power(
    title: "Rage of the Death Spirit",
    bonusTitle: "Level 9",
    description: "As you strike, robbing your foe of its strength, you awaken a spirit that commands your enemies' attention.",
    type: powers.powerType.daily,
    action: powers.actionType.standard,
    range: "Melee weapon",
    traits: "Necrotic, Primal, Rage, Weapon",
    target: "One creature",
    additionalRows: (
      [*Attack:* Strength vs. AC],
      [*Hit:* 2[W] + Strength necrotic damage, and the target is weakened (save ends).],
      [*Miss:* Half damage, and the target is weakened until the end of your next turn.],
      [*Effect:* You enter the rage of the death spirit. Until the rage ends, as the first action of each of your turns, you can use a free action to mark each enemy within 2 squares of you until the end of your next turn. In addition, you gain a +2 power bonus to attack rolls and damage rolls against enemies marked by you.],
    ),
  )

  #powers.power(
    title: "Serpent Fang Rage",
    bonusTitle: "Level 9",
    description: "Scale-shaped tattoos form on your arms, and you strike with a suddenly envenomed weapon. From then on, your rage-flushed markings distract those you damage.",
    type: powers.powerType.daily,
    action: powers.actionType.standard,
    range: "Melee weapon",
    traits: "Poison, Primal, Rage, Weapon",
    target: "One creature",
    additionalRows: (
      [*Attack:* Strength vs. AC],
      [*Hit:* 4[W] + Strength poison damage, and ongoing 30 poison damage (save ends).],
      [*Miss:* Half damage.],
      [*Effect:* You enter the rage of the serpent fang. Until the rage ends, you and each ally adjacent to you have resist 10 poison, and any enemy you hit grants combat advantage and takes ongoing 15 poison damage (save ends).],
    ),
  )

  #powers.power(
    title: "Stone Bear Rage",
    bonusTitle: "Level 9",
    description: "The spirit of the stone bear that hunts at the mountains' roots courses through you, and its fury blunts the pain of your wounds.",
    type: powers.powerType.daily,
    action: powers.actionType.standard,
    range: "Melee weapon",
    traits: "Primal, Rage, Weapon",
    target: "One creature",
    additionalRows: (
      [*Attack:* Strength vs. AC],
      [*Hit:* 4[W] + Strength damage, and the target is grabbed. You do not need a free hand to maintain this grab.],
      [*Miss:* Half damage.],
      [*Effect:* You enter the rage of the stone bear. Until the rage ends, you gain resistance to all damage equal to half your level plus your Constitution, and any time you are missed by an enemy attack and have at least one creature grabbed the enemy must reroll its attack targeting one creature of your choice you have grabbed.],
    ),
  )

  #powers.power(
    title: "Stoneroot Rage",
    bonusTitle: "Level 9",
    description: "Your power wells up from deep within the unassailable earth.",
    type: powers.powerType.daily,
    action: powers.actionType.standard,
    range: "Melee weapon",
    traits: "Primal, Rage, Weapon",
    target: "One creature",
    additionalRows: (
      [*Attack:* Strength vs. AC],
      [*Hit:* 4[W] + Strength damage, and the target is slowed (save ends).],
      [*Miss:* Half damage.],
      [*Effect:* You enter the rage of Stoneroot. Until the rage ends, you may reduce the number of squares of any forced movement you are subject to by your Constitution and gain resist 5 to all damage.],
    ),
  )

  #powers.power(
    title: "Storm Drake Rage",
    bonusTitle: "Level 9",
    description: "Lightning cascades around you and flows into your enemy. As you rage, lightning lashes out at any foe that strikes you, knocking it to the ground.",
    type: powers.powerType.daily,
    action: powers.actionType.standard,
    range: "Melee pierce 2",
    traits: "Lightning, Primal, Rage, Weapon",
    target: "One creature",
    additionalRows: (
      [*Attack:* Strength vs. AC],
      [*Hit:* 3[W] + Strength lightning damage, and ongoing 30 lightning damage (save ends).],
      [*Miss:* Half damage.],
      [*Effect:* You enter the rage of the storm drake. Until the rage ends, any enemy that hits you with a melee attack takes lightning damage equal to your Dexterity and is knocked prone.],
    ),
  )

  #powers.power(
    title: "White Tiger Rage",
    bonusTitle: "Level 9",
    description: "The spirit of the white tiger empowers your attack, freezing your enemy in place. As the tiger's rage fills you, winter's chill slows your foes.",
    type: powers.powerType.daily,
    action: powers.actionType.standard,
    range: "Melee weapon",
    traits: "Cold, Primal, Rage, Weapon",
    target: "One creature",
    additionalRows: (
      [*Attack:* Strength vs. AC],
      [*Hit:* 2[W] + Strength cold damage, and the target is immobilized (save ends).],
      [*Miss:* Half damage, and the target is slowed (save ends).],
      [*Effect:* You enter the rage of the white tiger. Until the rage ends, you gain resist 10 cold and any enemy that starts its turn adjacent to you is slowed until the end of its turn.],
    ),
  )






















]
