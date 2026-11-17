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
      #theme.featBlocksFromJson("../content/feats/heroic/barbarian.json", start: 0, end: 5);

      #colbreak();

      #theme.featBlocksFromJson("../content/feats/heroic/barbarian.json", start: 5, end: 10);

    ]

    #pagebreak();

    #align(center)[
      = Paragon #className Feats (Level 11+)
    ]

    #columns(2)[
      #theme.featBlocksFromJson("../content/feats/paragon/barbarian.json");
    ]
  ]
}
