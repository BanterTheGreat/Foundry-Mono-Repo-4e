#import "../helpers/creation_content.typ" as creation;
#import "../helpers/theme.typ" as theme;
#import "../helpers/rituals.typ": ritualEntry;

#let rituals = json("../content/rituals/rituals.json").rituals

#let ritualsPage() = {
  return [
    #theme.bannerPage(
      title: "Rituals",
      imageName: "utilities.jpg",
      width: 40%,
      gradient: gradient.linear(black, black, black.transparentize(50%), black.transparentize(100%)),
      content: [
        Rituals are extended practices that provide various boosts and benefits.

        = Gaining Rituals
        #creation.rules.techniqueAcquisition.description

        = Learning additional Rituals
        To learn additional rituals, you must train for at least 8 hours with a character who has mastered it and is at least 6 levels higher than the minimum level to use the ritual; or train for at least 1 week with a character who has mastered it, regardless of their level; or to study a manual or other text that describes the ritual for 8 hours. You must also meet the ritual’s level requirement.

        *Market Price* is the one-time cost to buy a manual containing the ritual. A found manual can be studied without paying this price, and rituals gained through level advancement require no purchase. Any payment for instruction from a teacher is agreed with the GM; it is not an additional automatic fee.

        Prices use published ritual prices where an equivalent exists. Custom rituals use comparable rituals as pricing benchmarks; their listed prices are Modern4e rules.

        When learning either Arcane, Primal or Divine rituals, your class must be of the corresponding power source.

        = Performing a Ritual
        Once you’ve mastered a ritual, you can use it. Each ritual takes time to perform—usually a significant amount, preventing them from being used during combat. Additionally, each ritual has costs, typically materials (which are consumed) and sometimes foci (which are reusable), paid at the end of the usage time of the ritual. *Casting Cost* lists the materials and other resources expended each time you perform the ritual. Gold-piece costs represent consumed materials; healing surges are spent separately. A *Reusable Focus* must be available when you perform the ritual, but is not consumed or bought again each time. Its value is separate from both the market price and casting cost. Pay casting costs once each time you perform the ritual, including rituals that remain active until dismissed.

        Some rituals require skill checks; you make the check at the end of the usage time, and cannot take 10 on the check.
      ],
    )

    #theme.subPageTitle(title: "Crafting Rituals")
    #columns(2)[
      #for ritual in rituals.filter(it => it.category == "Crafting") {
        ritualEntry(ritual)
      }
    ]
    #pagebreak();
    #theme.subPageTitle(title: "Magic Rituals")
    #columns(2)[
      #for category in ("Arcane", "Primal", "Divine") [
        #align(center, heading(level: 2, category))
        #for ritual in rituals.filter(it => it.category == category) {
          ritualEntry(ritual)
        }
      ]
    ]
    #pagebreak();
    #theme.subPageTitle(title: "Medical Rituals")
    #columns(2)[
      #for ritual in rituals.filter(it => it.category == "Medical") {
        ritualEntry(ritual)
      }
    ]
  ]
}
