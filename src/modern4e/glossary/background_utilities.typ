#import "../helpers/theme.typ" as theme

#let environments = (
  ("Nomadic", "warlord-2-mind-for-maps", "warlord-2-setup-camp-quickly"),
  ("Rural", "ranger-2-calming-rider", "warlord-2-natural-leader"),
  ("Wilderness", "ranger-2-favored-terrain", "ranger-2-forage-for-magical-herbs"),
  ("Urban", "rogue-2-charming-rapscallion", "rogue-2-investigative-mind"),
  ("Secluded", "warlord-2-bird-calls", "wizard-2-specialty-ritual"),
)

#let upbringings = (
  ("Academic", "wizard-2-focused-detect-magic", "paladin-2-fiend-hunter-s-knowledge"),
  ("Militaristic", "fighter-2-old-war-buddy", "warlord-2-running-cadence"),
  ("Lawless", "warlord-2-improvised-distraction", "rogue-2-looming-thug"),
  ("Labor", "fighter-6-only-as-good-as-their-tools", "fighter-2-up-we-go-fighter"),
  ("Spiritual", "cleric-2-friendly-pastor", "cleric-2-lesser-religious-rites"),
  ("Creative", "cleric-2-preacher-power", "fighter-2-are-you-not-entertained"),
)

#let backgroundUtilitiesPage() = {
  let powers = json("../content/reference/non-combat-utility-powers.json").powers
  theme.pageTitle(title: "Optional Background Utilities")
  [
    If the GM allows background utilities, choose one Environment and one Upbringing from the lists below. Each opens two powers for your first utility pick. You can spend that pick on one of the four powers as a non-combat utility. Your background meets the class, power source, and skill rank requirements for that pick. You still follow the power's frequency and the requirements for using it, such as having the right equipment or knowing a ritual.

    Labor lets you choose _Only As Good as Their Tools_ at your first utility pick. If you choose _Old War Buddy_, your contact comes from your Militaristic upbringing. These background choices grant utility options only.

    The page numbers point to the full power cards in _D&D 4e Non-Combat Utility Powers_. Use the 2.0 check rules and the guidance for older skills in #link(<revised-skill-list>)[Skills & Checks] when you use an archived power.
  ]
  for (title, options) in (("Environment", environments), ("Upbringing", upbringings)) {
    heading(title)
    table(
      columns: (auto, 1fr, 1fr),
      stroke: theme.tableDivider,
      fill: theme.defaultTableStyle(),
      align: left,
      inset: 5pt,
      table.header([*Choose one*], [*First option*], [*Second option*]),
      ..options.map(((name, first, second)) => (
        name,
        ..(first, second).map(id => {
          let power = powers.find(power => power.id == id)
          let pages = power.definitions.first().pages.map(str).join(", ")
          [#power.name (p. #pages)]
        }),
      )).flatten(),
    )
  }
}
