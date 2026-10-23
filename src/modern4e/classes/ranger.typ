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
      #theme.featBlock(
        title: "Precise Hunter",
        requirements: "3 Wisdom",
        content: [
          When you score a critical hit against the target of your Hunter's Quarry with a ranged attack, your allies gain a +1 bonus to attack rolls against that target until the start of your next turn.
        ],
      );

      #theme.featBlock(
        title: "Agile Running Attack",
        requirements: "Running Attack",
        content: [
          When you move as part of using a skirmisher attack power, you ignore difficult terrain.
        ],
      );

      #theme.featBlock(
        title: "Flank on the Run",
        requirements: "Running Attack",
        content: [
          Whenever you are adjacent to an enemy and move to another square adjacent to that enemy, you do not provoke an opportunity attack from that enemy for leaving your square.
        ],
      );

      #theme.featBlock(
        title: "Hobbling Strike",
        content: [
          Whenever you would deal Hunter's Quarry damage, you can forgo one die of that damage to slow the target until the end of your next turn.
        ],
      );

      #theme.featBlock(
        title: "Hunter’s Aim",
        content: [
          You don't take the normal –2 penalty to attack rolls against your quarry if it has cover or concealment.
        ],
      );
      
      #colbreak();

      #theme.featBlock(
        title: "Lethal Hunter",
        content: [
          The extra damage dice from your Hunter's Quarry class feature increase from d6s to d8s.
        ],
      );

      #theme.featBlock(
        title: "Second Shot",
        content: [
          You can designate the second-nearest enemy as your quarry instead of the nearest enemy.
        ],
      );

      #theme.featBlock(
        title: "Staggering Strike",
        content: [
          Whenever you would deal Hunter's Quarry damage to an enemy, you can forgo one die of that damage to push that enemy 1 square.
        ],
      );

      #theme.featBlock(
        title: "Swift Footwork",
        content: [
          Whenever you use a martial encounter or daily power that allows you to shift, you can shift 2 extra squares.
        ],
      );
    ]

    #pagebreak();

    #align(center)[
      = Paragon #className Feats (Level 11+)
    ]

    #columns(2)[
      // https://iws.mx/dnd/?view=feat833 — Martial Power, page(s) 140.
      #theme.featBlock(
        title: "Bleeding Precision",
        requirements: "11th level",
        content: [
          Whenever you hit your quarry with a ranger daily attack power, the target takes ongoing 5 damage (save ends). If the power already deals ongoing damage that has no damage type, instead increase that ongoing damage by 5.
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

      // https://iws.mx/dnd/?view=feat852 — Martial Power, page(s) 144.
      #theme.featBlock(
        title: "Hunter's Advantage",
        requirements: "11th level, elf",
        content: [
          You deal 2 extra damage with Hunter's Quarry when you have combat advantage against your quarry.
        ],
      );

      // https://iws.mx/dnd/?view=feat353 — Martial Power, page(s) 144.
      #theme.featBlock(
        title: "Hunter's Resurgence",
        requirements: "11th level",
        content: [
          When you reduce your quarry to 0 hit points, you can use your second wind as a free action. You do not gain the normal bonus to defenses if you do so.
        ],
      );

      // https://iws.mx/dnd/?view=feat859 — Martial Power, page(s) 144.
      #theme.featBlock(
        title: "Preternatural Senses",
        requirements: "11th level, 2 Wisdom, proficiency in Perception",
        content: [
          Whenever you make a Perception check, roll twice and use the higher result.
        ],
      );

      // https://iws.mx/dnd/?view=feat860 — Martial Power, page(s) 144.
      #theme.featBlock(
        title: "Prime Quarry",
        requirements: "11th level, 2 Wisdom, Prime Shot",
        content: [
          The bonus to attack rolls granted by Prime Shot increases to +2 if the target is also your quarry.
        ],
      );

      // https://iws.mx/dnd/?view=feat2515 — Martial Power 2, page(s) 143.
      #theme.featBlock(
        title: "Retreat Technique",
        requirements: "11th level",
        content: [
          Whenever you hit an enemy with a melee attack during your turn, you don't provoke opportunity attacks from that enemy for moving away from it until the end of your turn.
        ],
      );

      // https://iws.mx/dnd/?view=feat1722 — Dragon Magazine 377, page(s) 45.
      #theme.featBlock(
        title: "Sniper's Aim",
        requirements: "11th level, proficiency in Perception",
        content: [
          Whenever you miss with a daily ranger attack against your quarry, you can choose to apply your Hunter's Quarry damage. You can still deal Hunter's Quarry damage only once per turn.
        ],
      );

      // https://iws.mx/dnd/?view=feat871 — Martial Power, page(s) 145.
      #theme.featBlock(
        title: "Wrathful Hunter",
        requirements: "11th level, tiefling",
        content: [
          If you use your infernal wrath racial power against your quarry, you gain a +3 power bonus to your next attack against the target made before the end of your next turn.
        ],
      );
    ]
  ]
}

