#import "../helpers/theme.typ" as theme;
#import "../helpers/ancestry_content.typ" as ancestryContent;

#let humanPage() = {
  return [
    #theme.subPageTitle(title: ancestryContent.entry("modern4e.ancestry.human").title);

    #columns(2)[
      = Attributes

      #ancestryContent.attributes("modern4e.ancestry.human")

      = Ancestry Traits
      #ancestryContent.trait("modern4e.feature.human-cooperation")

      #ancestryContent.trait("modern4e.feature.human-all-rounded")

      #ancestryContent.trait("modern4e.feature.human-heroic-effort")


      #ancestryContent.powerCard("modern4e.power.heroic-effort");

      #colbreak();
      #image("../images/human.png", height: 300pt)
    ]

    #pagebreak();
    #theme.subPageTitle(title: "Human Feats", outlined: false);

    #theme.featCategoryTitle("Heroic Feats")
    #theme.featGrid(
      count: 3,
      ..theme.featCardsFromJson("../content/feats/ancestries/human/heroic.json"),
    )

    #theme.featCategoryTitle("Heroic Class Combo Feats")
    #theme.featGrid(
      count: 3,
      ..theme.featCardsFromJson("../content/feats/ancestries/human/heroic-class-combo.json"),
    )

    #theme.featCategoryTitle("Paragon Feats")
    #theme.featGrid(
      count: 3,
      ..theme.featCardsFromJson("../content/feats/ancestries/human/paragon.json"),
    )

    #theme.featCategoryTitle("Paragon Class Combo Feats")
    #theme.featGrid(
      count: 3,
      ..theme.featCardsFromJson("../content/feats/ancestries/human/paragon-class-combo.json"),
    )
  ]
}
