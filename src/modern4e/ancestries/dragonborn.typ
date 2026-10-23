#import "../helpers/theme.typ" as theme;
#import "../helpers/powers.typ";
#import "../helpers/ancestries.typ";

#let dragonbornPage() = {
  return [
    #theme.subPageTitle(title: "Dragonborn");

    #columns(2)[
      = Attributes

      #ancestries.attributes(
        size: "Medium",
        speed: 6,
        vision: "Normal",
        languages: "Common Draconic",
      )

      = Traits
      == Dragonborn Scales
      Choose either Acid, Cold, Fire, Lightning, Necrotic, Poison or Radiant. You have resistance to the chosen damage type equal to 5 +  one-half your level.
      == Draconic Heritage
      You gain a bonus to your healing surge value equal to your Constitution.
      == Dragonborn Powers
      Your capabilities as a Dragonborn give you one of the following powers, choose one of the powers below.

      #colbreak();
      #image("../images/dragonborn.png", height: 300pt)
    ]

    #columns(2)[
      #theme.choiceBox("Dragon Breath")

      #powers.power(
        title: "Dragon Breath",
        description: "As you open your mouth with a roar, the deadly power of your draconic kin blasts forth to engulf your foes.",
        type: powers.powerType.encounter,
        range: "Close blast 3",
        action: powers.actionType.minor,
        target: "Each creature in the blast",
        offenseStat: "Main Ability",
        defenseStat: "Reflex",
        bonusAttackText: [You gain a +2 bonus to the attack roll.
          - Level 11: The bonus increases to +4.
          - Level 21: The bonus increases to +6.
        ],
        trigger: none,
        additionalRows: (
          [*Hit:* 1d6 + Main Ability damage.
            - Level 11: 2d6 + Main Ability damage.
            - Level 21: 3d6 + Main Ability damage.
          ],
          [*Special:* The damage type is the same as the type you choose for Dragonborn Scales.],
        ),
        traits: "Varies",
      );

      #colbreak();
      #theme.choiceBox("Dragonfear")

      #powers.power(
        title: "Dragonfear",
        description: "Your presence causes your enemies to quake and tremble.",
        type: powers.powerType.encounter,
        range: "Close burst 5",
        action: powers.actionType.minor,
        target: "Each enemy in the burst",
        offenseStat: "Main Ability",
        defenseStat: "Will",
        bonusAttackText: [You gain a +2 bonus to the attack roll.
          - Level 11: The bonus increases to +4.
          - Level 21: Close Burst 10 & The bonus increases to +6.
        ],
        trigger: none,
        additionalRows: (
          [*Hit:* The target takes a -2 penalty to attack rolls and grants combat advantage until the end of your next turn.],
        ),
        traits: "Fear",
      );
    ]

    #pagebreak();
    #theme.subPageTitle(title: "Dragonborn Feats", outlined: false);

    #theme.featCategoryTitle("Heroic Feats")
    #theme.featGrid(
      count: 2,
      ..theme.featCardsFromJson("../content/feats/ancestries/dragonborn/heroic.json"),
    )

    #theme.featCategoryTitle("Heroic Class Combo Feats")
    #theme.featGrid(
      count: 2,
      ..theme.featCardsFromJson("../content/feats/ancestries/dragonborn/heroic-class-combo.json"),
    )

    #theme.featCategoryTitle("Paragon Class Combo Feats")
    #theme.featGrid(
      count: 2,
      ..theme.featCardsFromJson("../content/feats/ancestries/dragonborn/paragon-class-combo.json"),
    )
  ]
}
