#import "../helpers/theme.typ" as theme;
#import "../helpers/powers.typ";
#import "../helpers/ancestries.typ";

#let devaPage() = {
  return [
    #theme.subPageTitle(title: "Deva");

    #columns(2)[
      = Attributes

      #ancestries.attributes(
        size: "Normal",
        speed: 6,
        vision: "Normal",
        languages: "Common + 2",
      )

      = Traits
      == Astral Majesty
      You have a +1 bonus to all defenses against attacks made by bloodied creatures.

      == Astral Resistance
      You have resistance to necrotic damage and radiant damage equal to 5 + one-half your level.

      == Immortal Origin
      Your spirit is native to the Astral Sea, so you are considered an immortal creature for the purpose of effects that relate to creature origin.

      == Memory of a Thousand Lifetimes
      You have the memory of a thousand lifetimes power.

      #powers.power(
        title: "Memory of a Thousand Lifetimes",
        description: "The dreamlike memories of your previous lives lend insight to aid you.",
        action: powers.actionType.noAction,
        type: powers.powerType.encounter,
        range: "Personal",
        trigger: "You make an attack roll, a saving throw, a skill check, or an ability check and dislike the result",
        additionalRows: (
          [
            *Effect:* You add 1d6 to the triggering roll.,
          ],
        ),
      )

      #colbreak();
      #image("../images/deva.jpg", height: 400pt)
    ]

    #pagebreak();
    #theme.subPageTitle(title: "Deva Feats", outlined: false);

    #theme.featCategoryTitle("Heroic Feats")
    #theme.featGrid(
      count: 3,
      ..theme.featCardsFromJson("../content/feats/ancestries/deva/heroic.json"),
    )

    #theme.featCategoryTitle("Heroic Class Combo Feats")
    #theme.featGrid(
      count: 3,
      ..theme.featCardsFromJson("../content/feats/ancestries/deva/heroic-class-combo.json"),
    )

    #theme.featCategoryTitle("Paragon Feats")
    #theme.featGrid(
      count: 3,
      ..theme.featCardsFromJson("../content/feats/ancestries/deva/paragon.json"),
    )

    #theme.featCategoryTitle("Paragon Class Combo Feats")
    #theme.featGrid(
      count: 3,
      ..theme.featCardsFromJson("../content/feats/ancestries/deva/paragon-class-combo.json"),
    )
  ]
}
