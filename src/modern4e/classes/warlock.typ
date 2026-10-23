#import "../helpers/theme.typ";
#import "../helpers/classes.typ" as classes;
#import "../helpers/powers.typ";

#let className = "Warlock";

#let warlockPage() = {
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
          ),
          weaponProficiencies: (classes.weaponProf.simpleMelee, classes.weaponProf.simpleRanged),
          implementProficiencies: (classes.implementProf.rod, classes.implementProf.wand, classes.implementProf.tome),
        );

        #classes.defensesAndHealth(
          fortitude: 11,
          will: 12,
          reflex: 12,
          health: 22,
          healthOnLevelUp: 5,
          healingSurges: 6,
        )

        #classes.abilities(
          mainAbilities: ("Charisma", "Constitution"),
          extraAbilities: "Intelligence",
          class: className,
        );
      ],
    )[
      = Warlock's Curse
      You can use the Warlock's Curse Power.

      #powers.power(
        title: "Warlock's Curse",
        type: powers.powerType.at-will,
        range: [Special],
        target: "The enemy nearest to you that you can see",
        action: powers.actionType.minor,
        traits: [Curse],
        isSpecial: true,
        additionalRows: (
          [
            *Effect:*  You place a Warlock's Curse on the enemy. If you hit a cursed enemy with an attack, you deal +1d6 damage. You decide whether to apply the extra damage after making the damage roll. You can deal this extra damage to each enemy only once per turn.

            A Warlock's Curse remains in effect until the end of the encounter or until the cursed enemy drops to 0 hit points or fewer.
            You can't place a Warlock's Curse on a creature that is already affected by your or another character's Warlock's Curse.

            *Level 11:*	+2d6 damage. #linebreak()
            *Level 21:*	+3d6 damage. #linebreak()
          ],
          [*Special:*  You can only use Warlock's Curse once per turn.],
        ),
      )

      = Eldritch Attack
      #theme.buildChoiceHeader()
      Warlocks may specialise in blade or blast, choose one of the options below:

      #theme.choiceBlock(
        title: "Eldritch Blast",
        body: [
          You specialize at ranged combat, firing bolts of eldritch energy at your foes. You learn the Eldritch Blast power.
          #powers.power(
            fill: theme.bgColor,
            title: "Eldritch Blast",
            description: "You fire a bolt of dark, crackling eldritch energy at your foe.",
            type: powers.powerType.at-will,
            range: [*Ranged* 10],
            target: "One creature",
            action: powers.actionType.standard,
            offenseStat: "Charisma or Constitution",
            defenseStat: powers.defense.reflex,
            traits: [Arcane, Implement],
            isSpecial: true,
            additionalRows: (
              [
                *Hit:* 1d10 + Charisma or Constitution damage. #linebreak()

                *Level 21:* 2d10 + Charisma or Constitution damage.
              ],
            ),
          );
        ],
      )

      #block(
        [

          #theme.choiceBlock(
            title: "Eldritch Strike",
            body: [
              You specialize at melee combat, using your eldritch power to drive back your foes. You learn the Eldritch Strike power.
              #powers.power(
                fill: theme.bgColor,
                title: "Eldritch Strike",
                description: "The dire power of your attack drives your enemy before you.",
                type: powers.powerType.at-will,
                range: [*Melee* weapon],
                target: "One creature",
                action: powers.actionType.standard,
                offenseStat: "Charisma or Constitution",
                defenseStat: powers.defense.ac,
                traits: [Arcane, Weapon, Basic],
                additionalRows: (
                  [
                    *Hit:* 1[W] + Charisma or Constitution damage, and you slide the target 1 square. #linebreak()

                    *Level 21:* 2[W] + Charisma or Constitution.
                  ],
                  [
                    *Special:* This power counts as a melee basic attack.
                  ],
                ),
              );
            ],
          )
        ],
        breakable: false,
      );
    ]

    #classes.classFeatures[
      = Eldritch Pact
      #theme.buildChoiceHeader()
      You have forged a pact with mysterious entities that grant you your arcane powers. Choose one pact. The pacts presented in the Player's Handbook are the fey pact, the infernal pact, and the star pact. Other products present additional pacts. The pact you choose determines the following Warlock abilities:
      - *At-Will Spells:* Your pact determines one of the at-will spells you know.
      - *Pact Boon:* Each pact includes a pact boon. The pact boon is a granted power you can use to further hex your enemies.

      The pact you take also provides bonuses to certain Warlock powers. Individual powers detail the effects (if any) your Eldritch Pact selection has on them. Choose one of the following pacts:

      #theme.bigChoiceBox(title: "Dark Pact", content: [
        You have forged a pact with the dark beings that lurk in the shadows of the drow civilization. Spells of darkness, poison, madness, and spite fill your mind. You might turn your powers to noble ends, but you always face the temptation to enhance your spells by hurting your friends—just a little.

        == Darkspiral Aura
        You gain the Darkspiral Aura power.

        #powers.power(
          fill: theme.bgColor,
          title: "Darkspiral Aura",
          description: "As your cursed enemies fall in battle, your Darkspiral Aura grows in power. You can unleash it on an enemy, blasting its mind and body.",
          type: powers.powerType.at-will,
          range: [*Special*],
          action: powers.actionType.immediateInterrupt,
          trigger: "When an enemy under your Warlock's Curse makes a melee attack or a ranged attack against you",
          traits: [Arcane, Necrotic, Psychic],
          additionalRows: (
            [
              *Effect:* When an enemy under your Warlock's Curse is reduced to 0 hit points or fewer, add 1 to your Darkspiral Aura. Your Darkspiral Aura has a starting value of 0, and it resets to 0 when you take a short rest or an extended rest.
            ],
            [
              *Hit:* 1d6 necrotic and psychic damage to that enemy for each point of your Darkspiral Aura's current value. #linebreak()

              *Level 11:* 1d8 damage. #linebreak()
              *Level 21:* 1d10 damage.
            ],
            [
              *Special:* If this attack deals less than 12 damage, the value of your Darkspiral Aura becomes 0.

              If this attack deals 12 damage or more, you can cause the enemy to be weakened for its attack (which means the attack deals half damage), and the value of your Darkspiral Aura becomes 1.
            ],
          ),
        );

        == Spiteful Glamor
        You gain the Spiteful Glamor at-will spell.
        #powers.power(
          fill: theme.bgColor,
          title: "Spiteful Glamor",
          description: "The mere sight of you is anathema to your enemy.",
          type: powers.powerType.at-will,
          range: [*Ranged* 10],
          target: "One creature",
          action: powers.actionType.standard,
          offenseStat: "Charisma",
          defenseStat: powers.defense.will,
          traits: [Arcane, Implement, Psychic],
          isSpecial: true,
          additionalRows: (
            [
              *Hit:* 1d8 + Charisma psychic damage, or 1d12 + Charisma psychic damage to a target at maximum hit points. #linebreak()

              *Level 21:* 2d8 + Charisma damage, or 2d12 + Charisma to a target at maximum hit points.
            ],
          ),
        )
      ])


      #theme.bigChoiceBox(title: "Elemental Pact", content: [
        The Elemental Chaos's power lured you into forging a pact with one of the inscrutable primordials. You reached into the rolling Plane Below and stole its power. Your magic is wild and random, changing to suit the powers you serve. The elemental power fueling your spells surprised your enemies with the seemingly random energy you can loose against them.

        == Elemental Affinity
        After short or extended rest, roll a d10 to determine your current elemental affinity. You can choose the damage type when you use your second wind, but the type changes again when you rest.

        #table(
          columns: (1fr, 1fr),
          stroke: none,
          align: left,
          fill: theme.defaultTableStyle(),
          inset: 4pt,
          [*D10*], [*Affinity*],
          [1-2], [Acid],
          [3-4], [Cold],
          [5-6], [Fire],
          [7-8], [Lightning],
          [9-10], [Thunder],
        )

        On your turn, when you use an arcane attack power that deals force, necrotic, poison, or psychic damage, you can change the damage type to match that of your current elemental affinity. Your elemental affinity's damage type replaces each instance of force, necrotic, poison, and psychic damage that the power deals.

        == Accursed Affinity
        You gain the Accursed Affinity pact boon.

        #powers.power(
          fill: theme.bgColor,
          title: "Accursed Affinity",
          type: powers.powerType.at-will,
          range: [*Close* Burst 20],
          action: powers.actionType.immediateReaction,
          trigger: "An enemy under your Warlock's Curse is reduced to 0 hit points or fewer",
          additionalRows: (
            [
              *Effect:* The next enemy you place your Warlock's Curse on gains vulnerable 5 to the damage type matching your current elemental affinity. This vulnerability is cumulative with the enemy's existing vulnerability to the same damage type, if any, and lasts until the curse ends.

              *Level 11:* Vulnerable 10. #linebreak()
              *Level 21:* Vulnerable 15.
            ],
          ),
        );

        == Chromatic Bolt
        You gain the chromatic bolt power.

        #powers.power(
          fill: theme.bgColor,
          title: "Chromatic Bolt",
          description: "You loose a crackling bolt of raw chaos against your foes.",
          type: powers.powerType.at-will,
          range: [*Ranged* 10],
          target: "One creature",
          action: powers.actionType.standard,
          offenseStat: "Charisma",
          defenseStat: powers.defense.reflex,
          traits: [Arcane, Elemental, Implement, Psychic, Basic],
          additionalRows: (
            [
              *Hit:* 1d6 + Charisma psychic damage, and one creature within 5 squares of the target takes psychic damage equal to your *Constitution*. #linebreak()

              *Level 21:* 2d6 + Charisma psychic damage, and one creature within 10 squares of the target takes psychic damage equal to your *Constitution*.
            ],
          ),
        );
      ])


      #theme.bigChoiceBox(title: "Fey Pact", content: [
        You have forged a bargain with ancient, amoral powers of the Feywild. Some are primitive earth spirits, grim and menacing; some are capricious wood, sky, or water spirits; and others are incarnations of seasons or natural forces who roam the faerie realm like wild gods. They bestow magic that ranges from feral and savage to wondrous and enchanting.

        == Misty Step
        You have the Misty Step pact boon

        #powers.power(
          fill: theme.bgColor,
          title: "Misty Step",
          description: "You instantly transform into silver mist that streams a short distance and reforms, allowing you to flee or maneuver to set up a deadly attack.",
          type: powers.powerType.at-will,
          range: [*Close* Burst 20],
          action: powers.actionType.free,
          trigger: "An enemy under your Warlock's Curse is reduced to 0 hit points or fewer",
          additionalRows: (
            [
              *Effect:* You teleport a number of squares up to your *Intelligence*. Once per turn, you may then deal Force damage equal to half your level plus your *Intelligence* to one adjacent creature.

              *Level 11:* One or two adjacent creatures. #linebreak()
              *Level 21:* Any number of adjacent creatures.
            ],
          ),
        );

        == Eyebite
        You know the eyebite spell

        #powers.power(
          fill: theme.bgColor,
          title: "Eyebite",
          description: "You glare at your enemy, and your eyes briefly gleam with brilliant colors. Your foe reels under your mental assault, and you vanish from his sight.",
          type: powers.powerType.at-will,
          range: [*Ranged* 10],
          target: "One or two creatures",
          action: powers.actionType.standard,
          offenseStat: powers.offense.charisma,
          defenseStat: powers.defense.will,
          traits: [Arcane, Charm, Implement, Psychic],
          additionalRows: (
            [
              *Hit:* 1d6 + Charisma psychic damage, and if you had combat advantage against the target you are invisible to the target until the start of your next turn. #linebreak()

              *Level 21:* 2d6 + Charisma damage.
            ],
          ),
        );
      ])



      #theme.bigChoiceBox(title: "Infernal Pact", content: [
        Long ago a forgotten race of devils created a secret path to power and taught it to the tieflings of old to weaken their fealty to Asmodeus. In his wrath, Asmodeus destroyed the scheming devils and struck their very names from the memory of all beings—but you dare to study their perilous secrets anyway.

        == Infernal Patronage
        You have the Infernal Patronage pact boon

        #powers.power(
          fill: theme.bgColor,
          title: "Infernal Patronage",
          type: powers.powerType.at-will,
          range: [*Close* Burst 20],
          action: powers.actionType.free,
          traits: [Arcane],
          trigger: "An enemy in range under your Warlock's Curse is reduced to 0 hit points or less.",
          additionalRows: (
            [
              *Effect:* You gain the following benefits
              - *Dark One's Blessing:* You gain temporary hit points equal to your level + your *Intelligence*. These temporary hit points disappear at the end of your next extended rest.
              - *Soul Pyre:* If the triggering enemy was not a minion, you may then make a _Soul Pyre_ attack.
            ],
          ),
        );

        #powers.power(
          fill: theme.bgColor,
          title: "Soul Pyre",
          description: "You unleash a burst of hellish flames from the location where your cursed enemy fell.",
          type: powers.powerType.at-will,
          range: [*Close* burst 1 on the triggering enemy],
          action: powers.actionType.noAction,
          target: "Each creature in burst",
          traits: [Arcane, Fire],
          isSpecial: true,
          additionalRows: (
            [
              *Effect:* Half your level + *Intelligence* fire damage. #linebreak()

              *Level 21:* Close burst 2.
            ],
            [
              *Special:* You may use Soul Pyre once per turn.
            ],
          ),
        );

        == Hellish Rebuke
        You gain the Hellish Rebuke spell

        #powers.power(
          fill: theme.bgColor,
          title: "Hellish Rebuke",
          description: "You point your finger, and your foe is scoured in hellish flames stoked by your own anger and pain. If you are injured, the flames burst into life one more time before they fade away.",
          type: powers.powerType.at-will,
          range: [*Ranged* 10],
          target: "One creature",
          action: powers.actionType.standard,
          offenseStat: "Constitution",
          defenseStat: powers.defense.reflex,
          traits: [Arcane, Fire, Implement],
          additionalRows: (
            [
              *Hit:* 1d8 + Constitution fire damage. The first time you take damage before the end of your next turn, the target takes 1d8 + Constitution fire damage. #linebreak()

              *Level 21:* 2d8 + Constitution damage and extra damage.
            ],
          ),
        );
      ])



      #theme.bigChoiceBox(title: "Star Pact", content: [
        You have mastered the astrologer's art, learning the secret names of the stars and gazing into the Far Realm beyond, gaining great power thereby. You can call upon powers that madden or terrify your enemies, manipulate chance and fate, or scour your foes with icy banes and curses drawn from beyond the night sky.

        == Fate of the Void
        You have the Fate of the Void pact boon.

        #powers.power(
          fill: theme.bgColor,
          title: "Fate of the Void",
          description: "Your curse intermingles with the lost vitality of a cursed enemy to reveal a glimpse of the future to you.",
          type: powers.powerType.at-will,
          range: [*Close* Burst 20],
          action: powers.actionType.free,
          traits: [Arcane],
          trigger: "An enemy in range under your Warlock's Curse is reduced to 0 hit points or less.",
          requirement: [You must not have more charges of Glimpses of the Void than your Intelligence (minimum 1).],
          additionalRows: (
            [
              *Effect:* You gain a charge of Glimpse of the Void.

              Whenever you make an attack, before making any attack rolls or applying any effects of the power, you may choose to spend any number of charges of Glimpse of the Void to enhance the power.

              - If you spend one charge of Glimpse of the Void, you gain combat advantage and a bonus to damage rolls with the power equal to your *Intelligence*.
              - For each additional charge you spend, you gain an additional +1 bonus to attack rolls and an additional +2 bonus to damage rolls with the power.

              Whenever you make an ability check, skill check, or saving throw, before making the roll, you may choose to spend any number of charges of Glimpse of the Void to enhance the roll.

              - If you spend one charge of Glimpse of the Void, you gain a +2 bonus to the roll.
              - For each additional charge you spend, you gain an additional +1 bonus to the roll.

              *Level 11:* Increase the additional bonus to damage rolls when spending additional charges to +3. #linebreak()
              *Level 21:* Increase the additional bonus to damage rolls when spending additional charges to +4.
            ],
          ),
        );

        Whenever you complete a short or extended rest and have charges of Glimpse of the Void remaining, you gain temporary hit points equal to your *Intelligence* for each charge. All of your charges of Glimpse of the Void then dissipate. These temporary hit points disappear at the end of your next extended rest.

        == Dire Radiance
        You gain the Dire Radiance power.

        #powers.power(
          fill: theme.bgColor,
          title: "Dire Radiance",
          description: "You cause a shaft of brilliant, cold starlight to lance down from above, bathing your foe in excruciating light. The nearer he moves toward you, the brighter and more deadly the light becomes.",
          type: powers.powerType.at-will,
          range: [*Ranged* 10],
          target: "One creature",
          action: powers.actionType.standard,
          offenseStat: "Charisma or Constitution",
          defenseStat: powers.defense.fortitude,
          traits: [Arcane, Fear, Implement, Radiant],
          additionalRows: (
            [
              *Hit:* 1d6 + Charisma or Constitution radiant damage. The first time the target moves closer to you on its next turn, it takes 1d6 + Charisma or Constitution damage. This is a fear effect.

              *Level 21:* 2d6 + Charisma or Constitution damage.
            ],
          ),
        );
      ])

      = Prime Shot
      If none of your allies are nearer to your target than you are, you receive a +1 bonus to ranged attack rolls against that target.

      = Shadow Walk
      On your turn, if you move at least 3 squares away from where you started your turn, you gain concealment until the end of your next turn.

      = Powers
      You may choose 1 Encounter and 2 Daily Warlock Powers.

      #classes.powerLinks(className: className, skipAtWill: true, skipPaths: true);


    ]

    #pagebreak()

    = #className Paragon Paths
    #classes.zeitgeistPathReference()

    #theme.pathBlocksFromJson("../content/paths/warlock.json");

    #pagebreak()

    #align(center)[
      = Heroic #className Feats
    ]
    #columns(2)[
      #theme.featBlocksFromJson("../content/feats/heroic/warlock.json");
    ]

    #pagebreak()

    #align(center)[
      = Paragon #className Feats (Level 11+)
    ]
    #columns(2)[
      #theme.featBlocksFromJson("../content/feats/paragon/warlock.json");
    ]
  ]
}
