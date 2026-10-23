#import "../helpers/theme.typ" as theme;
#import "../helpers/powers.typ";
#import "../helpers/ancestries.typ";

#let koboldPage() = {
  return [
    #theme.subPageTitle(title: "Kobold");

    #columns(2)[
      = Attributes

      #ancestries.attributes(
        size: "Small",
        speed: 6,
        vision: "Darkvision",
        languages: "Common Draconic",
      )

      = Ancestry Traits
      == Trap Sense
      You gain a +2 bonus to defenses against traps.
      == Kobold Scales
      Choose either Acid, Cold, Fire, Lightning, Necrotic, Poison or Radiant. You have resistance to the chosen damage type equal to 5 +  one-half your level.
      == Shifty Maneuver
      You gain the Shifty Maneuver power.

      #powers.power(
        title: "Shifty Maneuver",
        description: "You call on your natural ability to dodge danger.",
        type: powers.powerType.at-will,
        range: "Personal",
        action: powers.actionType.minor,
        target: none,
        offenseStat: none,
        defenseStat: none,
        additionalRows: (
          [*Effect:* You shift 1 square.],
        ),
        traits: none,
      );

      #colbreak();
      #image("../images/kobold.webp", height: 300pt)
    ]

    #pagebreak();
    #theme.subPageTitle(title: "Kobold Feats", outlined: false);

    #theme.featCategoryTitle("Heroic Feats")
    #theme.featGrid(
      count: 2,
      ..theme.featCardsFromJson("../content/feats/ancestries/kobold/heroic.json"),
    )
  ]
}




