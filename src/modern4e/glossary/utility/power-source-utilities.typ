#import "../../helpers/theme.typ" as theme;
#import "../../helpers/powers.typ" as powers;

#let ruleLine(value) = {
  let parts = value.split(":")
  if parts.len() > 1 and parts.first().len() < 45 {
    [*#parts.first().trim():* #parts.slice(1).join(":").trim()]
  } else {
    [#value]
  }
};

#let powerSourceUtilities() = {
  let entries = json("../../content/power-source-utilities.json").powers
  pagebreak()
  theme.subPageTitle(title: "Power Source Utility Powers")
  parbreak()
  [These powers are available to any class with the matching power source. Choose them with your out-of-combat utility picks, meeting the minimum level and all listed prerequisites and requirements.]
  for source in ("Arcane", "Martial", "Primal", "Divine") {
    pagebreak()
    theme.subPageTitle(title: source + " Utility Powers", level: 3)
    let sourceEntries = entries.filter(entry => entry.source == source)
    for (index, level) in sourceEntries.map(entry => entry.level).dedup().sorted().enumerate() {
      if index > 0 { pagebreak() }
      heading("Level " + str(level), level: 4, depth: 2)
      columns(2, gutter: 5mm)[
        #for entry in sourceEntries.filter(entry => entry.level == level).sorted(key: entry => entry.title) {
          let rows = entry.rows.map(ruleLine)
          powers.power(
            title: entry.title,
            bonusTitle: "Level " + str(entry.level),
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
  }
};
