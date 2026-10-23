#import "../helpers/theme.typ" as theme;
#import "../helpers/powers.typ";
#import "../helpers/ancestries.typ";


#let tieflingPage() = {
  return [
    #theme.subPageTitle(title: "Tiefling");

    #columns(2)[
      = Attributes

      #ancestries.attributes(
        size: "Medium",
        speed: 6,
        vision: "Low-Light",
        languages: "Common + 1",
      )

      = Ancestry Traits
      == Bloodhunt
      You gain a +1 racial bonus to attack rolls against bloodied foes.
      == Fire Resistance
      You have resist fire 5 + one-half your level.
      == Infernal Wrath
      You gain the Infernal Wrath power.

      #powers.power(
        title: "Infernal Wrath",
        description: "You call upon the hellfire burning in your soul to punish your enemy.",
        type: powers.powerType.encounter,
        range: "Close burst 10",
        action: powers.actionType.free,
        target: "The triggering enemy in the burst",
        offenseStat: "Main Ability",
        defenseStat: none,
        trigger: "An enemy within 10 squares of you hits you.",
        additionalRows: (
          [*Effect:* The target takes 1d6 + Main Ability fire damage.
            - Level 11: 2d6 + Main Ability fire damage.
            - Level 21: 3d6 + Main Ability fire damage.
          ],
        ),
        traits: "Fire",
      );

      #colbreak();
      #image("../images/tiefling.webp", height: 300pt)
    ]

    #pagebreak();
    #theme.subPageTitle(title: "Tiefling Feats", outlined: false);

    #theme.featCategoryTitle("Heroic Feats")
    #theme.featGrid(
      count: 3,
      ..theme.featCardsFromJson("../content/feats/ancestries/tiefling/heroic.json"),
    )

    #theme.featCategoryTitle("Heroic Class Combo Feats")
    #theme.featGrid(
      count: 3,
      ..theme.featCardsFromJson("../content/feats/ancestries/tiefling/heroic-class-combo.json"),
    )

    #theme.featCategoryTitle("Paragon Feats")
    #theme.featGrid(
      count: 3,
      ..theme.featCardsFromJson("../content/feats/ancestries/tiefling/paragon.json"),
    )

    #theme.featCategoryTitle("Paragon Class Combo Feats")
    #theme.featGrid(
      count: 3,
      ..theme.featCardsFromJson("../content/feats/ancestries/tiefling/paragon-class-combo.json"),
    )
  ]
}
