#import "../helpers/theme.typ" as theme;
#import "../helpers/classes.typ" as classes;
#import "../helpers/class_content.typ" as content;

#let classData = content.entry("modern4e.class.cleric");
#let className = classData.title;

#let clericPage() = {
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
      #content.feature("modern4e.feature.cleric-lore")

      #content.feature("modern4e.feature.cleric-healing-word")

      #content.feature("modern4e.feature.cleric-channel-divinity", sectionEnd: 2)

    ]

    #classes.classFeatures[
      #content.featureSections("modern4e.feature.cleric-channel-divinity", start: 2)

      #content.feature("modern4e.feature.cleric-divine-technique")

      = Powers

      #content.initialPowerText(classData)



    ]

    #set page(columns: 1)
      #classes.powerLinks(className: className);

    #pagebreak(weak: true)

    #align(center)[
      = #className Paragon Paths
    ]
    #classes.zeitgeistPathReference()

    #columns(2)[
      #theme.pathBlocksFromJson("../content/paths/cleric.json")
    ]

    #pagebreak();

    #align(center)[
      = Heroic #className Feats
    ]

    #columns(2)[
      #theme.featBlocksFromJson("../content/feats/heroic/cleric.json", start: 0, end: 9);

      #colbreak();
      #theme.featBlocksFromJson("../content/feats/heroic/cleric.json", start: 9, end: 13);
    ]

    #pagebreak();

    #align(center)[
      = Paragon #className Feats (Level 11+)
    ]

    #columns(2)[
      #theme.featBlocksFromJson("../content/feats/paragon/cleric.json");
    ]
  ]
}
