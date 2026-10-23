#import "../helpers/theme.typ" as theme;
#import "../helpers/powers.typ";
#import "../helpers/ancestries.typ";

#let elfPage() = {
  return [
    #theme.subPageTitle(title: "Elf");

    #columns(2)[
      = Attributes

      #ancestries.attributes(
        size: "Medium",
        speed: 7,
        vision: "Low-light",
        languages: "Common  Elven",
      )

      = Ancestry Traits
      == Wild Step
      You ignore difficult terrain when you shift.
      == Group Awareness
      You grant allies within 5 squares of you a +1 racial bonus to initiative.
      == Elf Powers
      You gain either the Elven Accuracy or the Subtle Step power, choose one of the powers below:

      #colbreak();
      #image("../images/elf.png", height: 300pt)
    ]

    #columns(2)[
      #theme.choiceBox("Elven Accuracy");

      #powers.power(
        title: "Elven Accuracy",
        description: "With an instant of focus, you take careful aim at your foe and strike with the legendary accuracy of the elves.",
        type: powers.powerType.encounter,
        range: "Personal",
        action: powers.actionType.free,
        target: none,
        offenseStat: none,
        defenseStat: none,
        trigger: "You make an attack roll and dislike the result.",
        additionalRows: (
          [*Effect:* Reroll the attack roll. Use the second roll, even if it's lower.],
        ),
        traits: none,
      );

      #colbreak();
      #theme.choiceBox("Subtle Step");
      #powers.power(
        title: "Subtle Step",
        description: "Wild elves train for battle from the time they can walk, and their teachers place early emphasis on evasion and escape.",
        type: powers.powerType.encounter,
        range: "Personal",
        action: powers.actionType.move,
        target: none,
        offenseStat: none,
        defenseStat: none,
        additionalRows: (
          [*Effect:* You shift up to your speed.],
        ),
        traits: none,
      );

    ]

    #pagebreak();
    #theme.subPageTitle(title: "Elf Feats", outlined: false);

    #theme.featCategoryTitle("Heroic Feats")
    #theme.featGrid(
      count: 3,
      ..theme.featCardsFromJson("../content/feats/ancestries/elf/heroic.json"),
    )

    #theme.featCategoryTitle("Heroic Class Combo Feats")
    #theme.featGrid(
      count: 3,
      ..theme.featCardsFromJson("../content/feats/ancestries/elf/heroic-class-combo.json"),
    )

    #theme.featCategoryTitle("Paragon Class Combo Feats")
    #theme.featGrid(
      count: 3,
      ..theme.featCardsFromJson("../content/feats/ancestries/elf/paragon-class-combo.json"),
    )
  ]
}
