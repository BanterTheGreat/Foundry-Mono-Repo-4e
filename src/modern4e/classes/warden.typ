#import "../helpers/theme.typ";
#import "../helpers/classes.typ" as classes;
#import "../helpers/powers.typ";

#let className = "Warden";

#let wardenPage() = {
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
            classes.armorProf.shields,
          ),
          weaponProficiencies: (
            classes.weaponProf.simpleMelee,
            classes.weaponProf.simpleRanged,
            classes.weaponProf.militaryMelee,
          ),
          implementProficiencies: (),
        );

        #classes.defensesAndHealth(
          fortitude: 12,
          will: 12,
          reflex: 11,
          health: 27,
          healthOnLevelUp: 7,
          healingSurges: 9,
        )

        #classes.abilities(
          mainAbilities: "Strength",
          extraAbilities: ("Constitution", "Wisdom"),
          class: className,
        );
      ],
    )[

      = Font of Life
      At the start of your turn, you can make a saving throw against one effect that a save can end. On a save, the effect immediately ends, preventing it from affecting you on your current turn. If you fail the saving throw, you still make a saving throw against the effect at the end of your turn.

      = Nature's Wrath
      Once during each of your turns, you can mark each adjacent enemy as a free action. This mark lasts until the end of your next turn.
      In addition, you gain the warden’s fury and warden’s grasp powers. You can use these powers against enemies to prevent them from harming those you protect.

      #columns(2)[
        #powers.power(
          title: "Warden's Fury",
          description: "You lash out with nature's wrath at a foe that has attacked your ally and diminish its defenses.",
          type: powers.powerType.at-will,
          action: powers.actionType.immediateInterrupt,
          trigger: "An enemy marked by you makes an attack that does not include you as a target",
          traits: "Primal, Weapon",
          range: [*Melee* weapon],
          target: "The triggering enemy",
          offenseStat: "Strength",
          defenseStat: "Fortitude",
          additionalRows: (
            [
              *Hit:* 1[W] + Strength, and the target grants combat advantage to you and your allies until the end of your next turn.

              *Level 21:* 2[W] + Strength.
            ],
          ),
        );

        #colbreak();

        #powers.power(
          title: "Warden's Grasp",
          description: "Spectral vines clutch at a foe that has attacked your ally, impeding your enemy's movement.",
          type: powers.powerType.at-will,
          action: powers.actionType.immediateReaction,
          trigger: "An enemy marked by you that is within 5 squares of you makes an attack that does not include you as a target",
          traits: "Primal",
          range: [*Close* burst 5],
          target: "The triggering enemy in the burst",
          additionalRows: (
            [
              *Effect:* You slide the target 1 square. The target is slowed and cannot shift until the end of its turn.
            ],
          ),
        );
      ]

      = Guardian Might
      #theme.buildChoiceHeader()
      Wardens connect with the natural world in a variety of ways to augment their fighting abilities. Choose one of the following options:
      #theme.choiceBlock(title: "Earthstrength", body: [
        While you are not wearing heavy armor, you add your *Constitution* to your AC.
        In addition, when you use your second wind, you gain an additional bonus to AC equal to your *Constitution*. The bonus lasts until the end of your next turn.
      ])


      #theme.choiceBlock(title: "Wildblood", body: [
        While you are not wearing heavy armor, you add your *Wisdom* to your AC.
        In addition, when you use your second wind, each enemy marked by you takes an additional penalty to attack rolls for attacks that don't include you as a target. The penalty equals your *Wisdom* and lasts until the end of your next turn.
      ])


      #theme.choiceBlock(title: "Stormheart", body: [
        While you are not wearing heavy armor, you can add your *Constitution* to your AC.

        In addition, when you use your second wind, you slide each enemy marked by you and within 2 squares of you 1 square, and each enemy marked by you is slowed until the end of your next turn.
      ])

      #theme.choiceBlock(title: "Lifespirit", body: [
        While you are not wearing heavy armor, you add your *Wisdom* to your AC.

        In addition, when you use your second wind, an ally within 5 squares of you can spend a healing surge and make a saving throw.
      ])
    ]

    #classes.classFeatures[

      = Powers
      You may choose 2 At-Will, 1 Encounter and 2 Daily #className Powers.

      #classes.powerLinks(className: className);
    ]

    #set page(columns: 1)

    #align(center)[
      = Heroic #className Feats
    ]

    #columns(2)[
      #theme.featBlocksFromJson("../content/feats/heroic/warden.json", start: 0, end: 5);

      #colbreak();

      #theme.featBlocksFromJson("../content/feats/heroic/warden.json", start: 5, end: 10);
    ]

    #pagebreak();

    #align(center)[
      = Paragon #className Feats (Level 11+)
    ]

    #columns(2)[
      #theme.featBlocksFromJson("../content/feats/paragon/warden.json");
    ]
  ]
}
