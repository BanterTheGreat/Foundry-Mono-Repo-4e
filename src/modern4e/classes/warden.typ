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
      #theme.featBlock(
        title: "Courage of the Lone Stag",
        content: [
          When you mark three or more enemies with Nature's Wrath, you gain a +2 bonus to weapon damage rolls against creatures you mark until the start of your next turn. This bonus increases to +3 at 11th level, and to +4 at 21st level.
        ],
      );

      #theme.featBlock(
        title: "Crushing Earthstrength",
        content: [
          When you use your second wind, you gain a bonus to weapon damage rolls equal to your *Constitution* until the end of your next turn.
        ],
      );

      #theme.featBlock(
        title: "Dancing Leaves",
        content: [
          When you use warden's grasp, you can teleport up to 2 squares to a square closer to the target instead of sliding it.
        ],
      );

      #theme.featBlock(
        title: "Earthstrength Resilience",
        requirements: "Earthstrength",
        content: [
          When you use your second wind, you gain resist 2 to all damage until the end of your next turn. The resistance increases to 5 at 11th level and 8 at 21st level.
        ],
      );

      #theme.featBlock(
        title: "Lifespirit Constitution",
        requirements: "Lifespirit",
        content: [
          You can grant a saving throw to a second ally within 5 squares of you when you use your second wind.
        ],
      );

      #colbreak();

      #theme.featBlock(
        title: "Revitalizing Font of Life",
        content: [
          If you succeed on a saving throw granted by Font of Life, you gain a +2 bonus to all other saving throws during or at the end of your current turn.
        ],
      );

      #theme.featBlock(
        title: "Roiling Storm",
        requirements: "Stormheart",
        content: [
          When you use your second wind, you can shift a number of squares equal to your *Constitution* instead of sliding enemies marked by you.
        ],
      );

      #theme.featBlock(
        title: "Sudden Roots",
        content: [
          Whenever you hit an enemy with an opportunity attack, that enemy is slowed until the end of its turn.
        ],
      );

      #theme.featBlock(
        title: "Wildblood Fury",
        requirements: "Wildblood",
        content: [
          When you use your second wind, you gain a bonus to damage rolls against each enemy marked by you equal to your *Wisdom* until the end of your next turn.
        ],
      );

      #theme.featBlock(
        title: "Crushing Guardian",
        content: [
          You gain a +2 bonus to damage rolls while in guardian form. This bonus increases to +3 at 11th level, and to +4 at 21st level.
        ],
      );
    ]

    #pagebreak();

    #align(center)[
      = Paragon #className Feats (Level 11+)
    ]

    #columns(2)[
      // https://iws.mx/dnd/?view=feat1888 — Primal Power, page(s) 143.
      #theme.featBlock(
        title: "Arcing Throw",
        requirements: "11th level",
        content: [
          When you use a spear as a thrown weapon, the target doesn't gain cover from its allies.
        ],
      );

      // https://iws.mx/dnd/?view=feat1954 — Dragon Magazine 379, page(s) 45.
      #theme.featBlock(
        title: "Earth's Punishment",
        requirements: "11th level, Earthstrength",
        content: [
          When an adjacent enemy that is marked by you makes an attack that does not include you as a target, and hits and damages at least one of your allies, it takes damage equal to your Constitution.
        ],
      );

      // https://iws.mx/dnd/?view=feat1894 — Primal Power, page(s) 143.
      #theme.featBlock(
        title: "Earthstrength Defenses",
        requirements: "11th level, Earthstrength",
        content: [
          When you use your second wind, you gain a bonus to Fortitude, Reflex, and Will equal to your Constitution until the end of your next turn.
        ],
      );

      // https://iws.mx/dnd/?view=feat1039 — Player's Handbook 2, page(s) 190.
      #theme.featBlock(
        title: "Earthstrength Resolve",
        requirements: "11th level, Earthstrength",
        content: [
          When any enemy marked by you makes an attack that doesn't include you as a target, you gain temporary hit points equal to your Constitution.
        ],
      );

      // https://iws.mx/dnd/?view=feat582 — Player's Handbook 2, page(s) 190.
      #theme.featBlock(
        title: "Enhanced Font of Life",
        requirements: "11th level",
        content: [
          You gain a +1 bonus to saving throws granted by your Font of Life.
        ],
      );

      // https://iws.mx/dnd/?view=feat1955 — Dragon Magazine 379, page(s) 46.
      #theme.featBlock(
        title: "Font of Vengeance",
        requirements: "11th level",
        content: [
          When you save against ongoing damage at the start of your turn, if you are adjacent to and can make an opportunity attack against the creature that inflicted the ongoing damage, you deal damage to that creature equal to your Strength.
        ],
      );

      // https://iws.mx/dnd/?view=feat1897 — Primal Power, page(s) 144.
      #theme.featBlock(
        title: "Forceful Smash",
        requirements: "11th level",
        content: [
          Whenever you score a critical hit with a hammer or a mace, the target is knocked prone.
        ],
      );

      // https://iws.mx/dnd/?view=feat2560 — Dragon Magazine 383, page(s) 62.
      #theme.featBlock(
        title: "Gusting Rebuke",
        requirements: "11th level, Stormheart",
        content: [
          When an enemy adjacent to you that is marked by you hits and damages one of your allies with an attack that does not include you as a target, you can push the enemy a number of squares equal to your Constitution as an immediate reaction.
        ],
      );

      // https://iws.mx/dnd/?view=feat1898 — Primal Power, page(s) 144.
      #theme.featBlock(
        title: "Lifespirit Healing",
        requirements: "11th level, Lifespirit",
        content: [
          When you use your second wind, a second ally within 5 squares of you can spend a healing surge and make a saving throw.
        ],
      );

      // https://iws.mx/dnd/?view=feat1899 — Primal Power, page(s) 145.
      #theme.featBlock(
        title: "Maneuvering Attack",
        requirements: "11th level",
        content: [
          When you pull, push, or slide a target with an attack using a polearm or a spear, that target grants combat advantage to you until the end of your next turn.
        ],
      );

      // https://iws.mx/dnd/?view=feat1956 — Dragon Magazine 379, page(s) 46.
      #theme.featBlock(
        title: "Quickening Font",
        requirements: "11th level",
        content: [
          When you save against an effect at the start of your turn, your speed increases by 1 until the end of your turn.
        ],
      );

      // https://iws.mx/dnd/?view=feat1907 — Primal Power, page(s) 145.
      #theme.featBlock(
        title: "Stormheart Thunder",
        requirements: "11th level, Stormheart",
        content: [
          When you use Stormheart to slow an enemy, that enemy gains vulnerable 5 thunder until the end of your next turn.
        ],
      );

      // https://iws.mx/dnd/?view=feat1957 — Dragon Magazine 379, page(s) 46.
      #theme.featBlock(
        title: "Vengeful Grasp",
        requirements: "11th level",
        content: [
          When you use Warden's Grasp, you can choose to push the target 3 squares rather than slide it 1 square.
        ],
      );

      // https://iws.mx/dnd/?view=feat1916 — Primal Power, page(s) 146.
      #theme.featBlock(
        title: "Wellspring of Life",
        requirements: "11th level",
        content: [
          When you succeed on a saving throw granted by your Font of Life, each ally adjacent to you gains a +1 bonus to saving throws until the end of your next turn.
        ],
      );

      // https://iws.mx/dnd/?view=feat1917 — Primal Power, page(s) 146.
      #theme.featBlock(
        title: "Wildblood Retribution",
        requirements: "11th level, Wildblood",
        content: [
          When you use your second wind, if any enemy marked by you makes an attack that doesn't include you as a target before the start of your next turn, you can make a melee basic attack against that enemy as a free action during your next turn.
        ],
      );

      // https://iws.mx/dnd/?view=feat591 — Player's Handbook 2, page(s) 193.
      #theme.featBlock(
        title: "Wildblood Speed",
        requirements: "11th level, Wildblood",
        content: [
          When any enemy marked by you makes an attack that doesn't include you as a target, you can shift a number of squares equal to your Wisdom as a free action.
        ],
      );
    ]
  ]
}
