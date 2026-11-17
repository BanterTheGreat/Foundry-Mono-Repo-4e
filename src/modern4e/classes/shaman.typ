#import "../helpers/theme.typ" as theme;
#import "../helpers/classes.typ" as classes;
#import "../helpers/class_content.typ" as content;

#let classData = content.entry("modern4e.class.shaman");
#let className = classData.title;

#let shamanPage() = {
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
      #content.feature("modern4e.feature.shaman-companion-spirit", optionEnd: 1)

    ]

    #classes.classFeatures[
      #content.featureOptions("modern4e.feature.shaman-companion-spirit", start: 1)

      #content.feature("modern4e.feature.shaman-healing-spirit")

      #pagebreak()
      #content.feature("modern4e.feature.shaman-primal-attunement")

      = Powers

      #content.initialPowerText(classData)

      #classes.powerLinks(className: className, skipPaths: true);

    ]

    #pagebreak()

    #set page(columns: 1)

    #align(center)[
      = #className Paragon Paths
    ]
    #classes.zeitgeistPathReference()


    #columns(2)[
      #theme.pathBlocksFromJson("../content/paths/shaman.json")
    ]

    #pagebreak()

    #align(center)[
      = Heroic #className Feats
    ]

    #columns(2)[

      #theme.featBlocksFromJson("../content/feats/heroic/shaman.json", start: 0, end: 4);



      #colbreak();

      #theme.featBlocksFromJson("../content/feats/heroic/shaman.json", start: 4, end: 9);
    ]

    #pagebreak()

    #align(center)[
      = Paragon #className Feats (Level 11+)
    ]

    #columns(2)[
      #theme.featBlocksFromJson("../content/feats/paragon/shaman.json", start: 0, end: 3);


      #colbreak();

      #theme.featBlocksFromJson("../content/feats/paragon/shaman.json", start: 3, end: 6);
    ]
  ]
}
