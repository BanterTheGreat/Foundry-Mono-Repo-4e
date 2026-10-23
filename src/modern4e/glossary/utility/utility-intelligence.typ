#import "../../helpers/powers.typ" as powers;

// Level 2 Combat
#let intelligenceLevel2Combat() = {
  return [
  ]
}

// Level 2 Out of Combat
#let intelligenceLevel6Combat() = {
  return [
    #powers.power(
      title: "Demonic Bargain",
      bonusTitle: "Arcana | Level 6",
      description: "You call on a demonic entity to wreak greater destruction, but you tear part of your own mind in the process.",
      type: powers.powerType.encounter,
      traits: "Arcane, Psychic",
      range: "Personal",
      action: powers.actionType.free,
      trigger: "You roll damage and dislike the result.",
      additionalRows: (
        [*Effect*: You reroll the damage and must use the second result. You then take psychic damage equal to twice your level.],
      ),
    );

    #powers.power(
      title: "Insightful Warning",
      bonusTitle: "Arcana | Level 6",
      description: "As your foe unleashes its attack, you realize that you have read about this sort of danger and shout a warning to your friends.",
      type: powers.powerType.encounter,
      range: "Personal",
      action: powers.actionType.immediateInterrupt,
      trigger: "A creature you can see makes an attack roll for an area or a close attack that includes you as a target",
      additionalRows: (
        [*Effect*: You and each ally included as a target of the triggering attack gain a +2 power bonus to all defenses against it.],
      ),
    );

    #powers.power(
      title: "Warp in the Weave",
      bonusTitle: "Arcana | Level 6",
      description: "You spend energy and tap into the web of magic that connects everything, ready to create a few temporary holes.",
      type: powers.powerType.encounter,
      range: "Personal",
      action: powers.actionType.immediateInterrupt,
      requirement: "You must have at least 1 healing surge.",
      trigger: "A creature uses a burst or blast power that includes you",
      additionalRows: (
        [*Effect*: You spend a healing surge but regain no hit points. The triggering burst or blast does not target you or your square.],
      ),
    );

    #powers.power(
      title: "Slow Pursuit",
      bonusTitle: "Society | Level 6",
      description: "You knock over obstacles, take difficult paths, drop rubbish, and do anything else you can think of to slow your enemies' pursuit.",
      type: powers.powerType.encounter,
      range: "Personal",
      action: powers.actionType.move,
      requirement: "You must be in an urban environment",
      additionalRows: (
        [*Effect*: You move your speed. At one point during the movement, you create an area of difficult terrain in a close blast 3. The difficult terrain lasts until the end of the encounter.],
      ),
    );
  ]
}

// Level 6 Out of Combat
#let intelligenceLevel10Combat() = {
  return [
    #powers.power(
      title: "Trap Sense",
      bonusTitle: "Thievery | Level 10",
      description: "As the trap springs, your experience in dealing with such hazards lets you step aside and leave a foe at the trap's mercy.",
      type: powers.powerType.encounter,
      range: "Personal",
      action: powers.actionType.immediateInterrupt,
      trigger: "A trap or a hazard makes a melee or a ranged attack roll against you",
      additionalRows: (
        [*Effect*: You gain a +4 power bonus to all defenses against the attack. If the attack misses you, the trap repeats the attack as a free action against an enemy adjacent to you.],
      ),
    );

    #powers.power(
      title: "Lessons of Society",
      bonusTitle: "Society | Level 10",
      description: "As you watch your allies, you draw upon past lessons to shout out a few pointers.",
      type: powers.powerType.daily,
      range: "Close burst 5",
      action: powers.actionType.minor,
      requirement: "You must have at least 1 healing surge.",
      target: "Each ally in the burst",
      additionalRows: (
        [*Effect*: You spend a healing surge but regain no hit points. Each target can regain one expended encounter utility power of level 10 or lower.],
      ),
    );

    #powers.power(
      title: "Tactician's Measure",
      bonusTitle: "Society | Level 10",
      description: "The enemies' movements are similar to those used in a skirmish you once studied. You use knowledge of it to outmaneuver a foe.",
      type: powers.powerType.encounter,
      range: "Melee 1",
      action: powers.actionType.immediateReaction,
      trigger: "An enemy enters a square adjacent to you or to an ally adjacent to you",
      target: "You or the ally",
      additionalRows: (
        [*Effect*: The target shifts 1 square and gains a +2 bonus to all defenses until the end of your next turn.],
      ),
    );

    #powers.power(
      title: "Navigate Crowds",
      bonusTitle: "Society | Level 10",
      description: "A life spent in the city trained you to maneuver through crowds.",
      type: powers.powerType.encounter,
      range: "Personal",
      action: powers.actionType.move,
      additionalRows: (
        [*Effect*: You shift your speed. During this movement, you can move through enemies' spaces.],
      ),
    );
  ]
}

// Level 10 Out of Combat
