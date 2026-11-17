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
      #theme.featBlocksFromJson("../content/feats/heroic/bard.json", start: 0, end: 5);

      #colbreak();

      #theme.featBlocksFromJson("../content/feats/heroic/bard.json", start: 5, end: 9);

    ]

    #pagebreak();

    #align(center)[
      = Paragon #className Feats (Level 11+)
    ]

    #columns(2)[
      #theme.featBlocksFromJson("../content/feats/paragon/bard.json");
    ]
  ]
}
