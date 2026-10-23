#import "../../helpers/powers.typ" as powers;

// Level 2
#let constitutionLevel2() = {
  return [
    #powers.power(
      title: "Endure Pain",
      bonusTitle: "Endurance | Level 2",
      description: "You grin and bear it, shrugging off the pain of a new wound.",
      type: powers.powerType.daily,
      range: [*Personal*],
      trigger: "You are hit by an attack",
      action: powers.actionType.immediateInterrupt,
      additionalRows: (
        [*Effect*: Until the end of your next turn, you gain resistance to all damage equal to 5 + your Constitution.],
      ),
      traits: none,
    )
    #powers.power(
      title: "Grit and Spittle",
      bonusTitle: "Endurance | Level 2",
      description: "Drawing on pure stubbornness, you're ready see your way through disaster.",
      type: powers.powerType.encounter,
      range: [*Personal*],
      requirement: "You must have at least 1 healing surge.",
      action: powers.actionType.minor,
      additionalRows: (
        [*Effect*: You spend a healing surge but regain no hit points. You make a saving throw against every effect on you that a save can end.],
      ),
      traits: none,
    )

    #powers.power(
      title: "Inspiring Fortitude",
      bonusTitle: "Endurance | Level 2",
      description: "Inspired by your resilience, your allies find the will to overcome challenges.",
      type: powers.powerType.daily,
      range: [*Close burst 5*],
      target: "Each ally in the burst",
      requirement: "Your second wind must be available for you to use",
      action: powers.actionType.standard,
      additionalRows: (
        [*Effect*: You use your second wind, and each target gains temporary hit points equal to 10 + your Constitution.],
      ),
      traits: none,
    )
  ]
}

// Level 6
#let constitutionLevel6() = {
  return [
    #powers.power(
      title: "Internal Reserves",
      bonusTitle: "Endurance | Level 6",
      description: "Summoning up reserves of strength, you make a desperate effort to prevail.",
      type: powers.powerType.daily,
      range: "Personal",
      action: powers.actionType.noAction,
      trigger: "You are required to roll a saving throw.",
      additionalRows: (
        [*Effect*: You make the saving throw with a +4 power bonus.],
      ),
    );

    #powers.power(
      title: "Third Wind",
      bonusTitle: "Endurance | Level 6",
      description: "You have almost endless reserves and can rebound from injuries that would bring down another.",
      type: powers.powerType.daily,
      traits: "Healing",
      range: "Personal",
      action: powers.actionType.minor,
      additionalRows: (
        [*Effect*: You spend a healing surge.],
        [*Special*: As a standard action, an adjacent ally can make a DC 10 Medicine check to allow you to use this power without spending an action yourself.],
      ),
    );

    #powers.power(
      title: "Walk It Off",
      bonusTitle: "Endurance | Level 6",
      description: "You take a deep breath to fight off a lingering wound.",
      type: powers.powerType.encounter,
      range: "Personal",
      action: powers.actionType.noAction,
      trigger: "Your turn starts and you have ongoing damage",
      additionalRows: (
        [*Effect*: Make a saving throw against the ongoing damage before you take the damage.],
      ),
    );
  ]
}

// Level 10
#let constitutionLevel10() = {
  return [
    #powers.power(
      title: "Reactive Surge",
      bonusTitle: "Endurance | Level 10",
      description: "The attack was well placed, but you choose not to let it affect you.",
      type: powers.powerType.encounter,
      traits: "Healing",
      range: "Personal",
      action: powers.actionType.immediateReaction,
      trigger: "An attack bloodies you",
      additionalRows: (
        [*Effect*: You spend a healing surge.],
      ),
    );
  ]
}
