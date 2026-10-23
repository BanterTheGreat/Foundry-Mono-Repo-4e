#import "../helpers/theme.typ" as theme;
#import "../helpers/powers.typ";
#import "../helpers/ancestries.typ";

#let orcPage() = {
  return [
    #theme.subPageTitle(title: "Orc");

    #columns(2)[
      = Attributes

      #ancestries.attributes(
        size: "Medium",
        speed: 6,
        vision: "Low-Light",
        languages: "Common + 1",
      )

      = Ancestry Traits
      == Swift Charge
      You gain a +2 bonus to speed when charging.
      == Orc Resilience
      The first time you are bloodied during an encounter, you gain 5 temporary hit points. The hit points increase to 10 at 11th and 15 at 21st level.
      == Furious Assault
      You gain the Furious Assault power.

      #powers.power(
        title: "Furious Assault",
        description: "Your monstrous wrath burns inside you.",
        type: powers.powerType.encounter,
        range: "Personal",
        action: powers.actionType.free,
        target: none,
        offenseStat: none,
        defenseStat: none,
        trigger: "You hit an enemy with an attack.",
        additionalRows: (
          [*Effect:* The attack deals 1[W] extra damage if it's a weapon attack or 1d8 extra damage if it is not a weapon attack.],
        ),
        traits: none,
      );
      #colbreak();
      #image("../images/orc.png", height: 300pt)
    ]

    #pagebreak();
    #theme.subPageTitle(title: "Orc Feats", outlined: false);

    #theme.featCategoryTitle("Heroic Feats")
    #theme.featGrid(
      count: 2,
      ..theme.featCardsFromJson("../content/feats/ancestries/orc/heroic.json"),
    )

    #theme.featCategoryTitle("Heroic Class Combo Feats")
    #theme.featGrid(
      count: 2,
      ..theme.featCardsFromJson("../content/feats/ancestries/orc/heroic-class-combo.json"),
    )

    #theme.featCategoryTitle("Paragon Class Combo Feats (Level 11+)")
    #theme.featGrid(
      count: 2,
      ..theme.featCardsFromJson("../content/feats/ancestries/orc/paragon-class-combo.json"),
    )
  ]
}




