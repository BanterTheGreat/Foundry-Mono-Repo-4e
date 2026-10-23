#import "../helpers/theme.typ" as theme;

#import "../helpers/classes.typ" as classes;

#import "../helpers/powers.typ";

#let className = "Wizard";

#let wizardPage() = {
  return [
    #classes.bannerPage(
      className: className,
    );


    #classes.classOverview(
      className: className,
      reference: [
        #classes.proficiencies(
          armorProficiencies: (classes.armorProf.cloth),
          weaponProficiencies: (classes.weaponProf.simpleMelee, classes.weaponProf.simpleRanged),
          implementProficiencies: (
            classes.implementProf.orb,
            classes.implementProf.staff,
            classes.implementProf.wand,
            classes.implementProf.tome,
          ),
        );

        #classes.defensesAndHealth(fortitude: 11, will: 13, reflex: 11, health: 20, healthOnLevelUp: 4, healingSurges: 6)

        #classes.abilities(
          mainAbilities: "Intelligence",
          extraAbilities: ("Wisdom", "Constitution"),
          class: className,
        );
      ],
    )[

      = Spellbook
      You possess a spellbook, a book full of mystic lore in which you store your rituals and your daily and utility spells.

      == Daily and Utility Powers
      Your spellbook holds your wizard daily attack powers and wizard utility powers (not including your cantrips). You begin with two daily attack powers in your spellbook, one of which you can use on any given day. Each time you gain a level that lets you select a wizard daily attack power or a wizard utility power, choose two different powers of that type at that level and add them to your book.
      After each extended rest, you can prepare a number of daily attack powers and utility powers according to what you can use per day for your level (see the Wizard Powers Prepared per Day table). You can't prepare the same power twice on the same day.

      If you replace a power because of gaining a level or through retraining, the previous power vanishes from your spellbook and is replaced by the new power.

      == Techniques
      Your book also contains three 1st-level magic Techniques of your choice that you have mastered.
      At 5th level, and again at 11th, 15th, 21st, and 25th level, you master two more Techniques of your choice and add them to your spellbook. When you choose the Techniques , they must be your level or lower.

      == Capacity
      A typical spellbook has 128 pages. Each power takes up 1 page. A Techniques takes up a number of pages equal to its level.

      #block(
        [
          *Wizard powers prepared per day*
          #block(table(
            columns: (1fr, 1fr, 1fr),
            stroke: theme.tableDivider,
            align: left,
            fill: theme.defaultTableStyle(),
            inset: 8pt,
            [*Level*], [*Daily*], [*Utility*],
            [1], [1], [-],
            [2-4], [1], [1],
            [5], [2], [1],
            [6-8], [2], [2],
            [9], [3], [2],
            [10-15], [3], [3],
            [16-21], [3], [4],
            [22-30], [3], [5],
          ))],
        breakable: false,
      )
    ]

    #classes.classFeatures[
      = Arcane Implement Mastery
      #theme.buildChoiceHeader()
      You specialize in the use of one kind of implement to gain additional abilities when you wield it. Choose one of the following forms of implement mastery below.

      #theme.choiceBlock(
        title: "Orb of Imposition",
        body: [
          Once per encounter, you can use your Orb of Imposition power.

          #powers.power(
            fill: theme.bgColor,
            title: "Orb of Imposition",
            type: powers.powerType.encounter,
            action: powers.actionType.free,
            traits: "Implement",
            range: "Special",
            requirement: "You must wield an orb to use this ability.",
            additionalRows: (
              [
                *Effect:* You can use your orb to gain one of the following two effects.

                You can designate one creature you have cast a wizard spell upon that has an effect that lasts until the subject succeeds on a saving throw. That creature takes a penalty to its next saving throw against that effect equal to your Wisdom.

                Alternatively, you can choose to extend the duration of an effect created by a wizard at-will spell (such as cloud of daggers or ray of frost) that would otherwise end at the end of your current turn. The effect instead ends at the end of your next turn.],
            ),
          )
        ],
      )

       
      #theme.choiceBlock(
        title: "Staff of Defense",
        body: [
          A staff of defense grants you a +1 bonus to AC. In addition, once per encounter, you can use the Staff of Defense power.

          #powers.power(
            fill: theme.bgColor,
            title: "Staff of Defense",
            type: powers.powerType.encounter,
            action: powers.actionType.immediateInterrupt,
            traits: "Implement",
            range: "Special",
            requirement: "You must wield your staff.",
            additionalRows: (
              [
                *Effect:* You gain a bonus to defense against one attack equal to your Constitution. You can declare the bonus after the Dungeon Master has already told you the damage total.],
            ),
          )
        ],
      )

       
      #theme.choiceBlock(
        title: "Wand of Accuracy",
        body: [
          Once per encounter, you can use your Wand of Accuracy power.

          #powers.power(
            fill: theme.bgColor,
            title: "Wand of Accuracy",
            type: powers.powerType.encounter,
            action: powers.actionType.free,
            traits: "Implement",
            range: "Special",
            requirement: "You must wield your wand.",
            additionalRows: (
              [
                *Effect:* You gain a bonus to a single attack roll equal to your Intelligence.],
            ),
          )
        ],
      )
       
      #theme.choiceBlock(
        title: "Orb of Deception",
        body: [
          Once per encounter, you can use your Orb of Deception power.
          #powers.power(
            fill: theme.bgColor,
            title: "Orb of Deception",
            type: powers.powerType.encounter,
            action: powers.actionType.free,
            traits: "Implement",
            range: "Special",
            trigger: "When you miss an enemy with a wizard illusion power",
            requirement: "You must wield an orb to use this ability.",
            additionalRows: (
              [
                *Effect:* Choose another enemy within 3 squares of the missed target. The chosen enemy cannot also be a target of the original attack. Repeat the attack against this new target, with a bonus to the attack roll equal to your Wisdom.],
            ),
          )
        ],
      )

       
      #theme.choiceBlock(
        title: "Tome of Binding",
        body: [
          Once per encounter, as a free action, if you use your tome when using an arcane summoning power, all creatures summoned by that power gain a bonus to damage rolls equal to your Constitution.

          You must wield a tome to benefit from this feature.
        ],
      )

      #block(
        [
           
          #theme.choiceBlock(
            title: "Tome of Readiness",
            body: [
              When you select this form of implement mastery, choose a wizard encounter attack power of your level or lower that you don't already know. That power is now stored and available for your use at a later time.

              Once per encounter as a free action, you can use the stored power by expending another unused wizard encounter attack power of its level or higher. You must still take the normal action required to use the stored power.

              Each time you reach a level that lets you choose an encounter power, you can replace the stored power with a new wizard encounter attack power of your level or lower that you do not already know.

              You must wield a tome to benefit from this feature.
            ],
          )
        ],
        breakable: false,
      )

      = Cantrips
      #theme.buildChoiceHeader(prompt: [Choose Four])
      You may choose 4 cantrips from the options below.

      #theme.choiceBlock(
        title: "Chameleon's Mask",
        body: [

          #powers.power(
            fill: theme.bgColor,
            title: "Chameleon's Mask",
            description: "You pull strands of shadow, blending your colors and sounds with your surroundings to help you hide from your enemy's sight and hearing.",
            type: powers.powerType.encounter,
            range: "Personal",
            action: powers.actionType.free,
            traits: "Arcane, Illusion",
            trigger: "You make a Skill Check to sneak or hide.",
            additionalRows: (
              [*Effect:* You may use your Arcana check for the check instead.],
            ),
          );
        ],
      )

       
      #theme.choiceBlock(
        title: "Spook",
        body: [
          #powers.power(
            fill: theme.bgColor,
            title: "Spook",
            description: "You gather the shadows to yourself, so that when you speak, your words drip with menace.",
            type: powers.powerType.encounter,
            range: "Personal",
            action: powers.actionType.free,
            traits: "Arcane, Nethermancy, Shadow",
            trigger: "You would make a Skill Check to intimidate or coerce someone.",
            additionalRows: (
              [*Effect:* You may use an Arcana check instead.],
            ),
          );
        ],
      )


       
      #theme.choiceBlock(
        title: "Suggestion",
        body: [
          #powers.power(
            fill: theme.bgColor,
            title: "Suggestion",
            description: "You weave arcane power through your words, infusing each phrase with persuasive magic.",
            type: powers.powerType.encounter,
            range: "Personal",
            action: powers.actionType.free,
            traits: "Arcane",
            trigger: "You would make a Skill Check to persuade someone.",
            additionalRows: (
              [*Effect:* You may use your Arcana check for the check instead.],
            ),
          );
        ],
      )

       
      #theme.choiceBlock(
        title: "Water Stride",
        body: [
          #powers.power(
            fill: theme.bgColor,
            title: "Water Stride",
            description: "You speed across a liquid surface as if it were solid ground.",
            type: powers.powerType.encounter,
            range: "Personal",
            action: powers.actionType.minor,
            traits: "Arcane",
            additionalRows: (
              [*Effect:* Until the end of your next turn, you can treat liquid surfaces as if they were solid ground but difficult terrain.],
            ),
          );
        ],
      )

       
      #theme.choiceBlock(
        title: "Whispering Wind",
        body: [
          #powers.power(
            fill: theme.bgColor,
            title: "Whispering Wind",
            description: "You speak a message to the wind and let it carry your words to an audience you choose.",
            type: powers.powerType.encounter,
            range: "Personal",
            action: powers.actionType.standard,
            traits: "Arcane",
            additionalRows: (
              [*Effect:* You cause a breeze to carry a message of up to 25 words or a sound up to 6 seconds long to a place you choose. The destination must be within a number of miles equal to your Intelligence and must be familiar to you, and it must be a location that the wind can reach. Once you complete the message or the sound, the wind travels at speed 5 (or 1 mile per hour) until it reaches the destination, where it conveys the message or the sound regardless of whether anyone hears it.],
            ),
          );
        ],
      )


       
      #theme.choiceBlock(
        title: "Prestidigitation",
        body: [
          #powers.power(
            fill: theme.bgColor,
            title: "Prestidigitation",
            description: "You perform an amusing magical trick, such as creating a dancing wisp of light, freshening a wilting flower, making a coin invisible, or warming a cold drink.",
            type: powers.powerType.at-will,
            range: "Ranged 2",
            action: powers.actionType.standard,
            traits: "Arcane",
            additionalRows: (
              [*Effect:* Use this cantrip to accomplish one of the effects given below:
                - Change the color of items in 1 cubic foot.
                - Create a harmless sensory effect, such as a shower of sparks, a puff of wind, faint music, or a strong odor.
                - Clean or soil items in 1 cubic foot.
                - Instantly light (or snuff out) a candle, a torch, or a small campfire.
                - Chill, warm, or flavor up to 1 pound of nonliving material for up to 1 hour.
                - Make a small mark or symbol appear on a surface for up to 1 hour.
                - Produce out of nothingness a small item or image that exists until the end of your next turn.
                - Make a small, handheld item invisible until the end of your next turn.
              ],
            ),
          );
        ],
      )

       
      #theme.choiceBlock(
        title: "Ghost Sound",
        body: [
          #powers.power(
            fill: theme.bgColor,
            title: "Ghost Sound",
            description: "With a wink, you create an illusory sound that emanates from a distant location.",
            type: powers.powerType.at-will,
            range: "Ranged 10",
            action: powers.actionType.standard,
            traits: "Arcane, Illusion",
            target: "One object or unoccupied square",
            additionalRows: (
              [*Effect:* You cause a sound as quiet as a whisper or as loud as a yelling or fighting creature to emanate from the target. You can produce nonvocal sounds such as the ringing of a sword blow, jingling armor, or scraping stone. If you whisper, you can whisper quietly enough that only creatures adjacent to the target can hear your words.],
            ),
          );
        ],
      )


       
      #theme.choiceBlock(
        title: "Light",
        body: [
          #powers.power(
            fill: theme.bgColor,
            title: "Light",
            description: "With a wave of your hand, you cause a bright light to appear on the tip of your staff, upon some other object, or in a nearby space.",
            type: powers.powerType.at-will,
            range: "Ranged 5",
            action: powers.actionType.minor,
            traits: "Arcane",
            target: "One object or unoccupied square",
            additionalRows: (
              [*Effect:* The target sheds bright light until the end of the encounter or until you use this power again. The light fills the target's space and all squares within 4 squares of it. Putting out the light is a free action.],
            ),
          );
        ],
      )

       
      #theme.choiceBlock(
        title: "Mage Hand",
        body: [
          #powers.power(
            fill: theme.bgColor,
            title: "Mage Hand",
            description: "You gesture toward an object nearby, and a spectral floating hand lifts the object into the air and moves it where you wish.",
            type: powers.powerType.at-will,
            range: "Ranged 5",
            action: powers.actionType.minor,
            traits: "Arcane, Conjuration",
            additionalRows: (
              [*Effect:* You conjure a spectral, floating hand in an unoccupied square within range. The hand lasts until the end of your next turn or until you use this power again. If you are holding an object when you use this power, the hand can move the object into a pack, a pouch, a sheath, or a similar container and simultaneously move any one object carried or worn anywhere on your body into your hand. While the hand persists, you can take the following actions.

                *Minor Action:* The hand picks up or manipulates an object weighing 20 pounds or less. It can hold only one object at a time.

                *Move Action:* The hand moves up to 5 squares in any direction, carrying the object it holds.

                *Free Action:* The hand drops the object it is holding.
                *Sustain Minor:* The hand persists until the end of your next turn.],
            ),
          );
        ],
      )

      = Arcane Techniques
      You gain the Technique Master feat for Arcane Techniques.

      #colbreak()

      = Powers
      You may choose 2 At-Will, 1 Encounter and 2 Daily #className Powers.



      #classes.powerLinks(className: className, skipPaths: true);
    ]

    #pagebreak()

    #align(center)[
      = #className Paragon Paths
    ]
    #classes.zeitgeistPathReference()


    #columns(2)[
      #theme.pathBlocksFromJson("../content/paths/wizard.json")
    ]

    #pagebreak()

    #set page(columns: 1)

    #align(center)[
      = Heroic #className Feats
    ]

    #columns(2)[
      #theme.featBlock(
        title: "Phantom Echoes",
        requirements: "2 Wisdom",
        content: [
          When you use an arcane illusion power and hit a target, you gain combat advantage against that target until the end of your next turn. If the illusion power has an effect that a save can end, you instead gain combat advantage against the target until it saves against that effect.
        ],
      );

      #theme.featBlock(
        title: "Careful Summoner",
        requirements: "2 Constitution",
        content: [
          Creatures created by your arcane summoning powers gain a +1 bonus to all defenses.
        ],
      );

      #theme.featBlock(
        title: "Destructive Wizardry",
        requirements: "2 Dexterity",
        content: [
          When you use an arcane attack power and hit two or more creatures, you gain a +2 bonus to that power's damage rolls. This bonus increases to +3 at 11th level and to +4 at 21st level.
        ],
      );

      #theme.featBlock(
        title: "Enlarge Spell",
        requirements: "2 Wisdom",
        content: [
          Before using a wizard at-will or encounter attack power, you can choose to take a -2 penalty to each die of damage rolled with the power to increase the size of its blast or its burst by 1.

          You can't use this feat on a power that doesn't roll dice for damage.
        ],
      );

      #theme.featBlock(
        title: "Expanded Spellbook",
        requirements: "2 Wisdom",
        content: [
          Choose one daily wizard attack spell of every level you know. Add this spell to your spellbook. Each time you gain a new level of daily wizard attack spells, you learn one extra spell of that level (in other words, add three spells to your spellbook instead of only two).

          This feat doesn't change the number of daily attack spells you can prepare each day.
        ],
      );

      #theme.featBlock(
        title: "Bitter Cold",
        content: [
          When you hit a creature with a cold wizard power, that creature also takes a -2 penalty to its Fortitude until the end of your next turn.
        ],
      );

      #colbreak();

      #theme.featBlock(
        title: "Burn Everything",
        content: [
          Your arcane fire powers ignore an amount of fire resistance equal to your Intelligence. The fire resistance you ignore increases to 5 + your Intelligence at 11th level and to 10 + your Intelligence at 21st level. If the creature is immune to fire, instead treat that creature as having resist fire 25.
        ],
      );

      #theme.featBlock(
        title: "Far Spell",
        content: [
          If a wizard power has a range of 10 squares or fewer, increase the power's normal range by 2 squares. If a wizard power has a range of 11–20 squares, increase the power's normal range by 5 squares. This also applies to area powers, so an area burst 1 within 10 becomes an area burst 1 within 12.
        ],
      );

      #theme.featBlock(
        title: "Immolate the Masses",
        content: [
          When you use a wizard power, you gain 1 temporary hit point for each minion you reduce to 0 hit points with that power.
        ],
      );

      #theme.featBlock(
        title: "Stoking the Fire",
        content: [
          When you hit a target with a fire attack, you gain a +2 power bonus to your next damage roll with a fire attack against that target before the end of your next turn.
        ],
      );

      #theme.featBlock(
        title: "Sympathy of Flame",
        content: [
          You gain a +2 feat bonus to damage rolls with arcane fire attacks against creatures taking ongoing fire damage. This bonus increases to +4 at 11th level and +6 at 21st level.
        ],
      );

      #theme.featBlock(
        title: "Illusionary Stealth",
        content: [
          Whenever you use a wizard illusion power and you hit a target, you gain a feat bonus to Skill Checks to hide or sneak equal to your Intelligence until the end of your next turn.
        ],
      );

      #theme.featBlock(
        title: "Arcane Fire",
        content: [
          When you hit a target with an arcane fire power, that target gains vulnerable 5 cold against the first arcane attack power you use against it before the end of your next turn.
        ],
      );
    ]

    #pagebreak()

    #align(center)[
      = Paragon #className Feats (Level 11+)
    ]

    #columns(2)[
      // Source: https://iws.mx/dnd/?view=feat1998
      #theme.featBlock(
        title: "Acid Splash",
        requirements: "11th level, 2 Constitution",
        content: [
          When you miss with an acid wizard power and would not normally do damage, you deal acid damage equal to your Constitution.
        ],
      );

      // Source: https://iws.mx/dnd/?view=feat3071
      #theme.featBlock(
        title: "Consuming the Weak",
        requirements: "11th level",
        content: [
          Whenever you hit a target vulnerable to fire with an arcane fire attack, the target takes ongoing 5 fire damage in addition to the attack's normal effects (save ends).
        ],
      );

      // Source: https://iws.mx/dnd/?view=feat1999
      #theme.featBlock(
        title: "Energy Recovery",
        requirements: "11th level, 2 Wisdom",
        content: [
          Whenever a creature fails a saving throw against an effect from one of your wizard powers, you gain temporary hit points equal to your Wisdom.
        ],
      );

      // Source: https://iws.mx/dnd/?view=feat1176
      #theme.featBlock(
        title: "Improved Orb of Deception",
        requirements: "11th level, 3 Charisma, Orb of Deception",
        content: [
          While you wield an orb, any creature you hit with an arcane illusion power grants combat advantage to your next ally who attacks it before the start of your next turn.
        ],
      );

      // Source: https://iws.mx/dnd/?view=feat1177
      #theme.featBlock(
        title: "Improved Orb of Imposition",
        requirements: "11th level, 3 Wisdom, Orb of Imposition",
        content: [
          Each time a creature you have designated with your Orb of Imposition fails a saving throw against the effect you have specified, it takes damage equal to 5 + your Wisdom.
        ],
      );

      // Source: https://iws.mx/dnd/?view=feat1178
      #theme.featBlock(
        title: "Improved Staff of Defense",
        requirements: "11th level, 2 Constitution, 2 Dexterity, Staff of Defense",
        content: [
          While you wield a staff, you gain a +1 bonus to Fortitude, Reflex, and Will.
        ],
      );

      // Source: https://iws.mx/dnd/?view=feat1179
      #theme.featBlock(
        title: "Improved Tome of Binding",
        requirements: "11th level, 3 Constitution, Tome of Binding",
        content: [
          While you wield a tome, creatures created by your arcane summoning powers appear with 10 temporary hit points.
        ],
      );

      // Source: https://iws.mx/dnd/?view=feat1180
      #theme.featBlock(
        title: "Improved Tome of Readiness",
        requirements: "11th level, 2 Constitution, 2 Wisdom, Tome of Readiness",
        content: [
          After you prepare your daily and utility wizard powers after an extended rest, choose one daily or utility power in your spellbook that you didn't prepare and store this power in your tome.

          Once per encounter as a free action, you can use this stored power by expending another unused wizard power of the appropriate type (daily or utility) of its level or higher. You must still take the normal action required to use the stored power.
        ],
      );

      // Source: https://iws.mx/dnd/?view=feat1181
      #theme.featBlock(
        title: "Improved Wand of Accuracy",
        requirements: "11th level, 3 Dexterity, Wand of Accuracy",
        content: [
          While you wield a wand, your arcane powers ignore enemies' cover (but not superior cover).
        ],
      );

      // Source: https://iws.mx/dnd/?view=feat2000
      #theme.featBlock(
        title: "Lightning Transport",
        requirements: "11th level, 2 Constitution",
        content: [
          When you reduce a creature to 0 hit points or fewer with a wizard lightning power, you can teleport a number of squares equal to your Constitution as a free action.
        ],
      );

      // Source: https://iws.mx/dnd/?view=feat2001
      #theme.featBlock(
        title: "Phantasmal Destruction",
        requirements: "11th level",
        content: [
          When you have combat advantage against a creature, any wizard illusion power that you use against that creature scores a critical hit on a roll of 19–20.
        ],
      );

      // Source: https://iws.mx/dnd/?view=feat2047
      #theme.featBlock(
        title: "Prophetic Preparation",
        requirements: "11th level, Vistani Heritage",
        content: [
          Once per day, as a free action, you can swap one daily attack spell you didn't prepare in place of one you did prepare. Also once per day, as a free action, you can swap one utility spell you didn't prepare in place of one you did prepare. You choose the replacement spell at the time you use it.
        ],
      );

      // Source: https://iws.mx/dnd/?view=feat320
      #theme.featBlock(
        title: "Second Implement",
        requirements: "11th level",
        content: [
          You gain a second Arcane Implement Mastery class feature.
        ],
      );

      // Source: https://iws.mx/dnd/?view=feat169
      #theme.featBlock(
        title: "Spell Focus",
        requirements: "11th level, 2 Charisma",
        content: [
          Creatures that attempt saving throws against your wizard powers take a –2 penalty to the rolls.
        ],
      );

      // Source: https://iws.mx/dnd/?view=feat2002
      #theme.featBlock(
        title: "Sympathetic Transference",
        requirements: "11th level",
        content: [
          When you immobilize, restrain, or slow an enemy, choose an ally within 20 squares of you that is also suffering the same condition. End that condition.
        ],
      );

      // Source: https://iws.mx/dnd/?view=feat647
      #theme.featBlock(
        title: "War Wizardry",
        requirements: "11th level",
        content: [
          Your arcane spells take a –5 penalty on attack rolls against allies, and deal only half their normal damage to allies.
        ],
      );

    ]
  ]
}
