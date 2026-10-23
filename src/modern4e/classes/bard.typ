#import "../helpers/theme.typ";
#import "../helpers/classes.typ" as classes;
#import "../helpers/powers.typ";

#let className = "Bard";

#let bardPage() = {
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
            classes.armorProf.lightShield,
          ),
          weaponProficiencies: (
            classes.weaponProf.simpleMelee,
            classes.weaponProf.simpleRanged,
            classes.weaponProf.militaryMelee,
            classes.weaponProf.militaryRanged,
          ),
          implementProficiencies: (classes.implementProf.wand),
        );

        #classes.defensesAndHealth(fortitude: 11, will: 12, reflex: 12, health: 22, healthOnLevelUp: 5, healingSurges: 7)

        #classes.abilities(
          mainAbilities: "Charisma",
          extraAbilities: ("Constitution", "Intelligence"),
          class: className,
        );
      ],
    )[
      = Majestic Word
      With a mere word or phrase, you inspire your allies to greater feats of heroism.

      #powers.power(
        title: "Majestic Word",
        description: "You utter words laden with preternatural inspiration, restoring your ally's stamina and making wounds seem insignificant.",
        type: powers.powerType.encounter,
        action: powers.actionType.minor,
        range: [*Close* burst 5],
        target: "You or one ally in the burst",
        isSpecial: true,
        traits: "Arcane, Healing",
        additionalRows: (
          [
            *Effect:* The target can spend a healing surge and regain additional hit points equal to your Charisma. You also slide the target 1 square. #linebreak()
            
            *Level 6:* 1d6 + Charisma additional hit points. #linebreak()
            *Level 11:* Close Burst 10 & 2d6 + Charisma additional hit points. #linebreak()
            *Level 16:* Close Burst 10 & 3d6 + Charisma additional hit points. #linebreak()
            *Level 21:* Close Burst 15 & 4d6 + Charisma additional hit points. #linebreak()
            *Level 26:* Close Burst 15 & 5d6 + Charisma additional hit points.
          ],
          [
            *Special:* You can use this power twice per encounter, but only once per round. At 16th level, you can use this power three times per encounter, but only once per round.
          ],
        ),
      )
      = Virtuosic Virtue
      #theme.buildChoiceHeader()
      You inspire your allies to heroic deeds with your music and words. Choose one of the following virtues.
      #theme.choiceBlock(title: "Virtue of Cunning", body: [Once per round, when an enemy attack misses an ally within a number of squares of you equal to 5 + your *Intelligence*, you can slide that ally 1 square as a free action.])
       
      #theme.choiceBlock(title: "Virtue of Prescience", body: [Once per encounter as an immediate interrupt, when an enemy hits one ally within 5 squares of you, you grant that ally a power bonus equal to your *Wisdom* to the defense targeted by the triggering enemy until the end of that enemy's turn.])

      #theme.choiceBlock(title: "Virtue of Valor", body: [Once per round, when any ally within 5 squares of you reduces an enemy to 0 hit points or bloodies an enemy, you can grant temporary hit points to that ally as a free action. The number of temporary hit points equals 1 + your *Constitution* at 1st level, 3 + your *Constitution* at 11th level, and 5 + your *Constitution* at 21st level.])


      = Techniques
      You master two level 1 techniques, one of these must have the bard trait.
      = Powers
      You may choose 2 At-Will, 1 Encounter and 2 Daily #className Powers.

    ]

    #classes.classFeatures[
      #classes.powerLinks(className: className);
    ]


    #align(center)[
      = Heroic #className Feats
    ]

    #columns(2)[
      #theme.featBlock(
        title: "Battle Song Expertise",
        content: [
          You also gain a +1 feat bonus to the number of squares that you can pull, push, or slide creatures with your bard attacks and bard paragon path attacks.
        ],
      );

      #theme.featBlock(
        title: "Wild Virtue",
        content: [
          Each time you use your Bardic Virtue, you can shift 1 square as a free action.
        ],
      );

      #theme.featBlock(
        title: "Advantage of Cunning",
        requirements: "Virtue of Cunning",
        content: [
          When you slide an ally with your Virtue of Cunning, you can also slide an enemy that was adjacent to that ally into the space the ally vacated.
        ],
      );

      #theme.featBlock(
        title: "Extended Prescience",
        requirements: "Virtue of Prescience",
        content: [
          When you use your Virtue of Prescience to grant a power bonus to an ally's defense, that bonus lasts until the end of the ally's next turn.
        ],
      );

      #theme.featBlock(
        title: "Prescient Fortification",
        requirements: "Virtue of Prescience",
        content: [
          When you use your Virtue of Prescience to grant a power bonus to an ally, increase that bonus by 2.
        ],
      );

      #colbreak();

      #theme.featBlock(
        title: "Strength of Valor",
        requirements: "Virtue of Valor",
        content: [
          When you grant an ally temporary hit points with your Virtue of Valor, that ally also gains a +2 bonus to the next damage roll he or she makes before the end of his or her next turn.
        ],
      );

      #theme.featBlock(
        title: "Bardic Wayfarer",
        content: [
          Once per turn when you teleport an ally with a power, you can also teleport 1 square as a free action. In addition, when you use majestic word you can teleport the target 1 square instead of sliding the target.
        ],
      );

      #theme.featBlock(
        title: "Battle Cadence",
        content: [
          When you use majestic word, you can slide the target 1 extra square. The target also gains a +2 bonus to the next damage roll he or she makes before the end of his or her next turn.
        ],
      );

      #theme.featBlock(
        title: "Improved Majestic Word",
        content: [
          When you use majestic word, the target of the power gains temporary hit points equal to your Charisma.
        ],
      );

    ]

    #pagebreak();

    #align(center)[
      = Paragon #className Feats (Level 11+)
    ]

    #columns(2)[
      // https://iws.mx/dnd/?view=feat1172 — Arcane Power, page(s) 130.
      #theme.featBlock(
        title: "Disheartening Presence",
        requirements: "11th level",
        content: [
          While you are conscious and not bloodied, bloodied enemies adjacent to you take a -1 penalty to attack rolls.
        ],
      );

      // https://iws.mx/dnd/?view=feat475 — Player's Handbook 2, page(s) 191.
      #theme.featBlock(
        title: "Improved Cunning",
        requirements: "11th level, Virtue of Cunning",
        content: [
          When you use Virtue of Cunning to slide an ally, you can slide the ally 2 squares instead of 1.
        ],
      );

      // https://iws.mx/dnd/?view=feat476 — Player's Handbook 2, page(s) 191.
      #theme.featBlock(
        title: "Improved Valor",
        requirements: "11th level, Virtue of Valor",
        content: [
          The number of temporary hit points granted by your Virtue of Valor increases by 3.
        ],
      );

      // https://iws.mx/dnd/?view=feat1182 — Arcane Power, page(s) 132.
      #theme.featBlock(
        title: "Majestic Rescue",
        requirements: "11th level",
        content: [
          When you use majestic word, you can grant the target a saving throw in addition to the other effects of the power.
        ],
      );

      // https://iws.mx/dnd/?view=feat1183 — Arcane Power, page(s) 132.
      #theme.featBlock(
        title: "Prescient Aid",
        requirements: "11th level, Virtue of Prescience",
        content: [
          When an ally within 10 squares of you misses with an attack roll, you can use your Virtue of Prescience as an immediate interrupt. That ally gains a power bonus to the attack roll equal to your Wisdom.
        ],
      );

      // https://iws.mx/dnd/?view=feat2974 — Dragon Magazine 387, page(s) 25.
      #theme.featBlock(
        title: "Walk Among the Fey",
        requirements: "11th level",
        content: [
          Whenever you use a power that slides a creature, you can teleport that creature an equal number of squares instead. Where you teleport the creature remains subject to any restrictions on the original slide.
        ],
      );
    ]
  ]
}
