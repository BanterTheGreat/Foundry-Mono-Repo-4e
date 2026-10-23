#import "../helpers/theme.typ";
#import "../helpers/classes.typ" as classes;
#import "../helpers/powers.typ";

#let className = "Swordmage";

#let swordmagePage() = {
  return [
    #classes.bannerPage(
      className: className,
    );

    #classes.classOverview(
      className: className,
      reference: [
        #classes.proficiencies(
          armorProficiencies: (classes.armorProf.cloth, classes.armorProf.leather),
          weaponProficiencies: (
            classes.weaponProf.simpleMelee,
            classes.weaponProf.militaryLightBlade,
            classes.weaponProf.militaryHeavyBlade,
          ),
          implementProficiencies: (classes.implementProf.lightBlade, classes.implementProf.heavyBlade),
        );

        #classes.defensesAndHealth(
          fortitude: 11,
          will: 13,
          reflex: 11,
          health: 25,
          healthOnLevelUp: 6,
          healingSurges: 8,
        )

        #classes.abilities(
          mainAbilities: "Intelligence",
          extraAbilities: ("Constitution", "Strength"),
          class: className,
        );
      ],
    )[
      = Swordbond
      By spending 1 hour of meditation with a chosen light or heavy blade, you forge a special bond with the weapon. As a standard action, you can call your bonded weapon to your hand from up to 10 squares away.

      You can forge a bond with a different blade using the same meditation process (for instance, if you acquire a new blade that has magical abilities). If you forge a bond with a different blade, the old bond dissipates.

      If your bonded weapon is broken or damaged, you can spend 1 hour of meditation to recreate the weapon from a fragment. (This process automatically destroys any other fragments of the weapon in existence, so you can't use it to create multiple copies of a broken weapon.)

      = Spellwarden Warden
      While you are conscious and wielding either a light blade or a heavy blade, you maintain a field of magical force around you.
      This field provides a +1 bonus to AC, or a +3 bonus if you are wielding a blade in one hand and have your other hand free (not carrying a shield, an off-hand weapon, a two-handed weapon, or anything else).

      = Spellwarden Aegis
      #theme.buildChoiceHeader()
      You can place a magical warding upon a foe, allowing you to respond to the foe's attacks against your allies with a counterassault or a timely protection. Choose one Aegis and gain its benefit.


      #theme.choiceBlock(
        title: "Aegis of Assault",
        body: [
          You can use the Aegis of assault power to teleport to the side of the attacker and respond with an attack of your own.

          #powers.power(
            fill: theme.bgColor,
            title: "Aegis of Assault",
            type: powers.powerType.at-will,
            action: powers.actionType.minor,
            range: [*Close* burst 2],
            target: "One creature in the burst",
            traits: "Arcane, Teleportation",
            additionalRows: (
              [
                *Effect:* You mark the target. The target remains marked until you use this power against another target. If you mark other creatures using other powers, the target is still marked. A creature can be subject to only one mark at a time. A new mark supersedes a mark that was already in place.

                If your marked target makes an attack that doesn't include you as a target, it takes a –2 penalty to attack rolls. If that attack hits and the marked target is within 10 squares of you, you can use an immediate reaction to teleport to a square adjacent to the target and make a melee basic attack against it. If no unoccupied space exists adjacent to the target, you can't use this immediate reaction.
              ],
            ),
          );
        ],
      )


      #theme.choiceBlock(
        title: "Aegis of Ensnarement",
        body: [
          You can use the Aegis of ensnarement power to teleport a marked creature to any space adjacent to you.

          #powers.power(
            fill: theme.bgColor,
            title: "Aegis of Ensnarement",
            type: powers.powerType.at-will,
            action: powers.actionType.minor,
            range: [*Close* burst 2],
            target: "One creature in the burst",
            traits: "Arcane, Teleportation",
            additionalRows: (
              [
                *Effect:* You mark the target. The target remains marked until you use this power against another target. If you mark another creature using other powers, the target is still marked.

                Until the mark ends, if the target makes any attack that does not include you as a target, it takes a -2 penalty to the attack roll.

                If a target marked by this power is within 10 squares of you when it hits with an attack that does not include you as a target, you can use an immediate reaction after the target's entire attack is resolved to teleport the target to any space adjacent to you. In addition, the target grants combat advantage to all creatures until the end of your next turn. If no unoccupied space exists adjacent to you, you can't use this immediate reaction, and the target doesn't grant combat advantage as a result of this effect.
              ],
            ),
          );
        ],
      )
    ]

    #classes.classFeatures[

      #theme.choiceBlock(
        title: "Aegis of Shielding",
        body: [
          You can use the Aegis of shielding power to reduce the damage dealt to an ally by an attack.

          #powers.power(
            fill: theme.bgColor,
            title: "Aegis of Shielding",
            type: powers.powerType.at-will,
            action: powers.actionType.minor,
            range: [*Close* burst 2],
            target: "One creature in the burst",
            traits: "Arcane, Teleportation",
            additionalRows: (
              [
                *Effect:* You mark the target. The target remains marked until you use this power against another target. If you mark other creatures using other powers, the target is still marked. A creature can be subject to only one mark at a time. A new mark supersedes a mark that was already in place.

                If your marked target makes an attack that doesn't include you as a target, it takes a –2 penalty to attack rolls. If that attack hits and the marked target is within 10 squares of you, you can use an immediate interrupt to reduce the damage dealt by that attack to any one creature by an amount equal to 5 + your *Constitution*.
                At 11th level, reduce the damage dealt by 10 + your *Constitution*. At 21st level, reduce the damage dealt by 15 + your *Constitution*.
              ],
            ),
          );
        ],
      )

      #colbreak();

      = Powers
      You may choose 2 At-Will, 1 Encounter and 2 Daily #className Powers.
      #classes.powerLinks(className: className, skipAtWill: false, skipPaths: true);

    ]

    #pagebreak()
    
    = #className Paragon Paths
    #classes.zeitgeistPathReference()

    #theme.pathBlocksFromJson("../content/paths/swordmage.json");

    #pagebreak()


    #columns(2)[
      #align(center)[
        = Heroic #className Feats
      ]

      #theme.featBlock(
        title: "Improved Spellwarden Shielding",
        content: [
          While you are wearing cloth armor, leather armor, or no armor, the bonus to AC from your Swordmage Warding increases by 1.
        ],
      );

      #theme.featBlock(
        title: "Ensnarement",
        requirements: "Aegis of Ensnarement",
        content: [
          When you use aegis of ensnarement to teleport an enemy, that enemy is also slowed until the end of your next turn.
        ],
      );

      #theme.featBlock(
        title: "Retributive Shield",
        requirements: "Aegis of Shielding",
        content: [
          When you use your aegis of shielding power, you gain a +2 bonus to the next attack roll made before the end of your next turn against the foe that triggered the aegis of shielding immediate interrupt.
        ],
      );

      #theme.featBlock(
        title: "Escalating Assault",
        requirements: "Aegis of Assault",
        content: [
          Each time you make a melee basic attack granted by your aegis of assault power, you gain a cumulative +1 bonus on future attack rolls made for the melee basic attacks granted by this power (up to a maximum bonus of +3). This bonus resets to 0 at the end of the encounter or if you are rendered unconscious.
        ],
      );

      #theme.featBlock(
        title: "Aegis Accuracy",
        content: [
          If a target marked by your Swordmage Aegis makes an attack and doesn't include you as a target, you gain a +1 bonus to attack rolls against the marked creature until the end of your next turn.
        ],
      );

      #theme.featBlock(
        title: "Aegis Vitality",
        content: [
          Whenever a creature marked by your Swordmage Aegis makes an attack that does not include you as a target, you gain 3 temporary hit points.
          Increase the temporary hit points to 5 at 11th level, and to 8 at 21st level.
        ],
      );

      #theme.featBlock(
        title: "Combat Casting",
        content: [
          When you use a melee swordmage attack power and hit an enemy, your ranged and area swordmage attack powers don't provoke opportunity attacks until the end of your next turn.
        ],
      );

      #theme.featBlock(
        title: "Extended Teleportation",
        content: [
          Whenever you teleport with a swordmage or swordmage paragon path power, add 1 to the distance you can teleport.
        ],
      );

      #theme.featBlock(
        title: "Improved Swordbond",
        content: [
          You can call your bonded weapon to your hand from up to 20 squares away with a minor action.
        ],
      );

      #colbreak();

      = Paragon Swordmage Feats (Level 11+)

      #theme.featBlock(
        title: "Deadly Immobilization",
        requirements: "11th level",
        content: [
          Whenever you slow or immobilize a target with a swordmage or swordmage paragon path attack power, that power deals extra damage equal to your *Constitution*.
        ],
      )

      #theme.featBlock(
        title: "Distant Swordbond",
        requirements: "11th level",
        content: [
          You can call your bonded weapon to your hand from up to 1 mile away as a minor action.
        ],
      )

      #theme.featBlock(
        title: "Double Aegis",
        requirements: "11th level",
        content: [
          When you use your Swordmage Aegis power, you can choose to also mark a second target within the burst.
          If both targets attack your allies, you must choose which of the targets to respond to. (You still have only one immediate action per round.)
        ],
      )

      #theme.featBlock(
        title: "Ensnaring Flourish",
        requirements: "11th level, Aegis of Ensnarement",
        content: [
          When you use aegis of ensnarement to teleport an enemy, you gain a +5 bonus to damage rolls on melee attacks against that enemy until the end of your next turn.
        ],
      )

      #theme.featBlock(
        title: "Greater Aegis of Shielding",
        requirements: "11th level, Aegis of Shielding",
        content: [
          When you use your aegis of shielding to reduce the damage from an enemy's attack, you reduce the damage by an additional 5 points.
        ],
      )

      #theme.featBlock(
        title: "Greater Swordmage Warding",
        requirements: "11th level",
        content: [
          While your Swordmage Warding is active, you gain a +1 feat bonus to all defenses.
          At 21st level, this bonus increases to +2.
        ],
      )

      #theme.featBlock(
        title: "Timely Teleport",
        requirements: "11th level",
        content: [
          When you use second wind, you can also teleport a number of squares equal to your *Intelligence* as a free action.
        ],
      )

      #theme.featBlock(
        title: "Vigorous Assault",
        requirements: "11th level, Aegis of Assault",
        content: [
          When you use your aegis of assault to teleport, you gain temporary hit points equal to 3 + your *Strength*.
        ],
      )
    ]
  ]
}
