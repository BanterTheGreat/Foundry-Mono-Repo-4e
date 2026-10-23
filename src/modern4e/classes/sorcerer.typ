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
      #theme.featBlock(
        title: "Mastery of Knives",
        content: [
          You gain proficiency with the kukri and katar, and you can treat them as daggers for the purpose of casting sorcerer spells.
        ],
      );

      #theme.featBlock(
        title: "Sorcerous Blade Channeling",
        content: [
          When you use any ranged sorcerer attack power through a dagger, you can use the power as a melee attack. If you do so, the power's range equals your melee reach.
        ],
      );

      #theme.featBlock(
        title: "Arcane Spellfury",
        content: [
          When you hit any enemy with a sorcerer at-will attack power, you gain a +1 bonus to attack rolls against that enemy until the end of your next turn.
        ],
      );

      #theme.featBlock(
        title: "Focusing Spellfury",
        content: [
          When you use a sorcerer at-will attack power and hit two or more enemies, you gain a +2 bonus to damage rolls with ranged and melee attack powers until the end of your next turn.
        ],
      );

      #theme.featBlock(
        title: "Rising Spellfury",
        content: [
          When you use a sorcerer at-will attack power and hit only one enemy, you gain a +1 bonus to attack rolls with area and close attack powers until the end of your next turn.
        ],
      );

      #theme.featBlock(
        title: "Leatherbound Sorcerer",
        content: [
          You become proficient in leather armor.
        ],
      );

      #theme.featBlock(
        title: "Armored Sorcerer",
        requirements: "Proficient in leather armor.",
        content: [
          When wearing leather armor, any resistance you gain from your Spell Source class feature increases by 2.
        ],
      );

      #theme.featBlock(
        title: "Tempest Magic",
        requirements: "2 Constitution, 2 Dexterity, Storm Magic",
        content: [
          When you use an arcane power that has the lightning or thunder keyword, you gain a +1 feat bonus to damage rolls. While you are bloodied, this bonus becomes +2.
          At 11th level, this bonus increases to +2 (or +4 when bloodied). At 21st level, it increases to +3 (or +6 when bloodied).
        ],
      );

      #theme.featBlock(
        title: "Improved Dragon Soul",
        requirements: "Dragon Magic",
        content: [
          The resistance granted by your Dragon Soul increases by 2. The increase changes to 5 at 11th level and 10 at 21st level.
        ],
      );

      #theme.featBlock(
        title: "Coincidental Success",
        requirements: "Wild Magic",
        content: [
          Once per encounter when you make a skill check as a part of a skill challenge, choose 1–10 or 11–20. If the result of the d20 roll for that skill check is within the range selected, you automatically earn one success for that skill challenge.
        ],
      );


      #theme.featBlock(
        title: "Disciplined Wild Soul",
        requirements: "Wild Magic",
        content: [
          When determining your Wild Soul damage type, roll twice and use either result.
        ],
      );
      #theme.featBlock(
        title: "Distracting Coincidences",
        requirements: "Wild Magic",
        content: [
          Targets you slide with sorcerer attacks or your Unfettered Power take a -2 penalty to AC until the end of your next turn.
        ],
      );

      #theme.featBlock(
        title: "Fortunate Resistance",
        requirements: "Wild Magic",
        content: [
          When you roll for your Wild Soul resistance, choose 1–5 or 6–10. If the result of your first die roll is within the range selected, you can choose any result to replace that die roll.
        ],
      );

      #theme.featBlock(
        title: "Gambler’s Initiative",
        requirements: "Wild Magic",
        content: [
          Before rolling an initiative check, choose even numbers or odd numbers. If the result of the d20 roll for that initiative check matches the type of number selected, you gain a feat bonus to that initiative check equal to your Charisma.
        ],
      );

      #theme.featBlock(
        title: "Unlucky Teleport",
        requirements: "Wild Magic",
        content: [
          Enemies you teleport with sorcerer powers or with sorcerer paragon path powers or class features take 1d10 psychic damage
        ],
      );

      #block(
        [
          #theme.featBlock(
            title: "Lucky Shot",
            requirements: "Wild Magic",
            content: [
              When you use a daily sorcerer attack power or a daily sorcerer paragon path attack power, for one attack roll choose even numbers or odd numbers. If the result of the d20 roll matches the type of number selected, you gain a feat bonus to the damage roll against the target equal to your Charisma for this attack
            ],
          );
        ],
        breakable: false,
      );

      #theme.featBlock(
        title: "Student of the Cosmos",
        requirements: "Cosmic Magic",
        content: [
          You gain an additional benefit based on your current phase in the cosmic cycle:
          - *Phase of the Sun:* You gain a +2 feat bonus to initiative checks.
          - *Phase of the Moon:* You gain a +2 feat bonus to arcane technique checks.
          - *Phase of the Stars:* You gain a +2 feat bonus to Skill Checks to hide or sneak.
        ],
      );

      #theme.featBlock(
        title: "Cosmic Blade Channeling",
        requirements: "Cosmic Magic, Sorcerous Blade Channeling",
        content: [
          Once per round, when you hit with an attack made using Sorcerous Blade Channeling, you gain a benefit based on your current phase:
          - *Phase of the Sun:* You push the target 1 square.
          - *Phase of the Moon:* You slide the target 1 square to a square adjacent to you.
          - *Phase of the Stars:* You roll a saving throw.
        ],
      );
    ]

    #pagebreak();

    #align(center)[
      = Paragon #className Feats (Level 11+)
    ]

    #columns(2)[
      // https://iws.mx/dnd/?view=feat1034 — Player's Handbook 2, page(s) 190.
      #theme.featBlock(
        title: "Arcane Flexibility",
        requirements: "11th level",
        content: [
          When you score a critical hit with a sorcerer power, you can change the damage type dealt by the power to a damage type you have resistance or immunity to.
        ],
      );

      // https://iws.mx/dnd/?view=feat1171 — Arcane Power, page(s) 130.
      #theme.featBlock(
        title: "Cosmic Spellfury",
        requirements: "11th level, Cosmic Magic",
        content: [
          Whenever you hit at least one enemy with a sorcerer at-will attack power, you gain a benefit based on your current phase in the cosmic cycle. This benefit applies after the attack is resolved.
          Phase of the Sun: You can roll a saving throw.
          Phase of the Moon: You gain concealment until the end of your next turn.
          Phase of the Stars: You become insubstantial until the end of your next turn or until you are hit by an attack.
        ],
      );

      // https://iws.mx/dnd/?view=feat576 — Player's Handbook 2, page(s) 190.
      #theme.featBlock(
        title: "Draconic Spellfury",
        requirements: "11th level, Dragon Magic",
        content: [
          Whenever you hit an enemy with a sorcerer at-will attack power, you gain temporary hit points equal to your Strength.
        ],
      );

      // https://iws.mx/dnd/?view=feat1187 — Arcane Power, page(s) 133.
      #theme.featBlock(
        title: "Sorcerous Reserves",
        requirements: "11th level",
        content: [
          When you have expended all your sorcerer daily attack powers, you gain a +1 bonus to attack rolls with sorcerer at-will attack powers until you regain the use of one of your sorcerer daily attack powers.
        ],
      );

      // https://iws.mx/dnd/?view=feat1188 — Arcane Power, page(s) 133.
      #theme.featBlock(
        title: "Sorcerous Vision",
        requirements: "11th level",
        content: [
          Whenever you would make a Perception check or an Insight check, you can make an Arcana check instead.
        ],
      );

      // https://iws.mx/dnd/?view=feat1189 — Arcane Power, page(s) 133.
      #theme.featBlock(
        title: "Storm Spellfury",
        requirements: "11th level, Storm Magic",
        content: [
          Whenever you use a sorcerer at-will attack power and hit at least one enemy, you can fly 2 squares as a free action after resolving the attack.
        ],
      );

      // https://iws.mx/dnd/?view=feat1050 — Player's Handbook 2, page(s) 193.
      #theme.featBlock(
        title: "Wild Spellfury",
        requirements: "11th level, Wild Magic",
        content: [
          Whenever you hit an enemy with a sorcerer at-will attack power, each enemy adjacent to you takes damage equal to your Dexterity.
        ],
      );
    ]
  ]
}
