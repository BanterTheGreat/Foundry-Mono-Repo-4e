#import "../helpers/theme.typ" as theme;

#import "../helpers/classes.typ": (
  abilities, armorProf, bannerPage, classFeatures, classOverview, defensesAndHealth, implementProf, powerLinks, proficiencies, weaponProf,
);

#import "../helpers/powers.typ";

#let className = "Artificer";

#let artificerPage() = {
  return [
    #bannerPage(
      className: className,
    );

    #classOverview(
      className: className,
      reference: [
        #proficiencies(
          armorProficiencies: (armorProf.cloth, armorProf.leather),
          weaponProficiencies: (weaponProf.simpleMelee, weaponProf.simpleRanged),
          implementProficiencies: (implementProf.rod, implementProf.wand, implementProf.staff),
        );

        #defensesAndHealth(fortitude: 12, will: 12, reflex: 11, health: 22, healthOnLevelUp: 5, healingSurges: 6)

        #abilities(
          mainAbilities: "Intelligence",
          extraAbilities: ("Wisdom", "Constitution"),
          class: className,
        );
      ],
    )[

      = Arcane Empowerment
      Your study of magic has given you the ability to manipulate the arcane energy contained within items. You begin each day with the ability to empower a magic item, and you gain one additional arcane empowerment for each milestone you reach. You must spend a short rest with an item in order to empower it. You can empower an item in two ways.

      == Augment Energy
      You infuse a weapon or an implement with a reservoir of energy that lasts until the end of your next extended rest or until it is expended. The wielder of the implement or the weapon can use a free action after making an attack roll to expend the reservoir of energy to gain a +2 bonus to that attack roll. An implement or a weapon can be augmented only once per day in this way.

      == Impart Energy
      You recharge the daily power of a magic item. An item can be recharged only once per day in this way.

      = Arcane Rejuvenation
      Before combat, an arcane tinkerer spends time infusing his or her allies' magic items with curative energy. Whenever one of the artificer's allies uses a magic item's daily power, that ally absorbs the energy and gains temporary hit points equal to one-half your level + your *Intelligence*.

      = Healing Infusion
      You can create healing infusions for later use. At the end of an extended rest, you create two healing infusions that last until the end of your next extended rest. At 16th level, you instead create three healing infusions.

      You determine the effect of a healing infusion at the time you use the power, not at the time you create it. When you use a Healing Infusion power, you expend one of the infusions you created during your last extended rest. During a short rest, you or an ally can spend a healing surge to replenish one of the infusions expended.

      #powers.power(
        title: "Healing Infusion: Curative Admixture",
        description: "You use the magic of your infusion to heal the wounds of your target.",
        type: powers.powerType.encounter,
        range: "Close burst 5",
        action: powers.actionType.minor,
        target: "You or one ally in the burst",
        isSpecial: true,
        additionalRows: (
          [*Effect:* The target regains hit points equal to its healing surge value + your Wisdom, and you expend an infusion crafted with your Healing Infusion class feature. #linebreak()

            *Level 6:* The target regains an extra 2 hit points. #linebreak()
            *Level 11:* Close Burst 10 & The target regains an extra 4 hit points. #linebreak()
            *Level 16:* Close Burst 10 & The target regains an extra 6 hit points. #linebreak()
            *Level 21:* Close Burst 15 & The target regains an extra 8 hit points. #linebreak()
            *Level 26:* Close Burst 15 & The target regains an extra 10 hit points.
          ],
          [*Special:* You can use two Healing Infusion powers per encounter, but only one per round. At 16th level, you can use three Healing Infusion powers per encounter, but only one per round.],
        ),
        traits: "Arcane, Healing",
      );

      #powers.power(
        title: "Healing Infusion: Resistive Formula",
        description: "You channel the energy of your infusion into your target's armor, providing lasting protection.",
        type: powers.powerType.encounter,
        range: "Close burst 5",
        action: powers.actionType.minor,
        target: "You or one ally in the burst",
        isSpecial: true,
        additionalRows: (
          [*Effect:* The target gains a +1 power bonus to AC until the end of the encounter, and you expend an infusion crafted with your Healing Infusion class feature. The target can end the bonus as a free action to gain temporary hit points equal to its healing surge value + your Constitution. #linebreak()

            *Level 11:* Close Burst 10 & Temporary hit points equal to the target's healing surge value + twice your Constitution. #linebreak()
            *Level 21:* Close Burst 15 & Temporary hit points equal to the target's healing surge value + three times your Constitution.
          ],
          [*Special:* You can use two Healing Infusion powers per encounter, but only one per round. At 16th level, you can use three Healing Infusion powers per encounter, but only one per round.],
        ),
        traits: "Arcane",
      );
    ];

    #classFeatures[
      = Techniques
      You master the Alchemical Creation and Brew Potion techniques and gain the Technique Master feat.
      = Powers
      You may choose 2 At-Will, 1 Encounter and 2 Daily #className Powers.


      #powerLinks(className: className);
    ]

    #set page(columns: 1)

    #pagebreak()

    #align(center)[
      = Heroic #className Feats
    ]

    #columns(2)[
      #theme.featBlock(
        title: "Accurate Magic Weapon",
        content: [
          Whenever you use an Artificer power that targets a weapon or an implement, the next attack roll with that weapon or implement before the end of the encounter gains a +1 bonus.
        ],
      );

      #theme.featBlock(
        title: "Arcane Trapsmith",
        content: [
          You can use your knowledge of the Arcane during Skill Checks to disable traps or open locks. You gain a +4 feat bonus to checks related to arcane traps or hazards.
        ],
      );


      #theme.featBlock(
        title: "Crossbow Caster",
        content: [
          You can use a crossbow as an implement for your Artificer powers and Artificer paragon path powers.
        ],
      );

      #colbreak();
      #theme.featBlock(
        title: "Defensive Minions",
        content: [
          A creature you summon using an Artificer summoning power has a +2 feat bonus to all defenses.
        ],
      );

      #theme.featBlock(
        title: "Master Mixer",
        content: [
          You can make alchemical items of your level + 3 or lower. You must have the correct formula and an appropriate skill.
        ],
      );

      #theme.featBlock(
        title: "Potent Restorables",
        content: [
          Your Artificer healing powers restore 2 extra hit points. The extra hit points increase to 3 at 6th level, to 4 at 11th level, to 5 at 16th level, to 6 at 21st level, and to 7 at 26th level.
        ],
      );

      #theme.featBlock(
        title: "Improved Augment Energy",
        content: [
          The Augment Energy option of your Arcane Empowerment class feature grants a +4 bonus to the attack roll instead of +2.
        ],
      );
    ]

    #pagebreak();

    #align(center)[
      = Paragon #className Feats (Level 11+)
    ]

    #columns(2)[
      // https://iws.mx/dnd/?view=feat1416 — Eberron Player's Guide, page(s) 93.
      #theme.featBlock(
        title: "Enhanced Resistive Formula",
        requirements: "11th level",
        content: [
          When your resistive formula grants temporary hit points to you or an ally, that character can grant an equal number of temporary hit points to one ally within 5 squares of them.
        ],
      );

      // https://iws.mx/dnd/?view=feat2113 — Dragon Magazine 381, page(s) 62.
      #theme.featBlock(
        title: "Rapid Infusion",
        requirements: "11th level",
        content: [
          You can use your Healing Infusion powers as free actions on your turn instead of as a minor action.
        ],
      );

      // https://iws.mx/dnd/?view=feat2114 — Dragon Magazine 381, page(s) 62.
      #theme.featBlock(
        title: "Retribution Seeker",
        requirements: "11th level",
        content: [
          You gain a +2 feat bonus to damage rolls with arcane attack powers against enemies adjacent to at least one of your allies.
        ],
      );
    ]
  ]
}
