#import "../helpers/theme.typ" as theme;
#import "../helpers/ancestry_content.typ" as ancestryContent;

#let dragonbornPage() = {
  return [
    #theme.subPageTitle(title: ancestryContent.entry("modern4e.ancestry.dragonborn").title);

    #columns(2)[
      = Attributes

      #ancestryContent.attributes("modern4e.ancestry.dragonborn")

      = Traits
      #ancestryContent.trait("modern4e.feature.dragonborn-dragonborn-scales")

      #ancestryContent.trait("modern4e.feature.dragonborn-draconic-heritage")

      #ancestryContent.trait("modern4e.feature.dragonborn-dragonborn-powers")


      #colbreak();
      #image("../images/dragonborn.png", height: 300pt)
    ]

    #columns(2)[
      #theme.choiceBox(ancestryContent.entry("modern4e.power.dragon-breath").title)

      #ancestryContent.powerCard("modern4e.power.dragon-breath");

      #colbreak();
      #theme.choiceBox(ancestryContent.entry("modern4e.power.dragonfear").title)

      #ancestryContent.powerCard("modern4e.power.dragonfear");
    ]

    #pagebreak();
    #theme.subPageTitle(title: "Dragonborn Feats", outlined: false);

    #theme.featCategoryTitle("Heroic Feats")
    #theme.featGrid(
      count: 2,
      ..theme.featCardsFromJson("../content/feats/ancestries/dragonborn/heroic.json"),
    )

    #theme.featCategoryTitle("Heroic Class Combo Feats")
    #theme.featGrid(
      count: 2,
      ..theme.featCardsFromJson("../content/feats/ancestries/dragonborn/heroic-class-combo.json"),
    )

    #theme.featCategoryTitle("Paragon Class Combo Feats")
    #theme.featGrid(
      count: 2,
      ..theme.featCardsFromJson("../content/feats/ancestries/dragonborn/paragon-class-combo.json"),
    )
  ]
}
