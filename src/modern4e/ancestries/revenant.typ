#import "../helpers/theme.typ" as theme;
#import "../helpers/powers.typ";
#import "../helpers/ancestries.typ";

#let revenantPage() = {
  return [
    #theme.subPageTitle(title: "Revenant");

    #columns(2)[
      = Attributes

      #ancestries.attributes(
        size: "Medium",
        speed: 6,
        vision: "Low-Light",
        languages: "Common + 1",
      )

      = Ancestry Traits
      == Unnatural Vitality
      When you drop to 0 hit points or fewer and are subjected to the dying condition, you can choose to be dazed, instead of falling unconscious. You make death saving throws as normal, and if you fail one, you fall unconscious instead of being dazed.
      == Past Life
      Select a race other than revenant. You are also considered a member of that race for the purpose of meeting prerequisites, such as feat or paragon path prerequisites.
      == Undead
      You are considered an undead creature for the purpose of effects that relate to the undead keyword. You are also considered a living creature.
      == Dark Reaping
      You gain the Dark Reaping power.

      #powers.power(
        title: "Dark Reaping",
        description: "You use one death as the seed to sow more destruction.",
        type: powers.powerType.encounter,
        range: "Personal",
        action: powers.actionType.free,
        target: none,
        offenseStat: none,
        defenseStat: none,
        trigger: "A creature within 5 squares of you is reduced to 0 hit points",
        additionalRows: (
          [*Effect:* One creature of your choice that you hit with an attack before the end of your next turn takes extra necrotic damage equal to 1d8 + your main ability.],
        ),
        traits: "Necrotic",
      );

      #colbreak();
      #image("../images/revenant.jpeg", height: 300pt)
    ]

    #pagebreak();
    #theme.subPageTitle(title: "Revenant Feats", outlined: false);

    #theme.featCategoryTitle("Heroic Feats")
    #theme.featGrid(
      count: 2,
      ..theme.featCardsFromJson("../content/feats/ancestries/revenant/heroic.json"),
    )
  ]
}
