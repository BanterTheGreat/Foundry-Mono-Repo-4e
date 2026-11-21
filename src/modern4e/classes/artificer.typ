#import "../helpers/theme.typ" as theme;
#import "../helpers/classes.typ" as classes;
#import "../helpers/class_content.typ" as content;

#let classData = content.entry("modern4e.class.artificer");
#let className = classData.title;

#let artificerPage() = {
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
      #content.feature("modern4e.feature.artificer-arcane-empowerment")

      #content.feature("modern4e.feature.artificer-arcane-rejuvenation")

      #content.feature("modern4e.feature.artificer-healing-infusion")

    ];

    #classes.classFeatures[
      #content.feature("modern4e.feature.artificer-techniques")

      = Powers

      #content.initialPowerText(classData)


      #classes.powerLinks(className: className);

    ]

    #set page(columns: 1)

    #pagebreak(weak: true)

    #align(center)[
      = #className Paragon Paths
    ]
    #classes.zeitgeistPathReference()

    #columns(2)[
      #theme.pathBlocksFromJson("../content/paths/artificer.json")
    ]

    #pagebreak()

    #align(center)[
      = Heroic #className Feats
    ]

    #columns(2)[
      #theme.featBlocksFromJson("../content/feats/heroic/artificer.json", start: 0, end: 3);

      #colbreak();
      #theme.featBlocksFromJson("../content/feats/heroic/artificer.json", start: 3, end: 7);
    ]

    #pagebreak();

    #align(center)[
      = Paragon #className Feats (Level 11+)
    ]

    #columns(2)[
      #theme.featBlocksFromJson("../content/feats/paragon/artificer.json");
    ]
  ]
}
