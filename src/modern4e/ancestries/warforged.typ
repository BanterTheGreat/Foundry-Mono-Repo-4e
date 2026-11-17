#import "../helpers/theme.typ" as theme;
#import "../helpers/ancestry_content.typ" as ancestryContent;

#let warforgedPage() = {
  return [
    #theme.subPageTitle(title: ancestryContent.entry("modern4e.ancestry.warforged").title);

    #columns(2)[
      = Attributes

      #ancestryContent.attributes("modern4e.ancestry.warforged")

      = Ancestry Traits
      #ancestryContent.trait("modern4e.feature.warforged-warforged-mind")

      #ancestryContent.trait("modern4e.feature.warforged-warforged-resilience")

      #ancestryContent.trait("modern4e.feature.warforged-warforged-resolve")


      #ancestryContent.powerCard("modern4e.power.warforged-resolve");

      #colbreak();
      #image("../images/warforged.png", height: 300pt)
    ]

    #pagebreak();
    #theme.subPageTitle(title: "Warforged Feats", outlined: false);

    #theme.featCategoryTitle("Heroic Feats")
    #theme.featGrid(
      count: 2,
      ..theme.featCardsFromJson("../content/feats/ancestries/warforged/heroic.json"),
    )
  ]
}



