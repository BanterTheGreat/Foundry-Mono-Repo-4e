#import "../helpers/theme.typ" as theme;
#import "../helpers/powers.typ";
#import "../helpers/ancestries.typ";

#let warforgedPage() = {
  return [
    #theme.subPageTitle(title: "Warforged");

    #columns(2)[
      = Attributes

      #ancestries.attributes(
        size: "Medium",
        speed: 6,
        vision: "Normal",
        languages: "Common + 1",
      )

      = Ancestry Traits
      == Warforged Mind
      You have a +1 racial bonus to your Will.
      == Warforged Resilience
      You have a +2 racial bonus to saving throws against ongoing damage. Also, when you make a death saving throw, you can take the better result of your die roll or 10.
      == Warforged Resolve
      You gain the Warforged Resolve power.

      #powers.power(
        title: "Warforged Resolve",
        description: "It's difficult to take you down, even when you're faltering.",
        type: powers.powerType.encounter,
        range: "Personal",
        action: powers.actionType.minor,
        target: none,
        offenseStat: none,
        defenseStat: none,
        additionalRows: (
          [*Effect:* You gain a number of temporary hit points equal to 3 + one-half your level and can make a saving throw against one effect on you that deals ongoing damage. If you are bloodied, you also regain hit points equal to 3 + one-half your level.],
        ),
        traits: "Healing",
      );

      #colbreak();
      #image("../images/warforged.png", height: 300pt)
    ]

    #pagebreak();
    #theme.subPageTitle(title: "Warforged Feats", outlined: false);

    #theme.featCategoryTitle("Heroic Feats")
    #theme.featGrid(
      count: 2,
      ..theme.featCardsFromJson("../content/feats/ancestries/warforged/heroic.json"),
    )
  ]
}



