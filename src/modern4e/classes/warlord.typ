#import "../helpers/theme.typ";
#import "../helpers/classes.typ" as classes;
#import "../helpers/powers.typ";

#let className = "Warlord";

#let warlordPage() = {
  return [
    #classes.bannerPage(
      className: className,
    );

    #classes.classOverview(
      className: className,
      reference: [
        #classes.proficiencies(
          armorProficiencies: (classes.armorProf.light),
          weaponProficiencies: (
            classes.weaponProf.simpleMelee,
            classes.weaponProf.militaryMelee,
            classes.weaponProf.simpleRanged,
          ),
          implementProficiencies: (),
        );

        #classes.defensesAndHealth(
          fortitude: 12,
          will: 11,
          reflex: 12,
          health: 22,
          healthOnLevelUp: 5,
          healingSurges: 7,
        )

        #classes.abilities(
          mainAbilities: "Strength",
          extraAbilities: ("Intelligence", "Charisma"),
          class: className,
        );
      ],
    )[
      = Inspiring Word
      Using the inspiring word power, warlords can grant their comrades additional resilience with nothing more than a shout of encouragement.

      #powers.power(
        title: "Inspiring Word",
        type: powers.powerType.encounter,
        description: [You call out to a wounded ally and offer inspiring words of courage and determination that invigorates your comrade.],
        action: powers.actionType.minor,
        range: [*Close* burst 5],
        target: [You or one ally in the burst],
        traits: "Healing",
        additionalRows: (
          [*Effect:* The target can spend a healing surge and regain 1d6 additional hit points. #linebreak()

            *Level 6:* 2d6 additional hit points. #linebreak()
            *Level 11:* Close Burst 10 & 3d6 additional hit points. #linebreak()
            *Level 16:* Close Burst 10 & 4d6 additional hit points. #linebreak()
            *Level 21:* Close Burst 15 & 5d6 additional hit points. #linebreak()
            *Level 26:* Close Burst 15 & 6d6 additional hit points.],
          [*Special:* You can use this power twice per encounter, but only once per round. At 16th level, you can use this power three times per encounter.],
        ),
        isSpecial: true,
      );

      = Tactical Path
      #theme.buildChoiceHeader()
      The Warlord's path was decided long ago: either mastering precise volleys to command from afar or forging ahead to lead the charge with fearless resolve. Choose one of the options below:

      #theme.choiceBlock(title: "From The Back", body: [You gain proficiency with military ranged weapons.])


      #theme.choiceBlock(title: "Leading the Charge", body: [You gain proficiency with Chainmail and Light Shields.])



      = Leadership Style
      #theme.buildChoiceHeader()
      Every Warlord has his own brand of leadership, choose one of the options below:

      #theme.choiceBlock(
        title: "Battlefront Leader",
        body: [
          You gain proficiency with heavy shields, and you gain the battlefront shift power.

          #powers.power(
            fill: theme.bgColor,
            title: "Battlefront Shift",
            type: powers.powerType.encounter,
            description: [As combat breaks out, you position yourself at the forefront of the battle, rallying your allies to advance with you.],
            action: powers.actionType.noAction,
            range: [*Close* burst 3],
            target: [You or one ally in the burst],
            traits: "Martial",
            trigger: [You roll initiative],
            additionalRows: ([*Effect:* The target shifts half his or her speed.],),
          )
        ],
      )


      #theme.choiceBlock(
        title: "Combat Leader",
        body: [You and each ally within 10 squares who can see and hear you gain a +2 power bonus to initiative.],
      )
    ]

    #classes.classFeatures[
      = Commanding Presence
      #theme.buildChoiceHeader()
      Choose one of the following presence benefits below.
      #theme.choiceBlock(
        title: "Bravura Presence",
        body: [When an ally who can see you spends an action point to take an extra action and uses the action to make an attack, the ally can choose to take advantage of this feature before the attack roll. If the ally chooses to do so and the attack hits, the ally can either make a basic attack or take a move action after the attack as a free action. If the attack misses, the ally grants combat advantage to all enemies until the end of his or her next turn.],
      )


      #theme.choiceBlock(
        title: "Insightful Presence",
        body: [When any ally who can see you spends an action point to take an extra action, that ally gains a bonus to all defenses equal to half your *Intelligence* or *Charisma* until the start of his or her next turn.],
      )


      #theme.choiceBlock(title: "Inspiring Presence", body: [
        When an ally who can see you spends an action point to take an extra action, that ally also regains hit points equal to one-half your level + your *Charisma*.

        If the ally can see multiple warlord allies who have this class feature, the ally regains hit points from only one of them (the ally's choice).
      ])

      #theme.choiceBlock(
        title: "Resourceful Presence",
        body: [When an ally who can see you spends an action point to take an extra action and uses the action to make an attack, that attack gains a bonus to damage equal to one-half your level + your *Intelligence*. If the attack hits no target, the ally gains temporary hit points equal to one-half your level + your *Charisma*.],
      )


      #theme.choiceBlock(
        title: "Skirmishing Presence",
        body: [When an ally who can see you spends an action point to make an attack, that ally can use a free action to shift a number of squares equal to your *Intelligence* or *Charisma* before or after the attack.],
      )


      #theme.choiceBlock(title: "Tactical Presence", body: [
        When an ally you can see spends an action point to make an attack, the ally gains a bonus to the first attack roll of that attack. The bonus equals half your *Intelligence*.

        If multiple warlord allies who have this class feature can see the ally, he or she gains the bonus from only one of them (the ally's choice).
      ])


      = Powers
      You may choose 2 At-Will, 1 Encounter and 2 Daily #className Powers.

    ]

    #pagebreak()

    #classes.powerLinks(className: className, skipPaths: true);

    #pagebreak()


    = #className Paragon Paths
    #classes.zeitgeistPathReference()


    #columns(2)[
      #theme.pathBlocksFromJson("../content/paths/warlord.json")
    ]

    #pagebreak()

    #align(center)[
      = Heroic #className Feats
    ]

    #columns(2)[
      #theme.featBlocksFromJson("../content/feats/heroic/warlord.json")
    ]

    #pagebreak()

    #align(center)[
      = Paragon #className Feats (Level 11+)
    ]

    #columns(2)[
      #theme.featBlocksFromJson("../content/feats/paragon/warlord.json")
    ]
  ]
}
