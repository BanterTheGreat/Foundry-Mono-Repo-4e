#import "../helpers/theme.typ";
#import "../helpers/classes.typ" as classes;
#import "../helpers/powers.typ";

#let className = "Ranger";

#let rangerPage() = {
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
          weaponProficiencies: (
            classes.weaponProf.simpleMelee,
            classes.weaponProf.simpleRanged,
            classes.weaponProf.militaryMelee,
            classes.weaponProf.militaryRanged,
          ),
          implementProficiencies: (),
        );

        #classes.defensesAndHealth(fortitude: 12, will: 11, reflex: 12, health: 22, healthOnLevelUp: 5, healingSurges: 6)

        #classes.abilities(
          mainAbilities: ("Strength", "Dexterity"),
          extraAbilities: ("Constitution", "Wisdom", "Dexterity"),
          class: className,
        );
      ],
    )[
      = Hunter's Quarry
      You gain the Hunter's Quarry power.

      #powers.power(
        title: "Hunter's Quarry",
        type: powers.powerType.at-will,
        traits: "Martial",
        action: powers.actionType.minor,
        range: "Personal",
        target: "The nearest enemy that you can see.",
        additionalRows: (
          [*Effect:*
            The target is designated as your quarry. The target remains your quarry until the end of the encounter, until the target is defeated, or until you designate a different target as your quarry. You can designate one enemy as your quarry at a time. If multiple enemies you can see are equally nearest to you, you choose which becomes your quarry.

            Whenever you hit the enemy designated as your quarry with an attack that deals damage during your turn, you deal 1d6 extra damage to that enemy.

            *Level 11:* 2d6 extra damage. #linebreak()
            *Level 21:* 3d6 extra damage.],
        ),
      )

      = Fighting Style
      #theme.buildChoiceHeader()
      Each ranger has their own fighting style, choose one from the options below.

      #theme.choiceBlock(title: "Archer Fighting Style", body: [Whenever you roll initiative, you can shift a number of squares equal to your *Wisdom*, even if you are surprised. You gain Defensive Mobility as a bonus feat.])

       
      #theme.choiceBlock(title: "Hunter Fighting Style", body: [You gain a +4 bonus to AC against opportunity attacks you provoke by making a ranged attack. You can sheathe a weapon as a free action and can draw a weapon as part of the same action used to attack with it.])

       
      #theme.choiceBlock(title: "Marauder Fighting Style", body: [You gain a +1 bonus to speed while you aren't using a shield or a two-handed weapon. This bonus to speed increases to +2 at 21st level. While wielding a melee weapon in each hand, you gain a +1 shield bonus to AC and Reflex.])

           
          #theme.choiceBlock(title: "Two-Blade Fighting Style", body: [You can wield any one-handed weapon in your off hand as if it were an off-hand weapon. You gain Toughness as a bonus feat.])


      = Hunter’s Specialization
      #theme.buildChoiceHeader()
      Choose one of the options below:

      #theme.choiceBlock(title: "Prime Shot", body: [If none of your allies are nearer to your target than you are, you receive a +1 bonus to ranged attack rolls against that target.])
      
      #theme.choiceBlock(title: "Running Attack", body: [Whenver you use a standard action that lets you move (such as making a charge or using the skirmish shot power), and you end that movement at least 2 squares away from where you began that move, you gain a +1 bonus to attack rolls made as part of that standard action.])
    ]

    #classes.classFeatures[
      = Powers
      You may choose 2 At-Will, 1 Encounter and 2 Daily #className Powers.

      #classes.powerLinks(className: className);
    ]

    #set page(columns: 1)

    #align(center)[
      = Heroic #className Feats
    ]

    #columns(2)[
      #theme.featBlocksFromJson("../content/feats/heroic/ranger.json", start: 0, end: 5);
      
      #colbreak();

      #theme.featBlocksFromJson("../content/feats/heroic/ranger.json", start: 5, end: 9);
    ]

    #pagebreak();

    #align(center)[
      = Paragon #className Feats (Level 11+)
    ]

    #columns(2)[
      #theme.featBlocksFromJson("../content/feats/paragon/ranger.json");
    ]
  ]
}

