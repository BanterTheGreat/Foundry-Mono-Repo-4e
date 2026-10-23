#import "../helpers/theme.typ" as theme;
#import "../helpers/configuration.typ" as config;


#import "./goblin.typ";
#import "./halfling.typ";
#import "./dragonborn.typ";
#import "./dwarf.typ";
#import "./elf.typ";
#import "./kobold.typ";
#import "./human.typ";
#import "./goliath.typ";
#import "./warforged.typ";
#import "./revenant.typ";
#import "./orc.typ";
#import "./tiefling.typ";
#import "./deva.typ";

#let ancestriesPage() = {
  let _getAncestryPages() = {
    return (
      deva.devaPage(),
      dragonborn.dragonbornPage(),
      dwarf.dwarfPage(),
      elf.elfPage(),
      goblin.goblinPage(),
      goliath.goliathPage(),
      halfling.halflingPage(),
      kobold.koboldPage(),
      human.humanPage(),
      orc.orcPage(),
      // revenant.revenantPage(), - Disabled for now: It is not fitting for ZEITGEIST.
      tiefling.tieflingPage(),
      warforged.warforgedPage(),
    ).join(pagebreak())
  }

  return [
    #theme.bannerPage(
      title: "Ancestries",
      content: [],
      imageName: "ancestries.webp",
      gradient: gradient.linear(
        black,
        black.transparentize(100%),
        black.transparentize(100%),
        black.transparentize(100%),
        angle: 45deg,
      ),
      width: 40%,
    )

    #_getAncestryPages();
  ]
}

