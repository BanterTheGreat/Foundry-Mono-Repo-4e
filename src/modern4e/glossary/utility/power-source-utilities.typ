#import "../../helpers/theme.typ" as theme;
#import "../../helpers/power_content.typ": powerCard;
#import "../../helpers/utility_content.typ": utilityEntries;

#let powerSourceUtilities() = {
  pagebreak()
  theme.subPageTitle(title: "Power Source Utility Powers")
  parbreak()
  [These powers are available to any class with the matching power source. Choose them with your out-of-combat utility picks, meeting the minimum level and all listed prerequisites and requirements.]
  for source in ("Arcane", "Martial", "Primal", "Divine") {
    pagebreak()
    theme.subPageTitle(title: source + " Utility Powers", level: 3)
    let sourceEntries = utilityEntries(lower(source))
    for (index, level) in sourceEntries.map(entry => entry.level).dedup().sorted().enumerate() {
      if index > 0 { pagebreak() }
      heading("Level " + str(level), level: 4, depth: 2)
      columns(2, gutter: 5mm)[
        #for entry in sourceEntries.filter(entry => entry.level == level) {
          powerCard(entry)
        }
      ]
    }
  }
};
