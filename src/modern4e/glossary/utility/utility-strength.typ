#import "../../helpers/powers.typ" as powers;

// Level 2 Combat
#let strengthLevel2Combat() = {
  return [
  ]
}

// Level 2 Out of Combat
#let strengthLevel6Combat() = {
  return [
    #powers.power(
      title: "Crushing Escape",
      bonusTitle: "Athletics | Level 6",
      description: "You smash free from your enemy's grasp, sending it reeling and making it susceptible to your next attack.",
      type: powers.powerType.encounter,
      range: "Personal",
      action: powers.actionType.free,
      trigger: "You make an escape attempt using Athletics.",
      additionalRows: (
        [*Effect*: You gain a power bonus to your Athletics check equal to your Strength. If you escape and a creature was grabbing you, that creature gains vulnerable 5 to your attacks until the end of your next turn.],
      ),
    );

    #powers.power(
      title: "Mighty Sprint",
      bonusTitle: "Athletics | Level 6",
      description: "Your throw yourself forward at a breakneck pace, bounding over obstacles.",
      type: powers.powerType.encounter,
      range: "Personal",
      action: powers.actionType.move,
      additionalRows: (
        [*Effect*: You move your speed + 4. During this movement, you ignore difficult terrain and gain a +5 power bonus to Athletics checks you make as part of the move.],
      ),
    );

    #powers.power(
      title: "Sudden Leap",
      bonusTitle: "Athletics | Level 6",
      description: "You spring around your enemy too quickly for it to strike you.",
      type: powers.powerType.encounter,
      range: "Melee 1",
      action: powers.actionType.move,
      target: "One creature",
      additionalRows: (
        [*Effect*: You make a Athletics check against a DC determined by the target's size: 15 (Medium or smaller), 20 (Large), 25 (Huge), or 30 (Gargantuan). If the check succeeds, you jump to another square adjacent to the target, without provoking an opportunity attack from it.],
      ),
    );
  ]
}

// Level 6 Out of Combat
#let strengthLevel10Combat() = {
  return [
    #powers.power(
      title: "Incredible Stride",
      bonusTitle: "Athletics | Level 10",
      description: "You move with amazing swiftness.",
      type: powers.powerType.daily,
      traits: "Stance",
      range: "Personal",
      action: powers.actionType.minor,
      additionalRows: (
        [*Effect*: Until the stance ends, you gain a +4 power bonus to speed.],
      ),
    );
  ]
}

// Level 10 Out of Combat
