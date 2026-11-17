#import "../helpers/theme.typ" as theme;
#import "../helpers/classes.typ" as classes;
#import "../helpers/class_content.typ" as content;

#let classData = content.entry("modern4e.class.wizard");
#let className = classData.title;

#let wizardPage() = {
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
      #content.feature("modern4e.feature.wizard-spellbook")
    ]

    #classes.classFeatures[
      #content.feature("modern4e.feature.wizard-arcane-implement-mastery")
      #content.feature("modern4e.feature.wizard-cantrips")
      #content.feature("modern4e.feature.wizard-arcane-techniques")
      #colbreak()
      = Powers
      #content.initialPowerText(classData)
      #classes.powerLinks(className: className, skipPaths: true);
    ]

    #pagebreak()

    #align(center)[
      = #className Paragon Paths
    ]
    #classes.zeitgeistPathReference()


    #columns(2)[
      #theme.pathBlocksFromJson("../content/paths/wizard.json")
    ]

    #pagebreak()

    #set page(columns: 1)

    #align(center)[
      = Heroic #className Feats
    ]

    #columns(2)[
      #theme.featBlocksFromJson("../content/feats/heroic/wizard.json", start: 0, end: 6);

      #colbreak();

      #theme.featBlocksFromJson("../content/feats/heroic/wizard.json", start: 6, end: 13);
    ]

    #pagebreak()

    #align(center)[
      = Paragon #className Feats (Level 11+)
    ]

    #columns(2)[
      #theme.featBlocksFromJson("../content/feats/paragon/wizard.json");

    ]
  ]
}
