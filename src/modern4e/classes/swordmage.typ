#import "../helpers/theme.typ" as theme;
#import "../helpers/classes.typ" as classes;
#import "../helpers/class_content.typ" as content;

#let classData = content.entry("modern4e.class.swordmage");
#let className = classData.title;

#let swordmagePage() = {
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
      #content.feature("modern4e.feature.swordmage-swordbond")
      #content.feature("modern4e.feature.swordmage-spellwarden-warden")
      #content.feature("modern4e.feature.swordmage-spellwarden-aegis", optionEnd: 2)
    ]

    #classes.classFeatures[
      #content.featureOptions("modern4e.feature.swordmage-spellwarden-aegis", start: 2)
      #colbreak()
      = Powers
      #content.initialPowerText(classData)
      #classes.powerLinks(className: className, skipAtWill: false, skipPaths: true);
    ]

    #pagebreak()
    
    = #className Paragon Paths
    #classes.zeitgeistPathReference()

    #theme.pathBlocksFromJson("../content/paths/swordmage.json");

    #pagebreak()


    #columns(2)[
      #align(center)[
        = Heroic #className Feats
      ]

      #theme.featBlocksFromJson("../content/feats/heroic/swordmage.json");

      #colbreak();

      = Paragon Swordmage Feats (Level 11+)

      #theme.featBlocksFromJson("../content/feats/paragon/swordmage.json");
    ]
  ]
}
