#import "../helpers/theme.typ";
#import "../helpers/classes.typ" as classes;
#import "../helpers/powers.typ";
#import "barbarian-primal-powers.typ": primalPowers;

#let className = "Barbarian";
#let barbarianPage() = {
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
          ),
          weaponProficiencies: (
            classes.weaponProf.simpleMelee,
            classes.weaponProf.simpleRanged,
            classes.weaponProf.militaryMelee,
          ),
          implementProficiencies: (),
        );

        #classes.defensesAndHealth(
          fortitude: 13,
          will: 11,
          reflex: 11,
          health: 25,
          healthOnLevelUp: 6,
          healingSurges: 8,
        )

        #classes.abilities(
          mainAbilities: "Strength",
          extraAbilities: ("Constitution", "Dexterity", "Charisma"),
          class: className,
        );
      ],
    )[

      = Barbarian Agility
      While wearing light or no armor, you gain a +1 bonus to your Reflex defense and may use your Strength in place of Intelligence or Dexterity when calculating your AC score.

      = Feral Might
      #theme.buildChoiceHeader()
      Barbarians connect with the natural world in a variety of ways. Some barbarians grow so hardened to physical punishment that they find it easier to simply absorb, rather than avoid, attacks. Others are living examples of the power of one's will to shape one's fate. Choose one of the following options:

      #theme.choiceBlock(
        title: "Rageblood Vigor",
        body: [
          You gain the swift charge power. Once per turn when you bloody a non-minion enemy or reduce a non-minion enemy to 0 hit points, you gain temporary hit points equal to your *Constitution* plus half your level.

          #powers.power(
            fill: theme.bgColor,
            title: "Swift Charge",
            description: "As your foe falls, you rush towards your next victim",
            type: powers.powerType.encounter,
            action: powers.actionType.free,
            range: "Personal",
            trigger: "You reduce a creature to 0 hit points, or an enemy adjacent to you drops to 0 hit points.",
            traits: "Primal",
            additionalRows: (
              [
                *Effect:* You charge an enemy.

                *Level 11:* Your charge attack deals 1[W] extra damage on a hit. #linebreak()
                *Level 21:* Your charge attack deals 2[W] extra damage on a hit.
              ],
            ),
          )
        ],
      )


      #theme.choiceBlock(
        title: "Thaneborn Triumph",
        body: [
          You gain the roar of triumph power. Once per turn when you bloody a non-minion enemy or reduce a non-minion enemy to 0 hit points, choose an enemy adjacent to you. The next attack by you or an ally against that enemy gains a +3 power bonus to the attack roll and deals extra damage to that creature equal to your *Charisma*.

          #powers.power(
            fill: theme.bgColor,
            title: "Roar of Triumph",
            description: "Your howl of victory shakes your enemies to the core, as they know your blood thirst is not yet quenched.",
            type: powers.powerType.encounter,
            action: powers.actionType.free,
            range: [*Close* burst 3 (burst 4 at 11th level; burst 5 at 21st level)],
            trigger: "You reduce a creature to 0 hit points, or an enemy adjacent to you drops to 0 hit points.",
            traits: "Fear, Primal",
            target: "Each enemy in the burst",
            additionalRows: (
              [
                *Effect:* Each target takes a -2 penalty to damage rolls and all defenses until the end of your next turn.

                *Level 11:* The penalty to damage rolls increases to -4.
              ],
            ),
          )
        ],
      )
    ]

    #classes.classFeatures[

      #theme.choiceBlock(
        title: "Thunderborn Wrath",
        body: [
          You gain the war cry power. Once per turn when you bloody a non-minion enemy or reduce a non-minion enemy to 0 hit points, each enemy adjacent to you takes thunder damage equal to your *Constitution* plus half your level.

          #powers.power(
            fill: theme.bgColor,
            title: "War Cry",
            description: "Your potent victory cry sends nearby enemies reeling in terror.",
            type: powers.powerType.encounter,
            action: powers.actionType.free,
            range: [*Close* blast 3 (Blast 5 at 11th level, blast 7 at 21st level)],
            trigger: "You reduce a creature to 0 hit points, or an enemy adjacent to you drops to 0 hit points.",
            target: "Each enemy in the blast",
            traits: "Fear, Primal, Thunder",
            additionalRows: (
              [
                *Effect:* You may push each target up to 1 square, and each target gains vulnerability to thunder damage equal to your Constitution plus 1 until the end of your next turn.

                *Level 11:* up to 2 squares, Constitution plus 2. #linebreak();
                *Level 21:* up to 3 squares, Constitution plus 3.
              ],
            ),
          )
        ],
      )

      #theme.choiceBlock(
        title: "Whirling Slayer",
        body: [
          You gain the Whirling Lunge power, and you can wield one-handed weapons in your off hand without needing the off-hand property. Once per turn when you bloody a non-minion enemy or reduce a non-minion enemy to 0 hit points, you can shift a number of squares equal to half your *Dexterity* as a free action, and your next attack before the end of your next turn against any enemy adjacent to you after the shift gains a +2 bonus to damage rolls against those enemies. Increase this bonus to +3 at 11th level and +4 at 21st level.

          #powers.power(
            fill: theme.bgColor,
            title: "Whirling Lunge",
            description: "Striking down one foe, you whirl deeper into enemy ranks.",
            type: powers.powerType.encounter,
            action: powers.actionType.free,
            range: "Personal",
            trigger: "You reduce a creature to 0 hit points, or an enemy adjacent to you drops to 0 hit points.",
            traits: "Primal, Weapon",
            additionalRows: (
              [
                *Effect:* You shift up to 2 squares and then deal 1[W] damage (off-hand weapon) to one enemy adjacent to you after the shift that you can see.

                *Level 11:* 3 squares, 2[W] damage (off-hand weapon) #linebreak()
                *Level 21:* 4 squares, 3[W] damage (off-hand weapon)
              ],
            ),
          );
        ],
      )

      = Rage Strike
      Barbarian daily attack powers with the Rage keyword begin with an attack and let you enter a rage, granting an ongoing benefit until the rage ends. A rage lasts until the end of the encounter, until you enter another rage, or until you fall unconscious.

      You gain the rage strike power. It lets you expend another daily rage power for a single attack while keeping your current rage.

      #powers.power(
        title: "Rage Strike",
        description: "You channel your primal rage into a devastating attack.",
        type: powers.powerType.at-will,
        action: powers.actionType.standard,
        range: "Melee weapon",
        traits: "Primal, Weapon",
        requirement: "You must be raging and have at least one unused rage power.",
        target: "One creature",
        offenseStat: "Strength",
        defenseStat: "AC",
        isSpecial: true,
        additionalRows: (
          [
            *Hit:* You deal damage based on the level of the rage power you expended, _if the target of this power is in the Elite or Solo group, the total damage you deal to that target is doubled._

            *1st level:* 	3[W] + Strength #linebreak()
            *5th level:* 	5[W] + Strength #linebreak()
            *9th level:*	7[W] + Strength #linebreak()
            *15th level:* 	9[W] + Strength #linebreak()
            *19th level:* 	11[W] + Strength #linebreak()
            *20th level:*	12[W] + Strength #linebreak()
            *25th level:* 	13[W] + Strength #linebreak()
            *29th level:* 	15[W] + Strength
          ],
          [
            *Miss:* Half damage.
          ],
          [
            *Special:* To make this attack, you expend an unused Daily Barbarian rage power without using it.
          ],
        ),
      )


      = Rampage
      Once per round, when you score a critical hit with a barbarian attack power, you can make a melee basic attack as a free action. You do not have to attack the same target that you critically hit.

      = Powers
      You may choose 2 At-Will, 1 Encounter and 2 Daily #className Powers.

      Use the revised attack powers printed in this chapter in place of their published versions. The lists include powers available through level 11 and their scaling through that level. A level-based improvement to a power you know applies automatically unless the list says it requires a higher-level power slot. Utility power choices follow the book's normal utility rules.
    ]

    #classes.classFeatures[
      #primalPowers()
    ]
    #pagebreak()

    #set page(columns: 1)

    #align(center)[
      = #className Paragon Paths
    ]
    #classes.zeitgeistPathReference()

    #columns(2)[
      #theme.pathBlocksFromJson("../content/paths/barbarian.json")
    ]

    #pagebreak()

    #align(center)[
      = Heroic #className Feats
    ]

    #columns(2)[
      #theme.featBlock(
        title: "Angry Grandfather",
        content: [
          You gain a bonus to death saving throws equal to the number of powers with the Rage keyword you know that are currently expended. This bonus increases by 1 for each ally within 10 squares of you who has at least one tribal feat.
        ],
      );

      #theme.featBlock(
        title: "Bloodthirsty Visage",
        content: [
          You gain a +2 feat bonus to damage rolls with fear powers, increasing to +3 at level 11 and +4 at level 21. This feat bonus is doubled against creatures that were subject to one of your fear effects before the attack.
        ],
      );

      #theme.featBlock(
        title: "Blood Cousin's Tribe",
        content: [
          You gain a +1 bonus to damage rolls when raging, increasing to +2 at level 11 and +3 at level 21. This bonus increases by 1 for each ally within 10 squares of you who has at least one tribal feat.
        ],
      );

      #theme.featBlock(
        title: "Bloody Triumph",
        requirements: "Thaneborn Triumph",
        content: [
          Once per turn when you bloody an enemy or reduce a non-minion enemy to 0 hit points, an ally who can see you can shift up to 2 squares as a free action.
        ],
      );

      #theme.featBlock(
        title: "Crackling Wrath",
        requirements: "Thunderborn Wrath",
        content: [
          You gain resistance to thunder and lightning damage equal to 5 + half your level, or your highest resistance to thunder and lightning damage increases by 5. Your Thunderborn Wrath deals 2 extra lightning damage, increasing to 3 at level 11 and 5 at level 21.
          Previous feat title: Thunderborn Rage
        ],
      );

      #colbreak();

      #theme.featBlock(
        title: "Deadly Rage",
        content: [
          Whenever you start your turn while raging, you can choose to take damage equal to half your level (minimum 1), which cannot be reduced or prevented in any way. If you do so, you gain a +2 bonus to damage rolls until the end of your turn. Increase the bonus to damage rolls to +4 at level 11, and +6 at level 21.
        ],
      );

      #theme.featBlock(
        title: "Double Lunge",
        requirements: "Whirling Lunge power",
        content: [
          When you use Whirling Lunge, you deal 1[W] (main hand weapon) extra damage to the target, increasing to 2[W] (main hand weapon) extra damage at level 21.
        ],
      );

      #theme.featBlock(
        title: "Eager Charger",
        requirements: "Swift Charge power",
        content: [
          You gain a +2 feat bonus to speed when charging. In addition, you deal 1[W] extra damage with the charge attack granted by your Swift Charge power, increasing to 2[W] extra damage at level 21.
        ],
      );

      #theme.featBlock(
        title: "Brutal Reach",
        content: [
          When you are raging and wielding a two-handed reach weapon, you can reroll any weapon damage die that displays a 1 when making melee attacks.
        ],
      );

      #theme.featBlock(
        title: "Rising Fury",
        content: [
          When you reduce an enemy to 0 hit points, you gain a +2 feat bonus to weapon damage rolls until the end of your next turn. The bonus increases to +3 at 11th level and +4 at 21st level.
        ],
      );

    ]

    #pagebreak();

    #align(center)[
      = Paragon #className Feats (Level 11+)
    ]

    #columns(2)[
      // https://iws.mx/dnd/?view=feat2886 — Dragon Magazine 386, page(s) 51.
      #theme.featBlock(
        title: "Bloodthirsty Visage",
        requirements: "11th level, Thaneborn Triumph",
        content: [
          You gain a feat bonus equal to your Charisma to damage rolls with barbarian fear powers.
        ],
      );

      // https://iws.mx/dnd/?view=feat467 — Player's Handbook 2, page(s) 190.
      #theme.featBlock(
        title: "Charging Rampage",
        requirements: "11th level",
        content: [
          When you score a critical hit with a barbarian attack power while you are raging, you can charge as a free action, instead of making a melee basic attack as a result of Rampage.
        ],
      );

      // https://iws.mx/dnd/?view=feat1893 — Primal Power, page(s) 143.
      #theme.featBlock(
        title: "Double Lunge",
        requirements: "11th level, whirling lunge",
        content: [
          When you use whirling lunge, you deal extra damage to the target equal to your Strength.
        ],
      );

      // https://iws.mx/dnd/?view=feat2887 — Dragon Magazine 386, page(s) 51.
      #theme.featBlock(
        title: "Echoing Roar",
        requirements: "11th level, roar of triumph",
        content: [
          Whenever you use your second wind, you also regain the use of roar of triumph.
        ],
      );

      // https://iws.mx/dnd/?view=feat1896 — Primal Power, page(s) 143.
      #theme.featBlock(
        title: "Explosive Rage Strike",
        requirements: "11th level",
        content: [
          When you use rage strike, you can reduce the damage it deals by 2[W]. If you do so, the power becomes a close burst 1 that targets each enemy that you can see in the burst.
        ],
      );

      // https://iws.mx/dnd/?view=feat453 — Player's Handbook 2, page(s) 191.
      #theme.featBlock(
        title: "Rageblood Recovery",
        requirements: "11th level, Rageblood Vigor",
        content: [
          When you hit with the charge attack granted by swift charge while you are raging, you can spend a healing surge as a free action.
        ],
      );

      // https://iws.mx/dnd/?view=feat1901 — Primal Power, page(s) 145.
      #theme.featBlock(
        title: "Reckless Rage",
        requirements: "11th level",
        content: [
          When you attack an enemy with a rage power, you can take a –2 penalty to the attack roll against that enemy to deal 1[W] extra damage to it.
        ],
      );

      // https://iws.mx/dnd/?view=feat452 — Player's Handbook 2, page(s) 192.
      #theme.featBlock(
        title: "Thaneborn Advance",
        requirements: "11th level, Thaneborn Triumph",
        content: [
          When you use your roar of triumph power while you are raging, you can shift a number of squares equal to your Charisma and use your new position as the origin square of the burst.
        ],
      );

      // https://iws.mx/dnd/?view=feat1908 — Primal Power, page(s) 145.
      #theme.featBlock(
        title: "Thirsty Blade",
        requirements: "11th level",
        content: [
          When you reduce an enemy to 0 hit points with a charge attack using an axe or a heavy blade, each enemy adjacent to you at the end of the charge takes damage equal to your Strength.
        ],
      );

      // https://iws.mx/dnd/?view=feat1910 — Primal Power, page(s) 145.
      #theme.featBlock(
        title: "Thunderous Cry",
        requirements: "11th level, war cry",
        content: [
          When you use war cry, the targets grant combat advantage to you until the end of your next turn.
        ],
      );

      // https://iws.mx/dnd/?view=feat1913 — Primal Power, page(s) 145.
      #theme.featBlock(
        title: "Violent Reminder",
        requirements: "11th level, Rageblood Vigor",
        content: [
          When you reduce an enemy to 0 hit points, you gain a +5 bonus to the next damage roll you make before the end of your next turn.
        ],
      );

      // https://iws.mx/dnd/?view=feat1918 — Primal Power, page(s) 146.
      #theme.featBlock(
        title: "Withering Roar",
        requirements: "11th level, Thaneborn Triumph",
        content: [
          When you use Roar of Triumph, you can replace its penalty to all defenses for each target with that target granting combat advantage until the end of your next turn. The power's penalty to damage rolls still applies.
        ],
      );
    ]
  ]
}
