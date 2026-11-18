#import "../../helpers/theme.typ" as theme;
#import "../../helpers/power_content.typ": powerCard;
#import "../../helpers/utility_content.typ": utilityEntries;
#import "./utility-charisma.typ": charismaLevel2NonCombat;

#let skillUtilities() = {
  let entries = utilityEntries("skill")
  pagebreak()
  theme.subPageTitle(title: "General Non-Combat Utility Powers")
  parbreak()
  [These powers require proficiency in the skill shown on the card and the listed minimum level, but no particular power source. Choose them whenever advancement grants a utility power. Combat and non-combat labels describe their use and do not grant separate picks. All other prerequisites, requirements, costs, and casting times still apply.]
  for (index, level) in entries.map(entry => entry.level).dedup().sorted().enumerate() {
    if index > 0 { pagebreak() }
    heading("Skill Level " + str(level), level: 2)
    columns(2, gutter: 5mm)[
      #if level == 2 { charismaLevel2NonCombat() }
      #for entry in entries.filter(entry => entry.level == level) {
        powerCard(entry)
      }
    ]
  }
};
