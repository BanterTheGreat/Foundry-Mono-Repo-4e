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
      #theme.featBlocksFromJson("../content/feats/heroic/rogue.json");

    ]

    #pagebreak();

    #align(center)[
      = Paragon #className Feats (Level 11+)
    ]

    #columns(2)[
      #theme.featBlocksFromJson("../content/feats/paragon/rogue.json");
    ]
  ]
}
