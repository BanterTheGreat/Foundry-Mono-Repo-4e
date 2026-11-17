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

      #theme.featBlocksFromJson("../content/feats/heroic/runepriest.json");
    ]

    #pagebreak();

    #align(center)[
      = Paragon #className Feats (Level 11+)
    ]

    #columns(2)[
      #theme.featBlocksFromJson("../content/feats/paragon/runepriest.json");
    ]
  ]
}
