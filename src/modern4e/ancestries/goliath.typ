#import "../helpers/theme.typ" as theme;
#import "../helpers/ancestry_content.typ" as ancestryContent;

#let goliathPage() = {
  return [
    #theme.subPageTitle(title: ancestryContent.entry("modern4e.ancestry.goliath").title);

    #columns(2)[
      = Attributes

      #ancestryContent.attributes("modern4e.ancestry.goliath")

      = Ancestry Traits
      #ancestryContent.trait("modern4e.feature.goliath-mountain-s-tenacity")

      #ancestryContent.trait("modern4e.feature.goliath-powerful-athlete")

      #ancestryContent.trait("modern4e.feature.goliath-stone-s-endurance")


      #ancestryContent.powerCard("modern4e.power.stone-s-endurance");

      #colbreak();
      #image("../images/goliath.png", height: 350pt)
    ]

    #pagebreak();
    #theme.subPageTitle(title: "Goliath Feats", outlined: false);

    #theme.featCategoryTitle("Heroic Feats")
    #theme.featGrid(
      count: 2,
      ..theme.featCardsFromJson("../content/feats/ancestries/goliath/heroic.json"),
    )

    #theme.featCategoryTitle("Paragon Class Combo Feats")
    #theme.featGrid(
      count: 2,
      ..theme.featCardsFromJson("../content/feats/ancestries/goliath/paragon-class-combo.json"),
    )
  ]
}
