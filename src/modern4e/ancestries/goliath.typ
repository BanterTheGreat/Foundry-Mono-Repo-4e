#import "../helpers/theme.typ" as theme;
#import "../helpers/powers.typ";
#import "../helpers/ancestries.typ";

#let goliathPage() = {
  return [
    #theme.subPageTitle(title: "Goliath");

    #columns(2)[
      = Attributes

      #ancestries.attributes(
        size: "Medium",
        speed: 6,
        vision: "Normal",
        languages: "Common + 1",
      )

      = Ancestry Traits
      == Mountain’s Tenacity
      You have a +1 racial bonus to Will.
      == Powerful Athlete
      Whenever you make a Skill Check to perform a physical action akin to jumping or climbing, roll twice and use either result.
      == Stone’s Endurance
      You gain the Stone’s Endurance power.

      #powers.power(
        title: "Stone's Endurance",
        description: "Your foes’ attacks bounce off your stony hide.",
        type: powers.powerType.encounter,
        range: "Personal",
        action: powers.actionType.minor,
        target: none,
        offenseStat: none,
        defenseStat: none,
        additionalRows: (
          [*Effect:* You gain resist 5 to all damage until the end of your next turn.
            - Level 11: Resist 10 to all damage.
            - Level 21: Resist 15 to all damage.
          ],
        ),
        traits: none,
      );

      #colbreak();
      #image("../images/goliath.png", height: 350pt)
    ]

    #pagebreak();
    #theme.subPageTitle(title: "Goliath Feats", outlined: false);

    #theme.featCategoryTitle("Heroic Feats")
    #theme.featGrid(
      count: 2,
      ..theme.featCardsFromJson("../content/feats/ancestries/goliath/heroic.json"),
    )

    #theme.featCategoryTitle("Paragon Class Combo Feats")
    #theme.featGrid(
      count: 2,
      ..theme.featCardsFromJson("../content/feats/ancestries/goliath/paragon-class-combo.json"),
    )
  ]
}
