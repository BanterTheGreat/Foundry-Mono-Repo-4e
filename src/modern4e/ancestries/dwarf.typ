#import "../helpers/theme.typ" as theme;
#import "../helpers/powers.typ";
#import "../helpers/ancestries.typ";

#let dwarfPage() = {
  return [
    #theme.subPageTitle(title: "Dwarf");

    #columns(2)[
      = Attributes

      #ancestries.attributes(
        size: "Medium",
        speed: 5,
        vision: "Low-light",
        languages: "Common Dwarven",
      )

      = Ancestry Traits
      == Sturdy
      You ignore any Armor speed penalties and gain +1 healing surges.
      == Stand Your Ground
      When an effect forces you to move, you can move 1 square less than the effect specifies.
      == Dwarven Resilience
      You gain the Dwarven Resilience power.

      #powers.power(
        title: "Dwarven Resilience",
        description: "You quickly catch your breath and carry on.",
        type: powers.powerType.encounter,
        range: "Personal",
        action: powers.actionType.minor,
        target: none,
        offenseStat: none,
        defenseStat: none,
        trigger: none,
        additionalRows: (
          [*Effect:* You use your second wind.],
        ),
        traits: none,
      );

      #colbreak();
      #image("../images/dwarf.jpg", height: 340pt)
    ]

    #pagebreak();
    #theme.subPageTitle(title: "Dwarf Feats", outlined: false);

    #theme.featCategoryTitle("Heroic Feats")
    #theme.featGrid(
      count: 2,
      ..theme.featCardsFromJson("../content/feats/ancestries/dwarf/heroic.json"),
    )

    #theme.featCategoryTitle("Paragon Class Combo Feats")
    #theme.featGrid(
      count: 2,
      ..theme.featCardsFromJson("../content/feats/ancestries/dwarf/paragon-class-combo.json"),
    )
  ]
}
