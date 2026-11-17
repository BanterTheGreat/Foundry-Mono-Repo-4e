#import "../helpers/theme.typ" as theme;
#import "../helpers/ancestry_content.typ" as ancestryContent;

#let goblinPage() = {
  return [
    #theme.subPageTitle(title: ancestryContent.entry("modern4e.ancestry.goblin").title);

    #columns(2)[
      = Attributes

      #ancestryContent.attributes("modern4e.ancestry.goblin")

      = Traits
      #ancestryContent.trait("modern4e.feature.goblin-slippery")

      #ancestryContent.trait("modern4e.feature.goblin-goblin-reflexes")

      #ancestryContent.trait("modern4e.feature.goblin-goblin-tactics")


      #ancestryContent.powerCard("modern4e.power.goblin-tactics");

      #colbreak();
      #image("../images/goblin.png", height: 300pt)
    ]

    #pagebreak();
    #theme.subPageTitle(title: "Goblin Feats", outlined: false);

    #theme.featCategoryTitle("Heroic Feats")
    #theme.featGrid(
      count: 2,
      ..theme.featCardsFromJson("../content/feats/ancestries/goblin/heroic.json"),
    )
  ]
}
