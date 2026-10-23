#import "../helpers/theme.typ" as theme;
#import "../helpers/powers.typ";
#import "../helpers/ancestries.typ";

#let halflingPage() = {
  return [
    #theme.subPageTitle(title: "Halfling");

    #columns(2)[
      = Attributes

      #ancestries.attributes(
        size: "Small",
        speed: 6,
        vision: "Normal",
        languages: "Common + 1",
      )

      = Traits
      == Bold
      You gain a +5 racial bonus to saving throws against fear.
      == Nimble Reaction
      You gain a +2 racial bonus to AC against opportunity attacks.
      == Second Chance
      You gain the Second Chance power.

      #powers.power(
        title: "Second Chance",
        description: "Luck and small size combine to work in your favor as you dodge your enemy’s attack.",
        type: powers.powerType.encounter,
        range: "Personal",
        action: powers.actionType.immediateInterrupt,
        target: none,
        trigger: "You are hit by an attack.",
        additionalRows: (
          [*Effect:* The attacker must reroll the attack and use the second roll, even if it is lower.],
        ),
      );

      #colbreak();
      #image("../images/halfling.jpg", height: 400pt)
    ]

    #pagebreak();
    #theme.subPageTitle(title: "Halfling Feats", outlined: false);

    #theme.featCategoryTitle("Heroic Feats")
    #theme.featGrid(
      count: 2,
      ..theme.featCardsFromJson("../content/feats/ancestries/halfling/heroic.json"),
    )
  ]
}
