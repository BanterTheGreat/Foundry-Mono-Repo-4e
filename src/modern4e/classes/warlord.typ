#import "../helpers/theme.typ" as theme;
#import "../helpers/classes.typ" as classes;
#import "../helpers/class_content.typ" as content;

#let classData = content.entry("modern4e.class.warlord");
#let className = classData.title;

#let warlordPage() = {
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
      #content.feature("modern4e.feature.warlord-inspiring-word")

      #content.feature("modern4e.feature.warlord-tactical-path")

      #content.feature("modern4e.feature.warlord-leadership-style")

    ]

    #classes.classFeatures[
      #content.feature("modern4e.feature.warlord-commanding-presence")

      = Powers

      #content.initialPowerText(classData)


    ]

    #pagebreak()

    #classes.powerLinks(className: className, skipPaths: true);

    #pagebreak()


    = #className Paragon Paths
    #classes.zeitgeistPathReference()


    #columns(2)[
      #theme.pathBlocksFromJson("../content/paths/warlord.json")
    ]

    #pagebreak()

    #align(center)[
      = Heroic #className Feats
    ]

    #columns(2)[
      #theme.featBlocksFromJson("../content/feats/heroic/warlord.json")
    ]

    #pagebreak()

    #align(center)[
      = Paragon #className Feats (Level 11+)
    ]

    #columns(2)[
      #theme.featBlocksFromJson("../content/feats/paragon/warlord.json")
    ]
  ]
}
