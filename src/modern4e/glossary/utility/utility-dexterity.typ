#import "../../helpers/powers.typ" as powers;

// Level 2 Combat
#let dexterityLevel2Combat() = {
  return [
    #powers.power(
      title: "Agile Recovery",
      bonusTitle: "Acrobatics | Level 2",
      description: "With a quick leap, you are back on your feet and ready to act.",
      type: powers.powerType.at-will,
      range: [*Personal*],
      action: powers.actionType.minor,
      additionalRows: (
        [*Effect*: You stand up.],
      ),
      traits: none,
    )

    #powers.power(
      title: "Fast Hands",
      bonusTitle: "Thievery | Level 2",
      description: "Your fingers blur as you manipulate objects faster than the eye can follow.",
      type: powers.powerType.at-will,
      range: [*Personal*],
      action: powers.actionType.free,
      additionalRows: (
        [*Effect*: You draw or sheathe a weapon, pick up an item in your space or adjacent to it, or retrieve or stow an item
        ],
        [*Special*: You can use this power only once per round.],
      ),
      traits: none,
    )

    #powers.power(
      title: "Elude Senses",
      bonusTitle: "Stealth | Level 2",
      description: "You slip past the notice of creatures that have adapted to life underground.",
      type: powers.powerType.encounter,
      range: [*Personal*],
      action: powers.actionType.minor,
      additionalRows: (
        [*Effect*: Until the end of your next turn, creatures can't use darkvision, blindsight, or tremorsense to detect you. You can be detected with other senses as normal.],
      ),
      traits: none,
    )

    #powers.power(
      title: "Failed Diplomacy",
      bonusTitle: "Society | Level 2",
      description: "Negotiations are breaking down and will end in bloodshed. You realize this fact a split-second before your enemies do.",
      type: powers.powerType.daily,
      range: [*Close burst 5*],
      target: "You and each ally in the burst",
      action: powers.actionType.free,
      trigger: "You and your allies roll initiative and it is not a surprise round.",
      additionalRows: (
        [*Effect*: Each target gains a +2 power bonus to the initiative check. In addition, the target has combat advantage against all enemies until the end of his or her next turn.],
      ),
      traits: none,
    )
  ]
}

// Level 2 Out of Combat
#let dexterityLevel6Combat() = {
  return [
    #powers.power(
      title: "Dodge Step",
      bonusTitle: "Acrobatics | Level 6",
      description: "Relying on superior balance and agility, you move in the blink of an eye.",
      type: powers.powerType.encounter,
      range: "Personal",
      action: powers.actionType.immediateReaction,
      trigger: "An enemy ends its turn adjacent to you",
      additionalRows: (
        [*Effect*: You shift 1 square.],
      ),
    )

    #powers.power(
      title: "Graceful Maneuver",
      bonusTitle: "Acrobatics | Level 6",
      description: "You dodge past your enemies with speed and grace.",
      type: powers.powerType.encounter,
      range: "Personal",
      action: powers.actionType.move,
      additionalRows: (
        [*Effect*: You shift half your speed.],
      ),
    );

    #powers.power(
      title: "Timely Dodge",
      bonusTitle: "Acrobatics | Level 6",
      description: "Something out of the corner of your eye causes you to step out of the way of danger.",
      type: powers.powerType.encounter,
      range: "Personal",
      action: powers.actionType.immediateInterrupt,
      trigger: "An enemy targets you with an attack.",
      additionalRows: (
        [*Effect*: You shift up to half your speed. The triggering enemy can choose a new target for the attack if you are now out of range.],
      ),
    );

    #powers.power(
      title: "Tumbling Dodge",
      bonusTitle: "Acrobatics | Level 6",
      description: "You deftly tumble away from a strike.",
      type: powers.powerType.encounter,
      range: "Personal",
      action: powers.actionType.immediateInterrupt,
      trigger: "A melee attack hits you",
      additionalRows: (
        [*Effect*: You make an Acrobatics check and gain a bonus to all defenses against the triggering attack equal to the check result divided by 10. If the bonus causes the attack to miss, you shift 1 square.],
      ),
    );

    #powers.power(
      title: "Shrouding Gloom",
      bonusTitle: "Stealth | Level 6",
      description: "Using the environment agilely, you disappear from view.",
      type: powers.powerType.encounter,
      range: "Personal",
      action: powers.actionType.minor,
      requirement: "You must have cover or concealment.",
      additionalRows: (
        [*Effect*: You make a Stealth check.],
      ),
    );

    #powers.power(
      title: "Hasty Retreat",
      bonusTitle: "Thievery | Level 6",
      description: "It dawns on you as you botch the job that now might be a good time to make a swift exit.",
      type: powers.powerType.encounter,
      range: "Personal",
      action: powers.actionType.free,
      trigger: "Your Thievery check triggers a trap",
      additionalRows: (
        [*Effect*: You shift a number of squares equal to half your Dexterity.],
      ),
    );

    #powers.power(
      title: "Quick Switch",
      bonusTitle: "Thievery | Level 6",
      description: "You pull your friend closer and then slip away.",
      type: powers.powerType.encounter,
      range: "Melee 1",
      action: powers.actionType.move,
      target: "One ally",
      additionalRows: (
        [*Effect*: You slide the target 1 square into your space. You then shift 1 square.],
      ),
    );
  ]
}

// Level 6 Out of Combat
#let dexterityLevel10Combat() = {
  return [
    #powers.power(
      title: "Drop and Roll",
      bonusTitle: "Acrobatics | Level 10",
      description: "You fall off a ledge, but your training allows you to dash forward after landing safely.",
      type: powers.powerType.at-will,
      range: "Personal",
      action: powers.actionType.immediateReaction,
      trigger: "You fall and take no damage",
      additionalRows: (
        [*Effect*: You shift 3 squares.],
      ),
    );

    #powers.power(
      title: "Familiar Footing",
      bonusTitle: "Acrobatics | Level 10",
      description: "You are comfortable maneuvering around precarious terrain.",
      type: powers.powerType.daily,
      range: "Personal",
      action: powers.actionType.minor,
      additionalRows: (
        [*Effect*: You ignore difficult terrain until the end of the encounter.],
      ),
    );

    #powers.power(
      title: "Persistent Tail",
      bonusTitle: "Stealth | Level 10",
      description: "You follow your prey unseen, waiting for the best time to strike.",
      type: powers.powerType.at-will,
      range: "Close burst 20",
      action: powers.actionType.move,
      target: "One creature in the burst that you can see",
      requirement: "You must either have cover or concealment against the target",
      additionalRows: (
        [*Effect*: The first time the target moves before the start of your next turn, you can move your speed as an immediate reaction. If you end the movement with cover or concealment against the target, you can make a Stealth check to become hidden.],
      ),
    );

    #powers.power(
      title: "Disruptive Stunt",
      bonusTitle: "Thievery | Level 10",
      description: "With a flurry of taps, shoves, and nudges, you push past your foe, leaving it flustered.",
      type: powers.powerType.encounter,
      range: "Melee 1",
      action: powers.actionType.move,
      target: "One creature",
      additionalRows: (
        [*Effect*: You move your speed through the target's space to a square adjacent to it. This movement does not provoke an opportunity attack from the target. In addition, the target takes a –2 penalty to attack rolls until the start of your next turn.],
      ),
    );
  ]
}

// Level 10 Out of Combat
