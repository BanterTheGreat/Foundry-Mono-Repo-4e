#import "../helpers/theme.typ";
#import "../helpers/classes.typ" as classes;
#import "../helpers/powers.typ";

#let className = "Druid";

#let druidPage() = {
  return [
    #classes.bannerPage(
      className: className,
    );

    #classes.classOverview(
      className: className,
      reference: [
        #classes.proficiencies(
          armorProficiencies: (classes.armorProf.light),
          weaponProficiencies: (classes.weaponProf.simpleMelee, classes.weaponProf.simpleRanged),
          implementProficiencies: (classes.implementProf.staff, classes.implementProf.totem),
        );

        #classes.defensesAndHealth(fortitude: 11, will: 12, reflex: 12, health: 22, healthOnLevelUp: 5, healingSurges: 7)

        #classes.abilities(
          mainAbilities: "Wisdom",
          extraAbilities: ("Constitution", "Dexterity"),
          class: className,
        );
      ],
    )[
      = Balance of Nature
      Some Druids favor being in beast form, while others prefer being in humanoid form. However, just as Druids seek balance in the world between divine and primordial forces, Druids pursue balance within their own minds and bodies.

      *You begin with three at-will attack powers.* Throughout your career, *at least one of those powers, and no more than two, must have the beast form keyword.* By this means, you have access to useful attacks in either beast form or humanoid form.

      = Primal Aspect
      #theme.buildChoiceHeader()
      Druidic lore speaks of the Primal Beast, the first spirit of the world's noble predators. A formless thing of shadows, fur, feathers, and claws, this creature appears in many Druids' visions, and they speak of channeling the Primal Beast when using their wild shape and beast form powers. As a Druid, you choose which aspect of the Primal Beast you most strongly manifest with your powers.
      Choose one of these options. Your choice provides bonuses to certain Druid powers, as detailed in those powers.

      #theme.choiceBlock(title: "Primal Guardian", body: [While you are not wearing heavy armor, you can use your *Constitution* in place of your Dexterity or Intelligence to determine your AC.])

       
      #theme.choiceBlock(title: "Primal Predator", body: [While you are not wearing heavy armor, you gain a +1 bonus to your speed.])

       
      #theme.choiceBlock(title: "Primal Swarm", body: [While you are in beast form and not wearing heavy armor, melee attacks and ranged attacks deal less damage to you. When you take damage from either type of attack, the damage is reduced by your *Constitution*.])

       
      #theme.choiceBlock(title: "Primal Wrath", body: [While you are not wearing heavy armor, you gain a +1 bonus to the attack rolls of Druid attack powers and Druid paragon path attack powers that have the cold, fire, lightning, or thunder keywords.])
    ]

    #classes.classFeatures[
      = Wild Shape
      As a Druid, you have the ability to channel the primal energy of beasts into your physical form and transform into a beast. You have an at-will power, wild shape, that allows you to assume the form of a beast, and many Druid powers have the beast form keyword and therefore can be used only while you are in beast form.

      The wild shape power lets you assume a form of your size that resembles a natural or a fey beast, usually a four-legged mammalian predator such as a bear, a boar, a panther, a wolf, or a wolverine. Your beast form might also be an indistinct shape of shadowy fur and claws, an incarnation of the Primal Beast of which all earthly beasts are fractured images. You choose a specific form whenever you use wild shape, and that form has no effect on your game statistics.

      Your choice of Primal Aspect might suggest a specific form you prefer to assume, and certain beast form powers specify changes to your form when you use them. You might also resemble a more exotic beast when you're in beast form: a reptile such as a rage drake or a crocodile, or a fantastic beast such as an owlbear or a bulette.

      #powers.power(
        title: "Wild Shape",
        type: powers.powerType.at-will,
        action: powers.actionType.minor,
        range: [*Personal*],
        isSpecial: true,
        traits: "Polymorph, Primal",
        additionalRows: (
          [
            *Effect:* You change from your humanoid form to beast form or vice versa. When you change from beast form back to your humanoid form, you can shift 1 square. While you are in beast form, you can't use weapon or implement attack powers that lack the beast form keyword, although you can sustain such powers.

            You choose a specific form whenever you use wild shape to change into beast form. The beast form is your size, resembles a natural beast or a fey beast, and normally doesn't change your game statistics. Your equipment becomes part of your beast form, but you drop anything you are holding, except implements you can use. You continue to gain the benefits of the equipment you wear, except a shield.

            You can use the properties and the powers of implements as well as magic items that you wear, but not the properties or the powers of weapons or the powers of wondrous items. While equipment is part of your beast form, it cannot be removed, and anything in a container that is part of your beast form is inaccessible.
          ],
          [
            *Special:* You can use this power once per round.
          ],
        ),
      )
      #colbreak();

      = Powers
      You may choose 3 At-Will, off which 1 must be a beast form power, 1 Encounter and 2 Daily #className Powers.

      #classes.powerLinks(className: className);
    ]
    #pagebreak()

    #align(center)[
      = Heroic #className Feats
    ]

    #columns(2)[
      #theme.featBlock(
        title: "Strong-Willed Summoning",
        content: [
          When a creature you summon uses an instinctive action to attack, it gains a +1 bonus to the attack roll.
        ],
      );

      #theme.featBlock(
        title: "Primal Instinct",
        requirements: "Primal Guardian",
        content: [
          When you roll initiative at the start of any encounter, one ally within 5 squares of you can reroll his or her initiative.
        ],
      );

      #theme.featBlock(
        title: "Watchful Guardian",
        requirements: "Primal Guardian",
        content: [
          While you are in beast form, you and each ally adjacent to you gain a +2 feat bonus to attack rolls when making opportunity attacks.
        ],
      );

      #theme.featBlock(
        title: "Primal Fury",
        requirements: "Primal Predator",
        content: [
          You gain a +1 bonus to attack rolls with primal powers against bloodied enemies.
        ],
      );

      #theme.featBlock(
        title: "Predator’s Burst",
        requirements: "Primal Predator",
        content: [
          When you charge while you are in beast form, you gain a +2 bonus to speed and a +1 bonus to the damage rolls of the charge attack.
        ],
      );

      #theme.featBlock(
        title: "Stinging Swarm",
        requirements: "Primal Swarm",
        content: [
          Once per round when an enemy damages you with a melee attack while you are in beast form, that enemy grants combat advantage to you until the end of your next turn.
        ],
      );

      #theme.featBlock(
        title: "Ruthless Killer",
        requirements: "Grasping Claws Power",
        content: [
          When you hit a target with the grasping claws power, instead of slowing the target you can instead choose for the target to be immobilized until the end of your next turn. If you are ever not adjacent to the target, the immobilized effect ends.
        ],
      );

      #colbreak();

      #theme.featBlock(
        title: "Patient Hunter",
        requirements: "Pounce Power",
        content: [
          When you hit a target with an attack using the pounce power, the target grants combat advantage until the end of your next turn.
        ],
      );

      #theme.featBlock(
        title: "Unstoppable Beast",
        requirements: "Savage Rend Power",
        content: [
          When you hit a target with the savage rend power, you can shift 1 square into the space occupied by your target after you slide it.
        ],
      );

      #theme.featBlock(
        title: "Agile Form",
        content: [
          When you use wild shape to change from your humanoid form to beast form, you shift 1 square.
        ],
      );

      #theme.featBlock(
        title: "Cheetah’s Speed",
        content: [
          While you are in beast form and you are bloodied, you gain a +4 feat bonus to speed when you charge or run.
        ],
      );

      #theme.featBlock(
        title: "Enraged Boar Form",
        content: [
          While you are in beast form, you gain a +1 bonus to attack rolls and a +2 bonus to damage rolls with charge attacks.
        ],
      );

      #theme.featBlock(
        title: "Turtle’s Shell",
        content: [
          While you are in beast form, any time you take the total defense action or use your second wind, you gain resist 5 to all damage until the end of your next turn.
        ],
      );
    ]

    #pagebreak();

    #align(center)[
      = Paragon #className Feats (Level 11+)
    ]

    #columns(2)[
      // https://iws.mx/dnd/?view=feat1889 — Primal Power, page(s) 143.
      #theme.featBlock(
        title: "Bolstered Swarm",
        requirements: "11th level, Primal Swarm",
        content: [
          When you use wild shape to change from your humanoid form to beast form, you gain 5 + your Constitution temporary hit points. The temporary hit points increase to 10 + your Constitution at 21st level.
        ],
      );

      // https://iws.mx/dnd/?view=feat1890 — Primal Power, page(s) 143.
      #theme.featBlock(
        title: "Bolstering Guardian",
        requirements: "11th level, Primal Guardian",
        content: [
          When you reduce an enemy to 0 hit points with a druid attack power, one ally adjacent to you gains temporary hit points equal to your Constitution.
        ],
      );

      // https://iws.mx/dnd/?view=feat2187 — Dragon Magazine 382, page(s) 54.
      #theme.featBlock(
        title: "Brutal Grappler Form",
        requirements: "11th level",
        content: [
          While you are in beast form, you gain a +2 feat bonus to grab attempts. Additionally, any target you are grabbing while in beast form grants you combat advantage.
        ],
      );

      // https://iws.mx/dnd/?view=feat1891 — Primal Power, page(s) 143.
      #theme.featBlock(
        title: "Commanding Form",
        requirements: "11th level",
        content: [
          Once per round while you are in beast form, you can use a free action to give one of your summoned creatures a command that normally requires a minor action.
        ],
      );

      // https://iws.mx/dnd/?view=feat2188 — Dragon Magazine 382, page(s) 54.
      #theme.featBlock(
        title: "Fierce Thrasher Form",
        requirements: "11th level",
        content: [
          While you are in beast form and use a beast form power that pushes, pulls, or slides the target, increase the distance of the push, pull, or slide by 1 square.
        ],
      );

      // https://iws.mx/dnd/?view=feat554 — Player's Handbook 2, page(s) 191.
      #theme.featBlock(
        title: "Hunting Wolf Form",
        requirements: "11th level",
        content: [
          While you are in beast form, you gain a +5 feat bonus to Perception checks and a +1 feat bonus to speed.
        ],
      );

      // https://iws.mx/dnd/?view=feat1900 — Primal Power, page(s) 145.
      #theme.featBlock(
        title: "Pouncing Form",
        requirements: "11th level, Primal Predator",
        content: [
          When you use wild shape to change from your humanoid form to beast form, you can shift a number of squares equal to your Dexterity.
        ],
      );

      // https://iws.mx/dnd/?view=feat1045 — Player's Handbook 2, page(s) 191.
      #theme.featBlock(
        title: "Quick Wild Shape",
        requirements: "11th level",
        content: [
          You can use your wild shape power as a free action during your turn.
        ],
      );

      // https://iws.mx/dnd/?view=feat1903 — Primal Power, page(s) 145.
      #theme.featBlock(
        title: "Scattering Swarm",
        requirements: "11th level, Primal Swarm",
        content: [
          While you are in beast form, if you take damage from an area or a close attack, you can shift 2 squares as a free action.
        ],
      );

      // https://iws.mx/dnd/?view=feat2189 — Dragon Magazine 382, page(s) 54.
      #theme.featBlock(
        title: "Scuttling Crawler Form",
        requirements: "11th level",
        content: [
          While you are in beast form, you gain a +5 feat bonus to Athletics checks to climb and can climb at your speed.
        ],
      );

      // https://iws.mx/dnd/?view=feat553 — Player's Handbook 2, page(s) 192.
      #theme.featBlock(
        title: "Stalking Panther Form",
        requirements: "11th level",
        content: [
          While you are in beast form, you gain a +5 feat bonus to Stealth checks and a +4 feat bonus to initiative checks.
        ],
      );

      // https://iws.mx/dnd/?view=feat2190 — Dragon Magazine 382, page(s) 54.
      #theme.featBlock(
        title: "Venomous Fang Form",
        requirements: "11th level",
        content: [
          While you are in beast form, all your melee attacks with the poison keyword ignore the first 10 points of the target's poison resist. This increases to 15 points at 21st level.
        ],
      );

      // https://iws.mx/dnd/?view=feat1914 — Primal Power, page(s) 145.
      #theme.featBlock(
        title: "Vital Form",
        requirements: "11th level",
        content: [
          Once per encounter, when you use wild shape, you regain the use of your second wind if you have already used it during this encounter.
        ],
      );

      // https://iws.mx/dnd/?view=feat1915 — Primal Power, page(s) 146.
      #theme.featBlock(
        title: "Warning Guardian",
        requirements: "11th level, Primal Guardian",
        content: [
          Any ally adjacent to you doesn't grant combat advantage for being flanked.
        ],
      );
    ]
  ]
}
