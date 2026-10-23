#import "../helpers/theme.typ" as theme;
#import "../helpers/powers.typ";
#import "../helpers/ancestries.typ";

#let goblinPage() = {
  return [
    #theme.subPageTitle(title: "Goblin");

    #columns(2)[
      = Attributes

      #ancestries.attributes(
        size: "Small",
        speed: 6,
        vision: "Low-Light",
        languages: "Common Goblin"
      )

      = Traits
      == Slippery
      You gain a +2 racial bonus to your AC against Attack of Opportunities.
      == Goblin Reflexes
      You gain a +1 racial bonus to your Reflex defense.
      == Goblin Tactics
      You gain the Goblin Tactics power.

      #powers.power(
        title: "Goblin Tactics",
        description: "You avoid your enemy's blow and cleverly dodge away.",
        type: powers.powerType.at-will,
        range: "Personal",
        action: powers.actionType.immediateReaction,
        target: none,
        trigger: "An enemy misses you with a melee attack.",
        additionalRows: (
          [*Effect:* You shift 1 square.],
        ),
      );

      #colbreak();
      #image("../images/goblin.png", height: 300pt)
    ]

    #pagebreak();
    #theme.subPageTitle(title: "Goblin Feats", outlined: false);

    #theme.featCategoryTitle("Heroic Feats")
    #theme.featGrid(
      count: 2,
      ..theme.featCardsFromJson("../content/feats/ancestries/goblin/heroic.json"),
    )
  ]
}
