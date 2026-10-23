#import "../helpers/theme.typ";
#import "../helpers/classes.typ" as classes;
#import "../helpers/powers.typ";

#let className = "Avenger";

#let avengerPage() = {
  return [
    #classes.bannerPage(
      className: className,
    );

    #classes.classOverview(
      className: className,
      reference: [
        #classes.proficiencies(
          armorProficiencies: (classes.armorProf.cloth),
          weaponProficiencies: (
            classes.weaponProf.simpleMelee,
            classes.weaponProf.militaryMelee,
            classes.weaponProf.simpleRanged,
          ),
          implementProficiencies: (classes.implementProf.holySymbol),
        );

        #classes.defensesAndHealth(fortitude: 12, will: 12, reflex: 12, health: 24, healthOnLevelUp: 6, healingSurges: 7)

        #classes.abilities(
          mainAbilities: "Wisdom",
          extraAbilities: ("Dexterity", "Intelligence"),
          class: className,
        );
      ],
    )[
      = Armor Of Faith
      The favor of your deity wards you from harm. While you are wearing cloth armor or no armor and aren’t using a shield, you gain a +3 bonus to AC.

      = Channel Divinity
      Once per encounter you can invoke divine power, filling yourself with the might of your patron deity. With the divine might you invoke you can wield special powers. You can also learn other uses for this feature; for instance, the divinity feats grant characters with access to the Channel Divinity class feature the ability to use additional special powers.

      Regardless of how many different uses for Channel Divinity you know, you can use only one such ability per encounter. The special ability or power you invoke works just like your other powers. You gain the following Channel Divinity abilities.

      #powers.power(
        title: "Abjure Undead",
        description: "You send a brilliant ray of radiant power at an undead foe, compelling it to stagger toward you.",
        type: powers.powerType.encounter,
        action: powers.actionType.standard,
        range: [*Close* burst 5],
        target: "One undead creature in the burst",
        isSpecial: true,
        traits: "Divine, Implement, Radiant",
        offenseStat: "Wisdom",
        defenseStat: "Will",
        additionalRows: (
          [
            *Hit:* 3d10 + Wisdom radiant damage, and you pull the target a number of squares equal to 1 + your Wisdom. The target is also immobilized until the end of your next turn.

            *Level 5:* 4d10 + Wisdom radiant damage. #linebreak()
            *Level 11:* 5d10 + Wisdom radiant damage. #linebreak()
            *Level 15:* 6d10 + Wisdom radiant damage. #linebreak()
            *Level 21:* 7d10 + Wisdom radiant damage. #linebreak()
            *Level 25:* 8d10 + Wisdom radiant damage.
          ],
          [
            *Miss:* Half damage, and you pull the target 1 square
          ],
          [
            *Channel Divinity:* You can use only one channel divinity power per encounter.
          ],
        ),
      )

      #powers.power(
        title: "Divine Guidance",
        description: "You lend your deity’s guidance to an ally’s attack against your foe.",
        type: powers.powerType.encounter,
        action: powers.actionType.immediateInterrupt,
        range: [*Close* burst 10],
        target: "The Triggering Ally",
        isSpecial: true,
        traits: "Divine",
        trigger: "An ally within 10 squares of you makes an attack roll against your oath of enmity target.",
        additionalRows: (
          [
            *Effect:* The target makes a second attack roll and uses either result.
          ],
          [
            *Channel Divinity:* You can use only one channel divinity power per encounter.
          ],
        ),
      )
    ]

    #classes.classFeatures[
      = Oath of Enmity
      Your god gives you the power to strike down your chosen prey. You gain the oath of enmity power.

      #powers.power(
        title: "Oath of Enmity",
        description: "You focus your wrath on a single foe, giving your attacks against it extraordinary accuracy.",
        type: powers.powerType.encounter,
        action: powers.actionType.minor,
        range: [*Close* burst 10],
        target: "One enemy you can see in burst",
        isSpecial: true,
        traits: "Divine",
        additionalRows: (
          [
            *Effect:* When you make a melee attack against the target and the target is the only enemy adjacent to you, you make two attack rolls and use either result. This effect lasts until the end of the encounter or until the target drops to 0 hit points, at which point you regain the use of this power.

            If another effect lets you roll twice and use the higher result when making an attack roll, this power has no effect on that attack. If an effect forces you to roll twice and use the lower result when making an attack roll, this power has no effect on that attack either.

            If an effect lets you reroll an attack roll and you rolled twice because of this power, you reroll both dice.

            If both of the dice results would hit, your attack deals an additional 1[W] damage.
          ],
        ),
      )

      = Vindicator’s Censure
      #theme.buildChoiceHeader()
      As a vindicator, you train your mind, body, and soul toward one purpose: destroying the enemies of your faith. To that end, you gain divine aid in pursuing a single target, though the way you eliminate that enemy varies. Do you pin your foe down and keep other enemies away, or do you pursue your foe across the field of battle?
      Choose one of the following options. Your choice provides bonuses to certain vindicator powers, as detailed in those powers.

      #theme.choiceBlock(title: "Censure of Pursuit", body: [Whenever you hit your oath of enmity target with a charge attack, you gain a +2 bonus to AC and damage rolls until the end of your next turn. The bonus to damage rolls increases to +4 at 11th level and +6 at 21st level.])

       
      #theme.choiceBlock(title: "Censure of Retribution", body: [Whenever any enemy hits you with an attack, you gain a bonus to damage rolls against your oath of enmity target equal to your *Intelligence* until the end of your next turn.])
       
      #theme.choiceBlock(title: "Censure of Unity", body: [You gain a +2 bonus to damage rolls against your oath of enmity target for each ally adjacent to that target. The bonus increases to +3 at 11th level and +4 at 21st level.])

      #colbreak()

      = Powers
      You may choose 2 At-Will, 1 Encounter and 2 Daily #className Powers.



      #classes.powerLinks(className: className);
    ]

    #pagebreak();

    #align(center)[
      = Heroic #className Feats
    ]

    #columns(2)[
      #theme.featBlock(
        title: "Vindicating Allure",
        requirements: "Censure of Unity",
        content: [
          When you use your bond of censure power, add 2 to the number of squares you can pull the target.
        ],
      );

      #theme.featBlock(
        title: "Vindicating Resolution",
        requirements: "Censure of Pursuit",
        content: [
          When you attack a target of your oath of enmity with a weapon attack, treat all rolls of a 1 or 2 on the damage dice as though the result were 3 on the die.
        ],
      );

      #theme.featBlock(
        title: "Closing Pledge",
        requirements: "Censure of Pursuit",
        content: [
          When you hit your oath of enmity target with a ranged attack, you can shift a number of squares equal to 1 + your Dexterity as a free action, as long as you end that shift closer to the target.
        ],
      );

      #theme.featBlock(
        title: "Divine Passion",
        content: [
          When you use divine guidance and the triggering ally hits its target, the ally deals an additional 5 radiant damage.
          At 21st level, the ally deals an extra 10 radiant damage.
        ],
      );

      #colbreak();

      #theme.featBlock(
        title: "Improved Armor of Faith",
        content: [
          While you are wearing cloth armor or no armor and aren’t using a shield, you gain a +1 bonus to AC.
        ],
      );

      #theme.featBlock(
        title: "Oath Strike",
        content: [
          When you use oath of enmity, you can mark the target until the end of your next turn.
        ],
      );

      #theme.featBlock(
        title: "Divine Distraction",
        requirements: "Censure of Unity",
        content: [
          When you are adjacent to your oath of enmity target, the target grants combat advantage to any of your allies adjacent to it.
        ],
      );

      #theme.featBlock(
        title: "Armor of Vengeance",
        requirements: "Censure of Retribution",
        content: [
          While you are adjacent to your oath of enmity target, you gain a +1 bonus to all defenses against every other creature.
        ],
      );
    ]

    #pagebreak();

    #align(center)[
      = Paragon #className Feats (Level 11+)
    ]

    #columns(2)[
      // https://iws.mx/dnd/?view=feat2166 — Dragon Magazine 382, page(s) 40.
      #theme.featBlock(
        title: "Arbiter of Justice",
        requirements: "11th level",
        content: [
          You deal +2 damage against bloodied targets. Additionally, whenever an ally bloodies or reduces your oath of enmity target to 0 hit points, you may act as though you had bloodied or reduced the target to 0 hit points.
        ],
      );

      // https://iws.mx/dnd/?view=feat1565 — Divine Power, page(s) 137.
      #theme.featBlock(
        title: "Avenging Surge",
        requirements: "11th level, Censure of Unity",
        content: [
          When an ally hits your oath of enmity target, you gain temporary hit points equal to 3 + 3 per ally adjacent to that target.
        ],
      );

      // https://iws.mx/dnd/?view=feat1566 — Divine Power, page(s) 137.
      #theme.featBlock(
        title: "Censure's Grip",
        requirements: "11th level, Censure of Pursuit",
        content: [
          When you have combat advantage against your oath of enmity target and hit it with an avenger power, your target cannot shift away from you until the end of your next turn.
        ],
      );

      // https://iws.mx/dnd/?view=feat1570 — Divine Power, page(s) 138.
      #theme.featBlock(
        title: "Devout Guidance",
        requirements: "11th level",
        content: [
          When you use your divine guidance, the target gains a +3 power bonus to the second attack roll.
        ],
      );

      // https://iws.mx/dnd/?view=feat1572 — Divine Power, page(s) 138.
      #theme.featBlock(
        title: "Eager for Blood",
        requirements: "11th level",
        content: [
          During the first round of combat, your avenger weapon attacks deal 1[W] extra damage.
        ],
      );

      // https://iws.mx/dnd/?view=feat2167 — Dragon Magazine 382, page(s) 41.
      #theme.featBlock(
        title: "Exposing Oath",
        requirements: "11th level",
        content: [
          While a creature is your oath of enmity target, your attacks ignore any resist radiant or resist necrotic the target has.
        ],
      );

      // https://iws.mx/dnd/?view=feat2168 — Dragon Magazine 382, page(s) 41.
      #theme.featBlock(
        title: "Halo of Isolation",
        requirements: "11th level",
        content: [
          While adjacent to your oath of enmity target, all other enemies treat squares adjacent to you as difficult terrain.
        ],
      );

      // https://iws.mx/dnd/?view=feat487 — Player's Handbook 2, page(s) 191.
      #theme.featBlock(
        title: "Inexorable Pursuit",
        requirements: "11th level, Censure of Pursuit",
        content: [
          When you charge your oath of enmity target, you can ignore difficult terrain and move through enemies' spaces during the charge.
        ],
      );

      // https://iws.mx/dnd/?view=feat1756 — Dragon Magazine 378.
      #theme.featBlock(
        title: "Inspiring Oath",
        requirements: "11th level",
        content: [
          When you use oath of enmity, one ally you can see can shift 2 squares closer to your target as a free action.
        ],
      );

      // https://iws.mx/dnd/?view=feat496 — Player's Handbook 2, page(s) 191.
      #theme.featBlock(
        title: "Onslaught of Enmity",
        requirements: "11th level",
        content: [
          When you use oath of enmity, you can shift 2 squares closer to the target as a free action.
        ],
      );

      // https://iws.mx/dnd/?view=feat2169 — Dragon Magazine 382, page(s) 41.
      #theme.featBlock(
        title: "Painful Oath",
        requirements: "11th level",
        content: [
          The first time you hit your oath of enmity target each turn, you deal extra radiant and necrotic damage equal to your Wisdom.
        ],
      );

      // https://iws.mx/dnd/?view=feat1585 — Divine Power, page(s) 140.
      #theme.featBlock(
        title: "Pledge of Retribution",
        requirements: "11th level, Censure of Retribution",
        content: [
          If you miss your oath of enmity target with an attack, you gain a +1 bonus to the next attack roll you make against that target before the end of your next turn.
        ],
      );

      // https://iws.mx/dnd/?view=feat1044 — Player's Handbook 2, page(s) 191.
      #theme.featBlock(
        title: "Protected Isolation",
        requirements: "11th level, Censure of Retribution",
        content: [
          While you are adjacent to your oath of enmity target, you gain a +1 bonus to AC.
        ],
      );
    ]
  ]
}
