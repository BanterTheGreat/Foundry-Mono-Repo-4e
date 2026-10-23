#import "../helpers/theme.typ";
#import "../helpers/classes.typ" as classes;
#import "../helpers/powers.typ";

#let className = "Empty";

#let emptyPage() = {
  return [
    #classes.bannerPage(className: className);

    #columns(2)[
      #classes.proficiencies(
        armorProficiencies: (),
        weaponProficiencies: (),
        implementProficiencies: (),
      );

      #classes.defensesAndHealth(fortitude: 12, will: 12, reflex: 15, health: 22, healthOnLevelUp: 5, healingSurges: 6)

      #classes.abilities(
        mainAbilities: "MainAbility",
        extraAbilities: ("SecondaryAbility", "SecondaryAbility2"),
        class: className,
      );

      #colbreak();
      = Features
      Feature 1

      = Powers
      You may choose 2 At-Will, 1 Encounter and 2 Daily #className Powers.

    ]

    #pagebreak()

    #set page(columns: 1)

    #classes.powerLinks(className: className);

    #pagebreak()

    #align(center)[
      = Heroic #className Feats
    ]

    #columns(2)[
    ]
  ]
}
