#import "../helpers/theme.typ" as theme;
#import "./utility/power-source-utilities.typ": powerSourceUtilities;
#import "./utility/skill-utilities.typ": generalUtilityPowers;

#let utilityPage() = [
  #theme.bannerPage(
    title: "Utility Powers",
    content: [
      Utility powers help you and your allies overcome obstacles in and out of combat. Each time you gain a utility power, choose one you qualify for. A power's combat or non-combat label describes how you can use it.

      General utility powers are open to any class. Meet the power's minimum level and skill rank, along with any other prerequisites on the card.

      Power source utilities are open to classes of the matching source: *Arcane*, *Martial*, *Primal*, or *Divine*. You still need to meet each power's other prerequisites, such as having a beast companion or a specific class feature.
    ],
    imageName: "utilities.jpg",
    width: 60%,
    gradient: gradient.linear(black, black, black.transparentize(50%), black.transparentize(100%)),
  )

  #generalUtilityPowers()
  #powerSourceUtilities()
]
