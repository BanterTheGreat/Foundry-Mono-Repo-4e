#import "../helpers/theme.typ" as theme;
#import "../helpers/classes.typ" as classes;
#import "../helpers/class_content.typ" as content;

#let classData = content.entry("modern4e.class.invoker");
#let className = classData.title;

#let invokerPage() = {
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
      #content.feature("modern4e.feature.invoker-channel-divinity")
      #content.feature("modern4e.feature.invoker-divine-covenant", optionEnd: 1)
    ]

    #classes.classFeatures[
      #content.featureOptions("modern4e.feature.invoker-divine-covenant", start: 1)
      #content.feature("modern4e.feature.invoker-ritual-casting")
      = Powers
      #content.initialPowerText(classData)
      #classes.powerLinks(className: className);
    ]

    #set page(columns: 1)

    #pagebreak()

    #align(center)[
      = Heroic #className Feats
    ]

    #columns(2)[
      #theme.featBlocksFromJson("../content/feats/heroic/invoker.json");
    ]

    #pagebreak();

    #align(center)[
      = Paragon #className Feats (Level 11+)
    ]

    #columns(2)[
      #theme.featBlocksFromJson("../content/feats/paragon/invoker.json");
    ]
  ]
}
