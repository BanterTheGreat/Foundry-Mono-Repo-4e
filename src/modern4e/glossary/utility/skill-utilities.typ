#import "../../helpers/theme.typ" as theme;
#import "../../helpers/power_content.typ": powerCard;
#import "../../helpers/utility_content.typ": inventory, utilityEntries;

#let generalUtilities = {
  inventory.sections
    .filter(section => section.kind == "SKILL" and section.availability == "AVAILABLE")
    .map(section => utilityEntries(section.id))
    .flatten()
}

#let generalUtilityPowers() = {
  theme.subPageTitle(title: "General Utility Powers")
  parbreak()
  [Choose a power of your level or lower when you gain a utility power. Each card lists the skill rank you need. You need at least Trained for powers of levels 1?3, Expert for 4?10, Adept for 11?20, and Master for 21?30. Meet any other prerequisites on the card.]

  for (index, level) in generalUtilities.map(power => power.level).dedup().sorted().enumerate() {
    if index > 0 {
      pagebreak()
    }
    heading("Level " + str(level))
    columns(2, gutter: 5mm)[
      #for power in generalUtilities.filter(power => power.level == level).sorted(key: power => power.title) {
        powerCard(power)
      }
    ]
  }
}
