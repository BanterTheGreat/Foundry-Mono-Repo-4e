#import "../helpers/theme.typ" as theme;
#import "../helpers/classes.typ" as classes;
#import "../helpers/class_content.typ" as content;

#let classData = content.entry("modern4e.class.warlock");
#let className = classData.title;

#let warlockPage() = {
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
      #content.feature("modern4e.feature.warlock-warlock-s-curse")
      #content.feature("modern4e.feature.warlock-eldritch-attack")
    ]

    #classes.classFeatures[
      #content.feature("modern4e.feature.warlock-eldritch-pact", optionBreakable: true)
      #content.feature("modern4e.feature.warlock-prime-shot")
      #content.feature("modern4e.feature.warlock-shadow-walk")
      = Powers
      #content.classText(content.entry("modern4e.rule.warlock-initial-powers").description)
      #classes.powerLinks(className: className, skipAtWill: true, skipPaths: true);
    ]

    #pagebreak()

    = #className Paragon Paths
    #classes.zeitgeistPathReference()

    #theme.pathBlocksFromJson("../content/paths/warlock.json");

    #pagebreak()

    #align(center)[
      = Heroic #className Feats
    ]
    #columns(2)[
      #theme.featBlocksFromJson("../content/feats/heroic/warlock.json");
    ]

    #pagebreak()

    #align(center)[
      = Paragon #className Feats (Level 11+)
    ]
    #columns(2)[
      #theme.featBlocksFromJson("../content/feats/paragon/warlock.json");
    ]
  ]
}
