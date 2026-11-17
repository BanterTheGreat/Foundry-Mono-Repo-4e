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
      #theme.featBlocksFromJson("../content/feats/heroic/cleric.json", start: 0, end: 9);

      #colbreak();
      #theme.featBlocksFromJson("../content/feats/heroic/cleric.json", start: 9, end: 13);
    ]

    #pagebreak();

    #align(center)[
      = Paragon #className Feats (Level 11+)
    ]

    #columns(2)[
      #theme.featBlocksFromJson("../content/feats/paragon/cleric.json");
    ]
  ]
}
