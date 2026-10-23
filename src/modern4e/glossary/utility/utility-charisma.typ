#import "../../helpers/powers.typ" as powers;

#let charismaLevel2NonCombat() = {
  return [
    #powers.power(
      title: "Charming Rapscallion",
      bonusTitle: "Diplomacy | Level 2",
      description: "You've charmed your way past more marks than you can count, turning wary strangers into fast friends with little more than a grin and a good story.",
      type: powers.powerType.encounter,
      traits: "Non-Combat, Social, Deception",
      action: powers.actionType.minor,
      range: "Personal",
      additionalRows: (
        [*Prerequisite*: You must be proficient in Diplomacy.],
        [*Effect*: Until the end of your next turn, gain a +1 bonus to your next Bluff or Diplomacy check to persuade, sell something, or increase the impression or favorability someone has of you. If this is the first time you've met this NPC ever, the bonus increases to a +3. If you have ever done a negative action against this creature (tricked, swindled, cheated, stolen from, attacked, etc.) and they recognize you, then you cannot use this power on them.],
      ),
    )
  ]
}

// Level 2 Combat
#let charismaLevel2Combat() = {
  return [
    #powers.power(
      title: "Ominous Threat",
      bonusTitle: "Intimidate | Level 2",
      description: "You draw your enemy's attention to rest squarely on you.",
      type: powers.powerType.encounter,
      range: [*Melee 1*],
      action: powers.actionType.free,
      trigger: "You hit an enemy with a melee attack",
      target: "The enemy you hit",
      additionalRows: (
        [*Effect*: You mark the target until the end of your next turn. In addition, one ally marked by the target is no longer marked.],
      ),
      traits: none,
    )

    #powers.power(
      title: "Soothing Words",
      bonusTitle: "Diplomacy | Level 2",
      description: "The battle done, your allies turn to you for words of encouragement and support.",
      type: powers.powerType.daily,
      range: [*Close burst 5*],
      target: "Each ally who can hear you in the burst",
      requirement: "You must be taking a short rest",
      action: powers.actionType.standard,
      additionalRows: (
        [*Effect*: When each target spends one or more healing surges at the end of the short rest, he or she regains additional hit points equal to your Charisma.],
      ),
      traits: none,
    )
  ]
}

#let charismaLevel6Combat() = {
  return [
    #powers.power(
      title: "Confusing Blather",
      bonusTitle: "Bluff | Level 6",
      description: "You spew a stream of nonsense, leaving your enemies puzzled.",
      type: powers.powerType.encounter,
      range: "Close burst 1",
      action: powers.actionType.minor,
      target: "Each enemy in the burst",
      additionalRows: (
        [*Effect*: You make a Bluff check opposed by each target's passive Insight check. If the check succeeds against a target, that target cannot make opportunity attacks against you until the end of your next turn.],
      ),
    );

    #powers.power(
      title: "Stirring Speech",
      bonusTitle: "Diplomacy | Level 6",
      description: "Reciting your allies' great deeds and talents, you fill them with the confidence they need to win a battle ahead.",
      type: powers.powerType.daily,
      range: "Close burst 5",
      action: powers.actionType.standard,
      requirement: "You must be taking a short rest.",
      target: "Each ally who can hear you in the burst",
      additionalRows: (
        [*Effect*: Until the end of the next encounter, each target gains a +1 bonus to attack rolls and saving throws while not bloodied.],
      ),
    );

    #powers.power(
      title: "Demoralize Foe",
      bonusTitle: "Intimidate | Level 6",
      description: "You spit an ugly threat at your adversary, making it think twice before it attacks you.",
      type: powers.powerType.encounter,
      traits: "Fear",
      range: "Melee 1",
      action: powers.actionType.free,
      trigger: "You hit an enemy with a melee attack",
      target: "The enemy you hit",
      additionalRows: (
        [*Effect*: The target takes a –2 penalty to attack rolls against you until the end of your next turn.],
      ),
    );

    #powers.power(
      title: "Everybody Move",
      bonusTitle: "Intimidate | Level 6",
      description: "You inspire terror in your enemies.",
      type: powers.powerType.encounter,
      traits: "Fear",
      range: "Close blast 3",
      action: powers.actionType.minor,
      target: "Each enemy in the blast",
      additionalRows: (
        [*Effect*: You push each target 1 square, but not into hindering terrain.],
      ),
    );
  ]
}

#let charismaLevel10Combat() = {
  return [
    #powers.power(
      title: "Stall Tactics",
      bonusTitle: "Bluff | Level 10",
      description: "Your fast talking causes your enemies to hesitate for a crucial moment.",
      type: powers.powerType.daily,
      range: "Ranged sight",
      action: powers.actionType.free,
      trigger: "You roll initiative",
      target: "Each enemy you can see",
      additionalRows: (
        [*Effect*: Each target's initiative is reduced by 10.],
      ),
    );

    #powers.power(
      title: "Befriend",
      bonusTitle: "Diplomacy | Level 10",
      description: "You know the right things to say to make people like you.",
      type: powers.powerType.encounter,
      range: "Ranged 5",
      action: powers.actionType.minor,
      target: "One nonhostile creature",
      requirement: "The target must have -3 Intelligence or higher",
      additionalRows: (
        [*Effect*: Until the end of the encounter, you gain a +5 power bonus to Bluff checks and Diplomacy checks against the target.],
      ),
    );

    #powers.power(
      title: "Cry for Mercy",
      bonusTitle: "Diplomacy | Level 10",
      description: "With pleading words and gestures, you discourage your enemies from striking down the wounded.",
      type: powers.powerType.encounter,
      range: "Close burst 5",
      action: powers.actionType.minor,
      target: "You or one ally in the burst",
      requirement: "The target must be bloodied",
      additionalRows: (
        [*Effect*: Until the end of your next turn or until the target is no longer bloodied, the target's movement does not provoke opportunity attacks, and the target gains a +4 power bonus to all defenses.],
      ),
    );

    #powers.power(
      title: "Noble Sacrifice",
      bonusTitle: "Diplomacy | Level 10",
      description: "You demand that an enemy face you to distract it from your wounded friend, who is inspired by your sacrifice.",
      type: powers.powerType.encounter,
      traits: "Charm",
      range: "Close burst 3",
      action: powers.actionType.immediateInterrupt,
      trigger: "An enemy within 3 squares of you makes a melee attack roll against your bloodied ally adjacent to you",
      target: "The triggering enemy",
      additionalRows: (
        [*Effect*: The target's attack roll is against you instead of the bloodied ally. If the attack hits you, the ally gains temporary hit points equal to your Charisma.],
      ),
    );

    #powers.power(
      title: "Snap Out of It",
      bonusTitle: "Intimidate | Level 10",
      description: "A smack across the face brings your ally back to his or her senses.",
      type: powers.powerType.encounter,
      range: "Melee touch",
      action: powers.actionType.minor,
      target: "One ally",
      requirement: "The target must be under a dazing, dominating, or stunning effect that a save can end.",
      additionalRows: (
        [*Effect*: The target makes a saving throw against the effect.],
      ),
    );
  ]
}
