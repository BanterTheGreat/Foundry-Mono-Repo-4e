#import "../helpers/theme.typ" as theme;
#import "../helpers/powers.typ";
#import "../helpers/ancestries.typ";

#let humanPage() = {
  return [
    #theme.subPageTitle(title: "Human");

    #columns(2)[
      = Attributes

      #ancestries.attributes(
        size: "Medium",
        speed: 6,
        vision: "Normal",
        languages: "Common + 1",
      )

      = Ancestry Traits
      == Cooperation
      You gain +1 to any Skill Check to Aid Another.
      == All-Rounded
      You gain a +1 racial bonus to Fortitude, Reflex & Will.
      == Heroic Effort
      You gain the Heroic Effort power.

      #powers.power(
        title: "Heroic Effort",
        description: "Your grim focus and unbridled energy means that failure is not an option.",
        type: powers.powerType.encounter,
        range: "Ranged 10",
        action: powers.actionType.noAction,
        target: "You or one ally that you can see",
        offenseStat: none,
        defenseStat: none,
        trigger: "You or an ally miss with an attack or fail a saving throw.",
        additionalRows: (
          [*Effect:* The target gains a +3 racial bonus to the attack roll or the saving throw.],
        ),
        traits: none,
      );

      #colbreak();
      #image("../images/human.png", height: 300pt)
    ]

    #pagebreak();
    #theme.subPageTitle(title: "Human Feats", outlined: false);

    #theme.featCategoryTitle("Heroic Feats")
    #theme.featGrid(
      count: 3,
      ..theme.featCardsFromJson("../content/feats/ancestries/human/heroic.json"),
    )

    #theme.featCategoryTitle("Heroic Class Combo Feats")
    #theme.featGrid(
      count: 3,
      ..theme.featCardsFromJson("../content/feats/ancestries/human/heroic-class-combo.json"),
    )

    #theme.featCategoryTitle("Paragon Feats")
    #theme.featGrid(
      count: 3,
      ..theme.featCardsFromJson("../content/feats/ancestries/human/paragon.json"),
    )

    #theme.featCategoryTitle("Paragon Class Combo Feats")
    #theme.featGrid(
      count: 3,
      ..theme.featCardsFromJson("../content/feats/ancestries/human/paragon-class-combo.json"),
    )
  ]
}
