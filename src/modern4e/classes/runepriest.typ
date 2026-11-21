#import "../helpers/theme.typ" as theme;
#import "../helpers/classes.typ" as classes;
#import "../helpers/class_content.typ" as content;

#let classData = content.entry("modern4e.class.runepriest");
#let className = classData.title;

#let runePriestPage() = {
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
      #content.feature("modern4e.feature.runepriest-rune-master")

      #content.feature("modern4e.feature.runepriest-rune-of-mending")

      #content.feature("modern4e.feature.runepriest-rune-artistry")

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
      #theme.pathBlocksFromJson("../content/paths/runepriest.json")
    ]

    #pagebreak()

    #align(center)[
      = Heroic #className Feats
    ]

    #columns(2)[
      == Rune Feats
      Any Feat ending with [Rune] is a rune feat.

      #theme.featBlocksFromJson("../content/feats/heroic/runepriest.json");
    ]

    #pagebreak();

    #align(center)[
      = Paragon #className Feats (Level 11+)
    ]

    #columns(2)[
      #theme.featBlocksFromJson("../content/feats/paragon/runepriest.json");
    ]
  ]
}
