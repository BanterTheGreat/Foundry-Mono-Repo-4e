#import "../helpers/theme.typ" as theme;
#import "../helpers/classes.typ" as classes;
#import "../helpers/class_content.typ" as content;

#let classData = content.entry("modern4e.class.bard");
#let className = classData.title;

#let bardPage() = {
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
      #content.feature("modern4e.feature.bard-majestic-word")

      #content.feature("modern4e.feature.bard-virtuosic-virtue")

      #content.feature("modern4e.feature.bard-techniques")

      = Powers

      #content.initialPowerText(classData)


    ]

    #classes.classFeatures[
      #classes.powerLinks(className: className);

    ]


    #align(center)[
      = Heroic #className Feats
    ]

    #columns(2)[
      #theme.featBlocksFromJson("../content/feats/heroic/bard.json", start: 0, end: 5);

      #colbreak();

      #theme.featBlocksFromJson("../content/feats/heroic/bard.json", start: 5, end: 9);

    ]

    #pagebreak();

    #align(center)[
      = Paragon #className Feats (Level 11+)
    ]

    #columns(2)[
      #theme.featBlocksFromJson("../content/feats/paragon/bard.json");
    ]
  ]
}
