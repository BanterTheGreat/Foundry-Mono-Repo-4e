#import "../../helpers/powers.typ" as powers;

// Level 2 Combat
#let wisdomLevel2Combat() = {
  return [
    // TODO: Move to Divine?
    #powers.power(
      title: "Faith Healing",
      bonusTitle: "Religion | Level 2",
      description: "Your prayers help an ally recover from injury.",
      type: powers.powerType.daily,
      range: [*Melee touch*],
      target: "One creature",
      action: powers.actionType.standard,
      additionalRows: (
        [*Effect*: The target can spend a healing surge.],
      ),
      traits: "Healing",
    )

    #powers.power(
      title: "Otherworldly Lore",
      bonusTitle: "Nature | Level 2",
      description: "Something about the aberrant horror's movements strikes a chord; you know just how to fight it.",
      type: powers.powerType.encounter,
      range: [*Close burst 5*],
      target: "One aberrant creature you can see in the burst",
      action: powers.actionType.minor,
      additionalRows: (
        [*Effect*: You make a Nature check to determine the target's resistances and vulnerabilities. If the check succeeds, you or one ally who can hear you gains a +4 power bonus to his or her next attack roll against the target before the end of your next turn.],
      ),
      traits: none,
    )

    #powers.power(
      title: "Healer’s Gift",
      bonusTitle: "Medicine | Level 2",
      description: "You tend to a fallen comrade and stave off death's touch.",
      type: powers.powerType.encounter,
      range: [*Melee 1*],
      target: "One dying creature",
      action: powers.actionType.standard,
      additionalRows: (
        [*Effect*: The target can spend a healing surge.],
      ),
      traits: "Healing",
    )

    #powers.power(
      title: "Iron Resurgence",
      bonusTitle: "Medicine | Level 2",
      description: "Though your hands do little to comfort the wounded, you ensure that an injury will not keep an ally out of the battle.",
      type: powers.powerType.encounter,
      range: [*Melee 1*],
      target: "You or one ally",
      requirement: "The target must have at least two healing surges remaining & be bloodied.",
      action: powers.actionType.minor,
      additionalRows: (
        [*Effect*: The target loses a healing surge and can then spend one or two healing surges. The target also gains temporary hit points equal to half his or her healing surge value.],
      ),
      traits: "Healing",
    )

    #powers.power(
      title: "Stay Back",
      bonusTitle: "Nature | Level 2",
      description: "You sweep your torch or lantern around you to dazzle enemies accustomed to total darkness.",
      type: powers.powerType.encounter,
      range: [*Personal*],
      requirement: "You must be carrying a light source",
      action: powers.actionType.minor,
      additionalRows: (
        [*Effect*: Until the end of your next turn, enemies in the squares illuminated by the light source you are carrying take a -2 penalty to attack rolls.],
      ),
      traits: none,
    )
  ]
}

// Level 2 Out of Combat
#let wisdomLevel6Combat() = {
  return [
    #powers.power(
      title: "Physician's Care",
      bonusTitle: "Medicine | Level 6",
      description: "Your extensive training helps you get an ally back into the fight.",
      type: powers.powerType.encounter,
      traits: "Healing",
      range: "Melee 1",
      action: powers.actionType.standard,
      target: "You or one ally",
      additionalRows: (
        [*Effect*: The target can spend a healing surge.],
      ),
    );

    #powers.power(
      title: "Swift Recovery",
      bonusTitle: "Medicine | Level 6",
      description: "You address a companion's most critical wounds to get him or her back into the battle.",
      type: powers.powerType.encounter,
      range: "Melee 1",
      action: powers.actionType.minor,
      target: "One ally",
      additionalRows: (
        [*Effect*: The target can use his or her second wind without taking an action to do so.],
      ),
    );

    #powers.power(
      title: "Insightful Counter",
      bonusTitle: "Insight | Level 6",
      description: "You foresee your opponent's move and deny it the advantage.",
      type: powers.powerType.encounter,
      range: "Personal",
      action: powers.actionType.minor,
      additionalRows: (
        [*Effect*: You do not grant combat advantage until the end of your next turn.],
      ),
    );

    #powers.power(
      title: "Prescient Maneuver",
      bonusTitle: "Insight | Level 6",
      description: "Your enemy moves, and you match its steps with a countermove.",
      type: powers.powerType.encounter,
      range: "Personal",
      action: powers.actionType.immediateInterrupt,
      trigger: "An enemy within 5 squares of you moves willingly",
      additionalRows: (
        [*Effect*: You shift a number of squares equal to one-half your speed.],
      ),
    );

    #powers.power(
      title: "Natural Terrain Understanding",
      bonusTitle: "Nature | Level 6",
      description: "You alert your allies to hidden advantages in the nearby terrain, giving them an opportunity to shift the battle and defend themselves.",
      type: powers.powerType.encounter,
      range: "Close burst 3",
      action: powers.actionType.minor,
      target: "Each ally in the burst",
      additionalRows: (
        [*Effect*: The target gains a +2 power bonus to AC until the end of your next turn. In addition, the target can shift 2 squares as a free action.],
      ),
    );

    #powers.power(
      title: "Foil Ambush",
      bonusTitle: "Perception | Level 6",
      description: "Something out of place alerts you to imminent danger, letting you foil an enemy's ambush.",
      type: powers.powerType.daily,
      range: "Personal",
      action: powers.actionType.noAction,
      trigger: "You are surprised while conscious.",
      additionalRows: (
        [*Effect*: You are not surprised, and you are aware of the location of any enemy within 10 squares of you that is hidden. You then shift up to half your speed as a free action.],
      ),
    );

    // Move to Divine?
    #powers.power(
      title: "Censure the Unholy",
      bonusTitle: "Religion | Level 6",
      description: "Brandishing your holy symbol, you drive undead away and bolster your allies against them.",
      type: powers.powerType.encounter,
      traits: "Zone",
      range: "Close burst 1",
      action: powers.actionType.minor,
      requirement: "You must be wearing or holding a holy symbol.",
      additionalRows: (
        [*Effect*: The burst creates a zone that lasts until the end of your next turn. When you move, the zone moves with you, remaining centered on you. While within the zone, your allies gain a +2 power bonus to all defenses against undead creatures. If an undead creature ends its turn within the zone, you push it 1 square as a free action.],
      ),
    );

    // Move to Divine?
    #powers.power(
      title: "Deliverance of Faith",
      bonusTitle: "Religion | Level 6",
      description: "You give of yourself in the belief that somewhere, something will give a little back.",
      type: powers.powerType.encounter,
      range: "Personal",
      action: powers.actionType.minor,
      additionalRows: (
        [*Effect*: You spend a healing surge but regain no hit points. You gain temporary hit points equal to your healing surge value.],
      ),
    );

    #powers.power(
      title: "Theologian's Shield",
      bonusTitle: "Religion | Level 6",
      description: "Calling on lore culled from sacred texts, you know how to protect yourself from your enemy's attack.",
      type: powers.powerType.encounter,
      range: "Personal",
      action: powers.actionType.immediateInterrupt,
      trigger: "You are hit by a necrotic or a radiant attack",
      additionalRows: (
        [*Effect*: Until the end of your next turn, you gain necrotic resistance and radiant resistance equal to 5 + your Intelligence.],
      ),
    );
  ]
}

// Level 6 Out of Combat
#let wisdomLevel10Combat() = {
  return [
    #powers.power(
      title: "Time Out",
      bonusTitle: "Medicine | Level 10",
      description: "You grant your comrade a moment of respite.",
      type: powers.powerType.encounter,
      range: "Melee 1",
      action: powers.actionType.minor,
      target: "One ally",
      additionalRows: (
        [*Effect*: The target regains the use of second wind if he or she has already used it during this encounter.],
      ),
    );

    #powers.power(
      title: "Spot the Path",
      bonusTitle: "Nature | Level 10",
      description: "Having walked miles of broken trails, you know how to find the safest way through the most treacherous terrain.",
      type: powers.powerType.encounter,
      range: "Close burst 5",
      action: powers.actionType.minor,
      target: "You and each ally in the burst",
      additionalRows: (
        [*Effect*: Each target ignores difficult terrain until the end of your next turn.],
      ),
    );

    #powers.power(
      title: "Perfect Sight",
      bonusTitle: "Perception | Level 10",
      description: "Enemies might hide, but once you find a trace of them, there's no escaping you.",
      type: powers.powerType.encounter,
      range: "Personal",
      action: powers.actionType.minor,
      additionalRows: (
        [*Effect*: You gain blindsight 5 until the end of your next turn.],
      ),
    );

    #powers.power(
      title: "Assurance of Prophecy",
      bonusTitle: "Religion | Level 10",
      description: "You call out choice verses of prophecy. The knowledge that destiny is on your side renews your ally's vigor.",
      type: powers.powerType.encounter,
      range: "Close burst 5",
      action: powers.actionType.immediateReaction,
      trigger: "An ally within 5 squares of you spends a healing surge",
      additionalRows: (
        [*Effect*: The triggering ally gains 3d6 temporary hit points.],
      ),
    );

    #powers.power(
      title: "Conviction",
      bonusTitle: "Religion | Level 10",
      description: "You whisper a prayer for aid to overcome hardship.",
      type: powers.powerType.encounter,
      range: "Personal",
      action: powers.actionType.minor,
      additionalRows: (
        [*Effect*: You gain a +5 bonus to the next saving throw you make before the start of your next turn.],
      ),
    );

    #powers.power(
      title: "Recitation",
      bonusTitle: "Religion | Level 10",
      description: "You echo your allies' prayers to give them strength.",
      type: powers.powerType.daily,
      traits: "Zone",
      range: "Close burst 1",
      action: powers.actionType.minor,
      additionalRows: (
        [*Effect*: The burst creates a zone that lasts until the end of your next turn. When you move, the zone moves with you, remaining centered on you. While within the zone, your allies gain a +1 power bonus to attack rolls.],
        [*Sustain Minor*: The zone persists.],
      ),
    );
  ]
}

// Level 10 Out of Combat
