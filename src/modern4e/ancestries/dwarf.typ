#import "../helpers/theme.typ" as theme;
#import "../helpers/ancestry_content.typ" as ancestryContent;

#let dwarfPage() = {
  return [
    #theme.subPageTitle(title: ancestryContent.entry("modern4e.ancestry.dwarf").title);

    #columns(2)[
      = Attributes

      #ancestryContent.attributes("modern4e.ancestry.dwarf")

      = Ancestry Traits
      #ancestryContent.trait("modern4e.feature.dwarf-sturdy")

      #ancestryContent.trait("modern4e.feature.dwarf-stand-your-ground")

      #ancestryContent.trait("modern4e.feature.dwarf-dwarven-resilience")


      #ancestryContent.powerCard("modern4e.power.dwarven-resilience");

      #colbreak();
      #image("../images/dwarf.jpg", height: 340pt)
    ]

    #pagebreak();
    #theme.subPageTitle(title: "Dwarf Feats", outlined: false);

    #theme.featCategoryTitle("Heroic Feats")
    #theme.featGrid(
      count: 2,
      ..theme.featCardsFromJson("../content/feats/ancestries/dwarf/heroic.json"),
    )

    #theme.featCategoryTitle("Paragon Class Combo Feats")
    #theme.featGrid(
      count: 2,
      ..theme.featCardsFromJson("../content/feats/ancestries/dwarf/paragon-class-combo.json"),
    )
  ]
}
