#import "../helpers/theme.typ" as theme;
#import "../helpers/ancestry_content.typ" as ancestryContent;

#let halflingPage() = {
  return [
    #theme.subPageTitle(title: ancestryContent.entry("modern4e.ancestry.halfling").title);

    #columns(2)[
      = Attributes

      #ancestryContent.attributes("modern4e.ancestry.halfling")

      = Traits
      #ancestryContent.trait("modern4e.feature.halfling-bold")

      #ancestryContent.trait("modern4e.feature.halfling-nimble-reaction")

      #ancestryContent.trait("modern4e.feature.halfling-second-chance")


      #ancestryContent.powerCard("modern4e.power.second-chance");

      #colbreak();
      #image("../images/halfling.jpg", height: 400pt)
    ]

    #pagebreak();
    #theme.subPageTitle(title: "Halfling Feats", outlined: false);

    #theme.featCategoryTitle("Heroic Feats")
    #theme.featGrid(
      count: 2,
      ..theme.featCardsFromJson("../content/feats/ancestries/halfling/heroic.json"),
    )
  ]
}
