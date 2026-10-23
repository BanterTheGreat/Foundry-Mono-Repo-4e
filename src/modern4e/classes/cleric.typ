#import "../helpers/theme.typ" as theme;

#import "../helpers/classes.typ" as classes;

#import "../helpers/powers.typ";

#let className = "Cleric";

#let clericPage() = {
  return [
    #classes.bannerPage(
      className: className,
    );

    #classes.classOverview(
      className: className,
      reference: [
        #classes.proficiencies(
          armorProficiencies: (classes.armorProf.light, classes.armorProf.chainmail),
          weaponProficiencies: (classes.weaponProf.simpleMelee, classes.weaponProf.simpleRanged),
          implementProficiencies: (classes.implementProf.holySymbol),
        );

        #classes.defensesAndHealth(
          fortitude: 11,
          will: 13,
          reflex: 11,
          health: 22,
          healthOnLevelUp: 5,
          healingSurges: 7,
        )

        #classes.abilities(
          mainAbilities: ("Strength", "Wisdom"),
          extraAbilities: ("Intelligence", "Charisma"),
          class: className,
        );
      ],
    )[

      = Lore
      #theme.buildChoiceHeader()
      Some Cleric's specialised in the text of renewal and soothing, while others specialised in conquest and warfare. Choose one of the options below.

      #theme.choiceBlock(
        title: "Healer’s Lore",
        body: [When you let a creature spend a healing surge to regain hit points with one of your cleric powers that has the healing keyword, add your *Wisdom* to the hit points the recipient regains.],
      )

       
      #theme.choiceBlock(
        title: "Battlepriest's Lore",
        body: [You gain a +2 shield bonus to AC, and you have proficiency with scale armor. In addition, whenever you use a cleric healing power to allow a target to spend a healing surge, that target gains a +2 bonus to attack rolls until the end of your turn.],
      )

      = Healing Word
      Using the healing word power, clerics can grant their comrades additional resilience with nothing more than a short prayer.

      #powers.power(
        title: "Healing Word",
        description: "You utter a soothing word that mends wounds of the body and spirit.",
        type: powers.powerType.encounter,
        action: powers.actionType.minor,
        traits: "Healing",
        target: "You or one ally in the burst",
        range: [*Close* burst 5],
        isSpecial: true,
        additionalRows: (
          text[*Effect*: The target can spend a healing surge and regain 1d6 additional hit points.

            *Level 6:* 2d6 additional hit points. #linebreak()
            *Level 11:* Close Burst 10 & 3d6 additional hit points. #linebreak()
            *Level 16:* Close Burst 10 & 4d6 additional hit points. #linebreak()
            *Level 21:* Close Burst 15 & 5d6 additional hit points. #linebreak()
            *Level 26:* Close Burst 15 & 6d6 additional hit points.
          ],
          text[*Special:* You can use this power twice per encounter, but only once per round. At 16th level, you can use this power three times per round.],
        ),
      );

      = Channel Divinity
      Once per encounter you can invoke divine power, filling yourself with the strength of your patron deity. With the divine strength you invoke you can wield special powers. You can also learn other uses for this feature; for instance, the divinity feats grant characters with access to the Channel Divinity class feature the ability to use additional special powers.
      *Regardless of how many different uses for Channel Divinity you know, you can use only one such ability per encounter.* The special ability or power you invoke works just like your other powers. You gain the Favor of the Gods Channel Divinity power.

      #powers.power(
        title: "Favor of the Gods",
        description: "When luck runs against you, you beseech the gods for aid to turn chance in your favor.",
        type: powers.powerType.encounter,
        action: powers.actionType.minor,
        traits: "Channel Divinity, Divine",
        target: "One creature in the burst",
        range: [*Close* burst 3],
        additionalRows: (
          text[*Effect*: The next time the target misses with an attack roll before the end of your next turn, it can reroll that attack roll. It must use the new result, even if it is lower.],
        ),
      );
    ]

    #classes.classFeatures[
      #theme.buildChoiceHeader()
      Additionally, choose one of the Channel Divinity powers below:

      #theme.choiceBlock(
        title: "Punish the Profane",
        body: [
          #powers.power(
            fill: theme.bgColor,
            title: "Punish the Profane",
            description: "You channel divine energy into your weapon, causing it to release a burst of radiance when you strike an undead foe.",
            type: powers.powerType.encounter,
            action: powers.actionType.standard,
            traits: "Channel Divinity, Divine, Radiant, Weapon",
            target: "One undead creature",
            range: "Melee weapon",
            offenseStat: powers.offense.strength,
            defenseStat: powers.defense.ac,
            additionalRows: (
              [*Hit*: 2[W] + Strength radiant damage, and the target is immobilized until the end of your next turn.

                *Level 11:* 3[W] damage.
                *Level 21:* 4[W] damage.
              ],
              [*Effect*: Make the secondary attack.],
              [*Channel Divinity*: You can use only one channel divinity power per encounter],
            ),
          )

          #powers.power(
            fill: theme.bgColor,
            title: "Punish the Profane Secondary Attack",
            type: powers.powerType.encounter,
            action: powers.actionType.noAction,
            traits: "",
            range: [*Close* burst 3],
            target: "Each undead enemy in the burst other than the primary target",
            offenseStat: powers.offense.strength,
            defenseStat: powers.defense.will,
            additionalRows: (
              text[*Hit*: Charisma radiant damage. In addition, you push the secondary target a number of squares up to 3 + your Charisma],
            ),
            isSpecial: true,
          )
        ],
      )
       
      #theme.choiceBlock(
        title: "Turn undead",
        body: [
          #powers.power(
            fill: theme.bgColor,
            title: "Turn Undead",
            description: "You sear undead foes, push them back, and root them in place.",
            type: powers.powerType.encounter,
            action: powers.actionType.standard,
            traits: "Channel Divinity, Divine, Implement, Radiant",
            target: "Each undead creature in burst",
            range: [*Close* burst 2 (3 at 11th level, 5 at 21st level)],
            offenseStat: powers.offense.wisdom,
            defenseStat: powers.defense.will,
            additionalRows: (
              text[*Hit*: 1d10 + Wisdom radiant damage, and you push the target a number of squares up to 3 + your Charisma. The target is immobilized until the end of your next turn.

                *Level 11:* 2d10 + Wisdom radiant damage. #linebreak()
                *Level 21:* 3d10 + Wisdom radiant damage.
              ],
              text[*Channel Divinity*: You can use only one channel divinity power per encounter],
            ),
          )
        ],
      )

       
      #theme.choiceBlock(
        title: "Healer's Mercy",
        body: [
          #powers.power(
            fill: theme.bgColor,
            title: "Healer's Mercy",
            description: "Strength flows out from you to your injured comrades, rekindling their resolve to see the battle to its end.",
            type: powers.powerType.encounter,
            action: powers.actionType.standard,
            traits: "Channel Divinity, Divine, Healing",
            target: "Each bloodied ally in the burst",
            range: [*Close* burst 5],
            additionalRows: (
              text[*Effect*: Each target can spend a healing surge. You are weakened until the end of your next turn.],
              text[*Channel Divinity*: You can use only one channel divinity power per encounter],
            ),
          );
        ],
      )

      = Divine Technique
      You may choose a level 1 or 2 Divine Technique, you master it.

      = Powers
      You may choose 2 At-Will, 1 Encounter and 2 Daily #className Powers.


    ]

    #set page(columns: 1)
      #classes.powerLinks(className: className);

    #pagebreak();

    #align(center)[
      = Heroic #className Feats
    ]

    #columns(2)[
      #theme.featBlock(
        title: "Battlepriest's Armanents",
        requirements: "3 Strength",
        content: [
          You gain proficiency with light shields and with one military weapon of your choice.
        ],
      );

      #theme.featBlock(
        title: "Battle Healer",
        content: [
          When you use your healing word, you regain hit points equal to your Strength.
        ],
      );

      #theme.featBlock(
        title: "Defensive Grace",
        requirements: "Healer's Mercy",
        content: [
          When you use your healer’s mercy, you gain a power bonus equal to your Charisma to all defenses until the end of your next turn.
        ],
      );

      #theme.featBlock(
        title: "Defensive Healing Word",
        content: [
          When you use your healing word, the target also gains a power bonus to all defenses equal to your Charisma against the next attack made against him or her before the end of your next turn.
        ],
      );

      #theme.featBlock(
        title: "Shielding Word",
        content: [
          Targets of your healing word class feature also gain a +2 bonus to all defenses until the start of your next turn.
        ],
      );

      #theme.featBlock(
        title: "Sturdy Faith",
        content: [
          When you use your healing word on an ally, you gain temporary hit points equal to your Constitution.
        ],
      );

      #theme.featBlock(
        title: "Greater Turning",
        requirements: "Turn Undead",
        content: [
          Whenever you miss a target when using turn undead, the target is pushed a number of squares equal to your Charisma. The target takes no damage and is not immobilized.
        ],
      );

      #theme.featBlock(
        title: "Harbinger of Rebirth",
        content: [
          Any ally within 5 squares of you gains a +5 feat bonus to death saving throws.
        ],
      );

      #theme.featBlock(
        title: "Healer's Implement",
        content: [
          When you let a creature spend a healing surge to regain hit points with any of your cleric healing powers, add your holy symbol's enhancement bonus to the hit points the recipient regains.
        ],
      );

      #colbreak();
      #theme.featBlock(
        title: "Templar's Domain",
        requirements: "Healer's Lore",
        content: [
          Choose a divine domain that has a 1st level domain feature associated with it, such as the storm or the sun domain of the warpriest. You lose Healer's Lore and gain that 1st level domain feature. If the feature grants powers, you don't gain them.
        ],
      );

      #theme.featBlock(
        title: "Word of Retaliation",
        content: [
          When you use healing word, the target regains extra hit points equal to the number of enemies adjacent to him or her.
        ],
      );

      #theme.featBlock(
        title: "Pacifist Healer",
        content: [
          When you use healing word or a divine power that allows a target to spend a healing surge, the target regains additional hit points equal to 1d6 + your Charisma. Whenever you use said power, until the end of your next turn if you deal damage to a bloodied enemy, you become Dazed.

          The additional hit points increase to 2d6 + your Charisma at 11th level, and to 3d6 + your Charisma at 21st level.
        ],
      );

      #theme.featBlock(
        title: "Pacifist's Reward",
        content: [
          When you hit with an attack that doesn't deal damage, if you didn't deal any damage on your turn, gain 2 temporary hit points at the end of the turn. The temporary hit points increase to 3 at 11th level, and to 4 at 21st level.
        ],
      );
    ]

    #pagebreak();

    #align(center)[
      = Paragon #className Feats (Level 11+)
    ]

    #columns(2)[
      // https://iws.mx/dnd/?view=feat1967 — Dragon Magazine 379, page(s) 56.
      #theme.featBlock(
        title: "Assured Healing",
        requirements: "11th level",
        content: [
          When you miss with a divine attack power with the healing keyword, and that power has no effect on a miss, you or one ally within 5 squares of you regains hit points equal to your Charisma.
        ],
      );

      // https://iws.mx/dnd/?view=feat1093 — Dragon Magazine 371, page(s) 8.
      #theme.featBlock(
        title: "Dazing Rebuke",
        requirements: "11th level, turn undead",
        content: [
          Whenever you hit an undead creature with your turn undead class feature, you can choose to make the target dazed instead of immobilized.
        ],
      );

      // https://iws.mx/dnd/?view=feat1571 — Divine Power, page(s) 138.
      #theme.featBlock(
        title: "Divine Cleansing",
        requirements: "11th level, turn undead",
        content: [
          When you deal damage to at least one undead enemy with your turn undead, each ally in the power's burst can make a saving throw.
        ],
      );

      // https://iws.mx/dnd/?view=feat1573 — Divine Power, page(s) 138.
      #theme.featBlock(
        title: "Extended Healing",
        requirements: "11th level",
        content: [
          The burst of your healing word increases by 5.
        ],
      );

      // https://iws.mx/dnd/?view=feat1968 — Dragon Magazine 379, page(s) 56.
      #theme.featBlock(
        title: "Gambler's Word",
        requirements: "11th level",
        content: [
          Once per encounter, when you score a critical hit, you gain an additional use of your healing word power during this encounter.
        ],
      );

      // https://iws.mx/dnd/?view=feat1582 — Divine Power, page(s) 140.
      #theme.featBlock(
        title: "Merciful Power",
        requirements: "11th level, healer's mercy",
        content: [
          Each target of your healer's mercy can make a saving throw.
        ],
      );

      // https://iws.mx/dnd/?view=feat1757 — Dragon Magazine 378.
      #theme.featBlock(
        title: "Merciful Shift",
        requirements: "11th level, healer's mercy",
        content: [
          Each target of your healer's mercy power can shift 1 square as a free action.
        ],
      );

      // https://iws.mx/dnd/?view=feat1586 — Divine Power, page(s) 140.
      #theme.featBlock(
        title: "Radiant Vessel",
        requirements: "11th level",
        content: [
          If you hit an enemy with a cleric attack power that has the radiant keyword, the next time you use healing word before the end of your next turn the target regains 2d6 additional hit points.
        ],
      );

      // https://iws.mx/dnd/?view=feat1589 — Divine Power, page(s) 140.
      #theme.featBlock(
        title: "Swift Turning",
        requirements: "11th level, turn undead",
        content: [
          You can use your turn undead as a minor action instead of a standard action.
        ],
      );

      // https://iws.mx/dnd/?view=feat1096 — Dragon Magazine 371, page(s) 9.
      #theme.featBlock(
        title: "Undead Ward",
        requirements: "11th level, turn undead",
        content: [
          Your turn undead class feature gains the zone keyword. Whenever you use this power, the burst creates a zone that lasts until the end of your next turn. Any undead creature that enters or starts its turn within the zone takes 1d6 + Wisdom radiant damage. A creature can take this damage only once per turn.
        ],
      );

      // https://iws.mx/dnd/?view=feat2121 — Dragon Magazine 381, page(s) 93.
      #theme.featBlock(
        title: "Warding Shield",
        requirements: "11th level, proficiency with light or heavy shields",
        content: [
          When you are using a shield, allies adjacent to you gain a +2 shield bonus to Reflex.
        ],
      );
    ]
  ]
}
