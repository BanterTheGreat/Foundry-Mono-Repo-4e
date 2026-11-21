#import "../helpers/theme.typ" as theme;
#import "../helpers/classes.typ" as classes;
#import "../helpers/class_content.typ" as content;

#let classData = content.entry("modern4e.class.ranger");
#let className = classData.title;

#let rangerPage() = {
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
      #content.feature("modern4e.feature.ranger-hunter-s-quarry")
      #content.feature("modern4e.feature.ranger-fighting-style")
      #content.feature("modern4e.feature.ranger-hunters-specialization")
    ]

    #classes.classFeatures[
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
      #theme.pathBlocksFromJson("../content/paths/ranger.json")
    ]

    #pagebreak()

    #align(center)[
      = Heroic #className Feats
    ]

    #columns(2)[
      #theme.featBlocksFromJson("../content/feats/heroic/ranger.json", start: 0, end: 5);
      
      #colbreak();

      #theme.featBlocksFromJson("../content/feats/heroic/ranger.json", start: 5, end: 9);
    ]

    #pagebreak();

    #align(center)[
      = Paragon #className Feats (Level 11+)
    ]

    #columns(2)[
      #theme.featBlocksFromJson("../content/feats/paragon/ranger.json");
    ]
  ]
}

