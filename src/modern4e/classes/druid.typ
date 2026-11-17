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
      #theme.featBlocksFromJson("../content/feats/heroic/druid.json", start: 0, end: 7);

      #colbreak();

      #theme.featBlocksFromJson("../content/feats/heroic/druid.json", start: 7, end: 13);
    ]

    #pagebreak();

    #align(center)[
      = Paragon #className Feats (Level 11+)
    ]

    #columns(2)[
      #theme.featBlocksFromJson("../content/feats/paragon/druid.json");
    ]
  ]
}
