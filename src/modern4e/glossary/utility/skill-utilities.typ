#import "../../helpers/theme.typ" as theme;
#import "../../helpers/powers.typ" as powers;
#import "./power-source-utilities.typ": ruleLine;
#import "./utility-charisma.typ": charismaLevel2NonCombat;

#let skillUtilities() = {
  let entries = json("../../content/skill-utilities.json").powers
  pagebreak()
  theme.subPageTitle(title: "General Non-Combat Utility Powers")
  parbreak()
  [These powers require proficiency in the skill shown on the card and the listed minimum level, but no particular power source. Choose them with your out-of-combat utility picks. Powers marked for both combat and non-combat can use either kind of utility pick. All other prerequisites, requirements, costs, and casting times still apply.]
  for (index, level) in entries.map(entry => entry.level).dedup().sorted().enumerate() {
    if index > 0 { pagebreak() }
    heading("Skill Level " + str(level), level: 2)
    columns(2, gutter: 5mm)[
      #if level == 2 { charismaLevel2NonCombat() }
      #for entry in entries.filter(entry => entry.level == level).sorted(key: entry => entry.skill + entry.title) {
        let rows = entry.rows.map(ruleLine)
        powers.power(
          title: entry.title,
          bonusTitle: entry.skill + " | Level " + str(entry.level),
          description: entry.description,
          type: entry.type,
          traits: entry.traits,
          action: entry.action,
          range: [#entry.range],
          additionalRows: rows,
        )
      }
    ]
  }
};
