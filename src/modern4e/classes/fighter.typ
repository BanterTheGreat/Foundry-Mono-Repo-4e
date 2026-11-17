#import "../helpers/theme.typ";
#import "../helpers/classes.typ" as classes;
#import "../helpers/class_content.typ" as content;
#import "fighter-attack-powers.typ": fighterAttackPowers;

#let fighter = content.entry("modern4e.class.fighter");
#let className = fighter.title;

#let fighterPage() = {
  return [
    #classes.bannerPage(
      className: className,
      flavorContent: (
        quote: content.classText(fighter.flavor.quote),
        introduction: content.classText(fighter.flavor.introduction.join("\n\n")),
        gameplay: content.classText(fighter.flavor.gameplay),
      ),
      imagePath: "../images/classes_parent.jpg",
    );

    #classes.classOverview(
      className: className,
      reference: content.classReference(fighter),
    )[
      #columns(2)[
        #content.feature("modern4e.feature.combat-challenge")
        #colbreak()
        #content.feature("modern4e.feature.melee-weapon-mastery")
      ]
      #content.feature("modern4e.feature.fighter-reactivity")
    ]

    #classes.classFeatures[
      #content.feature("modern4e.feature.fighter-specialization")

      = Powers
      #content.initialPowerText(fighter)
      #content.commonRules(fighter)
      #colbreak()
      #classes.powerLinks(className: className, skipPaths: true, powerSources: fighter.powerSources.map(content.display));
    ]

    #classes.classFeatures[
      #fighterAttackPowers()
    ]

    #pagebreak()

    #align(center)[
      = #className Paragon Paths
    ]
    #classes.zeitgeistPathReference()


    #columns(2)[
      #theme.pathBlocksFromJson("../content/paths/fighter.json")
    ]

    #pagebreak()


    #set page(columns: 1)

    #align(center)[
      = Heroic #className Feats
    ]

    #columns(2)[
      #theme.featBlocksFromJson("../content/feats/heroic/fighter.json");
    ]

    #pagebreak();
    = Paragon #className Feats
    #columns(2)[
      #theme.featBlocksFromJson("../content/feats/paragon/fighter.json")

    ]

  ]
}
