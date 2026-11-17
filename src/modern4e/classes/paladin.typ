#import "../helpers/theme.typ" as theme;
#import "../helpers/classes.typ" as classes;
#import "../helpers/class_content.typ" as content;

#let classData = content.entry("modern4e.class.paladin");
#let className = classData.title;

#let paladinPage() = {
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
      #content.feature("modern4e.feature.paladin-divine-sanction")
      #content.feature("modern4e.feature.paladin-paladin-s-fervor", optionEnd: 1)
    ]

    #classes.classFeatures[
      #content.featureOptions("modern4e.feature.paladin-paladin-s-fervor", start: 1)
      #content.feature("modern4e.feature.paladin-channel-divinity")
      #content.feature("modern4e.feature.paladin-paladin-s-grace")
    ]


    #pagebreak()

    = Powers
    #content.initialPowerText(classData)

    #classes.powerLinks(className: className);

    #pagebreak();

    #align(center)[
      = Heroic #className Feats
    ]

    #columns(2)[
      #theme.featBlocksFromJson("../content/feats/heroic/paladin.json", start: 0, end: 7);

      #colbreak();

      #theme.featBlocksFromJson("../content/feats/heroic/paladin.json", start: 7, end: 12);

    ]

    #pagebreak();

    #align(center)[
      = Paragon #className Feats (Level 11+)
    ]

    #columns(2)[
      #theme.featBlocksFromJson("../content/feats/paragon/paladin.json");
    ]
  ]
}
