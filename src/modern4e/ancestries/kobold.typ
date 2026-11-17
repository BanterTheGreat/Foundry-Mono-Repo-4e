#import "../helpers/theme.typ" as theme;
#import "../helpers/ancestry_content.typ" as ancestryContent;

#let koboldPage() = {
  return [
    #theme.subPageTitle(title: ancestryContent.entry("modern4e.ancestry.kobold").title);

    #columns(2)[
      = Attributes

      #ancestryContent.attributes("modern4e.ancestry.kobold")

      = Ancestry Traits
      #ancestryContent.trait("modern4e.feature.kobold-trap-sense")

      #ancestryContent.trait("modern4e.feature.kobold-kobold-scales")

      #ancestryContent.trait("modern4e.feature.kobold-shifty-maneuver")


      #ancestryContent.powerCard("modern4e.power.shifty-maneuver");

      #colbreak();
      #image("../images/kobold.webp", height: 300pt)
    ]

    #pagebreak();
    #theme.subPageTitle(title: "Kobold Feats", outlined: false);

    #theme.featCategoryTitle("Heroic Feats")
    #theme.featGrid(
      count: 2,
      ..theme.featCardsFromJson("../content/feats/ancestries/kobold/heroic.json"),
    )
  ]
}




