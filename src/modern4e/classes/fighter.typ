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
      #theme.featBlock(
        title: "Deep Gash",
        requirements: "3 Constitution",
        content: [When you deal ongoing damage that has no damage type to a target as a result of an attack that uses an axe or a pick, the target takes a –2 penalty to saving throws against the ongoing damage.],
      );

      #theme.featBlock(
        title: "Improved Combat Challenge",
        content: [When an adjacent enemy marked by you shifts or makes an attack that doesn't include you as a target while you are using a shield, you give an adjacent ally a +2 bonus to all defenses until the start of your next turn as an immediate interrupt.],
      );

      #theme.featBlock(
        title: "Defensive Resilience",
        requirements: "2 Constitution, 2 Wisdom",
        content: [
          When you use second wind while you are bloodied, you gain a +1 bonus to all defenses, in addition to the normal bonus for second wind, until the end of your next turn.
        ],
      );

      #theme.featBlock(
        title: "Dirty Fighting",
        content: [
          You gain a +4 bonus to melee weapon damage rolls against surprised enemies.
        ],
      );

      #theme.featBlock(
        title: "Distracting Shield",
        requirements: "3 Wisdom",
        content: [
          If you hit a foe with an attack granted by your Combat Challenge class feature, the target takes a –2 penalty to attack rolls until the start of your next turn.

          _Special:_ You must have a shield equipped to benefit from this feat.
        ],
      );

      #theme.featBlock(
        title: "Dragging Flail",
        requirements: "3 Dexterity",
        content: [
          Whenever you use a flail to knock an enemy prone, you can also slide that enemy 1 square.
        ],
      );

      #theme.featBlock(
        title: "Encouraging Shield",
        content: [
          Your shield bonus also applies to your Will defense.
        ],
      );

      #theme.featBlock(
        title: "Fighter Weapon Specialization",
        requirements: "One-Handed Weapon Talent or Two-Handed Weapon Talent",
        content: [
          You gain a +1 bonus to damage rolls when you hit with an attack using a weapon of the style covered by your One-Handed Weapon Talent or Two-Handed Weapon Talent class feature.
        ],
      );

      #theme.featBlock(
        title: "Focused Superiority",
        content: [
          While you are wielding a one-handed weapon, you gain a bonus to damage rolls equal to your Wisdom with opportunity attacks.
        ],
      );

      #theme.featBlock(
        title: "Forceful Opportunist",
        requirements: "One-Handed Weapon Talent or Two-Handed Weapon Talent",
        content: [
          Whenever you hit a target with an opportunity attack, you can push the target 1 square and shift into the square the target vacated.
        ],
      );

      #theme.featBlock(
        title: "Improved Vigor",
        requirements: "Endurance",
        content: [
          You gain a +1 feat bonus to the number of temporary hit points you gain from using an invigorating power. The bonus increases to 2 at 11th level and 3 at 21st level.
        ],
      );

      #theme.featBlock(
        title: "Hewing Charge",
        requirements: "Two-Handed Weapon Talent",
        content: [
          You gain a bonus to damage rolls equal to your Constitution when making charge attacks while using a two-handed weapon.
        ],
      );

      #theme.featBlock(
        title: "Marked Fury",
        content: [
          If an adjacent enemy that is marked by you makes an attack that doesn't include you as a target, it takes a penalty to the attack roll equal to either -2 or the number of enemies adjacent to you, whichever is worse. This penalty replaces the normal penalty for having a creature marked.
        ],
      );

      #theme.featBlock(
        title: "Mobile Challenge",
        content: [
          After you hit an enemy with a melee basic attack granted by your Combat Challenge class feature, you can shift 1 square.
        ],
      );

      #theme.featBlock(
        title: "Offensive Resilience",
        requirements: "2 Dexterity, 2 Wisdom",
        content: [
          When you are bloodied and use second wind, you gain a +1 bonus to attack rolls until the end of your next turn.
        ],
      );

      #theme.featBlock(
        title: "Polearm Momentum",
        requirements: "2 Dexterity, 2 Wisdom",
        content: [
          Whenever you use a polearm or a spear attack to push or slide a target 2 or more squares, you can also knock that target prone at the end of the forced movement.
        ],
      );

      #theme.featBlock(
        title: "Potent Challenge",
        requirements: "3 Constitution",
        content: [
          If you hit a foe with an attack granted by your Combat Challenge class feature, add your Constitution to the damage roll.

          _Special:_ This benefit applies only to attacks made with two-handed weapons.
        ],
      );

      #theme.featBlock(
        title: "Reaping Blade",
        requirements: "3 Dexterity",
        content: [
          If you reduce an enemy to 0 hit points with an attack using a heavy blade, you can shift as a minor action until the end of your current turn.
        ],
      );

      #theme.featBlock(
        title: "Savage Axe",
        content: [
          When you hit with an opportunity attack with an axe, you deal extra damage equal to your Constitution.
        ],
      );

      #theme.featBlock(
        title: "Shield Defense",
        requirements: "2 Wisdom",
        content: [
          When you hit with a power that requires a shield, you gain a +1 bonus to AC and Reflex until the end of your next turn or until you stop using the shield.
        ],
      );

      #theme.featBlock(
        title: "Shield Push",
        content: [
          If you hit a foe with an attack granted by your Combat Challenge class feature, you push the target 1 square after dealing damage.

          _Special:_ You must be using a shield to benefit from this feat.
        ],
      );

      #theme.featBlock(
        title: "Shielded Resurgence",
        content: [
          When you use your second wind while you are using a shield, you regain extra hit points equal to your Wisdom, and the bonus to defenses lasts until the end of your next turn.
        ],
      );

      #theme.featBlock(
        title: "Stout Shield",
        content: [
          Your shield bonus also applies to your Fortitude.
        ],
      );

      #theme.featBlock(
        title: "Swift Spear",
        content: [
          When you hit with an opportunity attack with a spear, you can also slide that enemy 1 square to a space adjacent to you.
        ],
      );

      #theme.featBlock(
        title: "Thunder Hammer",
        requirements: "3 Constitution",
        content: [
          When you make an attack using a hammer or a mace that causes the target to become dazed, immobilized, slowed, or stunned, that target takes a –2 penalty to saving throws against any of those conditions.
        ],
      );

      #theme.featBlock(
        title: "Unbalancing Shield Shove",
        content: [
          When you hit with an opportunity attack while using a shield, the target grants combat advantage until the end of your next turn.
        ],
      );

      #theme.featBlock(
        title: "Victor's Confidence",
        requirements: "3 Constitution",
        content: [
          When you reduce an enemy to 0 hit points with a melee attack, you gain a +1 bonus to saving throws until the end of the encounter.
        ],
      );

      #theme.featBlock(
        title: "Wary Fighter",
        content: [
          You use your Wisdom instead of your Dexterity when rolling initiative. You also gain a +2 feat bonus to Insight and Perception checks.
        ],
      );
    ]

    #pagebreak();
    = Paragon #className Feats
    #columns(2)[
      #theme.featBlocksFromJson("../content/feats/paragon/fighter.json")

    ]

  ]
}
