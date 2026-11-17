#import "../helpers/theme.typ" as theme;
#import "../helpers/classes.typ" as classes;
#import "../helpers/class_content.typ" as content;

#let classData = content.entry("modern4e.class.rogue");
#let className = classData.title;

#let roguePage() = {
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
      #content.feature("modern4e.feature.rogue-first-strike")
      #content.feature("modern4e.feature.rogue-sneak-attack")
      #content.feature("modern4e.feature.rogue-rogue-tactics")
    ]

    #classes.classFeatures[
      #content.feature("modern4e.feature.rogue-rogue-weapon-talent-selection")
      = Powers
      #content.initialPowerText(classData)
      #content.commonRules(classData)
      #colbreak()
      #classes.powerLinks(className: className);
    ]




    #pagebreak()

    #set page(columns: 1)

    #align(center)[
      = Heroic #className Feats
    ]

    #columns(2)[
      #theme.featBlocksFromJson("../content/feats/heroic/rogue.json");

    ]

    #pagebreak();

    #align(center)[
      = Paragon #className Feats (Level 11+)
    ]

    #columns(2)[
      #theme.featBlocksFromJson("../content/feats/paragon/rogue.json");
    ]
  ]
}
