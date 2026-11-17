#import "../helpers/theme.typ" as theme;
#import "../helpers/ancestry_content.typ" as ancestryContent;

#let orcPage() = {
  return [
    #theme.subPageTitle(title: ancestryContent.entry("modern4e.ancestry.orc").title);

    #columns(2)[
      = Attributes

      #ancestryContent.attributes("modern4e.ancestry.orc")

      = Ancestry Traits
      #ancestryContent.trait("modern4e.feature.orc-swift-charge")

      #ancestryContent.trait("modern4e.feature.orc-orc-resilience")

      #ancestryContent.trait("modern4e.feature.orc-furious-assault")


      #ancestryContent.powerCard("modern4e.power.furious-assault");
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




