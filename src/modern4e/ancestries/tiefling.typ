#import "../helpers/theme.typ" as theme;
#import "../helpers/ancestry_content.typ" as ancestryContent;


#let tieflingPage() = {
  return [
    #theme.subPageTitle(title: ancestryContent.entry("modern4e.ancestry.tiefling").title);

    #columns(2)[
      = Attributes

      #ancestryContent.attributes("modern4e.ancestry.tiefling")

      = Ancestry Traits
      #ancestryContent.trait("modern4e.feature.tiefling-bloodhunt")

      #ancestryContent.trait("modern4e.feature.tiefling-fire-resistance")

      #ancestryContent.trait("modern4e.feature.tiefling-infernal-wrath")


      #ancestryContent.powerCard("modern4e.power.infernal-wrath");

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
