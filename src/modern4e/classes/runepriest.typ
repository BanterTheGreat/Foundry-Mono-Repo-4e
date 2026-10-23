#import "../helpers/theme.typ";
#import "../helpers/classes.typ" as classes;
#import "../helpers/powers.typ";

#let className = "Runepriest";

#let runePriestPage() = {
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
            classes.armorProf.lightShield,
          ),
          weaponProficiencies: (classes.weaponProf.simpleMelee, classes.weaponProf.simpleRanged),
          implementProficiencies: (),
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
          mainAbilities: "Strength",
          extraAbilities: ("Constitution", "Wisdom"),
          class: className,
        );
      ],
    )[
      = Rune Master
      Some of your powers have the runic keyword. When you are going to use a runic power, you first choose one of the runes noted in the power—either the rune of destruction or the rune of protection—and then use the power, applying the chosen rune's effects. The moment you choose the rune, you enter its rune state. You remain in that rune state until you enter another rune state or until the end of the encounter. Whenever you enter the rune state of the rune of destruction or the rune of protection, you gain an additional benefit. The benefit lasts while you're in the rune state.

      == Rune of Destruction
      Allies gain a +1 bonus to attack rolls against enemies that are adjacent to you or to any other runepriests who are in this rune state.

      == Rune of Protection
      While adjacent to you, allies gain resist 2 to all damage. The resistance increases to 4 at 11th level and 6 at 21st level.

      = Rune of Mending
      You gain the rune of mending power, This rune restores your allies’ health and grants them additional power based on your rune state.

      #powers.power(
        title: "Rune of Mending",
        description: "The healing rune flares with a cold blue fire as you trace it in the air. The rune then appears on your allies' armor.",
        type: powers.powerType.encounter,
        range: [*Close* burst 5],
        action: powers.actionType.minor,
        target: "You or one ally in the burst",
        traits: "Divine, Healing, Runic",
        isSpecial: true,
        additionalRows: (
          [*Effect*: The target can spend a healing surge. #linebreak()

            *Level 6:* 1d6 additional hit points. #linebreak()
            *Level 11:* Close Burst 10 & 2d6 additional hit points. #linebreak()
            *Level 16:* Close Burst 10 & 3d6 additional hit points. #linebreak()
            *Level 21:* Close Burst 15 & 4d6 additional hit points. #linebreak()
            *Level 26:* Close Burst 15 & 5d6 additional hit points.
          ],
          [*Rune of Destruction*: You and each ally in the burst gain a +2 power bonus to damage rolls (+4 power bonus at 11th level and +6 power bonus at 21st level) until the end of your next turn.],
          [*Rune of Protection*: You and each ally in the burst gain a +1 bonus to all defenses until the end of your next turn.],
          [*Special*: You can use this power twice per encounter, but only once per round. At 16th level, you can use this power three times per encounter.],
        ),
      );

      = Rune Artistry
      #theme.buildChoiceHeader()
      Runescribes follow one of the major traditions of rune magic: the path of the Wrathful Hammer, the way of the Defiant Word or the tradition of the Serene Blade.

      #theme.choiceBlock(
        title: "Defiant Word",
        body: [Whenever an enemy misses you with an attack, you gain a bonus to damage rolls against that enemy until the end of your next turn. The bonus equals your *Wisdom*, regardless of the number of times the enemy misses you in a round.],
      )

      #theme.choiceBlock(
        title: "Serene Blade",
        body: [You gain proficiency with all one-handed and two-handed military heavy blades. While you are not wearing heavy armor, you can use your *Wisdom* to determine your AC. Once per round immediately after an enemy deals damage to you with an attack, you gain temporary hit points equal to your *Wisdom*. The number of temporary hit points increases to 5 + your *Wisdom* at 11th level and 10 + your *Wisdom* at 21st level.],
      )

       
      #theme.choiceBlock(
        title: "Wrathful Hammer",
        body: [You gain proficiency with military hammers and military maces. In addition, whenever an enemy deals damage to you with an attack, you gain a bonus to damage rolls against that enemy until the end of your next turn. The bonus equals your *Constitution*, regardless of the number of times the enemy damages you in a round.],
      )

    ]

    #classes.classFeatures[
      = Powers
      You may choose 2 At-Will, 1 Encounter and 2 Daily #className Powers.

      #classes.powerLinks(className: className);
    ]

    #set page(columns: 1)


    #pagebreak()

    #align(center)[
      = Heroic #className Feats
    ]

    #columns(2)[
      == Rune Feats
      Any Feat ending with [Rune] is a rune feat.

      #theme.featBlock(
        title: "Rune of Hope [Rune]",
        content: [
          The target of your rune of mending also gains temporary hit points equal to the number of rune feats you have.
        ],
      );

      #theme.featBlock(
        title: "Rune of Zeal [Rune]",
        content: [
          The target of your rune of mending gains a bonus to damage rolls to their next hit until the end of their next turn equal to the number of rune feats you have.
        ],
      );

      #theme.featBlock(
        title: "Rune of Preparation [Rune]",
        content: [
          When you roll initiative, you may select an amount of allies equal to the number of rune feats you have, they gain a +1 bonus to initiative.
        ],
      );

      #theme.featBlock(
        title: "Rune of Vengeance [Rune]",
        content: [
          The first time you are bloodied during an encounter, you gain a bonus to damage rolls equal to the number of rune feats you have. The bonus lasts until the end of your next turn.
        ],
      );
    ]

    #pagebreak();

    #align(center)[
      = Paragon #className Feats (Level 11+)
    ]

    #columns(2)[
      // https://iws.mx/dnd/?view=feat2640 — Player's Handbook 3, page(s) 186.
      #theme.featBlock(
        title: "Defiant Light",
        requirements: "11th level, Defiant Word",
        content: [
          You gain resist 5 necrotic and resist 5 radiant. You also gain a +1 bonus to attack rolls with runepriest powers against targets that are vulnerable to radiant damage.
        ],
      );

      // https://iws.mx/dnd/?view=feat2660 — Player's Handbook 3, page(s) 189.
      #theme.featBlock(
        title: "Rune of Escape [Rune]",
        requirements: "11th level",
        content: [
          Whenever an ally within 5 squares of you uses their second wind, that ally can use a free action to shift a number of squares equal to the number of rune feats you have.
        ],
      );

      // https://iws.mx/dnd/?view=feat2661 — Player's Handbook 3, page(s) 189.
      #theme.featBlock(
        title: "Rune of Torment [Rune]",
        requirements: "11th level",
        content: [
          Whenever an enemy within 5 squares of you fails a saving throw against an effect caused by your runepriest powers, that enemy takes damage equal to the number of rune feats you have.
        ],
      );

      // https://iws.mx/dnd/?view=feat2669 — Player's Handbook 3, page(s) 189.
      #theme.featBlock(
        title: "Wrath of Defeat",
        requirements: "11th level, Wrathful Hammer",
        content: [
          When you drop to 0 hit points or fewer, you can use an immediate interrupt to make a melee basic attack with a +2 bonus to the attack roll.
        ],
      );
    ]
  ]
}
