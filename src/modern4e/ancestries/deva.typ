#import "../helpers/theme.typ" as theme;
#import "../helpers/ancestry_content.typ" as ancestryContent;

#let devaPage() = {
  return [
    #theme.subPageTitle(title: ancestryContent.entry("modern4e.ancestry.deva").title);

    #columns(2)[
      = Attributes

      #ancestryContent.attributes("modern4e.ancestry.deva")

      = Traits
      #ancestryContent.trait("modern4e.feature.deva-astral-majesty")


      #ancestryContent.trait("modern4e.feature.deva-astral-resistance")


      #ancestryContent.trait("modern4e.feature.deva-immortal-origin")


      #ancestryContent.trait("modern4e.feature.deva-memory-of-a-thousand-lifetimes")


      #ancestryContent.powerCard("modern4e.power.memory-of-a-thousand-lifetimes")

      #colbreak();
      #image("../images/deva.jpg", height: 400pt)
    ]

    #pagebreak();
    #theme.subPageTitle(title: "Deva Feats", outlined: false);

    #theme.featCategoryTitle("Heroic Feats")
    #theme.featGrid(
      count: 3,
      ..theme.featCardsFromJson("../content/feats/ancestries/deva/heroic.json"),
    )

    #theme.featCategoryTitle("Heroic Class Combo Feats")
    #theme.featGrid(
      count: 3,
      ..theme.featCardsFromJson("../content/feats/ancestries/deva/heroic-class-combo.json"),
    )

    #theme.featCategoryTitle("Paragon Feats")
    #theme.featGrid(
      count: 3,
      ..theme.featCardsFromJson("../content/feats/ancestries/deva/paragon.json"),
    )

    #theme.featCategoryTitle("Paragon Class Combo Feats")
    #theme.featGrid(
      count: 3,
      ..theme.featCardsFromJson("../content/feats/ancestries/deva/paragon-class-combo.json"),
    )
  ]
}
