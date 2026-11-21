#import "../helpers/theme.typ" as theme;
#import "../helpers/classes.typ" as classes;
#import "../helpers/class_content.typ" as content;

#let classData = content.entry("modern4e.class.avenger");
#let className = classData.title;

#let avengerPage() = {
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
      #content.feature("modern4e.feature.avenger-armor-of-faith")
      #content.feature("modern4e.feature.channel-divinity")
    ]

    #classes.classFeatures[
      #content.feature("modern4e.feature.avenger-oath-of-enmity")
      #content.feature("modern4e.feature.avenger-vindicators-censure")
      #colbreak()
      = Powers
      #content.initialPowerText(classData)
      #classes.powerLinks(className: className);
    ]

    #pagebreak(weak: true)

    #align(center)[
      = #className Paragon Paths
    ]
    #classes.zeitgeistPathReference()

    #columns(2)[
      #theme.pathBlocksFromJson("../content/paths/avenger.json")
    ]

    #pagebreak();

    #align(center)[
      = Heroic #className Feats
    ]

    #columns(2)[
      #theme.featBlocksFromJson("../content/feats/heroic/avenger.json", start: 0, end: 4);

      #colbreak();

      #theme.featBlocksFromJson("../content/feats/heroic/avenger.json", start: 4, end: 8);
    ]

    #pagebreak();

    #align(center)[
      = Paragon #className Feats (Level 11+)
    ]

    #columns(2)[
      #theme.featBlocksFromJson("../content/feats/paragon/avenger.json");
    ]
  ]
}
