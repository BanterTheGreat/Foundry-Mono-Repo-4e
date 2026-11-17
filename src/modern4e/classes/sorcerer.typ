#import "../helpers/theme.typ";
#import "../helpers/classes.typ" as classes;
#import "../helpers/powers.typ";

#let className = "Sorcerer";

#let sorcererPage() = {
  return [
    #classes.bannerPage(
      className: className,
    );

    #classes.classOverview(
      className: className,
      reference: [
        #classes.proficiencies(
          armorProficiencies: (classes.armorProf.cloth),
          weaponProficiencies: (classes.weaponProf.dagger, classes.weaponProf.staff),
          implementProficiencies: (classes.implementProf.staff, classes.implementProf.dagger),
        );

        #classes.defensesAndHealth(
          fortitude: 11,
          will: 13,
          reflex: 11,
          health: 22,
          healthOnLevelUp: 5,
          healingSurges: 6,
        )

        #classes.abilities(
          mainAbilities: "Charisma",
          extraAbilities: ("Strength", "Dexterity"),
          class: className,
        );
      ],
    )[
      = Spell Source
      #theme.buildChoiceHeader()
      As a sorcerer, you gain power through an instinctive or inborn connection to an ancient arcane source. Choose either Dragon Magic, Wild Magic, Cosmic Magic or Storm Magic. The choice you make grants you specific features and also provides bonuses to certain sorcerer powers, as detailed in those powers.

      #theme.bigChoiceBox(
        title: "Cosmic Magic",
        content: [
          The sun, the moon, and the stars speak to you in the voiceless language of cycles. The natural flow of the seasons tugs at your blood as the tide acts upon the oceans, pushing and pulling with gentle insistence regardless of the storm's fury, the dragon's flight, or the antics of otherworldly primordials. Just as the constellations move around the sky in a steady, imperturbable cadence, your spells are strong and unshakable, and tied to energies that can outlast all others.

          == Cosmic Persistence
          While you are not wearing heavy armor, you can use your Strength in place of your Dexterity or Intelligence to determine your AC.

          == Cosmic Power
          You gain a bonus to the damage rolls of arcane powers equal to your Strength. The bonus equals your Strength + 2 at 11th level and your Strength + 4 at 21st level.

          == Soul of the Cosmic Cycle
          At the end of a short rest or an extended rest, you choose a cosmic phase from those described below and gain its benefits.

          The first time you become bloodied during an encounter, your phase immediately changes to the next higher-numbered phase (or back to the phase of the sun if you are in the phase of the stars). For example, if you begin an encounter in the phase of the moon, after becoming bloodied you would be in the phase of the stars.

          In addition, each time you use a daily arcane attack power, you can choose to change your phase to the next higher-numbered phase immediately after resolving the effects of the power.
          + *Phase of the Sun:* At the start of your turn, each enemy adjacent to you takes fire and radiant damage equal to your Strength. You also gain resist 5 cold.
          + *Phase of the Moon:* You gain a bonus to AC equal to the number of conscious enemies adjacent to you. You also gain resist 5 psychic.
          + *Phase of the Stars:* Whenever an enemy's attack misses you, you can teleport a number of squares equal to your Strength as a free action. You also gain resist 5 radiant.

          The resistance granted by this class feature increases to 10 at 11th level and to 15 at 21st level. While you have resistance from this class feature, your arcane powers ignore all targets' resistance to that damage type up to the value of your resistance.

        ],
      );
    ]

    #classes.classFeatures[

      #theme.bigChoiceBox(
        title: "Dragon Magic",
        content: [
          The elemental power of dragons flows through you, infusing your spells with draconic strength. Through force of will, you tap into the arcane might of dragons.

          == Draconic Power
          You gain a bonus to the damage rolls of arcane powers equal to your Strength. The bonus increases to your Strength +2 at 11th level and your Strength +4 at 21st level.

          == Draconic Resilience
          While you are not wearing heavy armor, you can use your Strength in place of your Dexterity or Intelligence to determine your AC.

          == Dragon Soul
          Choose a damage type: acid, cold, fire, lightning, poison, or thunder. You gain resist 5 to that damage type. The resistance increases to 10 at 11th level and 15 at 21st level. Your arcane powers ignore any target's resistance to that damage type up to the value of your resistance.

          == Scales of the Dragon
          The first time you become bloodied during an encounter, you gain a +2 bonus to AC until the end of the encounter.
        ],
      );

      #theme.bigChoiceBox(
        title: "Storm Magic",
        content: [
          The raw and unbridled fury of storm powers your spells. While others might flee a storm, you embrace its power, internalize the force, and then unleash it. The impetuous, unpredictable power resident in the storm is your greatest ally. Like a tempest, you never give up and never give in until you are completely spent.

          == Storm Power
          You gain a bonus to the damage rolls of arcane powers equal to your Dexterity. The bonus equals your Dexterity + 2 at 11th level and your Dexterity + 4 at 21st level.

          == Storm Soul
          You gain resist 5 thunder and resist 5 lightning. This resistance increases to 10 at 11th level and 15 at 21st level.
          While this resistance is active, your arcane powers ignore all targets' resistance to that damage type up to the value of your resistance.

          If you are hit by an attack, you can end this resistance as an immediate interrupt to gain a +4 power bonus to all defenses until the end of your next turn. If you do so, the resistance returns after you take a short rest or an extended rest.

          == Storm's Embrace
          When you roll a natural 20 on an attack roll for an arcane power, wind surges around you and your enemy. You can push the target 1 square and then fly a number of squares equal to 1 + your Dexterity after applying the attack's other effects.
        ],
      );



      #theme.bigChoiceBox(
        title: "Wild Magic",
        content: [
          You draw your spells from the entropic forces of the Elemental Chaos. Whether tapping into the power of primordial beings or drawing strength directly from that plane, you unleash magic in wild surges.
          == Chaos Burst
          Your first attack roll during each of your turns determines a benefit you gain in that round. If you roll an even number, you gain a +1 bonus to AC until the start of your next turn. If you roll an odd number, you make a saving throw.

          == Chaos Power
          You gain a bonus to the damage rolls of arcane powers equal to your Dexterity. The bonus increases to your Dexterity + 2 at 11th level and your Dexterity + 4 at 21st level.

          #block(
            [
              == Unfettered Power
              When you roll a natural 20 on an attack roll for an arcane power, you slide the target 1 square and knock it prone after applying the attack's other effects.

              When you roll a natural 1 on an attack roll for an arcane power, you must push each creature within 5 squares of you 1 square.
            ],
            breakable: false,
          );

          == Wild Soul
          When you finish an extended rest, roll a d10 to determine a damage type.

          #table(
            columns: (1fr, 1fr),
            stroke: none,
            align: left,
            fill: theme.defaultTableStyle(),
            inset: 4pt,
            [d10], [Damage Type],
            [1], [Acid],
            [2], [Cold],
            [3], [Fire],
            [4], [Force],
            [5], [Lightning],
            [6], [Necrotic],
            [7], [Poison],
            [8], [Psychic],
            [9], [Radiant],
            [10], [Thunder],
          );

          You gain resist 5 to that damage type until the end of your next extended rest. The resistance increases to 10 at 11th level and 15 at 21st level.

          While you have resistance to that damage type, your arcane powers ignore any target's resistance to that damage type up to the value of your resistance.
        ],
      );


      = Prime Shot
      If none of your allies are nearer to your target than you are, you receive a +1 bonus to ranged attack rolls against that target.

      #colbreak();

      = Powers
      You may choose 2 At-Will, 1 Encounter and 2 Daily #className Powers.

      #classes.powerLinks(className: className);
    ]

    #set page(columns: 1)

    #align(center)[
      = Heroic #className Feats
    ]

    #columns(2)[
      #theme.featBlocksFromJson("../content/feats/heroic/sorcerer.json", start: 0, end: 15);

      #block(
        [
          #theme.featBlocksFromJson("../content/feats/heroic/sorcerer.json", start: 15, end: 16);
        ],
        breakable: false,
      );

      #theme.featBlocksFromJson("../content/feats/heroic/sorcerer.json", start: 16, end: 18);
    ]

    #pagebreak();

    #align(center)[
      = Paragon #className Feats (Level 11+)
    ]

    #columns(2)[
      #theme.featBlocksFromJson("../content/feats/paragon/sorcerer.json");
    ]
  ]
}
