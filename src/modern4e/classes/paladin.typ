#import "../helpers/theme.typ";
#import "../helpers/classes.typ" as classes;
#import "../helpers/powers.typ";

#let className = "Paladin";

#let paladinPage() = {
  return [
    #classes.bannerPage(
      className: className,
    );

    #classes.classOverview(
      className: className,
      reference: [
        #classes.proficiencies(
          armorProficiencies: (
            classes.armorProf.light,
            classes.armorProf.heavy,
            classes.armorProf.shields,
          ),
          weaponProficiencies: (
            classes.weaponProf.simpleMelee,
            classes.weaponProf.simpleRanged,
            classes.weaponProf.militaryMelee,
          ),
          implementProficiencies: (classes.implementProf.holySymbol),
        );

        #classes.defensesAndHealth(
          fortitude: 12,
          will: 12,
          reflex: 12,
          health: 26,
          healthOnLevelUp: 6,
          healingSurges: 10,
        )

        #classes.abilities(
          mainAbilities: ("Strength", "Charisma"),
          extraAbilities: "Wisdom",
          class: className,
        );
      ],
    )[
      = Divine Sanction
      Many Paladin powers and some other sources such as feats subject a target to your divine sanction. Being subject to your divine sanction means the target is marked by you for a duration specified in the description of the power or source. Unless otherwise noted, the mark ends before the specified duration if another effect marks the target.

      Until this mark ends, the target takes radiant damage equal to 3 + your Wisdom the first time each round it makes an attack that doesn't include you as a target. The damage increases to 6 + your Wisdom at 11th level and 9 + your Wisdom at 21st level.

      Divine Sanction is meant to complement Divine Challenge. You can use Divine Challenge to mark one sort of creature and use Divine Sanction to mark others. Divine Sanction has fewer restrictions than Divine Challenge so that you can easily use the two in concert. Using Divine Sanction to supplement Defender Aura is also possible, but more difficult.

      = Paladin's Fervor
      #theme.buildChoiceHeader()
      To resist a Paladin on the battlefield is to be overwhelmed by divine menace. You gain your choice of either the Divine Challenge power, or the Defender Aura and Righteous Radiance powers.

      #theme.choiceBlock(
        title: "Defender Aura & Righteous Radiance",
        body: [
          #powers.power(
            fill: theme.bgColor,
            title: "Defender Aura",
            type: powers.powerType.at-will,
            action: powers.actionType.minor,
            traits: "Aura",
            range: "Personal",
            additionalRows: (
              [*Effect:* You activate an aura 2 that lasts until you end it as a minor action or until you fall unconscious. While in the aura, any enemy takes a -2 penalty to attack rolls when it makes an attack that does not include either you or an ally who has this aura active. Marked enemies are not subject to this aura.

                *Level 11:* Aura 3. #linebreak();
                *Level 21:* Aura 5.
              ],
            ),
          );

          #powers.power(
            fill: theme.bgColor,
            title: "Righteous Radiance",
            description: "You exact divine punishment on any foe that ignores your presence.",
            type: powers.powerType.at-will,
            action: powers.actionType.opportunity,
            traits: "Divine, Radiant",
            range: "Personal",
            trigger: "An enemy subject to your defender aura either shifts or makes an attack that targets an ally of yours but not you or an ally who has an active defender aura.",
            target: "The triggering enemy",
            additionalRows: (
              [*Effect:* The target takes radiant damage equal to 3 + your *Strength*, plus extra radiant damage equal to your *Charisma* if the target is adjacent to you.

                *Level 11:* 6 + *Strength* radiant damage. #linebreak();
                *Level 21:* 9 + *Strength* radiant damage.
              ],
            ),
          )
        ],
      )
    ]

    #classes.classFeatures[

      #theme.choiceBlock(
        title: "Divine Challenge",
        body: [
          #powers.power(
            fill: theme.bgColor,
            title: "Divine Challenge",
            description: "You boldly confront a squadron of enemies, searing it with divine light if it ignores your challenge.",
            type: powers.powerType.at-will,
            action: powers.actionType.minor,
            traits: "Divine, Radiant",
            range: [*Close* blast 3 (4 at 11th level, 5 at 21st level)],
            target: "Each enemy in the blast.",
            additionalRows: (
              [*Effect:* You mark each target until you use this power again. The mark also ends at the end of your turn if you did not engage at least one of the targets—meaning you neither attacked a marked target during your turn nor ended your turn adjacent to any of them.

                Until the mark ends, each target takes radiant damage the first time each round it targets any of your allies with an attack that does not include you. The damage equals 3 + your *Charisma* radiant damage, and the first time each round you deal this damage, you also deal extra radiant damage equal to your *Strength*.

                Level 11: 6 + your *Charisma* radiant damage. #linebreak();
                Level 21: 9 + your *Charisma* radiant damage.],
            ),
          )
        ],
      )
      = Channel Divinity
      #theme.buildChoiceHeader(prompt: [Choose Two])
      Once per encounter you can invoke divine power, filling yourself with the might of your patron deity. You begin play with your choice of *two of four Paladin-specific Channel Divinity powers*: Divine Mettle, Divine Strength, Righteous Shield, and Smite the Condemned. At levels 5, 11, and 21, you
      gain an additional Channel Divinity power.

      Regardless of how many different uses for Channel Divinity you know, you can use only one such ability per encounter. Channel Divinity powers otherwise function like your regular class powers.

      #theme.choiceBlock(
        title: "Divine Mettle",
        body: [
          #powers.power(
            fill: theme.bgColor,
            title: "Divine Mettle",
            description: "Your unswerving faith in your deity empowers a nearby creature to resist a debilitating affliction.",
            type: powers.powerType.encounter,
            action: powers.actionType.minor,
            traits: "Channel Divinity, Divine",
            range: [*Close* burst 5 (10 at 11th level, 15 at 21st level)],
            target: "One ally in the burst",
            isSpecial: true,
            additionalRows: (
              [*Effect:* The target makes a saving throw with a power bonus equal to your *Charisma*.],
              [*Special:* You can use only one Channel Divinity power per encounter.],
            ),
          )
        ],
      )


      #theme.choiceBlock(
        title: "Divine Strength",
        body: [
          #powers.power(
            fill: theme.bgColor,
            title: "Divine Strength",
            description: "You petition your deity for the divine strength to lay low your enemies.",
            type: powers.powerType.encounter,
            action: powers.actionType.minor,
            traits: "Channel Divinity, Divine",
            range: "Personal",
            isSpecial: true,
            additionalRows: (
              [*Effect:* The next attack power you use this turn deals extra damage equal to your *Strength* plus half your level.],
              [*Special:* You can use only one Channel Divinity power per encounter.],
            ),
          )
        ],
      )


      #theme.choiceBlock(
        title: "Righteous Shield",
        body: [
          #powers.power(
            fill: theme.bgColor,
            title: "Righteous Shield",
            description: "You form golden energy around an ally, absorbing an attack against your friend and transferring the damage to yourself. As the magic fades, you become charged with righteous fury that fuels your attacks.",
            type: powers.powerType.encounter,
            action: powers.actionType.immediateInterrupt,
            traits: "Channel Divinity, Divine",
            range: [*Close* burst 3 (5 at 11th level, 10 at 21st level)],
            trigger: "An ally within the burst is damaged.",
            target: "The triggering ally in the burst",
            isSpecial: true,
            additionalRows: (
              [*Effect:* You take the damage instead of the target. This damage ignores your immunities and resistances. You gain a +2 power bonus to attack rolls until the end of your next turn.],
              [*Special:* You can use only one Channel Divinity power per encounter.],
            ),
          )
        ],
      )


      #theme.choiceBlock(
        title: "Smite the Condemned",
        body: [
          #powers.power(
            fill: theme.bgColor,
            title: "Smite the Condemned",
            description: "You scorch a profane foe with your weapon, driving it back and then binding it in place.",
            type: powers.powerType.encounter,
            action: powers.actionType.standard,
            traits: "Channel Divinity, Dogmatic, Divine, Radiant, Weapon",
            range: "Melee weapon",
            target: "One creature",
            offenseStat: "Strength or Charisma",
            defenseStat: powers.defense.will,
            isSpecial: true,
            additionalRows: (
              [*Hit:* 2[W] + Strength or Charisma radiant damage, and you push the target up to 2 squares. The target is immobilized until the end of your next turn.

                *Level 5:* One or two creatures. 3[W] + Strength or Charisma radiant damage, and you push the target up to 2 squares. The target is immobilized until the end of your next turn.

                *Level 9:* One or two creatures. 4[W] + Strength or Charisma radiant damage, and you push the target up to 2 squares. The target is immobilized (save ends).

                *Level 15:* One, two, or three creatures. 5[W] + Strength or Charisma radiant damage, and you push the target up to 3 squares. The target is immobilized (save ends).

                *Level 19:* One, two, or three creatures. 6[W] + Strength or Charisma radiant damage, and you push the target up to 3 squares. The target is restrained (save ends).

                *Level 25:* One, two, or three creatures. 7[W] + Strength or Charisma radiant damage, and you push the target up to 4 squares. The target is restrained and cannot teleport (save ends both).

                *Level 29:* One, two, or three creatures. 8[W] + Strength or Charisma radiant damage, and you push the target up to 4 squares. The target is restrained and cannot teleport (save ends both).],
              [*Miss:* Half damage.],
              [*Special:* You can use only one Channel Divinity power per encounter.],
            ),
          )
        ],
      )


      = Paladin's Grace
      #theme.buildChoiceHeader()
      Each Paladin can manifest an iconic miracle at the cost of their own life force, from healing the dying to summoning astral beasts. Choose Ardent Vow, Lay On Hands, or Virtue's Touch.

      #theme.choiceBlock(
        title: "Ardent Vow",
        body: [
          #powers.power(
            fill: theme.bgColor,
            title: "Ardent Vow",
            type: powers.powerType.at-will,
            action: powers.actionType.minor,
            traits: "Divine",
            range: "Close burst 5",
            isSpecial: true,
            target: "One creature",
            requirement: "You must have at least one healing surge remaining.",
            additionalRows: (
              [*Effect:* You willingly lose a healing surge, regaining no hit points. Until the end of the encounter, you deal extra damage to the target equal to your *Wisdom* plus half your level. Each time you attack the target, it is subject to your divine sanction until the end of your next turn.
              ],
              [*Special:* You can use this power a number of times per day equal to your *Wisdom* (minimum 1), but only once per round.],
            ),
          )
        ],
      )


      #theme.choiceBlock(
        title: "Lay On Hands",
        body: [
          #powers.power(
            fill: theme.bgColor,
            title: "Lay On Hands",
            description: "Your divine touch instantly heals wounds.",
            type: powers.powerType.at-will,
            action: powers.actionType.minor,
            traits: "Divine, Healing",
            range: "Melee touch",
            isSpecial: true,
            target: "One creature",
            requirement: "You must have at least one healing surge remaining.",
            additionalRows: (
              [*Effect:* You willingly lose a healing surge, regaining no hit points. The target regains hit points as if it had spent a healing surge.
              ],
              [*Special:* You can use this power a number of times per day equal to your *Wisdom* (minimum 1), but only once per round.],
            ),
          )
        ],
      )


      #theme.choiceBlock(
        title: "Virtue's Touch",
        body: [
          #powers.power(
            fill: theme.bgColor,
            title: "Virtue's Touch",
            description: "Your gentle touch removes affliction.",
            type: powers.powerType.at-will,
            action: powers.actionType.minor,
            traits: "Divine, Healing",
            range: "Melee touch",
            isSpecial: true,
            target: "One creature",
            requirement: "You must have at least one healing surge remaining.",
            additionalRows: (
              [*Effect:* You willingly lose a healing surge, regaining no hit points. You remove one condition from the target: blinded, dazed, deafened, slowed, stunned, or weakened.
              ],
              [*Special:* You can use this power a number of times per day equal to your *Wisdom* (minimum 1), but only once per round.],
            ),
          )
        ],
      )
    ]


    #pagebreak()

    = Powers
    You may choose 2 At-Will, 1 Encounter and 2 Daily #className Powers.

    #classes.powerLinks(className: className);

    #pagebreak();

    #align(center)[
      = Heroic #className Feats
    ]

    #columns(2)[
      #theme.featBlock(
        title: "Bloody Balance",
        content: [
          While you are adjacent to a bloodied ally, you gain a +2 bonus to damage rolls.
        ],
      );

      #theme.featBlock(
        title: "In Shining Armor",
        content: [
          While you are wearing plate armor and using a shield, adjacent allies gain a +1 shield bonus to AC if you are conscious.
        ],
      );

      #theme.featBlock(
        title: "Virtuous Recovery",
        content: [
          Whenever you spend a healing surge, you gain resistance to all damage equal to your Wisdom until the start of your next turn.
        ],
      );

      #theme.featBlock(
        title: "Divinity’s Shield",
        content: [
          When you use a channel divinity power, you gain a +2 bonus to Fortitude, Reflex, and Will defenses until the end of your next turn.
        ],
      );

      #theme.featBlock(
        title: "Mercy’s Reward",
        content: [
          When you score a critical hit, you can choose to reduce it to a normal hit instead. If you do, you or one ally adjacent to you can spend a healing surge and regain 10 additional hit points.
        ],
      );

      #theme.featBlock(
        title: "Bitter Challenge",
        requirements: "Divine Challenge",
        content: [
          Whenever a target takes damage from your divine challenge, it is also slowed until the end of your next turn.
        ],
      );

      #theme.featBlock(
        title: "Mighty Challenge",
        requirements: "Divine Challenge",
        content: [
          Whenever a target of your divine challenge takes damage from that power, it takes extra radiant damage equal to your Strength.
        ],
      );

      #colbreak();

      #theme.featBlock(
        title: "Mettle Proven",
        requirements: "Divine Mettle",
        content: [
          When an ally succeeds on a saving throw granted by your use of divine mettle, the ally can spend a healing surge.
        ],
      );

      #theme.featBlock(
        title: "Sudden Smite",
        requirements: "Divine Strength",
        content: [
          When you hit with an attack, you can use divine strength as a free action and apply its damage bonus to the triggering hit instead of your next attack.
        ],
      );

      #theme.featBlock(
        title: "Lend Health",
        requirements: "Lay on Hands",
        content: [
          Whenever you use a power that allows an ally to spend a healing surge or regain hit points as if he or she had spent a healing surge, that ally can use your healing surge value to determine the number of hit points regained.
        ],
      );

      #theme.featBlock(
        title: "Devoted Templar",
        requirements: "Lay on Hands",
        content: [
          When you use your lay on hands on an ally, that ally regains additional hit points equal to your Charisma.
          Your number of healing surges increases by one.
        ],
      );

      #theme.featBlock(
        title: "Healing Hands",
        requirements: "Lay on Hands",
        content: [
          When you use the lay on hands power, the affected ally gains additional hit points equal to your Charisma.
        ],
      );

    ]

    #pagebreak();

    #align(center)[
      = Paragon #className Feats (Level 11+)
    ]

    #columns(2)[
      // https://iws.mx/dnd/?view=feat3092 — Dragon Magazine 388.
      #theme.featBlock(
        title: "Angelic Protection",
        requirements: "11th level, lay on hands",
        content: [
          When you use lay on hands, you can instead grant the target temporary hit points equal to the number of hit points it would have regained.
        ],
      );

      // https://iws.mx/dnd/?view=feat2118 — Dragon Magazine 381, page(s) 93.
      #theme.featBlock(
        title: "Chosen Defender",
        requirements: "11th level",
        content: [
          Enemies adjacent to you take a -2 penalty to attack rolls on opportunity attacks against your allies.
        ],
      );

      // https://iws.mx/dnd/?view=feat1568 — Divine Power, page(s) 138.
      #theme.featBlock(
        title: "Contagious Challenge",
        requirements: "11th level, divine challenge",
        content: [
          When you hit an enemy marked by your divine challenge, you also subject one enemy adjacent to the target to your divine sanction. This divine sanction lasts until the start of your next turn.
        ],
      );

      // https://iws.mx/dnd/?view=feat1755 — Dragon Magazine 378.
      #theme.featBlock(
        title: "Forceful Challenge",
        requirements: "11th level, divine challenge",
        content: [
          When a creature takes damage from your divine challenge or divine sanction, you can slide that creature 1 square after the triggering attack is resolved.
        ],
      );

      // https://iws.mx/dnd/?view=feat3093 — Dragon Magazine 388.
      #theme.featBlock(
        title: "Fulfilled Vow",
        requirements: "11th level, ardent vow",
        content: [
          The first time in an encounter that you reduce an enemy marked by you to 0 or fewer hit points, you gain a +5 bonus to your next damage roll before the end of your next turn.
        ],
      );

      // https://iws.mx/dnd/?view=feat3094 — Dragon Magazine 388.
      #theme.featBlock(
        title: "Hero's Poise",
        requirements: "11th level",
        content: [
          When you succeed on a saving throw to end an effect, each ally that can see you within 5 squares of you gains a bonus to saving throws equal to your Charisma until the start of your next turn.
        ],
      );

      // https://iws.mx/dnd/?view=feat1578 — Divine Power, page(s) 139.
      #theme.featBlock(
        title: "Honored Foe",
        requirements: "11th level",
        content: [
          When a creature marked by your divine challenge or divine sanction damages you, you gain temporary hit points equal to your Wisdom.
        ],
      );

      // https://iws.mx/dnd/?view=feat3096 — Dragon Magazine 388.
      #theme.featBlock(
        title: "Just Punishment",
        requirements: "11th level",
        content: [
          When an enemy reduces an ally you can see to 0 or fewer hit points, you gain a +1 bonus to attack rolls against that enemy until that ally has 1 or more hit points or until the end of the encounter.
        ],
      );

      // https://iws.mx/dnd/?view=feat1583 — Divine Power, page(s) 140.
      #theme.featBlock(
        title: "Persistent Challenge",
        requirements: "11th level, 2 Charisma, divine challenge",
        content: [
          Once per encounter, if you fail to engage any target of your Divine Challenge on your turn, you can maintain the marks from that use of Divine Challenge as if you had engaged a target.
        ],
      );

      // https://iws.mx/dnd/?view=feat1587 — Divine Power, page(s) 140.
      #theme.featBlock(
        title: "Resurgent Attack",
        requirements: "11th level, 3 Strength",
        content: [
          When you spend a healing surge, you gain a +2 power bonus to the next attack roll you make before the end of your next turn.
        ],
      );

      // https://iws.mx/dnd/?view=feat1590 — Divine Power, page(s) 140.
      #theme.featBlock(
        title: "Touch of Salvation",
        requirements: "11th level, 2 Charisma, lay on hands or virtue's touch",
        content: [
          When you use your lay on hands or virtue’s touch on an ally, that ally can make a saving throw with a bonus equal to your Charisma.
        ],
      );

      // https://iws.mx/dnd/?view=feat1591 — Divine Power, page(s) 140.
      #theme.featBlock(
        title: "Untiring Virtue",
        requirements: "11th level",
        content: [
          Whenever you reach a milestone, you gain one additional use of your ardent vow, virtue’s touch, or lay on hands for today.
        ],
      );

      // https://iws.mx/dnd/?view=feat3097 — Dragon Magazine 388.
      #theme.featBlock(
        title: "Virtue's Chosen",
        requirements: "11th level, virtue's touch",
        content: [
          Your virtue's touch can also remove ongoing damage.
        ],
      );

      // https://iws.mx/dnd/?view=feat2121 — Dragon Magazine 381, page(s) 93.
      #theme.featBlock(
        title: "Warding Shield",
        requirements: "11th level",
        content: [
          When you are using a shield, allies adjacent to you gain a +2 shield bonus to Reflex.
        ],
      );

      // https://iws.mx/dnd/?view=feat3098 — Dragon Magazine 388.
      #theme.featBlock(
        title: "Wrathful Conviction",
        requirements: "11th level, divine strength",
        content: [
          The extra damage dealt by Divine Strength increases by your Charisma or Wisdom. This is in addition to its normal extra damage equal to your Strength plus half your level.
        ],
      );
    ]
  ]
}
