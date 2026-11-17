#import "../helpers/theme.typ" as theme;
#import "../helpers/classes.typ" as classes;
#import "../helpers/class_content.typ" as content;

#let classData = content.entry("modern4e.class.sorcerer");
#let className = classData.title;

#let sorcererPage() = {
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
      #content.feature("modern4e.feature.sorcerer-spell-source", optionEnd: 1, optionBreakable: true)
    ]

    #classes.classFeatures[
      #content.featureOptions("modern4e.feature.sorcerer-spell-source", start: 1, breakable: true)
      #content.feature("modern4e.feature.sorcerer-prime-shot")
      #colbreak()
      = Powers
      #content.initialPowerText(classData)
      #classes.powerLinks(className: className);
    ]

    #set page(columns: 1)

    #align(center)[
      = Heroic #className Feats
    ]

    #columns(2)[
      #theme.featBlocksFromJson("../content/feats/heroic/sorcerer.json", start: 0, end: 15);

      #block(
        [
          #theme.featBlocksFromJson("../content/feats/heroic/sorcerer.json", start: 15, end: 16);
        ],
        breakable: false,
      );

      #theme.featBlocksFromJson("../content/feats/heroic/sorcerer.json", start: 16, end: 18);
    ]

    #pagebreak();

    #align(center)[
      = Paragon #className Feats (Level 11+)
    ]

    #columns(2)[
      #theme.featBlocksFromJson("../content/feats/paragon/sorcerer.json");
    ]
  ]
}
