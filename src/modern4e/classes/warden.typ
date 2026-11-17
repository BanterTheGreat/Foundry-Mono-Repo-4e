#import "../helpers/theme.typ" as theme;
#import "../helpers/classes.typ" as classes;
#import "../helpers/class_content.typ" as content;

#let classData = content.entry("modern4e.class.warden");
#let className = classData.title;

#let wardenPage() = {
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
      #content.feature("modern4e.feature.warden-font-of-life")
      #content.feature("modern4e.feature.warden-nature-s-wrath", sectionEnd: 1)
      #columns(2)[
        #content.powerCard(content.entry("modern4e.power.warden-warden-s-fury"))
        #colbreak()
        #content.powerCard(content.entry("modern4e.power.warden-warden-s-grasp"))
      ]
      #content.feature("modern4e.feature.warden-guardian-might")
    ]

    #classes.classFeatures[
      = Powers
      #content.initialPowerText(classData)
      #classes.powerLinks(className: className);
    ]

    #set page(columns: 1)

    #align(center)[
      = Heroic #className Feats
    ]

    #columns(2)[
      #theme.featBlocksFromJson("../content/feats/heroic/warden.json", start: 0, end: 5);

      #colbreak();

      #theme.featBlocksFromJson("../content/feats/heroic/warden.json", start: 5, end: 10);
    ]

    #pagebreak();

    #align(center)[
      = Paragon #className Feats (Level 11+)
    ]

    #columns(2)[
      #theme.featBlocksFromJson("../content/feats/paragon/warden.json");
    ]
  ]
}
