#import "../helpers/theme.typ" as theme;
#import "../helpers/ancestry_content.typ" as ancestryContent;

#let revenantPage() = {
  return [
    #theme.subPageTitle(title: ancestryContent.entry("modern4e.ancestry.revenant").title);

    #columns(2)[
      = Attributes

      #ancestryContent.attributes("modern4e.ancestry.revenant")

      = Ancestry Traits
      #ancestryContent.trait("modern4e.feature.revenant-unnatural-vitality")

      #ancestryContent.trait("modern4e.feature.revenant-past-life")

      #ancestryContent.trait("modern4e.feature.revenant-undead")

      #ancestryContent.trait("modern4e.feature.revenant-dark-reaping")


      #ancestryContent.powerCard("modern4e.power.dark-reaping");

      #colbreak();
      #image("../images/revenant.jpeg", height: 300pt)
    ]

    #pagebreak();
    #theme.subPageTitle(title: "Revenant Feats", outlined: false);

    #theme.featCategoryTitle("Heroic Feats")
    #theme.featGrid(
      count: 2,
      ..theme.featCardsFromJson("../content/feats/ancestries/revenant/heroic.json"),
    )
  ]
}
