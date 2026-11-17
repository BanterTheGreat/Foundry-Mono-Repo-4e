#import "../helpers/theme.typ" as theme;
#import "../helpers/ancestry_content.typ" as ancestryContent;

#let elfPage() = {
  return [
    #theme.subPageTitle(title: ancestryContent.entry("modern4e.ancestry.elf").title);

    #columns(2)[
      = Attributes

      #ancestryContent.attributes("modern4e.ancestry.elf")

      = Ancestry Traits
      #ancestryContent.trait("modern4e.feature.elf-wild-step")

      #ancestryContent.trait("modern4e.feature.elf-group-awareness")

      #ancestryContent.trait("modern4e.feature.elf-elf-powers")


      #colbreak();
      #image("../images/elf.png", height: 300pt)
    ]

    #columns(2)[
      #theme.choiceBox(ancestryContent.entry("modern4e.power.elven-accuracy").title);

      #ancestryContent.powerCard("modern4e.power.elven-accuracy");

      #colbreak();
      #theme.choiceBox(ancestryContent.entry("modern4e.power.subtle-step").title);
      #ancestryContent.powerCard("modern4e.power.subtle-step");

    ]

    #pagebreak();
    #theme.subPageTitle(title: "Elf Feats", outlined: false);

    #theme.featCategoryTitle("Heroic Feats")
    #theme.featGrid(
      count: 3,
      ..theme.featCardsFromJson("../content/feats/ancestries/elf/heroic.json"),
    )

    #theme.featCategoryTitle("Heroic Class Combo Feats")
    #theme.featGrid(
      count: 3,
      ..theme.featCardsFromJson("../content/feats/ancestries/elf/heroic-class-combo.json"),
    )

    #theme.featCategoryTitle("Paragon Class Combo Feats")
    #theme.featGrid(
      count: 3,
      ..theme.featCardsFromJson("../content/feats/ancestries/elf/paragon-class-combo.json"),
    )
  ]
}
