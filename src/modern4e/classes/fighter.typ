#import "../helpers/theme.typ";
#import "../helpers/classes.typ" as classes;
#import "../helpers/powers.typ";

#let className = "Fighter";

#let fighterPage() = {
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
            classes.armorProf.chainmail,
            classes.armorProf.scale,
            classes.armorProf.shields,
          ),
          weaponProficiencies: (
            classes.weaponProf.simpleMelee,
            classes.weaponProf.simpleRanged,
            classes.weaponProf.militaryMelee,
            classes.weaponProf.militaryRanged,
          ),
          implementProficiencies: (),
        );

        #classes.defensesAndHealth(
          fortitude: 13,
          will: 11,
          reflex: 11,
          health: 25,
          healthOnLevelUp: 7,
          healingSurges: 9,
        )

        #classes.abilities(
          mainAbilities: "Strength",
          extraAbilities: ("Constitution", "Dexterity", "Wisdom"),
          class: className,
        );
      ],
    )[

      #columns(2)[
        = Combat Challenge
        In combat, it’s dangerous to ignore The Fighter. Every time you attack an enemy, you can choose to *mark* that target. The mark lasts until the end of your next turn.

        Additionally, you gain the Combat Challenge power:

        #powers.power(
          title: "Combat Challenge",
          type: powers.powerType.at-will,
          action: powers.actionType.immediateInterrupt,
          traits: "Martial, Weapon",
          range: "Melee 1",
          trigger: "An enemy marked by you is adjacent to you and shifts or makes an attack that does not include you as a target.",
          additionalRows: (
            [*Effect:* You can make a melee basic attack against that enemy],
          ),
        );

        #colbreak()

        = Melee Weapon Mastery
        Various Fighter powers come with bonuses if you have certain weapon types equipped. See the table below.

        #table(
          columns: (1fr, 1fr),
          stroke: 0.5pt + theme.tableDivider,
          align: horizon,
          fill: theme.defaultTableStyle(),
          inset: 4pt,
          [*Melee Type*], [*Ability*],
          [Axe], [Constitution],
          [Flail], [Dexterity],
          [Hammer], [Constitution],
          [Heavy Blade], [Dexterity],
          [Light Blade], [Dexterity],
          [Mace], [Constitution],
          [Pick], [Constitution],
          [Polearm], [Wisdom],
          [Spear], [Dexterity],
          [Staff], [Constitution],
        );
      ]

      = Reactivity
      #theme.buildChoiceHeader()
      As a Fighter, you are quick to strike down those who try to escape your reach. Choose one of the options below.

      #theme.choiceBlock(
        title: "Combat Reactivity",
        body: [
          #powers.power(
            fill: theme.bgColor,
            title: "Combat Reactivity",
            type: powers.powerType.at-will,
            action: powers.actionType.opportunity,
            traits: "Martial, Weapon",
            trigger: "An enemy adjacent to you takes an action that provokes an opportunity attack.",
            range: "Melee weapon",
            additionalRows: (
              [*Effect:* After the triggering enemy completes the action, you shift a number of squares equal to your *Dexterity*. You must end the shift closer to the target than you were when you began the shift. Then, make the following attack],
            ),
          )

          #powers.power(
            fill: theme.bgColor,
            title: "Combat Reactivity Followup",
            type: powers.powerType.at-will,
            action: powers.actionType.noAction,
            traits: "Martial, Weapon",
            target: "The triggering enemy",
            offenseStat: powers.offense.strength,
            defenseStat: powers.defense.ac,
            range: "Melee weapon",
            additionalRows: (
              [*Hit:* 1[W] + *Strength* damage, and you knock the target prone. #linebreak();

                *Level 21:* 2[W] + *Strength* damage.],
            ),
          )
        ],
      )

      #theme.choiceBlock(
        title: "Combat Superiority",
        body: [You gain a bonus to opportunity attacks equal to either your *Wisdom* or *Dexterity*. An enemy struck by your opportunity attack stops moving, if a move provoked the attack. If it still has actions remaining, it can use them to resume moving.],
      )
    ]

    #classes.classFeatures[



      = Fighter Specialization
      #theme.buildChoiceHeader()
      As a Fighter, you specialise in a specific way of fighting. Choose one of the options below.

      #theme.choiceBlock(
        title: "One-Handed Weapon Talent",
        body: [You gain a +1 bonus to weapon attack rolls with one-handed weapons.],
      )



      #theme.choiceBlock(
        title: "Two-Handed Weapon Talent",
        body: [You gain a +1 bonus to weapon attack rolls with two-handed weapons.],
      )



      #theme.choiceBlock(
        title: "Battlerager Vigor",
        body: [
          Whenever you hit an enemy with a melee or a close attack, you gain temporary hit points equal to your *Constitution*, plus any temporary hit points normally granted by the power. You gain the hit points only after the attack is resolved.

          If you use an invigorating Fighter attack power and miss every target with it, you gain temporary hit points equal to your *Constitution*.
          When wearing light armor or chainmail, you gain a +2 bonus to damage rolls with melee and close weapon attacks whenever you have temporary hit points.
        ],
      )


      = Powers
      You may choose 2 At-Will, 1 Encounter and 2 Daily #className Powers.

      #classes.commonTraits(class: className, commonTraits: [
        == Reliable
        An effect type. If a reliable power misses every target, the power is not expended.
        == Invigorating
        The creature gains temporary hit points equal to their *Constitution* when it hits with a power that has the invigorating keyword. No invigorating power grants temporary hit points more than once during a turn, even if the user hits more than once with that power.
      ]);
      #colbreak()
      #classes.powerLinks(className: className, skipPaths: true);
    ]

    #pagebreak()

    #align(center)[
      = #className Paragon Paths
    ]
    #classes.zeitgeistPathReference()


    #columns(2)[
      #theme.pathBlocksFromJson("../content/paths/fighter.json")
    ]

    #pagebreak()


    #set page(columns: 1)

    #align(center)[
      = Heroic #className Feats
    ]

    #columns(2)[
      #theme.featBlocksFromJson("../content/feats/heroic/fighter.json");
    ]

    #pagebreak();
    = Paragon #className Feats
    #columns(2)[
      #theme.featBlocksFromJson("../content/feats/paragon/fighter.json")

    ]

  ]
}
