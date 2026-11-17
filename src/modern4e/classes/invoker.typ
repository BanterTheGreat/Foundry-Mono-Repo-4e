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
      #theme.featBlocksFromJson("../content/feats/heroic/invoker.json");
    ]

    #pagebreak();

    #align(center)[
      = Paragon #className Feats (Level 11+)
    ]

    #columns(2)[
      #theme.featBlocksFromJson("../content/feats/paragon/invoker.json");
    ]
  ]
}
