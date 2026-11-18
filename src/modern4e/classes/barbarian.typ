#import "../helpers/theme.typ" as theme;
#import "../helpers/classes.typ" as classes;
#import "../helpers/class_content.typ" as content;
#import "barbarian-primal-powers.typ": primalPowers;

#let classData = content.entry("modern4e.class.barbarian");
#let className = classData.title;

#let barbarianPage() = {
  return [
    #classes.bannerPage(
      className: className,
      flavorContent: (quote: content.classText(classData.flavor.quote), introduction: content.classText(classData.flavor.introduction.join("\n\n")), gameplay: content.classText(classData.flavor.gameplay)),
      imagePath: "../images/classes_parent.jpg",
    );

    #classes.classOverview(
      className: className,
      reference: content.classReference(classData),
    )[
      #content.feature("modern4e.feature.barbarian-barbarian-agility")
      #content.feature("modern4e.feature.barbarian-feral-might", optionEnd: 2)
    ]

    #classes.classFeatures[
      #content.featureOptions("modern4e.feature.barbarian-feral-might", start: 2)
      #content.feature("modern4e.feature.barbarian-rage-strike")
      #content.feature("modern4e.feature.barbarian-rampage")
      = Powers
      #content.initialPowerText(classData)
      #content.classText(content.entry("modern4e.rule.barbarian-revised-powers").description)
    ]

    #classes.classFeatures[
      #primalPowers()
    ]
    #pagebreak()

    #set page(columns: 1)

    #align(center)[
      = #className Paragon Paths
    ]
    #classes.zeitgeistPathReference()

    #columns(2)[
      #theme.pathBlocksFromJson("../content/paths/barbarian.json")
    ]

    #pagebreak()

    #align(center)[
      = Heroic #className Feats
    ]

    #columns(2)[
      #theme.featBlocksFromJson("../content/feats/heroic/barbarian.json", start: 0, end: 5);

      #colbreak();

      #theme.featBlocksFromJson("../content/feats/heroic/barbarian.json", start: 5);

    ]

    #pagebreak();

    #align(center)[
      = Paragon #className Feats (Level 11+)
    ]

    #columns(2)[
      #theme.featBlocksFromJson("../content/feats/paragon/barbarian.json");
    ]
  ]
}
