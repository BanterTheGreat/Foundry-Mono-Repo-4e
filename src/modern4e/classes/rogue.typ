#import "../helpers/theme.typ";
#import "../helpers/classes.typ" as classes;
#import "../helpers/powers.typ";

#let className = "Rogue";

#let roguePage() = {
  return [
    #classes.bannerPage(
      className: className,
    );

    #classes.classOverview(
      className: className,
      reference: [
        #classes.proficiencies(
          armorProficiencies: (classes.armorProf.cloth, classes.armorProf.leather, classes.armorProf.lightShield),
          weaponProficiencies: (
            classes.weaponProf.dagger,
            classes.weaponProf.handCrossbow,
            classes.weaponProf.shortSword,
            classes.weaponProf.sling,
          ),
          implementProficiencies: (),
        );

        #classes.defensesAndHealth(
          fortitude: 12,
          will: 12,
          reflex: 11,
          health: 22,
          healthOnLevelUp: 5,
          healingSurges: 6,
        )

        #classes.abilities(
          mainAbilities: "Dexterity",
          extraAbilities: ("Constitution", "Strength", "Charisma"),
          class: className,
        );
      ],
    )[
      = First Strike
      At the start of every encounter, you have combat advantage against any creatures that have not yet acted in that encounter.

      = Sneak Attack
      When you make an attack with a light blade, a hand crossbow, a shortbow, or a sling and hit an enemy granting combat advantage to you, that enemy takes extra damage based on your level. You can deal this extra damage only once per turn.


      #table(
        columns: (1fr, 1fr),
        stroke: 0.5pt + theme.tableDivider,
        align: left,
        fill: theme.defaultTableStyle(),
        inset: 4pt,
        [*Level*], [*Extra Damage*],
        [1–10], [2d6],
        [11–20], [3d6],
        [21–30], [5d6],
      );

      = Rogue Tactics
      #theme.buildChoiceHeader()
      You gain one of the benefits described below, depending on your choice of Scoundrel Tactics. Your choice also provides additional benefits to certain scoundrel powers, as detailed in those powers' descriptions.

      #theme.choiceBlock(
        title: "Artful Dodger",
        body: [You gain a bonus to AC against opportunity attacks. The bonus equals your *Charisma*.],
      )


      #theme.choiceBlock(
        title: "Brutal Scoundrel",
        body: [You gain a bonus to Sneak Attack damage. The bonus equals your *Strength*.],
      )


      #theme.choiceBlock(title: "Cunning Sneak", body: [
        You don't take a penalty to checks to sneak or hide for moving more than 2 squares, and you take a –5 penalty instead of a -10 penalty to Stealth checks for running.

        If you end your movement at least 3 squares away from your starting position, you can make a check to sneak or hide to become hidden if you have any concealment or any cover, except for cover provided by intervening allies.
      ])


      #theme.choiceBlock(
        title: "Ruthless Ruffian",
        body: [You are proficient with the club and the mace, and you can use those weapons with Sneak Attack or any rogue power or rogue paragon path power that normally requires a light blade. If you use a club or a mace to deliver an attack that has the rattling keyword, add your *Strength* to the damage roll.],
      )
    ]

    #classes.classFeatures[
      = Rogue Weapon Talent
      #theme.buildChoiceHeader()
      Choose one of the options below:

      #theme.choiceBlock(title: "Rogue Weapon Talent", body: [You gain a +1 bonus to weapon attack rolls with daggers.])


      #theme.choiceBlock(title: "Sharpshooter Talent", body: [You gain a +1 bonus to either crossbows or slings.])


      = Powers
      You may choose 2 At-Will, 1 Encounter and 2 Daily #className Powers.
      #classes.commonTraits(class: className, commonTraits: [
        == Reliable
        An effect type. If a reliable power misses every target, the power is not expended.
        == Rattling
        If a creature deals damage with a power that has the rattling keyword, the target takes a -2 penalty to attack rolls until the end of the user's next turn. A target that is immune to fear is not subject to this penalty.
      ])
      #colbreak();
      #classes.powerLinks(className: className);
    ]




    #pagebreak()

    #set page(columns: 1)

    #align(center)[
      = Heroic #className Feats
    ]

    #columns(2)[
      #theme.featBlock(
        title: "Press the Advantage",
        requirements: "3 Charisma",
        content: [If you score a critical hit while you have combat advantage, you gain combat advantage against the target until the end of your next turn.],
      )

      #theme.featBlock(
        title: "Speedy Response",
        content: [If you are hit by an opportunity attack while moving, you gain a +1 bonus to speed for that move. This benefit is cumulative if you are hit multiple times.],
      )

      #theme.featBlock(
        title: "Surprising Charge",
        content: [When you make a charge attack against a target that is granting combat advantage to you, the attack deals 1[W] extra damage if you hit with a light blade.],
      )

      #theme.featBlock(
        title: "Dirty Fighting",
        content: [You gain a +4 bonus to melee weapon damage rolls against surprised enemies.],
      )

      #theme.featBlock(
        title: "Into the Fray",
        content: [During the surprise round and the first round of an encounter, you gain a +1 bonus to your speed and to your melee attack rolls.],
      )

      #theme.featBlock(
        title: "Opportunity Knocks",
        content: [Whenever you hit with an opportunity attack, or when an enemy misses you with an opportunity attack, the enemy you hit or the enemy that missed you grants combat advantage to you until the end of your next turn.],
      )

      #theme.featBlock(
        title: "Risky Shift",
        content: [Whenever you shift, you can shift 1 additional square. If you do so, you grant combat advantage until the start of your next turn.],
      )

      #theme.featBlock(
        title: "Two-Fisted Shooter",
        content: [You can treat the hand crossbow as an off-hand weapon, and you can reload it one-handed as a free action. When you score a critical hit and have a loaded hand crossbow in your off hand, you can make a ranged basic attack with that weapon as a free action.],
      )

      #theme.featBlock(
        title: "Versatile Duelist",
        content: [You gain proficiency with all one-handed, military heavy blades. If a rogue power requires you to wield a light blade, you can use that power with a one-handed heavy blade and can also deal your Sneak Attack damage while using a one-handed heavy blade with that power.],
      )

      #theme.featBlock(
        title: "Reckless Scramble",
        requirements: "Artful Dodger",
        content: [When a power lets you shift, you can instead choose to move that distance + 2 squares.],
      )

      #theme.featBlock(
        title: "Aggressive Assault",
        requirements: "Brutal Scoundrel",
        content: [At the beginning of an encounter, whenever you hit a target that has not yet acted, you slide that target 1 square.],
      )

      #theme.featBlock(
        title: "Brutal Wound",
        requirements: "Brutal Scoundrel",
        content: [When your attack deals ongoing damage and you deal Sneak Attack damage to the target, add 1 to the ongoing damage for every die of Sneak Attack damage dealt.],
      )

      #theme.featBlock(
        title: "Improved Cunning Sneak",
        requirements: "Cunning Sneak",
        content: [When you make a Stealth check to become hidden using your Cunning Sneak class feature, you must end a move action at least 2 squares away from your starting position instead of 3.],
      )

      #theme.featBlock(
        title: "Ruthless Injury",
        requirements: "Ruthless Ruffian",
        content: [When you use a club or a mace to make a sneak attack that causes the target to become blinded, immobilized, slowed, or weakened, that target takes a –2 penalty to saving throws against any of those conditions.],
      )

      #theme.featBlock(
        title: "Backstabber",
        content: [The extra damage dice from your Sneak Attack class feature increase from d6s to d8s.],
      )

      #theme.featBlock(
        title: "Underhanded Tactics",
        content: [Whenever you deal Sneak Attack damage, you can forgo rolling 1 die of that damage to impose a -2 penalty to the target's attack rolls until the end of your next turn.],
      )

      #theme.featBlock(
        title: "Blade and Buckler",
        content: [The shield bonus to defenses from your light shield increase to +2.],
      )

      #theme.featBlock(
        title: "Buckler Duelist",
        content: [If a rogue power gives you a power bonus to defenses and you wield a light shield, increase that bonus by 1.],
      )

      #theme.featBlock(
        title: "Swashbuckling Specialist",
        content: [While wielding a rapier, if you are the only creature adjacent to the target you may use your sneak attack damage even if you do not have combat advantage against the target with this attack.],
      )

      #theme.featBlock(
        title: "Surprise Knockdown",
        requirements: "3 Strength",
        content: [If you score a critical hit while you have combat advantage, you knock the target prone.],
      )

    ]

    #pagebreak();

    #align(center)[
      = Paragon #className Feats (Level 11+)
    ]

    #columns(2)[
      // https://iws.mx/dnd/?view=feat393 — Martial Power, page(s) 140.
      #theme.featBlock(
        title: "Avandra's Gift",
        requirements: "11th level, halfling",
        content: [
          When you use your second chance racial power and the enemy's attack misses, you gain combat advantage for the next attack roll you make against that enemy before the end of your next turn.
        ],
      );

      // https://iws.mx/dnd/?view=feat832 — Martial Power, page(s) 140.
      #theme.featBlock(
        title: "Bleeding Backstab",
        requirements: "11th level",
        content: [
          Whenever you deal Sneak Attack damage to a target with a rogue daily attack power, the target takes ongoing 5 damage (save ends). If the power already deals ongoing damage that has no damage type, instead increase that ongoing damage by 5.
        ],
      );

      // https://iws.mx/dnd/?view=feat2483 — Martial Power 2, page(s) 141.
      #theme.featBlock(
        title: "Brutal Bludgeon",
        requirements: "11th level",
        content: [
          When you hit with a club or a mace, you treat the weapon as though it had the brutal 1 property: Reroll any damage die result of 1 until the die shows 2 or higher.
        ],
      );

      // https://iws.mx/dnd/?view=feat2485 — Martial Power 2, page(s) 141.
      #theme.featBlock(
        title: "Combat Opportunist",
        requirements: "11th level",
        content: [
          Whenever one of your allies hits an enemy with an opportunity attack, that enemy grants combat advantage to you until the end of your next turn.
        ],
      );

      // https://iws.mx/dnd/?view=feat378 — Martial Power, page(s) 141.
      #theme.featBlock(
        title: "Cull the Weak",
        requirements: "11th level, 2 Charisma",
        content: [
          When you have combat advantage against a bloodied or a weakened target, you gain a +2 bonus to melee weapon damage rolls against the target.
        ],
      );

      // https://iws.mx/dnd/?view=feat2491 — Martial Power 2, page(s) 142.
      #theme.featBlock(
        title: "Disheartening Ambush",
        requirements: "11th level",
        content: [
          Whenever you would deal Sneak Attack damage, you can forgo one die of that damage to give your attack the rattling keyword.
        ],
      );

      // https://iws.mx/dnd/?view=feat2492 — Martial Power 2, page(s) 142.
      #theme.featBlock(
        title: "Dragon Breath Scoundrel",
        requirements: "11th level, dragonborn",
        content: [
          When you use your Dragon Breath racial power, you can expend your Sneak Attack for this turn to deal your Sneak Attack damage to each enemy you hit that is granting combat advantage to you.
        ],
      );

      // https://iws.mx/dnd/?view=feat2495 — Martial Power 2, page(s) 142.
      #theme.featBlock(
        title: "Elusive Movement",
        requirements: "11th level",
        content: [
          Whenever you end your turn at least 3 squares away from where you began your turn, you gain a +1 feat bonus to AC and Reflex until the start of your next turn.
        ],
      );

      // https://iws.mx/dnd/?view=feat365 — Martial Power, page(s) 143.
      #theme.featBlock(
        title: "Evasive Footwork",
        requirements: "11th level, 3 Dexterity, 2 Charisma",
        content: [
          When you shift 2 or more squares on your turn, you gain a +1 bonus to AC and Reflex until the start of your next turn.
        ],
      );

      // https://iws.mx/dnd/?view=feat2496 — Martial Power 2, page(s) 142.
      #theme.featBlock(
        title: "Expert Sneak",
        requirements: "11th level",
        content: [
          You have combat advantage against enemies that are deafened, immobilized, slowed, or weakened.
        ],
      );

      // https://iws.mx/dnd/?view=feat854 — Martial Power, page(s) 144.
      #theme.featBlock(
        title: "Infernal Sneak Attack",
        requirements: "11th level, tiefling",
        content: [
          When you deal your Sneak Attack damage, you can expend your infernal wrath to deal 1d6 extra fire damage for each die of Sneak Attack damage you deal.
        ],
      );

      // https://iws.mx/dnd/?view=feat355 — Martial Power, page(s) 144.
      #theme.featBlock(
        title: "Opportunistic Sneak Attack",
        requirements: "11th level",
        content: [
          When you hit with an opportunity attack and deal Sneak Attack damage, the target is slowed until the end of your next turn.
        ],
      );

      // https://iws.mx/dnd/?view=feat861 — Martial Power, page(s) 144.
      #theme.featBlock(
        title: "Prime Slayer",
        requirements: "11th level, elf",
        content: [
          While none of your allies are closer to your target than you are, you gain a +2 bonus to damage rolls for ranged attacks against that target.
        ],
      );

      // https://iws.mx/dnd/?view=feat864 — Martial Power, page(s) 144.
      #theme.featBlock(
        title: "Rogue Weapon Mastery",
        requirements: "11th level, Rogue Weapon Talent",
        content: [
          When you wield a dagger or a shuriken, the weapon gains the high crit property.
        ],
      );

      // https://iws.mx/dnd/?view=feat865 — Martial Power, page(s) 144.
      #theme.featBlock(
        title: "Roundabout Charge",
        requirements: "11th level, proficiency in Acrobatics",
        content: [
          When you charge, each square of your movement need not bring you closer to the target of your charge, but you must start the charge at least 3 squares away from the target.
        ],
      );

      // https://iws.mx/dnd/?view=feat2517 — Martial Power 2, page(s) 143.
      #theme.featBlock(
        title: "Sneaky Opportunity",
        requirements: "11th level",
        content: [
          Your opportunity attacks with light blades deal 1d6 extra damage. This extra damage increases to 2d6 at 21st level.
        ],
      );

      // https://iws.mx/dnd/?view=feat2520 — Martial Power 2, page(s) 143.
      #theme.featBlock(
        title: "Unerring Ambush",
        requirements: "11th level",
        content: [
          During the first round of combat, when you attack a creature that has not yet acted, you can make two attack rolls and use either result.
        ],
      );
    ]
  ]
}
