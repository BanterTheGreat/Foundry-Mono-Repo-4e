#import "../helpers/theme.typ";
#import "../helpers/classes.typ" as classes;
#import "../helpers/powers.typ";

#let className = "Invoker";

#let invokerPage() = {
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
          implementProficiencies: (classes.implementProf.rod, classes.implementProf.staff),
        );

        #classes.defensesAndHealth(fortitude: 12, will: 12, reflex: 12, health: 20, healthOnLevelUp: 4, healingSurges: 6)

        #classes.abilities(
          mainAbilities: "Wisdom",
          extraAbilities: ("Constitution", "Intelligence"),
          class: className,
        );
      ],
    )[
      = Channel Divinity
      Once per encounter you can invoke divine power, filling yourself with the strength of your patron deity. With the divine strength you invoke you can wield special powers. You can also learn other uses for this feature; for instance, the divinity feats grant characters with access to the Channel Divinity class feature the ability to use additional special powers.

      Regardless of how many different uses for Channel Divinity you know, you can use only one such ability per encounter. The special ability or power you invoke works just like your other powers. You gain the Rebuke Undead Channel Divinity power.

      #powers.power(
        title: "Rebuke Undead",
        description: "Undead flee and then cower in your presence, their bodies seared by divine light.",
        type: powers.powerType.encounter,
        range: [*Close* blast 5],
        action: powers.actionType.standard,
        offenseStat: "Wisdom",
        defenseStat: "Will",
        target: "Each undead creature in the blast",
        traits: "Channel Divinity, Divine, Implement, Radiant",
        additionalRows: (
          [
            *Hit:* 1d10 + Wisdom radiant damage. You push the target 2 squares, and it is dazed until the end of your next turn. #linebreak();

            *Level 5:* 2d10 + Wisdom radiant damage. #linebreak();
            *Level 11:* 3d10 + Wisdom radiant damage. #linebreak();
            *Level 15:* 4d10 + Wisdom radiant damage. #linebreak();
            *Level 21:* 5d10 + Wisdom radiant damage. #linebreak();
            *Level 25:* 6d10 + Wisdom radiant damage. #linebreak();
          ],
          [
            *Miss:* Half damage.
          ],
          [*Channel Divinity*: You can use only one channel divinity power per encounter],
        ),
      );

      = Divine Covenant
      #theme.buildChoiceHeader()
      Invokers wield ancient divine power that is not accessible to most mortals -- only to those who enter into a personal covenant with a god. Invokers undergo long years of study and testing. Only after that time are they allowed to enter into the final covenant that grants them access to this class's powers. Some say that, in the final swearing of the covenant, the invoker's god briefly manifests, but the details of an invoker's initiation are a closely held secret.

      Choose one of the options described below. The Divine Covenant you choose provides you with a Channel Divinity power and a covenant manifestation that takes effect whenever you use a divine encounter or daily attack power. Your choice also provides bonuses to certain invoker powers, as detailed in those powers.

      #theme.choiceBlock(
        title: "Covenant Malediction",
        body: [
          The gods entrust you with the invocations of destruction used in their war against the primordials, so you can carry forward their sacred cause and ensure that the world's enemies never rise again.

          == Channel Divinity
          You gain the Maledictor’s Doom power.

          == Covenant Manifestation
          When you use a divine encounter or daily attack power on your turn, you can push one target hit by the power 1 square after the power's effect is resolved.

          #powers.power(
            fill: theme.bgColor,
            title: "Maledictor's Doom",
            description: "Foes who hear your solemn vow are shaken by its weighty promise.",
            type: powers.powerType.encounter,
            range: [*Close* blast 5],
            action: powers.actionType.minor,
            offenseStat: "Intelligence",
            target: "Each enemy in the blast",
            traits: "Channel Divinity, Divine, Fear",
            additionalRows: (
              [
                *Effect:* Each target takes a -1 penalty to attack rolls and saving throws until the end of your next turn. In addition, whenever the target is hit by a fear attack before the end of your next turn, you push the target 1 square as a free action.
              ],
              [*Channel Divinity*: You can use only one channel divinity power per encounter],
            ),
          );
        ],
      )
    ]

    #classes.classFeatures[
       
      #theme.choiceBlock(
        title: "Covenant of Preservation",
        body: [
          The gods have charged you to defend the faithful and to ally with those who seek to defeat the gods' enemies.

          == Channel Divinity
          You gain the Preserver's Rebuke power.

          == Covenant Manifestation
          When you use a divine encounter or daily attack power on your turn, you can slide an ally within 10 squares of you 1 square.

          #powers.power(
            fill: theme.bgColor,
            title: "Preserver's Rebuke",
            description: "You call upon the gods to punish the enemy that dares harm those entrusted to your care.",
            type: powers.powerType.encounter,
            range: [*Personal*],
            action: powers.actionType.immediateReaction,
            offenseStat: "Intelligence",
            target: "An enemy within 10 squares of you",
            traits: "Channel Divinity, Divine",
            additionalRows: (
              [
                *Effect:* Before the end of your next turn, you gain a bonus to your next attack roll against the triggering enemy equal to your *Intelligence*.
              ],
              [*Channel Divinity*: You can use only one channel divinity power per encounter],
            ),
          );
        ],
      )
       
      #theme.choiceBlock(
        title: "Covenant of Wrath",
        body: [
          You have sworn to seek out and destroy those that oppose the gods. Primordials, demons, and devils fall before your magic like wheat before a scythe.

          == Channel Divinity
          You gain the Armor of Wrath power.

          == Covenant Manifestation
          When you use a divine encounter or daily attack power on your turn, you gain a bonus to the damage roll equal to 1 for each enemy you attack with the power.

          #powers.power(
            fill: theme.bgColor,
            title: "Armor of Wrath",
            description: "As your foe strikes, you invoke the gods' power to encase yourself in a burning aura of radiant energy.",
            type: powers.powerType.encounter,
            range: [*Close* burst 5],
            action: powers.actionType.immediateReaction,
            offenseStat: "Intelligence",
            target: "The triggering enemy in the burst",
            trigger: "An enemy within 5 squares of you hits you",
            traits: "Channel Divinity, Divine, Radiant",
            additionalRows: (
              [
                *Effect:* The target takes radiant damage equal to your *Constitution*, and you push the target 2 squares. #linebreak()

                *Level 11:* 1d6 + *Constitution* radiant damage. #linebreak()
                *Level 21:* 2d6 + *Constitution* radiant damage.
              ],
              [*Channel Divinity*: You can use only one channel divinity power per encounter],
            ),
          );
        ],
      )

      = Ritual Casting
      You master the Hand of Fate technique, the first time each day you use it you do not expend a healing surge.

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
      #theme.featBlock(
        title: "Angelic Harrier",
        content: [
          When you hit only one target with an invoker ranged encounter attack or an invoker ranged daily attack, you can slide the target 1 square after the power's effect is resolved.
        ],
      );

      #theme.featBlock(
        title: "Carceri’s Manacles",
        content: [
          Any enemy that ends its turn adjacent to a creature you have summoned is slowed until the end of its next turn.
        ],
      );

      #theme.featBlock(
        title: "Righteous Summons",
        content: [
          Creatures created by your divine summoning powers gain a benefit based on your Divine Covenant.
          - Covenant of Malediction: Enemies take a -1 penalty to attack rolls while adjacent to your summoned creature.
          - Covenant of Preservation: Any ally that starts its turn adjacent to your summoned creature can shift 1 square as a minor action until the end of    its turn.
          - Covenant of Wrath: Your summoned creatures gain a feat bonus to damage rolls equal to your *Constitution*.
        ],
      );

      #theme.featBlock(
        title: "Bitter Rebuke",
        content: [
          Modify rebuke undead based on your Divine Covenant.
          - Covenant of Malediction: When you hit a creature with rebuke undead, it takes a -2 penalty to attack rolls until the end of your next turn.
          - Covenant of Preservation: When you hit a creature with rebuke undead, it is slowed until the end of your next turn.
          - Covenant of Wrath: When you hit a creature with rebuke undead, you can push it a number of squares up to 2 + your *Constitution* instead of only 2 squares.
        ],
      );

      #theme.featBlock(
        title: "Heaven’s Arrow",
        content: [
          You gain a +2 feat bonus to attack rolls with ranged invoker attack powers against targets that are not adjacent to any creature. Increase this bonus to +3 at 15th level and +4 at 25th level.
        ],
      );

      #theme.featBlock(
        title: "Unsettling Omen",
        content: [
          You gain combat advantage for close blast invoker powers against adjacent enemies.
        ],
      );

      #theme.featBlock(
        title: "Invoker Defense",
        content: [
          When you hit an enemy within 3 squares of you with an invoker power, you gain a +2 feat bonus to AC until the start of your next turn.
        ],
      );

      #theme.featBlock(
        title: "Baleful Malediction",
        requirements: "Covenant of Malediction",
        content: [
          Whenever you use a divine encounter or daily attack power on your turn, each target hit by the power takes a -2 penalty to attack rolls against you until the start of your next turn.
        ],
      );

      #theme.featBlock(
        title: "Deadly Rebuke",
        requirements: "Covenant of Preservation",
        content: [
          When you use your preserver's rebuke power, add your *Intelligence* to the damage roll of the attack that gains the bonus from the power.
        ],
      );

      #theme.featBlock(
        title: "Insightful Preservation",
        requirements: "Covenant of Preservation",
        content: [
          When you use your preserver's rebuke power, one ally hit by the triggering attack gains temporary hit points equal to 3 + your *Intelligence*.
        ],
      );

      #theme.featBlock(
        title: "Armor of Burning Wrath",
        requirements: "Covenant of Wrath",
        content: [
          Your armor of wrath power deals fire and radiant damage and gains the fire keyword. The target of your armor of wrath power takes a -1 penalty to saving throws until the end of your next turn.
        ],
      );

      #theme.featBlock(
        title: "Armor of Burning Wrath",
        requirements: "Covenant of Wrath",
        content: [
          When you use your armor of wrath power, the target gains vulnerable 2 to all other damage until the end of your next turn.
        ],
      );

      #theme.featBlock(
        title: "Crushing Doom",
        requirements: "Maledictor’s Doom",
        content: [
          When you target an enemy with maledictor's doom, the enemy takes a penalty to damage rolls equal to your *Wisdom* until the end of your next turn.
        ],
      );

      #theme.featBlock(
        title: "Preserver’s Summons",
        requirements: "Preserver’s Rebuke",
        content: [
          When you use preserver's rebuke, you can slide the triggering ally 1 square and, if it is marked, you can end that condition.
        ],
      );
    ]

    #pagebreak();

    #align(center)[
      = Paragon #className Feats (Level 11+)
    ]

    #columns(2)[
      // https://iws.mx/dnd/?view=feat3002 — Dragon Magazine 387, page(s) 42.
      #theme.featBlock(
        title: "Accursed Isolation",
        requirements: "11th level, maledictor's doom",
        content: [
          If you target only one creature with maledictor's doom, the penalty to attack rolls increases to -3, and it is a -5 penalty to opportunity attack rolls.
        ],
      );

      // https://iws.mx/dnd/?view=feat1753 — Dragon Magazine 378.
      #theme.featBlock(
        title: "Broadened Manifestation",
        requirements: "11th level, Covenant of Preservation",
        content: [
          You can slide one or two allies with your covenant manifestation.
        ],
      );

      // https://iws.mx/dnd/?view=feat1574 — Divine Power, page(s) 138.
      #theme.featBlock(
        title: "Focused Wrath",
        requirements: "11th level, Covenant of Wrath",
        content: [
          When you use your armor of wrath power and the triggering enemy is the only enemy in the burst, you deal 1d6 extra damage with that power.
          At 21st level, this extra damage increases to 2d6.
        ],
      );

      // https://iws.mx/dnd/?view=feat1575 — Divine Power, page(s) 138.
      #theme.featBlock(
        title: "Footsteps of Doom",
        requirements: "11th level, Covenant of Malediction",
        content: [
          Each target of your maledictor's doom power gains vulnerable 5 to all damage from fear attacks until the end of your next turn.
        ],
      );

      // https://iws.mx/dnd/?view=feat1576 — Divine Power, page(s) 138.
      #theme.featBlock(
        title: "Forceful Covenant",
        requirements: "11th level, Covenant of Malediction",
        content: [
          Add 1 square to the distance that your Covenant Manifestation allows you to push a target.
        ],
      );

      // https://iws.mx/dnd/?view=feat1580 — Divine Power, page(s) 140.
      #theme.featBlock(
        title: "Invoker's Blaze",
        requirements: "11th level",
        content: [
          You gain a +2 feat bonus to damage rolls with divine attack powers that have the fire keyword or the radiant keyword. While you are bloodied, this feat bonus increases to +4.
          At 21st level, the feat bonus increases to +3 (or +6 while bloodied).
        ],
      );

      // https://iws.mx/dnd/?view=feat1581 — Divine Power, page(s) 140.
      #theme.featBlock(
        title: "Invoker's Control",
        requirements: "11th level",
        content: [
          When an enemy fails a saving throw against an effect caused by one of your divine attack powers, you gain a +2 power bonus to the next attack roll you make against that target before the end of your next turn.
        ],
      );

      // https://iws.mx/dnd/?view=feat485 — Player's Handbook 2, page(s) 191.
      #theme.featBlock(
        title: "Overbearing Retribution",
        requirements: "11th level, Covenant of Wrath",
        content: [
          When you use your armor of wrath power, the target falls prone after you push it.
        ],
      );

      // https://iws.mx/dnd/?view=feat3003 — Dragon Magazine 387, page(s) 42.
      #theme.featBlock(
        title: "Pillar of Heaven",
        requirements: "11th level",
        content: [
          When you miss each target with an invoker encounter attack power while using a staff, you gain a +2 bonus to all defenses until the start of your next turn.
        ],
      );

      // https://iws.mx/dnd/?view=feat1043 — Player's Handbook 2, page(s) 191.
      #theme.featBlock(
        title: "Preserver's Vengeance",
        requirements: "11th level, Covenant of Preservation",
        content: [
          You gain a +2 bonus to damage rolls with divine attack powers while a bloodied ally is within 5 squares of you.
        ],
      );

      // https://iws.mx/dnd/?view=feat486 — Player's Handbook 2, page(s) 191.
      #theme.featBlock(
        title: "Speaker of the Gods",
        requirements: "11th level",
        content: [
          When you use any Channel Divinity power, you can score a critical hit on a roll of 18–20 with the next divine attack power that you use before the end of your next turn.
        ],
      );

      // https://iws.mx/dnd/?view=feat3004 — Dragon Magazine 387, page(s) 42.
      #theme.featBlock(
        title: "Staff of Channeled Invocations",
        requirements: "11th level",
        content: [
          When you use any ranged invoker attack power through a staff, you can use the power as a melee attack with a range of 1.
        ],
      );

      // https://iws.mx/dnd/?view=feat1592 — Divine Power, page(s) 140.
      #theme.featBlock(
        title: "Warding Covenant",
        requirements: "11th level, Covenant of Preservation",
        content: [
          When you use your Covenant Manifestation to slide an ally, no enemy can gain combat advantage against that ally until the end of your next turn.
        ],
      );

      // https://iws.mx/dnd/?view=feat3005 — Dragon Magazine 387, page(s) 42.
      #theme.featBlock(
        title: "Wrathful Outburst",
        requirements: "11th level, armor of wrath",
        content: [
          When you use armor of wrath, you can target any one additional enemy in the burst.
        ],
      );

      // https://iws.mx/dnd/?view=feat3006 — Dragon Magazine 387, page(s) 42.
      #theme.featBlock(
        title: "Wrathful Panoply",
        requirements: "11th level, armor of wrath",
        content: [
          When you use armor of wrath, you gain a +1 bonus to all defenses until the end of your next turn. At 21st level, the bonus increases to +2.
        ],
      );
    ]
  ]
}
